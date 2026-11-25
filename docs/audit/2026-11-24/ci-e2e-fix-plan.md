# CI/E2E Failure Fix Plan — 2026-11-25

**From commit:** `e5bc8e4` (7/10 CI jobs passing, 3 failing)

---

## Failure Summary

| Job | Status | Primary Cause |
|-----|--------|---------------|
| **Backups** | ❌ Failed | `pos_backup_last_drill_duration_seconds.prom` not written to textfile collector |
| **React Admin E2E (Playwright)** | ❌ Failed | 8/8 tests failed — API login rate limit (429) from parallel test runs |
| **Flutter POS (Patrol Web)** | ❌ Failed | API never became available at `localhost:3100` (likely same root cause) |

---

## Fix 1: Backups — Missing Prometheus Metric File

### Root Cause
The `restore-drill.sh` calls `write_drill_duration()` → `write_metric()` which writes to `${PROMETHEUS_TEXTFILE_DIR}/${name}.prom`. In CI, `PROMETHEUS_TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector` is mounted via `pos-ci-textfile` volume. The metric file is not appearing, likely because:

1. The `pos-backup:ci` image runs as non-root user (UID 999 from `postgres` user), but the volume mount creates the directory as root
2. The `mkdir -p` in `write_metric()` runs as the `postgres` user but the directory ownership prevents writes

### Fix: `deploy/backup/restore-drill.sh`

Add explicit directory creation and permission fix before the drill starts:

```bash
# After line 40 (mkdir -p for DRILL_DATA_DIR)
# Ensure the Prometheus textfile collector directory exists and is writable
if [ -n "${PROMETHEUS_TEXTFILE_DIR:-}" ]; then
  mkdir -p "${PROMETHEUS_TEXTFILE_DIR}"
  # The backup image runs as postgres (UID 999), fix ownership if root created it
  chown -R postgres:postgres "${PROMETHEUS_TEXTFILE_DIR}" 2>/dev/null || true
fi
```

### Fix: `deploy/backup/backup.sh` (for consistency)

Add the same block at the top of the backup script.

### CI Workflow Fix (`.github/workflows/ci.yml`)

Ensure the textfile volume is created with correct permissions before containers start:

```yaml
- name: Create textfile collector directory
  run: |
    docker volume create pos-ci-textfile
    # Pre-create the directory with correct ownership
    docker run --rm -v pos-ci-textfile:/data alpine sh -c "mkdir -p /data && chown -R 999:999 /data"
```

---

## Fix 2: React Admin E2E — Login Rate Limiting (429)

### Root Cause
- Login throttle: **5 requests per 60 seconds** per IP (`AUTH_LOGIN_THROTTLE_LIMIT=5`, `AUTH_LOGIN_THROTTLE_TTL_MS=60000`)
- Playwright tests run in parallel, each test authenticates via `/auth/login`
- CI environment shares localhost IP → all tests hit the same throttle bucket

### Fix Options (pick one)

#### Option A: Increase CI Login Throttle (Quick, Low Risk)
**File:** `.github/workflows/e2e.yml` — add env vars to `admin-e2e` job:
```yaml
env:
  CI: 'true'
  E2E_DATABASE_URL: postgresql://pos:pos@localhost:5432/pos_e2e?schema=public
  API_BASE_URL: http://localhost:3100/api/v1
  AUTH_LOGIN_THROTTLE_LIMIT: '50'      # 10x for CI
  AUTH_LOGIN_THROTTLE_TTL_MS: '60000'
```

#### Option B: Shared Auth Session (Cleaner, Medium Effort)
**File:** `e2e/support/auth.ts` — implement session reuse:
```typescript
let cachedTokens: { accessToken: string; refreshToken: string } | null = null;

export async function getOwnerTokens(): Promise<{ accessToken: string; refreshToken: string }> {
  if (cachedTokens) return cachedTokens;
  // ... existing login logic
  cachedTokens = { accessToken: res.accessToken, refreshToken: res.refreshToken };
  return cachedTokens;
}
```

#### Option C: Disable Throttler in CI (Easiest, Less Realistic)
**File:** `apps/api-nestjs/src/common/throttler/throttler.config.ts`:
```typescript
export function buildThrottlerOptions(): ThrottlerModuleOptions {
  const isCI = process.env.CI === 'true';
  return {
    throttlers: [
      {
        name: 'default',
        limit: isCI ? 10000 : THROTTLE_LIMITS.global(),
        ttl: THROTTLE_LIMITS.globalTtl(),
      },
    ],
    errorMessage: 'Too many requests. Please slow down and try again later.',
  };
}
```

