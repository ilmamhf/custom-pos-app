# AGENTS.md — Definition of Done for CI/Validation Unification

## Purpose
This document defines the acceptance criteria for completing the `ci/unify-validation` branch work. No task is "done" until all criteria are met and evidenced by `gh` output.

> **Status:** the branch was merged to `main` on 2026-11-25 (PR #1, merge commit `483108a`). The tables below are kept as the historical acceptance record. Current status and documentation ownership live in [`docs/tasks/2026-11-27/README.md`](docs/tasks/2026-11-27/README.md) and [`docs/audit/README.md`](docs/audit/README.md).

---

## Definition of Done (Per Task)

### For Each CI Job Fix (Backups, React Admin E2E, Flutter POS Patrol Web)

| Criterion | Evidence Required |
|-----------|-------------------|
| **Diagnosis matches real CI logs** | Quote the failing log lines that confirm the root cause before implementing fix |
| **Fix implemented without weakening tests** | No skipped/deleted tests, no weakened assertions, no disabled CI steps |
| **Local validation passes** | `node scripts/ci.mjs <target>` runs the same steps as CI. The `ci` target auto-SKIPs `e2e-pos`/`e2e-patrol` (CI-only) and, on Windows, container/backup targets when `SKIP_CONTAINER_TESTS=1`; every SKIP must print a loud line and is not proof of a green job |
| **Pushed to branch** | `git push` shows new commit on `ci/unify-validation` |
| **CI run green** | `gh run watch` / `gh pr checks --watch` shows ✅ PASS for the target job |
| **Run URL + conclusion recorded** | Paste the workflow name, run URL, and conclusion from `gh` output (not screenshots) |

### For the Overall Branch

| Criterion | Evidence Required |
|-----------|-------------------|
| **All 3 originally failing jobs green** | Backups, React Admin E2E, Flutter POS Patrol Web all ✅ in `gh pr checks` |
| **`scripts/ci.mjs` exists and works** | `node scripts/ci.mjs ci` runs the full validation locally |
| **`Makefile` delegates to `ci.mjs`** | `make ci` works (if GNU make installed) |
| **`.nvmrc` pins Node 20** | `cat .nvmrc` → `20` |
| **Workflow parity with `ci.mjs`** | `.github/workflows/ci.yml` and `e2e.yml` mirror the `ci.mjs` steps inline (they do **not** call `ci.mjs`; GitHub Actions supplies the services, Docker buildx, and secrets). Any step added to one side must be reflected in the other |
| **Failure-only artifacts** | E2E jobs use `if: failure()`, `if-no-files-found: ignore`, `retention-days: 7` |
| **Audit docs updated** | `docs/audit/2026-11-24/` and `docs/audit/README.md` contain run URLs and conclusions |
| **No business-logic changes** | Only CI/test/infra fixes; no feature modifications |
| **No unnecessary deps/infra** | No new npm packages, Docker images, or services added |

---

## Evidence Format (Paste from `gh` output)

```
Workflow: React Admin (Playwright)
Run: https://github.com/ilmamhf/custom-pos-app/actions/runs/XXXXXXXXXX/job/YYYYYYYYYY
Conclusion: success (1m40s)
```

---

## Stop Conditions

- **After 3 failed attempts** on the same error → stop and report
- **Real CI logs contradict diagnosis** → stop, re-analyze, do not implement
- **`gh` unavailable/unauthenticated** → report and stop (do not declare done)

---

## Current Status (2026-11-27)

`ci/unify-validation` is **merged** (PR #1, merge commit `483108a`). Final evidence: `gh pr checks 1` → 10/10 pass; `main` runs [CI 45625352176](https://github.com/ilmamhf/custom-pos-app/actions/runs/45625352176) and [E2E 45625352118](https://github.com/ilmamhf/custom-pos-app/actions/runs/45625352118) both `success`.

| Task | Status | Evidence |
|------|--------|----------|
| Backups metric contract split | ✅ CI PASS | `42975ff` — `verify-backup.sh` `VERIFY_EXPECT_DRILL` pre/post-drill contract |
| Backups age-keygen permission | ✅ CI PASS | `839b42a` — `--entrypoint sh` for root write to `/keys` |
| React Admin E2E | ✅ CI PASS | `076122d` — `--mode test`, `CORS_ORIGIN=ADMIN_BASE_URL`, throttle in `apiEnv`, `pushSale` clock skew fix |
| Patrol Web migration test | ✅ CI PASS | `3ad1668` — web-compatible rewrite using `openPlatformDatabase()` |
| Patrol Web full suite | ✅ CI PASS (7/7) | `d630389` — preserve catalog/sync state, force delta pull; run `45620759147` |
| `scripts/ci.mjs` | ✅ Exists | 411 lines, 11 targets; `node scripts/ci.mjs ci` |
| `Makefile` | ✅ Exists | delegates to `ci.mjs` |
| `.nvmrc` | ✅ Exists | `20` |
| Workflow refactor | ❌ Not done | Workflows mirror the steps inline; no `ci.mjs` references under `.github/` |
| Failure-only artifacts | ✅ Present | `e2e.yml`: `if: failure()`, `if-no-files-found: ignore`, `retention-days: 7` |
| Audit docs | ✅ Updated 2026-11-27 | `docs/audit/README.md`, `ci-e2e-fix-results.md`, `docs/tasks/2026-11-27/` |

---

## Commands Reference

```bash
# Local CI (Windows, no GNU make)
node scripts/ci.mjs ci

# Watch CI runs
gh pr checks 1 --watch
gh run watch <run-id>

# View job logs
gh run view <run-id> --job <job-id> --log

# Create PR
gh pr create --base main --head ci/unify-validation --title "..." --body "..."
```

---

## Notes

- **Never** push to or merge into `main` from this branch
- **Never** skip/delete tests, weaken assertions, or disable CI steps to get green
- **Local results are not proof of done** — only `gh` run status counts
- Patrol `e2e-patrol` may SKIP locally (CI-only); `e2e-pos` may SKIP (no ChromeDriver) — print loud `SKIP` line
- `ci.mjs` `e2e-pos` / `e2e-patrol` targets always print SKIP; they do not execute the suites
- `ci.mjs` `containers` / `backup` targets use Linux-only `--network host`, `sleep`, and `grep`, and assume Postgres on `5432`; set `SKIP_CONTAINER_TESTS=1` on Windows (there is no automatic OS skip)
- `ci.mjs` `api` target expects `apps/api-nestjs/.env` (DATABASE_URL + JWT secrets) and a reachable Postgres on `15432`
- Age keygen: do not mount temp dir over directory containing `age-keygen.sh`; verify script's real path in image
- Throttle env vars apply to `e2e-admin` only; Patrol suite also needs higher login limit (default 5, suite does ~6+ logins/min)
- `JWT_*` / `CORS_ORIGIN` must be exported before bare `-e` flags; `CORS_ORIGIN=*` passes production config validation
- Revert settings heading regex only if logs confirm redirect/429 cause (logs confirmed redirect; revert approved)