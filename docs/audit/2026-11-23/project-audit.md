# Retail POS platform audit — post-remediation

- **Audit date:** 2026-11-23
- **Audited revision:** `7e5024b` (`main`)
- **Previous audit:** `docs/audit/2026-11-22/project-audit-1.md` (baseline: `9b787bb`, 2026-11-22)
- **Remediation:** Tasks 1–10 implemented (`049de56` → `42e0a5f`), Tasks 11–12 deferred
- **Scope:** NestJS API, Flutter POS, React Admin, cross-application contracts, data model, tests, security, operational readiness
- **Excluded:** UI/UX and visual-design assessment

---

## 1. Executive summary

The repository has completed **P0 remediation** for the 2026-11-22 audit. All 10 planned tasks are implemented and verified; the automated baseline is green across all three applications.

**Key improvements since baseline:**

| Area | Before | After |
|------|--------|-------|
| Store isolation | Critical bypasses (C-01, C-02) | Canonical store context, server-side scoping on all reads/mutations |
| Sync authority | Client-trusted prices/totals (H-02, H-03) | Server-recomputed money, shift/sale/user linkage validated |
| Sync reliability | Rejected work marked synced (H-04), no shift close (H-05), pull loses pending (H-06) | Per-entity results, retry/backoff, shift open/close transitions, pending-delta reconciliation |
| Refunds | Over-refunds, wrong math, incompatible payload (H-07, H-08, H-09) | Immutable line snapshots, atomic validation, idempotency, first-class refund command |
| Flutter local data | Unscoped catalog (H-01) | `(store_id, product_id)` identity, store-scoped reads/mutations, versioned migration |
| React sessions | Cache crosses logout (H-15), Cashier reaches Admin (H-17) | Query cache cleared on session change, all Admin routes guarded, cost price restricted |
| Infrastructure | No migrations (M-05), no CI (M-06) | Prisma baseline migration, Flutter v1 migration, CI + E2E workflows |

**Readiness decision (updated):**

| Use case | Assessment | Reason |
| --- | --- | --- |
| Local demo / developer workflow | ✅ Ready | Setup documented; all tests pass |
| Single-store controlled pilot | ✅ Ready | P0 defects closed; live-test issues fixed |
| Multi-store production rollout | ⚠️ Conditional | P1 financial/sync/auth work, M-02 token storage, and the D-01/D-02 dependency upgrades are complete; residual: negative-stock Admin UI surface |
| Internet-facing deployment | ❌ Not ready | Above + printer hardware (M-08/R-05) + the observability stack (M-07: deployment artifacts are done, metrics/traces/alerts and the backup drill are not) |

---

## 2. Verification baseline (2026-11-24, after P1 + M-02 + D-01/D-02 + M-07)

| Check | Result |
| --- | --- |
| API unit tests | 36 passed |
| API e2e tests | 24 passed (requires PostgreSQL on `localhost:15432`) |
| API TypeScript/build | Passed |
| React tests | 27 passed |
| React typecheck | Passed |
| React production build | Passed (chunk size warning) |
| Flutter tests | 158 passed |
| Flutter analyze | No errors; 28 info-level deprecation notices |
| Flutter web build | Passed |
| Fresh DB bootstrap | `prisma migrate deploy` + `migrate diff --exit-code` → no difference |
| `npm audit --omit=dev` (API) | 0 advisories (was 6: 1 critical, 5 high) |
| `npm audit --omit=dev` (React) | 0 advisories (was 3: 1 high, 2 moderate) |
| CI dependency audit | Blocking gate (`npm audit --omit=dev`, no `continue-on-error`) |
| Container images | `pos-api` + `pos-admin` built; migrations, seed, liveness/readiness, SPA fallback and the `/api/` proxy verified in Docker |
| Hardened containers | Both images run with a read-only root filesystem, a non-root user and all capabilities dropped |
| TLS overlay | Self-signed certificate: HTTP → 301 redirect, HTTPS SPA → 200, HTTPS `/api/` proxy → 200, `Secure`/`HttpOnly`/`SameSite=Strict` cookies confirmed through the TLS chain |

Baseline recorded before P1 (2026-11-23): API 26 unit / 19 e2e, Flutter 157.

---

## 3. Remediation summary

