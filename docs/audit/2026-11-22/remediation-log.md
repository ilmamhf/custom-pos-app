# Remediation execution log — 2026-11-22 audit

- **Plan:** [`remediation-plan.md`](./remediation-plan.md)
- **Source audit:** [`project-audit-1.md`](./project-audit-1.md)
- **Branch:** `main`
- **Status:** Tasks 1–10 implemented and verified; Tasks 11–12 deferred as noted.

## Verification summary

| Check | Result |
| --- | --- |
| API `tsc --noEmit` / `nest build` | Passed |
| API unit tests (`npm test`) | 25 passed |
| React `tsc --noEmit` | Passed |
| React tests (`NODE_ENV=test npm test`) | 27 passed |
| Flutter `flutter analyze` | No errors (24 pre-existing dependency-deprecation infos) |
| Flutter tests (`flutter test`) | 156 passed |
| API e2e | 19 passed against local Postgres (Docker Desktop) |

`NODE_ENV=production` is set in this Windows shell, which makes React resolve
its production bundle under Vitest (`act(...) is not supported`). React tests
therefore run with `NODE_ENV=test`. CI sets it explicitly.

## Task 1 — API canonical store context + scoping (C-01, C-02)

**Commit:** `049de56`

- Rewrote `StoreAccessGuard` to gather header `X-Store-Id`, route `storeId`,
  query `storeId`, body `storeId`/`fromStoreId`, reject any disagreement with
  `400`, authorize the canonical value, and attach `request.storeId` and
  `request.storeScope`.
- `StoreId` decorator returns only the canonical value; controllers pass it to
  services instead of trusting a second client field.
- Added `store-scope.util.ts` with `resolveStoreScope`, `storeScopeWhere`, and
  `assertStoreInScope`. Owner may request all/any; managers and cashiers are
  restricted to assigned stores and default-deny when no scope is available.
- Applied scope to products (inventory include + detail), inventory list and
  ledger, sales list/detail/refund, shifts list/close, reports, and stores
  list/detail. Direct-UUID reads are re-checked after loading.
- Shift close now verifies the caller's store assignment and (for cashiers)
  ownership of the shift.
- Product list/detail is limited to Owner/Manager so cashiers cannot fetch
  cost prices; cashiers use the sync-pull catalog.

**Residual:** C-02's "cashiers restricted to own operational records" is applied
to sales detail/refund, not to every resource. The dedicated cross-store e2e
matrix described in the audit was not added (the existing 19 e2e tests pass);
recommended as the next test investment.

## Task 2 — Sync authority and state machine (H-02, H-03, H-04/05/06 server)

**Commit:** `049de56`

- Sync push resolves the canonical store from the guard.
- Sales are recomputed server-side: unit price from `Product.basePrice` or the
  store override, name from the catalog, discount clamped to line gross,
  tax from the store rate with proportional per-line allocation, and totals
  derived from those authoritative lines. Client totals are ignored.
- Shift ownership uses the authenticated user; client `userId` is not trusted.
- Each sale requires its shift to exist, belong to the store, belong to the
  cashier, start before the sale, and (if closed) end after it.
- Shift-close requests are applied after sales in the same push, computed from
  immutable sale/refund snapshots, and are idempotent for already-closed shifts.
- Per-entity `synced*Ids` and `failed` results remain authoritative.

**Residual:** Offline price changes are reconciled against the current catalog
rather than a signed price-version contract. Mismatches are reconciled silently
to avoid losing sales; a future price-version protocol is still advisable.

## Task 3 — Refund correctness and money snapshots (H-07, H-08, H-09 server)

**Commit:** `049de56`

- `SaleItem` now stores `grossAmount`, `discountAmount`, `taxAmount`,
  `lineTotal`, and `refundedAmount`; `Sale` stores `taxRateBps`.
- Added a `Refund` command record with a unique `idempotencyKey`.
- Refund requests require at least one item, aggregate duplicate sale-item ids,
  reject empty requests, and use an optimistic conditional update
  (`refundedQty` must be unchanged) to prevent over-refunds and concurrent
  double-refunds.
- Refund value is the exact proportional share of the immutable line total;
  the final unit settles rounding residue. Reports consume the same snapshot.
- Added a first-class `refunds` array to `sync/push` with a signed offline
  authorization token (or online manager PIN).

**Residual:** Whole-order discount allocation is accepted as a client hint at
sync time; there is no separate order-discount allocation table.

## Task 4 — Inventory concurrency + API hardening (H-10, H-14, M-03, M-10)

**Commit:** `049de56`

- Transfers read the source for the response, then use a conditional
  `updateMany` (`stockOnHand >= qty`) and reject when no row is updated.
- JWT secrets are resolved by `security.config.ts`: production refuses to boot
  on missing/short/example secrets; development warns and falls back.
- The global exception filter returns a generic message plus `correlationId`
  for non-HTTP errors and logs the original stack.
