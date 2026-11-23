# Recheck after remediation — 2026-11-22 audit

- **Recheck date:** 2026-11-23
- **Scope:** every confirmed finding (C, H, M, L), dependency groups (D), and
  runtime-dependent risks (R) re-verified against the code after Tasks 1–10.
- **Status legend:** `FIXED` · `PARTIAL` · `OPEN` · `DEFERRED` · `DOCUMENTED`

## Recheck result

| ID | Status | Evidence / note |
| --- | --- | --- |
| C-01 | FIXED | `StoreAccessGuard` collects header/query/route/body/fromStore identifiers, rejects mismatches with 400, authorizes one canonical value, and attaches it to the request. Adapters/sync use the canonical value. |
| C-02 | FIXED | Products inventory, inventory/ledger, sales, shifts, reports, and stores are scoped by `resolveStoreScope`; direct-UUID lookups call `assertStoreInScope`. Cashier sales detail/refund additionally require ownership. Residual: not every resource restricts cashiers to their own records. |
| H-01 | FIXED | `local_products` PK is `(store_id, id)`; catalog/barcode/checkout/refund/pull are store-scoped; `activeStoreIdProvider` follows the selected store. |
| H-02 | PARTIAL | Prices, tax, and totals are recomputed from catalog + store rate. Per-line and order discounts are now propagated and bounded (see recheck fixes). No server-side discount policy or signed price-version contract yet. |
| H-03 | FIXED | Shift ownership uses the authenticated user; sales validate shift existence, store, cashier, and open-at-sale-time. |
| H-04 | FIXED | Flutter only marks an outbox entity synced when its id is in the matching success set; failures are retained and retried with a cap. Retry counters refresh after a transport failure. |
| H-05 | FIXED | Sync applies shift-close transitions after sales using `expectedCashForSales`; already-closed shifts are idempotent. |
| H-06 | FIXED | Pull subtracts unsynced sale quantities and persists a per-store cursor. Remaining deletion/tombstone semantics are tracked under R-04. |
| H-07 | FIXED | Refund DTO requires ≥1 item; duplicate sale-item ids are aggregated; empty requests are rejected. |
| H-08 | PARTIAL | Per-line gross/discount/tax/line-total/refunded-amount snapshots drive refunds and reports; refunds allocate the final residue exactly. A formal order-discount policy is still absent (bounded client hint). |
| H-09 | FIXED | Flutter emits a `refunds[]` command with a signed grant and command id; the API authorizes the grant, validates the sale's store, and is idempotent on replay. |
| H-10 | FIXED | Transfers use a conditional `updateMany` (`stockOnHand >= qty`) and reject when no row updates. |
| H-11 | FIXED | PIN cache is keyed by user+store, expires after 7 days, uses a 20k-iteration HMAC-SHA256 KDF, requires an unexpired grant for refunds, and is cleared on logout/store switch. |
| H-12 | FIXED | Automatic retries are limited to safe methods or `Idempotency-Key` requests; sync push supplies the header. |
| H-13 | PARTIAL | Reconciliation and refund math use BigInt and immutable snapshots; local drawer cash uses line totals. `SPLIT`/tender components are still not modeled (R-01). |
| H-14 | FIXED | Production startup fails on missing/short/example JWT secrets; development warns. |
| H-15 | FIXED | Query keys are session-scoped; the cache is cleared on login/logout/unauthorized. |
| H-16 | FIXED | Integer-only price validation, trimmed fields, server-error display, no close on failure, `step=1`. |
| H-17 | FIXED | All Admin routes are role-guarded; product list/detail is Owner/Manager only. |
| M-01 | FIXED | Users endpoints return a normalized `stores` alias alongside `userStores`. |
| M-02 | OPEN | React still uses `localStorage` for tokens. A CSP was added; an HttpOnly refresh-cookie + CSRF flow is not implemented. |
| M-03 | FIXED | Non-HTTP exceptions return a generic message plus `correlationId`; the original is logged. |
| M-04 | PARTIAL | Flutter has versioned migrations (`PRAGMA user_version`) and sale→shift / sale-item→sale foreign keys. A product foreign key is not declared. |
| M-05 | FIXED | Baseline Prisma migration and lock committed; deploy scripts added. |
| M-06 | FIXED | CI workflow covers API/React/Flutter/audit. Not yet executed on a remote runner. |
| M-07 | PARTIAL | Health/readiness endpoints and an operations runbook exist; metrics, tracing, and rate limiting are not implemented. |
| M-08 | DEFERRED | Printer hardware skipped at the user's request. Interface/mock only. |
| M-09 | FIXED | Ledger (and other list) query keys include the page size. |
| M-10 | FIXED | Production requires an explicit CORS allowlist; Swagger is off by default in production. |
| M-11 | FIXED | Products, inventory, sales, ledger, and staff render distinct error states. |
| M-12 | FIXED | Dashboard sends a business-local half-open range with an explicit upper bound. |
| M-13 | FIXED | `/auth/me` hydrates the session at startup/refresh; persisted data is a cache with 401 cleanup. |
| M-14 | FIXED | Logout increments `tokenVersion`; both token types are rejected afterwards. No per-device refresh-session list. |
| M-15 | FIXED | Refund/staff dialogs reset on open, cancel, failure, and sale change. |
| M-16 | OPEN | Sales date filters (API supports `from`/`to` but the UI does not expose them) and the staff edit workflow are still absent. |
| L-01 | FIXED | Pagination resets on store change. |
| L-02 | FIXED | Low/negative stock filters are mutually exclusive in the UI. |
| L-03 | FIXED | Inventory returns a server-side `negativeCount`. |
| L-04 | FIXED | Client password/PIN validation aligned with the backend. |
| L-05 | FIXED | Vite is a declared dev dependency. |
| D-01 | DEFERRED | API advisories remain; fix requires Prisma 7+ and toolchain migration. |
| D-02 | DEFERRED | React advisories remain; fix requires Zod 4 and React Router 7 majors. |
| R-01 | OPEN | Payment methods remain labels; no tender/authorization/settlement model. |
| R-02 | PARTIAL | BigInt output serialization is guarded, but input DTOs still use JS `number`; no documented safe-integer ceiling enforced on input. |
| R-03 | OPEN | Negative-stock approval/write-off/alert policy still undefined. |
| R-04 | PARTIAL | Per-store cursor implemented; deletion/tombstone contract and snapshot fallback remain. |
| R-05 | DEFERRED | Printer behavior deferred with M-08. |
| R-06 | OPEN | No throttling/lockout on login, refresh, or PIN endpoints. |
| R-07 | DOCUMENTED | Backup/restore and retention guidance added to the operations runbook; drills are operational work. |
| R-08 | DOCUMENTED | SPA fallback and `/api` routing documented with an nginx example. |