### Tasks completed (P0)

| # | Task | Findings addressed | Commit |
|---|------|-------------------|--------|
| 1 | API canonical store context + scoping | C-01, C-02 | `049de56` |
| 2 | Sync state machine, server-authoritative money, shift linkage | H-02, H-03, H-04(s), H-05(s), H-06(s) | `049de56` |
| 3 | Safe refunds + immutable money snapshots + Flutter refund command | H-07, H-08, H-09(s) | `049de56` |
| 4 | Inventory concurrency + API hardening | H-10, H-14, M-03, M-10 | `049de56` |
| 5 | Staff contract + auth session revalidation/revocation | M-01, M-13, M-14, H-17(s) | `049de56` |
| 6 | React session isolation + Admin route authorization | H-15, H-17 | `2cccb24` |
| 7 | React correctness/UX | H-16, M-02(partial), M-09, M-11, M-12, M-15, L-01–L-05 | `2cccb24` |
| 8 | Flutter store-scoped local catalog + pull reconciliation | H-01, H-06(c) | `dc47f0e` |
| 9 | Flutter sync/refund/PIN/retry | H-04(c), H-09(c), H-11, H-12 | `dc47f0e` |
| 10 | Versioned migrations + CI | M-04, M-05, M-06 | `42e0a5f` |

### Tasks completed (P1 — 2026-11-24)

| # | Task | Findings addressed | Commit |
|---|------|-------------------|--------|
| P1.1 | Tender components per sale + BigInt drawer reconciliation | H-13 | `7c24049` |
| P1.2 | Payment provider interface, transactions, webhook, void/refund | R-01 | `3775d27` |
| P1.3 | Negative-stock policy engine + escalation events | R-03 | `7935fa5` |
| P1.4 | Delta pull tombstones + durable cursor + snapshot fallback | R-04 | `bd23bd3` |
| P1.5 | IDR ceiling enforcement across DTOs | R-02 | `b368a8d` |
| P1.6 | Auth throttling + lockout telemetry + alert webhook | R-06 | `19a222d` |
| P1.7 | Backfilled Prisma migrations for P1.1–P1.4 schema | R-01/R-03/R-04 | `cbeb7ae` |

### Tasks completed (P2 — 2026-11-24)

| # | Task | Findings addressed | Commit |
|---|------|-------------------|--------|
| P2.1 | HttpOnly refresh cookie + CSRF double-submit (native clients unchanged) | M-02 | `8fe6383` |
| P2.2 | Prisma 7 + bcrypt 6 upgrade; API advisories cleared | D-01 | `8bd1631` |
| P2.3 | Zod 4 + React Router 7 upgrade; React advisories cleared | D-02 | `097036b` |
| P2.4 | Dependency audit becomes a blocking CI gate | D-01/D-02 | `097036b` |

### Tasks completed (P3 — 2026-11-24)

| # | Task | Findings addressed | Commit |
|---|------|-------------------|--------|
| P3.1 | Container images, Compose + Kubernetes manifests, probes, TLS, secret injection | M-07 | `f37dce0` |

### Tasks deferred

| # | Task | Reason |
|---|------|--------|
| 11 | Printer adapter + operational artifacts | Hardware skipped per request; ops runbook written |
| 12 | Dependency advisories | ✅ Done in P2.2/P2.3 — Prisma 7, Zod 4, React Router 7 with 0 advisories |

### Live-test fixes (post-remediation)

| Issue | Fix |
|-------|-----|
| POS sale did not reach Admin (stale outbox counts) | `_maybeSync` refreshes counts before gate; `requestSync()` after checkout/shift/refund |
| Shift button unreachable (router guard) | Allow `/shift` while shift open; sync badge tappable for manual sync |
| QRIS sale stuck (connectivity flag) | `requestSync()` forces past advisory flag; badge shows failed entries + retry |
| Admin price change not visible in POS | Periodic pull always runs; `catalogProvider` invalidated; cart prices refreshed; badge contrast fixed |

---

## 4. Residual findings (from recheck)

### High / Medium — require resolution for multi-store production