- Production requires an explicit `CORS_ORIGIN`; Swagger/docs are disabled by
  default in production unless `SWAGGER_ENABLED=true`.
- Added `/api/v1/health` and `/api/v1/health/ready`.

**Residual:** Rate limiting/brute-force protection (R-06) is documented but not
implemented; add `@nestjs/throttler` plus lockout telemetry before exposure.

## Task 5 — Staff contract + sessions (M-01, M-13, M-14, H-17)

**Commit:** `049de56`

- Users list/detail return both `userStores` and a normalized `stores` alias.
- Added `User.tokenVersion`; JWTs carry `ver`; the strategy rejects stale
  versions; refresh checks the version.
- Added `GET /auth/me` and `POST /auth/logout` (increments `tokenVersion`).
- `verify-pin` returns a signed, store/user/action-bound `offlineGrant`.

**Residual:** Refresh tokens are still stateless JWTs. Logout revokes via
version increment, which also invalidates access tokens; there is no per-device
refresh-session list. M-02 remains partial: React still persists tokens in
`localStorage` (see Task 7), and an HttpOnly refresh-cookie flow is not
implemented.

## Task 6 — React session isolation + roles (H-15, H-17)

**Commit:** `2cccb24`

- Query keys are prefixed with a session scope; `SessionCacheReset` clears the
  cache on `auth:session-changed`/`auth:unauthorized`.
- Login/logout/unauthorized update the scope and clear cached data.
- Every Admin route is wrapped in `RoleGuard` (Owner/Manager; settings Owner).
- Server-side product access is Owner/Manager only.

## Task 7 — React correctness/UX (H-16, M-09, M-11, M-12, M-15, L-01–L-05)

**Commit:** `2cccb24`

- Product editor requires whole-rupiah digits (no decimals/exponents), shows
  server mutation errors, and stays open on failure; trimmed min-length
  validation.
- Ledger key (and other list keys) include page size.
- Products, inventory, sales, ledger, and staff render distinct error states.
- Dashboard sends a business-local half-open `[start, end)` range with an
  explicit upper bound.
- Refund/staff dialogs reset on open, cancel, failure, and sale change.
- Pagination resets on store change; low/negative filters are mutually
  exclusive; inventory uses a server-side negative count.
- Client validation aligned with backend; Vite declared; CSP meta added;
  `/auth/me` revalidation and server logout wired in.

**Residual:** M-02 partial (token storage unchanged apart from CSP). If a strict
fix is required, move the refresh credential to an HttpOnly cookie and add CSRF
protection.

## Task 8 — Flutter store-scoped local catalog (H-01, H-06 client)

**Commit:** `dc47f0e`

- `local_products` identity is `(store_id, id)` with `UNIQUE(store_id, sku)`;
  the model and DAOs take a store scope.
- A versioned migration (`PRAGMA user_version = 1`) rebuilds legacy rows into
  the `store-1` bucket; sale→shift and sale-item→sale foreign keys are declared
  and `PRAGMA foreign_keys = ON` is enabled.
- Catalog, barcode lookup, checkout decrement, and refund stock updates bind to
  the active/sale store. `activeStoreIdProvider` follows the selected store.
- Pull subtracts unsynced local sale quantities and persists a per-store cursor.

**Residual:** Tombstones/deactivation contract (R-04) and refund-delta
reconciliation on pull are not implemented; a full snapshot fallback is still
recommended.

## Task 9 — Flutter sync/refund/PIN/retry (H-04, H-09, H-11, H-12)

**Commit:** `dc47f0e`

- Outbox processes pending + retryable failed entries. An entry is marked
  `SYNCED` only when its own id is in the matching success set; otherwise it is
  marked failed with the server reason and retried up to a cap.
- `_maybeSync` runs when pending or failed work exists.
- Refunds enqueue a `refund` entity with `refunds[]`, a command UUID as the
  idempotency key, and a signed authorization grant.
- Offline PIN cache is one JSON blob keyed by user+store, expires after 7 days,
  uses a 20k-iteration HMAC-SHA256 KDF, requires an unexpired grant for refunds,
  and is cleared on logout and store switch.
- HTTP retries are limited to safe methods or requests carrying
  `Idempotency-Key`; sync push supplies that header.
- Local drawer cash uses immutable line totals including sale-time tax/discount.

**Residual:** The PIN KDF is an iterated HMAC construction, not a standardized
PBKDF2/Argon2 implementation. If a memory-hard KDF is mandatory, add a native
PBKDF2/Argon2 package.

## Task 10 — Migrations + CI (M-04, M-05, M-06)

**Commit:** `42e0a5f`

- Committed `prisma/migrations/20261123000000_init/migration.sql` and
  `migration_lock.toml`; added `prisma:migrate:dev`/`deploy`; documented the
  baseline for databases previously created with `db push`.
- Flutter schema migrations are versioned (Task 8).
- Added `.github/workflows/ci.yml`: API (Postgres service, generate, validate,
  migrate, seed, build, unit, e2e), React (typecheck, test, build), Flutter
  (analyze, test, web build), and an advisory dependency audit.

