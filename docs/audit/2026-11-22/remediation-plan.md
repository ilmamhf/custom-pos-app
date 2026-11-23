# Remediation plan — 2026-11-22 audit

- **Source audit:** [`project-audit-1.md`](./project-audit-1.md)
- **Execution log:** [`remediation-log.md`](./remediation-log.md)
- **Status legend:** `TODO` · `IN PROGRESS` · `DONE` · `DEFERRED (documented)`

## Why this order

The audit's own release gate is the P0 set. Fixes are ordered so that later
tasks build on earlier invariants instead of colliding with them:

1. The API must have one canonical store identity before any other fix can
   safely assume isolation.
2. Sync must be server-authoritative before refund/shift data is trusted.
3. Refund math depends on immutable monetary snapshots introduced in sync.
4. Client work (React, Flutter) consumes the corrected contracts.
5. Operational work (migrations, CI, deployment) trailing the code.

## Task breakdown and work order

| # | Task | Findings | Depends on | Status |
| --- | --- | --- | --- | --- |
| 1 | API canonical store context + server-side scoping | C-01, C-02 | — | DONE |
| 2 | Sync state machine, server-authoritative money, shift linkage | H-02, H-03, H-04(server), H-05(server), H-06(server) | 1 | DONE |
| 3 | Safe refunds + immutable money snapshots + Flutter refund command | H-07, H-08, H-09 (server side) | 2 | DONE |
| 4 | Inventory concurrency + startup/auth/error/CORS/Swagger hardening | H-10, H-14, M-03, M-10 | 1 | DONE |
| 5 | Staff contract + auth session revalidation/revocation | M-01, M-13, M-14, H-17(server) | 4 | DONE |
| 6 | React session isolation + Admin route authorization | H-15, H-17 | 5 | DONE |
| 7 | React product editor, query cache keys, error states, dates, dialogs, low items | H-16, M-02, M-09, M-11, M-12, M-15, L-01, L-04, L-05 | 6 | DONE (M-02 partial) |
| 8 | Flutter store-scoped local catalog + pull reconciliation | H-01, H-06(client) | 2,3 | DONE |
| 9 | Flutter sync result handling, refund command, PIN cache, retry policy | H-04(client), H-09(client), H-11, H-12 | 3,8 | DONE |
| 10 | Versioned migrations + CI | M-04, M-05, M-06 | 1-9 | DONE |
| 11 | Printer adapter + operational/deployment artifacts | M-07, M-08, R-05 | 8,9 | DEFERRED (hardware skipped; ops runbook written) |
| 12 | Dependency advisories | D-01, D-02 | 10 | DEFERRED (major upgrades documented) |

See [`remediation-log.md`](./remediation-log.md) for what changed, how it was
verified, and the residual risk for each task.

## Task detail

### Task 1 — API canonical store context + scoping

- Resolve every client-supplied store identifier (header, query, route
  `storeId`, body `storeId`/`fromStoreId`) once; reject conflicts.
- Authorize the resolved canonical store, attach it to the request.
- Add a server scope policy: Owner may request all/any; Manager/Cashier are
  restricted to assigned stores; default-deny when a scope is required but
  absent.
- Apply scope to products, inventory, ledger, sales, shifts, reports, stores.
- Shift close verifies store + caller ownership.
- Negative e2e cases: header/body, header/query, header/route, transfer, direct
  UUID access.

### Task 2 — Sync authority and state machine

- Recompute prices/tax/totals from catalog + store tax; ignore client totals.
- Use authenticated user for shift ownership; validate shift exists, belongs to
  the store, belongs to the cashier, and is open at sale time.
- Apply shift-close transitions to existing shifts (idempotent).
- Keep per-entity results authoritative.

### Task 3 — Refunds

- Require ≥1 item; aggregate duplicate sale-item IDs; reject empty.
- Lock/enforce `refunded_qty + requested <= qty` transactionally.
- Persist immutable per-line gross/discount/tax/total and sale-time tax rate.
- Refund exact proportional line amounts using the snapshot; align reports.
- Add a first-class `refunds` sync command + idempotency key.

### Task 4 — Inventory + API hardening

- Conditional decrement `stock_on_hand >= qty` for transfers.
- Fail startup on missing/example JWT secrets; validate config.
- Do not leak internal exception messages; log with correlation id.
- CORS allowlist by environment; Swagger only in non-production.

### Task 5 — Staff contract + auth sessions

- Return `stores` alias from users endpoints (keep `userStores` internal).
- Add `tokenVersion` to User; include in JWT; reject stale versions.
- Add `GET /auth/me`, `POST /auth/logout`; rotate/invalidate refresh.

### Task 6 — React session/roles

- Recreate/clear the QueryClient on logout and unauthorized.
- Put user/session id in query keys.
- Guard every Admin route with `RoleGuard`; hide cost price from Cashier.

### Task 7 — React correctness/UX

- Integer-only price input; surface mutation errors; no close on failure.
- Ledger query key includes `limit`; error states for all query views.
- Business-timezone half-open dashboard ranges with a `to` bound.
- Reset dialogs on open/close/selection; pagination reset on scope change.
- Strict client validation; declare Vite; token storage hardening/CSP.

### Task 8 — Flutter local store scoping

- `(store_id, product_id)` identity for catalog/stock; scope reads/mutations.
- Bind cart/checkout/refund to the store captured when the item was added.
- Versioned local migrations + declared foreign keys.
- Pull subtracts unsynced local deltas; persist per-store pull cursor.

### Task 9 — Flutter sync/refund/PIN/retry

- Per-entity result handling; never mark rejected work synced; retry failed.
- Emit a real refund command; reconcile on ack.
- PIN cache keyed by store+user with TTL, cleared on logout/store switch.
- Retry only idempotent requests/idempotency-keyed mutations.

### Task 10 — Migrations + CI

- Commit a Prisma baseline migration; deployment uses `migrate deploy`.
- Flutter ordered migrations with `PRAGMA user_version`.
- CI workflow: API lint/type/build/unit/e2e, React type/test/build, Flutter
  analyze/test/build, dependency audit, Prisma validate.

### Task 11 — Printer + operations

- Production `BluetoothReceiptPrinterService` adapter + selection/reconnect.
- Health/readiness endpoint, deployment notes, backup/restore runbook,
  rate-limit guidance.

### Task 12 — Dependencies

- Upgrade Prisma toolchain and Zod/router within tested ranges; re-run audits.

## Definition of done

- Every changed app still builds and its existing tests pass (with updated
  expectations where the contract intentionally changed).
- Each task's changes and verification commands are recorded in
  `remediation-log.md`, including residual/deferred risk.