| ID | Finding | Status | Notes |
|---|---------|--------|-------|
| **H-13** | Shift cash reconciliation uses floats, incomplete payment model | **Fixed** | `SaleTender` table; BigInt throughout; split payments; tender refs |
| **R-01** | Payment methods are labels, no provider integration | **Fixed** | `IPaymentProvider` + generic HTTP provider, authorize/capture/void/refund, HMAC webhook, idempotency |
| **R-03** | Negative stock policy unspecified | **Fixed (engine/API)** | Policy engine with ALERT_ONLY / AUTO_TRANSFER / MANAGER_APPROVAL / WRITE_OFF + events; Admin UI still open |
| **R-04** | Delta pull: no tombstones, cursor not durable | **Fixed** | `ProductTombstone`, `SyncCursor`, `full=true` snapshot fallback, client delete handling |
| **R-02** | JS safe-integer boundary crossed | **Fixed** | IDR ceiling 999,999,999 enforced on every monetary DTO |
| **R-06** | No rate limiting on auth/PIN endpoints | **Fixed** | `@nestjs/throttler` global + strict auth routes; account lockout, masked telemetry, alert webhook |
| **M-02** | React tokens in `localStorage` | **Fixed** | Access token in memory; refresh token in HttpOnly `SameSite=Strict` cookie; CSRF double-submit; native clients keep body tokens |
| **M-04** | Flutter SQLite migration testing | **Partial** | Upgrade tests from v0→v1 on real devices needed |
| **M-07** | Production deployment/observability incomplete | **Partial** | Deployment done (containers, Compose, K8s, probes, TLS, secrets); metrics, traces, alerts, backup drills still open |
| **M-16** | Sales-date filter & staff edit workflows | **Open** | React date picker + server `from`/`to`; staff edit (not just toggle) |
| **D-01** | API dependency advisories (6) | **Fixed** | Prisma 7.10.1 (driver adapter + `prisma.config.ts`), bcrypt 6 (drops node-pre-gyp/tar), `effect` override; `npm audit --omit=dev` → 0 advisories |
| **D-02** | React dependency advisories (3) | **Fixed** | Zod 4.6.7 + `@hookform/resolvers` 7 + react-hook-form 7.92, React Router 7.18.6; `npm audit --omit=dev` → 0 advisories |

### Low — usability

| ID | Finding | Status |
|---|---------|--------|
| L-01–L-05 | Pagination, filter semantics, validation, Vite declaration | **Fixed in Task 7** |

---

## 5. Architecture & contract assessment (updated)

### 5.1 Trust boundaries (improved)

```
Flutter POS
  local SQLite catalog (store-scoped) / shifts / sales / outbox
               |
               | JWT + X-Store-Id + idempotent entity UUIDs + Idempotency-Key
               v
NestJS API  ---- Prisma / PostgreSQL
               | canonical storeId attached by StoreAccessGuard
               | server-recomputed prices/totals
               | shift/sale/user linkage validated
               | per-entity sync results
               v
React Admin
  QueryClient scoped by session; all Admin routes RoleGuarded
```

### 5.2 Cross-application contracts

| Contract | Status | Notes |
| --- | --- | --- |
| Login response | ✅ Compatible | API omits `user.email`; React falls back to submitted email |
| Staff/store assignments | ✅ Fixed | API returns `userStores` + normalized `stores` alias; React consumes `stores` |
| Product/inventory/sales/report shapes | ✅ Mostly compatible | Authorization scope enforced; refund/report math uses immutable snapshots |
| Shift sync | ✅ Improved | Open/close transitions applied; idempotent; validated ownership |
| Refund sync | ✅ Fixed | First-class `refunds[]` array with idempotency key + offline grant |
| Catalog pull | ✅ Store-scoped | Per-store cursor; pending deltas reconciled; `(store_id, product_id)` local identity |
| Payment | ⚠️ Labels only | `CASH/QRIS/CARD/SPLIT` stored; no tender/gateway/settlement model (R-01) |

---

## 6. Verified strengths (retained from baseline)

- Integer-only IDR in Flutter checkout/cart; `BigInt` storage in API
- Atomic local checkout (SQLite transaction with rollback test)
- Sync idempotency via client-generated sale UUIDs + server existence check
- bcrypt (10 rounds) for passwords/PINs; JWT strategy reloads user
- Relational integrity: composite PKs, FKs, stock ledger in same transaction
- Bulk importer: validated CSV, transaction-batched, dry-run default
- Documentation: setup, endpoints, seeded accounts, live verification order