**Residual:** CI has not executed yet (no push). The dependency-audit job is
`continue-on-error` until D-01/D-02 are resolved. The local dev database predated
the baseline migration (created with `db push`); it was synced and baselined with
`prisma migrate resolve --applied 20261123000000_init`, after which the 19 e2e
tests passed.

## Task 11 — Printer + operations (M-07, M-08, R-05) — DEFERRED

- **Printer/hardware work was explicitly skipped at the user's request.** No
  `BluetoothReceiptPrinterService`, ESC/POS encoding, device selection, or
  cash-drawer integration was added. The existing interface and mock remain;
  M-08 and R-05 stay open.
- Operational documentation was added in
  [`operations-runbook.md`](./operations-runbook.md) covering deployment
  topology, secrets, TLS/CORS, health probes, rate limiting, backups,
  observability, SPA routing, and incident ownership.

## Task 12 — Dependency advisories (D-01, D-02) — DEFERRED

Current `npm audit --omit=dev` (2026-11-23) still reports:

- **API:** 6 advisories (1 critical): `tar` via `@mapbox/node-pre-gyp`,
  `deepmerge-ts`/`effect` via `@prisma/config`, and `prisma` itself.
- **React:** 3 advisories (1 high): `zod < 4.6.6`, `react-router < 7.18.0`.

Every fix requires a semver-major upgrade (Prisma 7+, Zod 4 + `@hookform/resolvers`
major, React Router 7). The audit explicitly says not to apply blind major
overrides without migration testing. Recommended deliberate sequence:

1. Upgrade Prisma to a fixed 7.x, regenerate the client, verify the importer,
   seed, and e2e suites, then re-audit.
2. Upgrade Zod to 4 with `@hookform/resolvers` v5; run the React form tests.
3. Upgrade React Router to 7; verify routing, guards, and direct navigation.
4. Only then remove `continue-on-error` from the CI audit job.

**Residual:** The advisories remain present in `package-lock.json`. They are not
exploitable through the reviewed request paths in the same way as the fixed
application defects (e.g. `tar` is build-time tooling), but they must be cleared
before an internet-facing release.

## Recheck (2026-11-23)

Every finding was re-verified against the code. Full status matrix:
[`recheck-after-remediation.md`](./recheck-after-remediation.md).

The recheck found and fixed four additional gaps:

1. Discounted offline sales now preserve per-line and bounded order discounts
   through sync (plus a regression test); previously they synced at full price.
2. Sync refunds now reject a sale that belongs to a different store than the
   authorized grant.
3. Replayed refund commands are idempotent before grant verification, so an
   already-applied refund cannot be stuck retrying after grant expiry.
4. Flutter refreshes its pending/failed counts after a transport failure so the
   retry gate and badge stay accurate.

Still open after recheck: M-02, M-16, R-01, R-03, R-06; partial: H-02, H-08,
H-13, M-04, M-07, R-02, R-04; deferred: M-08/R-05, D-01, D-02.

## Live-test finding (2026-11-23) — POS sale did not reach Admin

A real POS sale did not change stock in React Admin. Investigation:

- The database contained the cashier's shift but none of their sales, so the
  sale never reached the server.
- `SyncNotifier._maybeSync` gated the periodic sync on
  `pendingCount + failedCount`, but counts were refreshed only on init,
  connectivity change, and sync completion. A newly enqueued sale left
  `pendingCount` at its stale value (often 0), so the 30s timer skipped the push
  until an app reload or connectivity event. There was also no UI or event that
  called `syncNow()` after checkout.
- React Admin also cached data for 60s with `refetchOnWindowFocus: false`, so an
  already-open view would not notice a server-side change promptly.

Fixes:

- `_maybeSync` refreshes outbox counts before evaluating the gate.
- New `requestSync()` (refresh + push) is invoked immediately after checkout,
  shift open/close, and refund enqueue.
- React `staleTime` is 15s with `refetchOnWindowFocus: true`; inventory/sales
  poll every 15s, ledger/reports every 30s.

Note: the Flutter "Open offline demo" path deliberately never syncs; a real
sale must come from a logged-in session. Existing pending outbox rows will push
on the next app start or within the timer interval after this build is loaded.

## Live-test finding 2 (2026-11-23) — Shift button did nothing

The POS app bar's Shift icon navigates to `/shift`, but `resolveRedirect` sent
`/shift` back to `/pos` whenever a shift was open. That made Shift Management —
and therefore Close Shift — unreachable, so pressing the icon appeared to do
nothing and there was no way to end a shift.

- Allow `/shift` while a shift is open; only `/login` and `/store-selector`
  bounce to the POS.
- Route-guard tests updated to cover the reachable `/shift` route.
- The sync status cloud is now a tappable icon that requests an immediate sync
  (still shows offline/syncing/pending/failed/synced state).