## Gaps found and fixed during this recheck

1. **Discounted offline sales synced at full price.** The Flutter outbox omitted
   per-line discount/tax/line-total and the API ignored the sale-level
   `discountTotal`. The payload now carries the line snapshot hints, and the
   API allocates the bounded order discount across lines before recomputing tax.
   Added a unit test (`sync.service.spec.ts`) asserting a 10% discount produces
   `discountTotal=3600`, `taxTotal=3564`, `grandTotal=35964`.
2. **Cross-store refund via sync.** A grant bound to store A could reference a
   sale owned by store B. `executeRefund` now accepts `expectedStoreId`; sync
   passes the canonical store and rejects mismatches.
3. **Idempotent refund replay after grant expiry.** A replayed refund command
   is now short-circuited by its `idempotencyKey` before grant verification, so
   an already-applied refund cannot get stuck retrying.
4. **Flutter retry gate stale after transport failure.** `syncNow` now refreshes
   the pending/failed counts in its error path so the periodic timer and badge
   see the newly failed rows.

## Verification after the recheck fixes

| Check | Result |
| --- | --- |
| API `tsc --noEmit` | Passed |
| API unit tests | 26 passed (added discount-allocation test) |
| Flutter `flutter analyze` | No errors (24 pre-existing deprecation infos) |
| Flutter checkout/sync payload tests | 12 passed |
| API e2e | 19 passed against local Postgres (Docker Desktop) |

## Recommended next work

In priority order: M-16 (sales date/staff edit UI), R-06 throttling, R-01
payment tender model, R-04 tombstones, M-02 cookie-based refresh, M-04 product
FK, then the D-01/D-02 major upgrades. M-08/R-05 remain intentionally parked.