---

## 7. Test gaps & required regression coverage (updated)

### API
- [ ] Cross-store e2e matrix (assigned/unassigned/omitted/conflict/header-route/transfer) — *was recommended in Task 1 residual*
- [ ] Sync mixed success/failure response handling
- [ ] Concurrent transfers against limited source stock (H-10)
- [x] Rate limiting / brute-force tests (R-06) — throttler 429 + lockout escalation
- [ ] Startup failure on missing/weak JWT secrets (H-14)

### Flutter
- [ ] Two stores with different prices/stock + switch-back behavior
- [ ] Failed server response IDs + retry/backoff; failed rows → retryable
- [ ] Pull with pending local sale decrement + failed outbox row
- [x] Durable per-store pull cursor + deactivation propagation — unit-tested; device test still open
- [ ] Offline refund command shape + local rollback + server ack reconciliation
- [ ] Offline PIN cache isolation by store/user, expiry, logout, PIN revocation
- [ ] Retry interceptor for non-idempotent requests + ambiguous responses
- [ ] Migration upgrade test v0→v1 on device

### React & contracts
- [ ] Real API staff response (`userStores` + `stores` alias) contract test
- [ ] Login with exact API response shape (no `user.email`)
- [ ] Ledger cache isolation when `limit` changes
- [ ] Token expiry, refresh failure, unauthorized cleanup, cross-user cache isolation
- [ ] Route-level Cashier access (direct nav + product cost disclosure)
- [ ] Product mutation: decimals, exponents, whitespace, server errors
- [ ] Distinct error states for all query views
- [ ] Dashboard date boundaries in non-UTC business timezone
- [x] Current-session revalidation (`/auth/me`) + logout revocation — plus HttpOnly cookie refresh (M-02)
- [ ] Refund/staff dialog reset on cancel/failure/reopen/sale change
- [ ] Page reset on store/filter changes; server-side negative-stock totals
- [ ] Generated/shared API types so server/client shape change fails CI

### Operational
- [x] Fresh database bootstrap from committed Prisma migrations — verified 2026-11-24
- [ ] CI running every verified command (push to trigger)
- [x] Dependency audit policy with documented exceptions — blocking `npm audit --omit=dev` gate, 0 advisories
- [x] Container images build, run non-root with a read-only root filesystem, apply migrations, and answer the liveness/readiness probes — verified 2026-11-24
- [ ] Backup restore + multi-client sync under intermittent connectivity
- [ ] DR drill with RPO/RTO measurement

---

## 8. Prioritized roadmap to "Multi-store production ✅"

### P1: Financial & sync correctness (2–3 weeks) — ✅ complete 2026-11-24

| # | Work | Unlocks |
|---|------|---------|
| 1 | **H-13**: `BigInt` reconciliation + tender components per sale (cash/QRIS/card/SPLIT with amounts, refs, change) | Accurate drawer variance, split payments, audit trail |
| 2 | **R-01**: Define payment provider interface (authorize/capture/void/settle) + tender allocation | Non-cash methods become real, not labels |
| 3 | **R-03**: Negative-stock policy engine (approval, auto-transfer, write-off, alerts) + Admin UI | Safe concurrent offline sales across stores |
| 4 | **R-04**: Tombstones + durable per-store cursor + snapshot fallback | Reliable catalog sync across disconnect/reconnect |
| 5 | **R-02**: Enforce IDR ceiling (e.g., 999,999,999) or decimal strings end-to-end | No precision loss at scale |
| 6 | **R-06**: `@nestjs/throttler` global + strict `/auth/*` limits + lockout telemetry + alerts | Production auth hardening |

### P2: Security & token hygiene (1 week)

| # | Work | Unlocks |
|---|------|---------|
| 7 | **M-02**: Refresh token → HttpOnly Secure SameSite cookie + CSRF (double-submit) | Tokens not accessible to XSS |
| 8 | **D-01/D-02**: Tested major upgrades (Prisma 7 → Zod 4 → React Router 7) + remove `continue-on-error` | Clean dependency bill of health |

### P3: Operations & observability (2–3 weeks)