**Recommended:** Option A (minimal change, keeps production throttle behavior intact).

---

### Secondary Fix: Settings Page Test — Missing "System Settings" Heading

**File:** `e2e/tests/admin/auth-and-guards.spec.ts` (line 45)

The test expects a heading "System Settings" but the page likely renders a different title. Check the actual Admin settings page:

```tsx
// apps/admin-react/src/features/settings/SettingsPage.tsx
<h1>Store & Staff</h1>  // or similar
```

Update the test selector to match the actual heading, or fix the page heading.

---

## Fix 3: Flutter POS (Patrol Web) — API Not Available

### Root Cause
The API startup script waits 60s for `/api/v1/health` on port 3100, then exits. The `api.log` isn't visible in the failure summary, but likely causes:

1. **Prisma migration error** — new migration test dependencies not in API image
2. **Port conflict** — another service on 3100
3. **Environment variable missing** — JWT secrets, CORS, etc.

### Fix: `.github/workflows/e2e.yml` — Patrol Job

**1. Always upload API log on failure (already done at line 283-289, but check it works)**

**2. Increase startup timeout and add debugging:**
```yaml
- name: Start API
  working-directory: apps/api-nestjs
  run: |
    nohup node dist/main.js > api.log 2>&1 &
    API_PID=$!
    for i in $(seq 1 120); do  # 2 minutes instead of 1
      if curl -sf http://localhost:3100/api/v1/health > /dev/null; then
        echo "API ready"
        exit 0
      fi
      if ! kill -0 $API_PID 2>/dev/null; then
        echo "API process died"
        cat api.log
        exit 1
      fi
      sleep 1
    done
    echo "API failed to start after 120s"
    cat api.log
    exit 1
```

**3. Ensure API image has all dependencies:**
```yaml
- name: Build API
  working-directory: apps/api-nestjs
  run: |
    npm run build
    # Verify critical modules exist
    node -e "require('@nestjs/throttler'); require('@prisma/client'); console.log('deps OK')"
```

**4. Check port availability:**
```yaml
- name: Check port 3100 free
  run: |
    if ss -tlnp | grep ':3100 '; then
      echo "Port 3100 already in use"
      exit 1
    fi
```

---

## Fix Priority Order

| Priority | Fix | Files | Est. Time |
|----------|-----|-------|-----------|
| 1 | Patrol API startup debug | `.github/workflows/e2e.yml` | 30 min |
| 2 | Backups metric file permission | `deploy/backup/restore-drill.sh`, `deploy/backup/backup.sh`, `.github/workflows/ci.yml` | 30 min |
| 3 | Admin E2E login throttle | `.github/workflows/e2e.yml` (Option A) | 10 min |
| 4 | Settings page test selector | `e2e/tests/admin/auth-and-guards.spec.ts` | 15 min |

---

## Validation Checklist

After applying fixes, re-run CI and verify:

- [ ] **Backups job**: `pos_backup_last_drill_duration_seconds.prom` appears in artifacts
- [ ] **Admin E2E**: All Playwright tests pass (no 429 errors)
- [ ] **Patrol Web**: API starts, health check passes, Patrol tests run
- [ ] **Settings test**: "System Settings" (or correct heading) assertion passes

---

## Files to Modify

| File | Change Type |
|------|-------------|
| `deploy/backup/restore-drill.sh` | Fix: ensure textfile dir writable |
| `deploy/backup/backup.sh` | Fix: same for backup job |
| `.github/workflows/ci.yml` | Fix: pre-create textfile volume with correct ownership |
| `.github/workflows/e2e.yml` | Fix: add `AUTH_LOGIN_THROTTLE_LIMIT=50` to admin-e2e env; extend API startup timeout for pos-patrol |
| `e2e/tests/admin/auth-and-guards.spec.ts` | Fix: correct heading selector |

---

## Rollback Plan

If any fix causes regressions:
- Throttle changes: revert env var in e2e.yml
- Backup metric: revert script changes, CI will still pass (metric is advisory)
- API startup: revert timeout extension

All changes are backward-compatible with local development.