| # | Work | Unlocks |
|---|------|---------|
| 9 | **M-07**: Container images, K8s/Compose manifests, health/readiness probes, TLS, secret injection | Deployable artifact |
| 10 | Structured JSON logs + Prometheus/OTel metrics + tracing + alerts (5xx, readiness, backup, negative stock, sync failures) | Observable production |
| 11 | Automated encrypted PG backups (daily, WAL archiving) + quarterly restore drill | Verified RPO ≤ 15 min, RTO ≤ 1 hr |
| 12 | **M-16**: Sales date-range filter + staff edit workflow in React | Admin operational completeness |
| 13 | **M-04**: Flutter migration upgrade tests on device (v0→v1) | Safe local DB upgrades |

### P4: Hardware (parallel track)

| # | Work | Unlocks |
|---|------|---------|
| 14 | **M-08/R-05**: `BluetoothReceiptPrinterService` + ESC/POS + device selection/reconnect + cash drawer | Hardware printing (deferred per request) |

---

## 9. Definition of "Multi-store production ready"

| Gate | Criteria |
|------|----------|
| **Financial** | Zero float money paths; tender components persisted per sale; split payments reconcile; price mismatches audited |
| **Sync** | Negative stock policy enforced; tombstones propagate; cursor durable; failed work retries with exponential backoff |
| **Security** | Rate limiting on all auth endpoints; tokens not in `localStorage`; `npm audit --omit=dev` = 0 |
| **Operations** | Containers + probes + backup/restore drill passed; metrics + alerts firing; DR runbook tested |
| **Multi-store verified** | E2E test: 2 stores, 2 cashiers, concurrent offline sales, disconnect/reconnect, price changes mid-shift, Admin sees all |

---

## 10. Final assessment

The codebase has **graduated from "local MVP" to "single-store pilot ready"**. The P0 trust-boundary defects (store isolation, sync authority, refund correctness, session isolation) are fixed and verified. The remaining gaps are **operational and financial hardening** — not architectural flaws.

**Recommended next step:** Execute P1 sprint (financial/sync correctness) to unblock multi-store production. The work is well-scoped, the test baseline is solid, and the contracts are now stable enough to build on.

---

## Appendix: Key files changed during remediation

| Area | Files |
|------|-------|
| API store isolation | `src/common/guards/store-access.guard.ts`, `src/common/utils/store-scope.util.ts`, `src/modules/*/controllers.ts`, `src/modules/*/services.ts` |
| API sync/refund | `src/modules/sync/sync.service.ts`, `src/modules/sync/dto/sync.dto.ts`, `src/modules/sales/sales.service.ts`, `src/modules/sales/dto/sale.dto.ts`, `prisma/schema.prisma` |
| API hardening | `src/config/security.config.ts`, `src/common/filters/http-exception.filter.ts`, `src/main.ts`, `src/modules/inventory/inventory.service.ts` |
| API auth/sessions | `src/modules/auth/auth.service.ts`, `src/modules/auth/auth.controller.ts`, `src/modules/auth/strategies/jwt.strategy.ts`, `prisma/schema.prisma` (tokenVersion) |
| React session/roles | `src/context/AuthContext.tsx`, `src/App.tsx`, `src/api/queries/queryKeys.ts`, `src/features/auth/RoleGuard.tsx` |
| React correctness | `src/features/products/ProductModal.tsx`, `src/lib/formatters.ts`, `src/features/dashboard/DashboardPage.tsx`, `src/features/inventory/InventoryPage.tsx`, `src/features/sales/SalesPage.tsx`, `src/features/sales/RefundDialog.tsx`, `src/features/settings/StaffModal.tsx` |
| Flutter local DB | `lib/core/database/app_database.dart`, `lib/core/database/tables/local_products.dart`, `lib/core/database/daos/products_dao.dart`, `lib/core/database/daos/sync_dao.dart`, `lib/core/database/daos/sales_dao.dart` |
| Flutter sync/refund/PIN | `lib/features/sync/sync_provider.dart`, `lib/features/receipts/refund_screen.dart`, `lib/features/auth/pin_service.dart`, `lib/core/network/dio_client.dart` |
| Migrations + CI | `prisma/migrations/20261123000000_init/`, `.github/workflows/ci.yml`, `.github/workflows/e2e.yml` |