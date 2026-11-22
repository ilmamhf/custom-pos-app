# Retail POS platform audit

- **Audit date:** 2026-11-22
- **Audited revision:** `1524c95` (`main`)
- **Scope:** NestJS API, Flutter POS, React Admin, cross-application contracts, data model, tests, security, and operational readiness
- **Excluded:** UI/UX and visual-design assessment

## 1. Executive summary

The repository is a credible local-development MVP with several strong foundations: integer IDR arithmetic, atomic local checkout, sale-level sync idempotency, bcrypt password/PIN handling, database-enforced stock-ledger relationships, and a well-tested bulk importer. The current automated baseline is green.

It is **not ready for production multi-store operation**. The most serious issues are not cosmetic:

1. Store authorization is not a reliable trust boundary. A request can present one authorized store in `X-Store-Id` while modifying another store in the body, and several read/detail endpoints perform no store-scope check at all.
2. Offline sync is not end-to-end reliable. Server-rejected work can be marked synced, failed entries never retry, shift closures are ignored after the shift already exists, and the client trusts monetary totals supplied by the device.
3. Refund correctness is unsafe. Duplicate or concurrent refund requests can exceed the refundable quantity, empty requests mutate sale status, discount/tax allocations are wrong, and Flutter emits a refund payload the API cannot accept.
4. Flutter's local catalog is not store-scoped. Switching stores can reuse another store's price and stock.
5. Offline supervisor authorization and automatic HTTP retries weaken important financial controls.
6. React has a separate session-isolation failure: cached data survives logout and is not scoped by user. Its product editor can also silently turn decimal/exponent input into a different integer price.

The audit found **2 confirmed critical, 17 confirmed high, 16 confirmed medium, and 5 confirmed low findings**, plus two dependency-advisory groups and several runtime-dependent risks. The evidence, impact, and remediation for each finding are recorded below.

### Readiness decision

| Use case | Assessment | Reason |
| --- | --- | --- |
| Local demo / developer workflow | Ready, with known sync limitations | Setup is documented; baseline tests and builds pass |
| Single-store controlled pilot | Conditional | Requires P0 store, sync, refund, and local-data fixes first |
| Multi-store production rollout | Not ready | Store isolation, sync correctness, and financial reconciliation have confirmed critical/high defects |
| Internet-facing deployment | Not ready | Secret defaults, token storage, broad CORS, dependency advisories, and missing operational controls remain |

## 2. Scope and method

### Components reviewed

- `apps/api-nestjs`: authentication, authorization, stores, users, products, inventory, shifts, sales, refunds, reports, sync, Prisma model, DTOs, error handling, Swagger, importer, unit/e2e tests.
- `apps/pos-flutter`: authentication and store selection, local SQLite schema, catalog, shift lifecycle, checkout, refunds, PIN verification, outbox/sync, Dio behavior, receipt-printer abstraction, unit/widget tests.
- `apps/admin-react`: authentication/session handling, API client, query/mutation contracts, role/store context, inventory, sales, reports, staff management, tests and build.
- Repository operations: setup documentation, Compose configuration, migrations, CI, production artifacts, dependency advisories.

### Verification baseline

The following checks passed during the audit:

| Check | Result |
| --- | --- |
| API unit tests | 25 passed |
| API e2e tests | 19 passed |
| API TypeScript/build | Passed |
| React tests | 27 passed |
| React production build | Passed |
| Flutter tests | 156 passed |
| Flutter web build | Passed |
| `flutter analyze` | No errors or warnings; 24 info-level deprecation notices |
| API `npm audit --omit=dev` | 6 advisories: 5 high, 1 critical |
| React `npm audit --omit=dev` | 3 advisories: 1 high, 2 moderate |

The audit did not modify application logic. The committed deliverable is this report only.

### Classification rules

- **Confirmed defect:** the current implementation directly contradicts the intended behavior or creates an invalid state. File/line evidence is provided.
- **Runtime-dependent risk:** the implementation is incomplete or the outcome depends on deployment, workload, hardware, payment-provider, or concurrency conditions not fully reproduced in the audit environment.
- **Verified strength:** behavior that was directly observed in code or covered by a passing test.

### Severity

| Severity | Meaning |
| --- | --- |
| Critical | Breaks store isolation or can materially corrupt authoritative financial/inventory state |
| High | Likely data loss, incorrect money, broken offline operation, or substantial security exposure |
| Medium | Contract, maintainability, operability, or defense-in-depth weakness with a credible production impact |
| Low | Localized defect with limited direct business impact |

## 3. Architecture and contract assessment

### 3.1 Trust boundaries

The intended architecture is sound at a high level:

```text
Flutter POS
  local SQLite catalog / shifts / sales / outbox
              |
              | JWT + X-Store-Id + idempotent entity UUIDs
              v
NestJS API  ---- Prisma / PostgreSQL
              |
              | same API contract
              v
React Admin
```

The strongest existing boundary is the client-generated sale UUID: the API checks for an existing sale before decrementing stock, so resubmitting a successfully ingested sale does not decrement stock twice (`apps/api-nestjs/src/modules/sync/sync.service.ts:120-191`). The weakest boundary is store context: the guard, controller DTOs, query parameters, and service queries do not share one canonical store identifier.

### 3.2 Evaluation criteria

| Required criterion | Result | Assessment |
| --- | --- | --- |
| Integer-only IDR | **Partial** | Flutter checkout and cart arithmetic are integer-based; API storage and tax helper use `BigInt`. Shift reconciliation uses JavaScript `number`, and API DTOs/responses cross the JavaScript safe-integer boundary. |
| Atomic offline checkout | **Pass locally** | Sale, items, stock decrement, and outbox insertion share one SQLite transaction; rollback is tested. End-to-end success after reconnect is not reliable for every operation. |
| Idempotent sync | **Partial** | Sale creation is idempotent. Existing shifts are not updated, rejected work is marked synced, and refunds have no valid offline protocol. |
| Store/role isolation | **Fail** | Role guards work. Store authorization has confirmed critical bypasses and broad missing scoping. |
| Shift / Manager-PIN guards | **Partial** | Online PIN verification uses bcrypt and checks store assignment. Offline PIN cache is global, non-expiring, and survives logout; shift close is not store/user scoped. |
| Hardware-printer abstraction | **Partial** | A clean interface and mock exist, but no Bluetooth implementation or production call site exists. |

### 3.3 Cross-application contracts

| Contract | Status | Notes |
| --- | --- | --- |
| Login response | Compatible | The API omits `user.email`; React declares it optional and falls back to the submitted email (`apps/admin-react/src/context/AuthContext.tsx:70-75`). This is not a defect. |
| Staff/store assignments | **Broken** | API returns `userStores`; React expects `stores` (`apps/api-nestjs/src/modules/users/users.service.ts:10-33`, `apps/admin-react/src/api/types.ts:40-47`). |
| Product/inventory/sales/report shapes | Mostly compatible | Basic response fields align. Authorization scope and refund/report math do not. |
| Shift sync | **Incomplete** | Client sends close state and actual cash, but the API only creates a missing shift and never applies the close transition. |
| Refund sync | **Incompatible** | Flutter emits a `refund` object inside a sale DTO; the API's sale DTO has no refund operation or shape. |
| Catalog pull | Shape-compatible, semantics unsafe | Pull returns one product row with one store's effective price/stock, while Flutter stores it under a product-only key. |
| Payment | Enumeration-compatible, process-incomplete | `CASH`, `QRIS`, `CARD`, and `SPLIT` exist, but tender/reference allocation is not modeled. |

## 4. Confirmed findings

### Severity summary

| ID | Severity | Finding |
| --- | --- | --- |
| C-01 | Critical | Conflicting store contexts bypass `StoreAccessGuard` |
| C-02 | Critical | Server-side store scoping is missing from reads and record actions |
| H-01 | High | Flutter's local catalog is not store-scoped |
| H-02 | High | Sync trusts client-supplied prices and monetary totals |
| H-03 | High | Sync does not enforce shift-sale-store/user linkage |
| H-04 | High | Rejected work is marked synced and failed entries never retry |
| H-05 | High | Existing shifts are never updated; closure sync is lost |
| H-06 | High | Pull replaces local stock without preserving pending work |
| H-07 | High | Refunds can exceed the refundable quantity; empty refunds mutate state |
| H-08 | High | Refund discount and tax accounting is incorrect |
| H-09 | High | Flutter's offline refund payload cannot satisfy the API contract |
| H-10 | High | Concurrent transfers can oversubtract source stock |
| H-11 | High | Offline PIN cache is global, non-expiring, and not cleared on logout |
| H-12 | High | Global HTTP retries can repeat non-idempotent writes |
| H-13 | High | Shift cash reconciliation uses floats and an incomplete payment model |
| H-14 | High | JWT signing falls back to known secrets |
| H-15 | High | React Query data survives logout and is not scoped by user |
| H-16 | High | React's product editor can silently corrupt prices and hide server errors |
| H-17 | High | Cashiers can enter Admin routes and retrieve product cost prices |
| M-01 | Medium | React and the API disagree on the staff-store response property |
| M-02 | Medium | React stores access and refresh tokens in `localStorage` |
| M-03 | Medium | The API returns internal exception messages to clients |
| M-04 | Medium | Flutter SQLite has no versioned migrations or declared foreign keys |
| M-05 | Medium | Prisma has no migration history |
| M-06 | Medium | No CI workflow enforces the verified commands |
| M-07 | Medium | Production deployment and observability artifacts are incomplete |
| M-08 | Medium | The printer abstraction has no production implementation or integration |
| M-09 | Medium | The ledger query key omits `limit` |
| M-10 | Medium | CORS defaults to `*` and Swagger is always enabled |
| M-11 | Medium | Most React query failures are rendered as empty datasets |
| M-12 | Medium | Dashboard date ranges are timezone-shifted and unbounded |
| M-13 | Medium | React's user/store authorization snapshot is never revalidated |
| M-14 | Medium | Logout does not revoke access or refresh tokens |
| M-15 | Medium | Refund and staff forms retain sensitive or stale state |
| M-16 | Medium | Documented sales-date and staff-edit workflows are absent |
| L-01 | Low | Pagination state survives store changes |
| L-02 | Low | Low-stock and negative-stock filters conflict |
| L-03 | Low | Negative-stock counts are page-local |
| L-04 | Low | React validation is weaker than backend validation |
| L-05 | Low | Vite is used directly but is not a declared dependency |

## 5. Critical findings

### C-01: Conflicting store contexts bypass `StoreAccessGuard`

**Severity:** Critical. **Status:** Confirmed

**Evidence**

- `StoreAccessGuard` chooses exactly one target in header/parameter/query/body priority order; the header wins: `apps/api-nestjs/src/common/guards/store-access.guard.ts:20-26`.
- It authorizes only that selected value: `apps/api-nestjs/src/common/guards/store-access.guard.ts:32-35`.
- Inventory adjustment passes the body `storeId` to the service: `apps/api-nestjs/src/modules/inventory/inventory.controller.ts:40-49`.
- The service modifies the body-selected store: `apps/api-nestjs/src/modules/inventory/inventory.service.ts:88-119`.
- Sync push similarly applies `dto.storeId`, not the header-selected context: `apps/api-nestjs/src/modules/sync/sync.service.ts:79-106`, `apps/api-nestjs/src/modules/sync/sync.service.ts:132-176`.
- A route parameter can conflict with a header in the same way: `apps/api-nestjs/src/modules/stores/stores.controller.ts:64-73`.

**Impact**

A manager assigned to BKS can send `X-Store-Id: <BKS>` with `storeId: <KMG>` to an adjustment or sync endpoint. The guard authorizes BKS while the service changes KMG. The same pattern affects any endpoint where the service's target and the guard's selected target can differ. This is a direct store-isolation failure and can corrupt stock, sales, shifts, and price overrides in an unassigned store.

**Remediation**

1. Resolve all store identifiers supplied by a request and reject any mismatch before authorization.
2. Attach one canonical store ID to the request context after authorization.
3. Controllers and services must use that canonical value, never a second client-supplied store field.
4. Add negative e2e tests for header/body, header/query, header/route, and transfer source/destination conflicts.

### C-02: Server-side store scoping is missing from reads and record actions

**Severity:** Critical. **Status:** Confirmed

**Evidence**

The following services apply a store filter only when the caller supplies one; omitting the parameter returns all stores:

- Products: `apps/api-nestjs/src/modules/products/products.service.ts:14-45`, `apps/api-nestjs/src/modules/products/products.service.ts:104-116`.
- Inventory and ledger: `apps/api-nestjs/src/modules/inventory/inventory.service.ts:20-29`, `apps/api-nestjs/src/modules/inventory/inventory.service.ts:249-258`.
- Sales list/detail: `apps/api-nestjs/src/modules/sales/sales.service.ts:17-25`, `apps/api-nestjs/src/modules/sales/sales.service.ts:85-93`.
- Shifts: `apps/api-nestjs/src/modules/shifts/shifts.service.ts:115-123`.
- Reports: `apps/api-nestjs/src/modules/reports/reports.service.ts:11-16`.
- Stores list/detail: `apps/api-nestjs/src/modules/stores/stores.service.ts:9-20`.

The controllers rely on role checks but do not apply `StoreAccessGuard` to these reads (`apps/api-nestjs/src/modules/products/products.controller.ts:34-48`, `apps/api-nestjs/src/modules/inventory/inventory.controller.ts:33-38`, `apps/api-nestjs/src/modules/sales/sales.controller.ts:29-40`, `apps/api-nestjs/src/modules/shifts/shifts.controller.ts:30-34`, `apps/api-nestjs/src/modules/reports/reports.controller.ts:17-21`, `apps/api-nestjs/src/modules/stores/stores.controller.ts:33-44`). Cashiers can therefore list every store. Store detail includes staff assignments. Shift close also accepts any shift UUID without store or user ownership validation (`apps/api-nestjs/src/modules/stores/stores.controller.ts:49-57`, `apps/api-nestjs/src/modules/shifts/shifts.service.ts:45-55`).

**Impact**

A cashier or single-store manager can enumerate other stores, products, effective prices, inventory, sales, shifts, reports, and staff/store relationships. A cashier who learns or guesses a shift UUID can attempt to close another store's shift. “All Stores” is treated as a presentation filter, not a privileged server-side scope.

**Remediation**

- Introduce one server-side store-scope policy: owner may explicitly request all stores; managers and cashiers are always restricted to assigned stores; cashiers should additionally be restricted to their own operational records where appropriate.
- Default to deny when a store context is required but absent.
- Scope every list query and every object lookup by the authorized store set.
- Return only the caller's accessible stores from `/stores`.
- Add cross-store e2e tests for every controller, including omitted filters and direct UUID access.

## 6. High-severity findings

### H-01: Flutter's local catalog is not store-scoped

**Severity:** High. **Status:** Confirmed

**Evidence**

- `local_products` has only `id` as its primary key and no `store_id`: `apps/pos-flutter/lib/core/database/app_database.dart:42-53`.
- The Drift table also declares only `{id}` as its primary key: `apps/pos-flutter/lib/core/database/tables/local_products.dart:8-40`.
- Pull uses `INSERT OR REPLACE`, replacing the row for the product UUID with the pulled store's price and stock: `apps/pos-flutter/lib/core/database/daos/products_dao.dart:35-55`, `apps/pos-flutter/lib/features/sync/sync_provider.dart:206-223`.
- Catalog queries do not filter by active store: `apps/pos-flutter/lib/features/catalog/catalog_provider.dart:14-27`.
- The cart copies that row's `effectivePrice`: `apps/pos-flutter/lib/features/pos/cart_provider.dart:21-28`.

**Impact**

After pulling store B, the same product row contains B's price and stock. Switching back to store A can sell A's products at B's price and use B's stock until another pull replaces the row. Pending local decrements can also be applied to the wrong store's stock representation.

**Remediation**

- Use a composite local identity such as `(store_id, product_id)` for catalog/stock rows.
- Scope all catalog reads and stock mutations by the selected store.
- Bind cart lines and checkout stock updates to the store captured when the item was added.
- Add a migration that rebuilds existing local data with a store identifier and a store-switch test covering two stores with different overrides.

### H-02: Sync trusts client-supplied prices and monetary totals

**Severity:** High. **Status:** Confirmed

**Evidence**

- The sync DTO accepts client `unitPrice`, `subtotal`, `taxTotal`, `discountTotal`, and `grandTotal`: `apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:52-135`.
- The API persists those values directly and does not load the product's store price or recompute tax/discount/total: `apps/api-nestjs/src/modules/sync/sync.service.ts:131-157`.
- The client also chooses the item name snapshot: `apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:63-72`.

**Impact**

A buggy or modified client can create authoritative sales with arbitrary prices, tax, discounts, and totals. Reports, cash reconciliation, receipt data, and downstream accounting then inherit the manipulated values. The device is effectively allowed to write financial truth directly.

**Remediation**

- Recompute server-side from the product, store price override/price snapshot, store tax rate, and an explicit, validated discount policy.
- Persist the price and tax basis used at the sale, including an immutable sale-time tax rate.
- Treat client totals as reconciliation hints, not authoritative values; reject or quarantine mismatches with a machine-readable reason.
- If offline price changes are a business requirement, define a signed price/version contract rather than accepting arbitrary values.

### H-03: Sync does not enforce shift-sale-store/user linkage

**Severity:** High. **Status:** Confirmed

**Evidence**

- A pushed shift accepts an optional client `userId`, and the API uses it instead of the authenticated user: `apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:23-26`, `apps/api-nestjs/src/modules/sync/sync.service.ts:93-105`.
- A pushed sale stores the push store and client `shiftId` without checking that the shift exists, belongs to that store, or belongs to the cashier: `apps/api-nestjs/src/modules/sync/sync.service.ts:131-157`.
- The database has independent foreign keys for `Sale.storeId` and `Sale.shiftId`, but no constraint that they identify the same store: `apps/api-nestjs/prisma/schema.prisma:140-178`.

**Impact**

A client can attribute a shift to another user and attach a sale to a shift from another store. Store reports, drawer reconciliation, cashier attribution, and operational audits can disagree. Referential integrity exists, but business integrity does not.

**Remediation**

- Use the authenticated user ID for shift ownership unless a deliberate manager reassignment command exists.
- Before ingesting a sale, load and validate its shift: same store, authorized cashier/owner relationship, open at sale time, and compatible lifecycle state.
- Consider a composite store/shift relation or database constraint that prevents a sale/store/shift mismatch.

### H-04: Rejected work is marked synced and failed entries never retry

**Severity:** High. **Status:** Confirmed

**Evidence**

- The API returns per-entity `syncedShiftIds`, `syncedSaleIds`, and `failed`: `apps/api-nestjs/src/modules/sync/sync.service.ts:202-206`.
- Flutter reads only the two success arrays and marks the entire outbox row synced after any HTTP 200, without inspecting `failed`: `apps/pos-flutter/lib/features/sync/sync_provider.dart:154-165`.
- The DAO contains failed-entry and reset helpers, but the sync engine only selects `PENDING` rows and never calls them: `apps/pos-flutter/lib/core/database/daos/sync_dao.dart:30-50`, `apps/pos-flutter/lib/core/database/daos/sync_dao.dart:159-166`, `apps/pos-flutter/lib/features/sync/sync_provider.dart:141-170`.
- Scheduled sync is gated by `pendingCount == 0`; failed work is not counted as work to retry: `apps/pos-flutter/lib/features/sync/sync_provider.dart:109-115`.

**Impact**

A server-side validation or database failure can be reported inside a successful HTTP response and the client will permanently mark the work synced. A transport failure marks the row `FAILED`, but no later path returns it to `PENDING`. Offline sales can therefore be lost from both the server and the retry queue.

**Remediation**

- Make the response result authoritative per entity: never mark an outbox item synced unless its entity ID is in the success set.
- Model `PENDING`, `IN_FLIGHT`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, and `SYNCED` explicitly.
- Retry retryable failures with exponential backoff and jitter; retain terminal errors for operator resolution.
- Schedule pull independently from pending push work so a failed push does not prevent catalog refresh.
- Add a contract test for a mixed response containing both success and failure IDs.

### H-05: Existing shifts are never updated; closure sync is lost

**Severity:** High. **Status:** Confirmed

**Evidence**

- The API checks for an existing shift and does nothing when it is present: `apps/api-nestjs/src/modules/sync/sync.service.ts:88-108`.
- Flutter closes a shift and enqueues an `updateShift` operation containing `closedAt` and `actualCash`: `apps/pos-flutter/lib/core/database/daos/shifts_dao.dart:92-119`, `apps/pos-flutter/lib/core/database/daos/shifts_dao.dart:196-211`.
- The API does not inspect the outbox operation and has no shift-state transition or close-update branch: `apps/api-nestjs/src/modules/sync/sync.service.ts:84-114`.

**Impact**

Once the open-shift event reaches the server, the later close event is acknowledged as synced but never applied. The server retains an open shift with no expected/actual cash. Sales may continue to be linked to a drawer the device considers closed. This is a normal-path defect, not only an edge case.

**Remediation**

- Define explicit shift commands (`open`, `close`, optionally `adjust`) and validate legal state transitions.
- On close, verify the shift's store/user, derive expected cash from authoritative sale/payment snapshots, and persist actual cash atomically.
- Return a distinct result for an already-closed shift and make the operation idempotent by command ID.

### H-06: Pull replaces local stock without preserving pending work

**Severity:** High. **Status:** Confirmed

**Evidence**

- Local checkout decrements the cached product stock: `apps/pos-flutter/lib/core/database/daos/sales_dao.dart:102-132`.
- Pull replaces cached rows with the server's absolute stock: `apps/pos-flutter/lib/core/database/daos/products_dao.dart:35-55`, `apps/pos-flutter/lib/features/sync/sync_provider.dart:206-223`.
- The engine does not merge unsynced local deltas before replacement, and the pull's `serverTime` is not persisted: `apps/pos-flutter/lib/features/sync/sync_provider.dart:225-229`.

**Impact**

When a failed or unacknowledged local sale is still represented locally, a later pull can overwrite its local decrement with server stock. The local and server views then diverge in opposite directions. The cursor is also not a durable per-store pull cursor, so delta semantics are not reliable across stores or sessions.

**Remediation**

- Track pending stock deltas per `(store, product)` and subtract them when materializing authoritative server stock, or reconcile before applying the pull.
- Persist a monotonic cursor per store and use a server-defined snapshot/cursor protocol.
- Define deletion/deactivation behavior and test multi-store, interrupted-sync, and partial-failure sequences.

### H-07: Refunds can exceed the refundable quantity; empty refunds mutate state

**Severity:** High. **Status:** Confirmed

**Evidence**

- `items` is an array but has no minimum-length validation: `apps/api-nestjs/src/modules/sales/dto/sale.dto.ts:41-45`.
- The sale and its item quantities are read before the transaction begins: `apps/api-nestjs/src/modules/sales/sales.service.ts:126-134`.
- Every requested item is checked against the same pre-transaction `refundedQty` snapshot, then incremented independently: `apps/api-nestjs/src/modules/sales/sales.service.ts:171-199`.
- With no items, the transaction still updates the sale status to `PARTIALLY_REFUNDED`: `apps/api-nestjs/src/modules/sales/sales.service.ts:236-252`.

**Impact**

Two entries for the same sale item can each pass the remaining-quantity check and collectively refund more than was sold. Two concurrent refund requests can read the same remaining quantity and both commit. Both cases inflate stock and refund cash beyond the original sale. An empty request also changes authoritative sale status without refunding anything.

**Remediation**

- Require at least one item and aggregate duplicate sale-item IDs before validation.
- Lock the sale/item rows or use a serializable transaction/conditional update that enforces `refunded_qty + requested <= qty` at commit time.
- Add an idempotency key for each refund command.
- Test duplicate entries, concurrent requests, empty arrays, and retry after an ambiguous response.

### H-08: Refund discount and tax accounting is incorrect

**Severity:** High. **Status:** Confirmed

**Evidence**

- The server's `SaleItem` model stores only unit price, quantity, and refunded quantity; it has no discount, tax, line-total, or refundable-amount snapshot: `apps/api-nestjs/prisma/schema.prisma:181-193`.
- Sync sale-item DTOs likewise carry only name, unit price, and quantity: `apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:52-79`.
- Refund value is calculated as gross `unitPrice * refundQty`, ignoring discount, then tax is added: `apps/api-nestjs/src/modules/sales/sales.service.ts:233-256`.
- Reports use the same gross-refund calculation: `apps/api-nestjs/src/modules/reports/reports.service.ts:46-52`.

**Impact**

A discounted sale refunds too much. Tax is recomputed at the current store rate instead of using the sale-time rate, and rounding is not allocated from the original sale. Report net sales and top-product revenue disagree with the actual amount paid. This is especially serious because Flutter stores line discount and tax locally but does not send them to the server.

**Remediation**

- Persist immutable per-line gross, discount, taxable amount, tax, line total, and sale-time tax rate.
- Define a deterministic order-discount allocation across lines.
- Refund the exact proportional line amounts, including the original tax treatment and a documented residual-rounding rule.
- Make report calculations consume the same refund ledger/amounts as the refund command.

### H-09: Flutter's offline refund payload cannot satisfy the API contract

**Severity:** High. **Status:** Confirmed

**Evidence**

- Flutter mutates local refund quantities, stock, and sale status, then writes a `createRefund` outbox operation: `apps/pos-flutter/lib/features/receipts/refund_screen.dart:104-174`.
- Its payload places a `refund` object inside a sale and uses refund-item objects as the sale's `items`: `apps/pos-flutter/lib/features/receipts/refund_screen.dart:138-159`.
- The API's `SyncSaleDto` requires receipt, monetary totals, payment method, timestamp, and full sale-item DTOs; it defines no refund command or `refund` property: `apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:81-136`.

**Impact**

The API rejects the pushed payload during DTO validation. The customer receives a local refund, local stock is restored, and the server retains the original sale/refund state. The eventual outbox failure compounds H-04 because the local transaction has already committed.

**Remediation**

- Add a first-class refund sync command with refund ID, sale ID, manager authorization proof, item allocations, reason, and idempotency key.
- Keep the local refund mutation and outbox command atomic, but treat server acknowledgment as the authoritative reconciliation point.
- Support online refunds through the existing endpoint with the same command model and offline queuing for the same command.

### H-10: Concurrent transfers can oversubtract source stock

**Severity:** High. **Status:** Confirmed

**Evidence**

- The transfer transaction first reads source inventory and checks `stockOnHand >= qty`: `apps/api-nestjs/src/modules/inventory/inventory.service.ts:166-181`.
- It later performs an unconditional decrement: `apps/api-nestjs/src/modules/inventory/inventory.service.ts:185-196`.

**Impact**

Under PostgreSQL's default read-committed isolation, two transfers can both read sufficient stock and then both decrement it. The source can become negative even though each request appeared valid. The ledger remains internally balanced, but the source quantity violates the transfer precondition.

**Remediation**

- Use a conditional update that decrements only when `stock_on_hand >= qty`, and reject if no row is updated.
- Alternatively lock the source inventory row or use serializable isolation with a retry on serialization failure.
- Add a concurrent-transfer integration test that starts two transfers against the same limited stock.

### H-11: Offline PIN cache is global, non-expiring, and not cleared on logout

**Severity:** High. **Status:** Confirmed

**Evidence**

- Offline PIN storage uses global keys without store or user identity: `apps/pos-flutter/lib/features/auth/pin_service.dart:57-59`.
- The cached value is a salted SHA-256 digest: `apps/pos-flutter/lib/features/auth/pin_service.dart:43-46`.
- Offline verification accepts the cached hash without expiry, store check, or revocation check: `apps/pos-flutter/lib/features/auth/pin_service.dart:92-108`.
- `clearCache()` exists but logout only clears auth tokens and state: `apps/pos-flutter/lib/features/auth/pin_service.dart:123-128`, `apps/pos-flutter/lib/features/auth/auth_provider.dart:169-173`.

**Impact**

A PIN verified for BKS can authorize an offline action at KMG because the cache is global. The cached authorization survives logout and can authorize a later user on the device. It has no maximum lifetime, and fast SHA-256 makes offline guessing cheaper than the API's bcrypt verification.

**Remediation**

- Prefer a short-lived, server-signed offline authorization grant bound to store, user, action, and expiry.
- If local PIN caching remains, key it by store and user, add a strict TTL, clear it on logout/store switch, and use a memory-hard KDF such as Argon2id or PBKDF2 with a high work factor.
- Invalidate cached grants when PINs or assignments change on the server.

### H-12: Global HTTP retries can repeat non-idempotent writes

**Severity:** High. **Status:** Confirmed

**Evidence**

- The Flutter Dio client installs one retry interceptor for every request: `apps/pos-flutter/lib/core/network/dio_client.dart:24-34`.
- It retries timeouts, connection errors, and every 5xx response without checking method or idempotency: `apps/pos-flutter/lib/core/network/dio_client.dart:143-185`.
- Refund, inventory adjustment, and transfer endpoints have no idempotency key; inventory adjustment applies the delta again and transfer applies another decrement: `apps/api-nestjs/src/modules/inventory/inventory.service.ts:88-138`, `apps/api-nestjs/src/modules/inventory/inventory.service.ts:141-246`, `apps/api-nestjs/src/modules/sales/sales.service.ts:126-263`.

**Impact**

If the server commits a request but the response is lost or replaced with a 5xx, the interceptor sends the request again. A refund can be repeated, stock can be adjusted twice, and stock can be transferred twice. The sale-sync path is safer because the server checks the sale UUID before applying it, but its HTTP-level retry is still unnecessary duplication.

**Remediation**

- Restrict automatic retries to safe/idempotent requests unless an explicit idempotency key is present.
- Add idempotency keys and durable server-side result storage to refunds, adjustments, transfers, and shift commands.
- Keep ambiguous-write recovery in the durable outbox rather than issuing blind HTTP retries.

### H-13: Shift cash reconciliation uses floats and an incomplete payment model

**Severity:** High. **Status:** Confirmed

**Evidence**

- Shift reconciliation converts `BigInt` values to JavaScript `number` and accumulates cash with `number`: `apps/api-nestjs/src/modules/shifts/shifts.service.ts:65-93`.
- Refund cash is approximated from item price only, despite the comment “Add approximate tax”; tax and discount are not reconciled: `apps/api-nestjs/src/modules/shifts/shifts.service.ts:73-87`.
- The schema has a `SPLIT` payment method but no tender/component table: `apps/api-nestjs/prisma/schema.prisma:27-32`, `apps/api-nestjs/prisma/schema.prisma:158-175`.
- Flutter offers cash, QRIS, and card only and stores no tendered amount or external reference: `apps/pos-flutter/lib/features/pos/payment_dialog.dart:78-115`, `apps/pos-flutter/lib/features/pos/payment_dialog.dart:199-224`, `apps/pos-flutter/lib/core/database/tables/local_sales.dart:29-45`.

**Impact**

Drawer variance can be wrong for discounted, taxed, or split payments. Floating-point accumulation violates the integer-only money rule and loses precision at sufficiently large totals. A `SPLIT` sale contributes no cash to expected drawer cash because only `PaymentMethod.CASH` is counted.

**Remediation**

- Use `BigInt` throughout reconciliation and persist tender components per sale.
- Store tendered amount, change, external payment reference, and per-method allocation.
- Reconcile from immutable sale/refund monetary snapshots rather than recalculating from current tax rates.
- Add tests for discounts, tax rounding, partial cash refunds, QRIS/card, and split allocations.

### H-14: JWT signing falls back to known secrets

**Severity:** High. **Status:** Confirmed

**Evidence**

- Access and refresh token generation use hard-coded fallback strings when configuration is absent: `apps/api-nestjs/src/modules/auth/auth.service.ts:86-90`, `apps/api-nestjs/src/modules/auth/auth.service.ts:157-171`.
- The JWT strategy has the same access-secret fallback: `apps/api-nestjs/src/modules/auth/strategies/jwt.strategy.ts:20-24`.
- The example environment publishes those same values: `apps/api-nestjs/.env.example:4-7`.

**Impact**

A deployment that omits or misspells environment variables starts successfully with publicly known signing keys. Anyone can forge access/refresh tokens, including owner tokens. This is a deployment-triggered critical authentication bypass.

**Remediation**

- Validate configuration during startup and refuse to boot when secrets are absent, short, or equal to the examples.
- Generate unique high-entropy secrets per environment and document rotation.
- Keep example values obviously placeholders rather than usable defaults; fail closed in production.

### H-15: React Query data survives logout and is not scoped by user

**Severity:** High. **Status:** Confirmed

**Evidence**

- One application-level `QueryClient` is created and retained for the SPA lifetime: `apps/admin-react/src/App.tsx:20-32`.
- Its default query `staleTime` is one minute: `apps/admin-react/src/App.tsx:20-27`.
- Logout clears tokens and auth state but does not remove or clear cached queries: `apps/admin-react/src/context/AuthContext.tsx:84-90`.
- The unauthorized event also clears auth state without clearing the query cache: `apps/admin-react/src/context/AuthContext.tsx:48-54`.
- Query keys contain resource, store, filters, and page, but no user/session identity: `apps/admin-react/src/api/queries/queryKeys.ts:1-55`.

**Impact**

If user B signs into the same SPA shortly after user A logs out, reports, inventory, sales, or user-list data from user A can render before a successful refetch. A one-minute stale window makes this a normal cross-account disclosure path, not only a theoretical race.

**Remediation**

- Remove all queries or recreate the `QueryClient` on logout and on the unauthorized event.
- Include a stable user/session identifier in every query key.
- Add a test that logs in as user A, populates the cache, logs out, logs in as user B, and asserts that no A data is rendered.

### H-16: React's product editor can silently corrupt prices and hide server errors

**Severity:** High. **Status:** Confirmed

**Evidence**

- Base/cost price fields accept browser number strings, while the Zod schema checks only string length: `apps/admin-react/src/features/products/ProductModal.tsx:19-26`, `apps/admin-react/src/features/products/ProductModal.tsx:167-200`.
- `parseIdr` removes every non-digit character before parsing: `apps/admin-react/src/lib/formatters.ts:24-38`. Consequently, `18.5` becomes `185` and `1e4` becomes `14`.
- The converted value is sent directly as the product price: `apps/admin-react/src/features/products/ProductModal.tsx:86-109`.
- Whitespace-only SKU/name values pass the client schema and are trimmed to empty strings before submission; the backend then rejects them.
- `mutateAsync` is awaited without a catch, and the modal has no mutation-error state: `apps/admin-react/src/features/products/ProductModal.tsx:86-113`, `apps/admin-react/src/features/products/ProductModal.tsx:132-240`.

**Impact**

A decimal or exponent-form price can be saved as a materially different integer without an error. Whitespace-only fields and other API validation failures are also not explained to the operator. Because catalog prices drive sales, this is a financial-data integrity defect rather than a cosmetic validation issue.

**Remediation**

- Require an integer-only string such as `/^\d+$/` before conversion and set `step={1}` on numeric inputs.
- Trim before minimum-length validation on both client and server.
- Use one strict IDR parser for raw input rather than the display-oriented `parseIdr` helper.
- Catch mutation errors and render the API message in the modal; never close on failure.

### H-17: Cashiers can enter Admin routes and retrieve product cost prices

**Severity:** High. **Status:** Confirmed

**Evidence**

- Only `/settings` has a React role guard; dashboard, sales, products, and inventory are protected only by authentication: `apps/admin-react/src/App.tsx:40-62`.
- The repository describes the portal as an Owner/Manager application and states that a Cashier is not an Admin user: `README.md:155-190`.
- The product-list API explicitly permits Cashier and returns `costPrice`: `apps/api-nestjs/src/modules/products/products.controller.ts:34-39`, `apps/api-nestjs/src/modules/products/products.service.ts:57-69`, `apps/admin-react/src/features/products/ProductsPage.tsx:114-117`, `apps/admin-react/src/features/products/ProductsPage.tsx:155-167`.
- Hiding a sidebar link is not route authorization.

**Impact**

A Cashier can directly visit `/products` and obtain cost prices, despite the intended Admin role boundary. Other Admin routes are also reachable, although their API calls generally fail with 403. Because cost data is commercially sensitive and the product endpoint is server-accessible to Cashier, the client route guard is not a sufficient control.

**Remediation**

- Apply role guards to every Admin route, not only settings.
- Restrict the product-list endpoint to the intended roles and omit cost price from responses where it is not needed.
- Keep server-side role authorization authoritative; route guards are only a usability layer.

## 7. Medium-severity findings

### M-01: React and the API disagree on the staff-store response property

**Severity:** Medium. **Status:** Confirmed

The API returns `userStores` (`apps/api-nestjs/src/modules/users/users.service.ts:10-33`), while React types and the staff table consume `stores` (`apps/admin-react/src/api/types.ts:40-47`, `apps/admin-react/src/features/settings/StaffManagementTab.tsx:76-89`). Assigned branches are therefore displayed as “All Stores.” Align the API shape or normalize it in one client adapter, and add a contract test using the real response shape.

### M-02: React stores access and refresh tokens in `localStorage`

**Severity:** Medium. **Status:** Confirmed

`apps/admin-react/src/api/client.ts:17-31` stores both bearer tokens in `localStorage`; `apps/admin-react/src/context/AuthContext.tsx:28-45` restores them from persistent browser storage. Any successful script execution in the origin can read them. Keep the access token in memory, use a short-lived refresh credential in an `HttpOnly`, `Secure`, `SameSite` cookie, and add a restrictive content-security policy.

### M-03: The API returns internal exception messages to clients

**Severity:** Medium. **Status:** Confirmed

For non-HTTP exceptions, the global filter puts `exception.message` into the response (`apps/api-nestjs/src/common/filters/http-exception.filter.ts:49-58`). Database and library messages can disclose schema, query, or implementation details. Return a generic production message and a correlation ID; log the original exception server-side.

### M-04: Flutter SQLite has no versioned migrations or declared foreign keys

**Severity:** Medium. **Status:** Confirmed

The database creates tables with `CREATE TABLE IF NOT EXISTS` and no schema-version mechanism (`apps/pos-flutter/lib/core/database/app_database.dart:40-159`). Local sale items reference sale/product/shift IDs as plain text without declared foreign-key constraints (`apps/pos-flutter/lib/core/database/app_database.dart:113-125`). Add ordered migrations, enable foreign keys explicitly, and test upgrades from each supported schema version.

### M-05: Prisma has no migration history

**Severity:** Medium. **Status:** Confirmed

The repository contains no `prisma/migrations` directory, and setup uses `prisma db push` (`apps/api-nestjs/package.json:13-17`, `README.md:71-86`). `db push` is useful for local prototyping but does not provide a reviewed, repeatable production migration history. Generate and commit a baseline migration, then use `prisma migrate deploy` in deployment.

### M-06: No CI workflow enforces the verified commands

**Severity:** Medium. **Status:** Confirmed

No `.github/workflows` directory exists. The test/build/analyze checks documented in this audit are manual. Add CI for API lint/type/build/unit/e2e, React type/test/build, Flutter format/analyze/test/build, dependency audit, and Prisma validation. Make protected branches require the pipeline.

### M-07: Production deployment and observability artifacts are incomplete

**Severity:** Medium. **Status:** Confirmed

Compose provisions only PostgreSQL (`compose.yaml:1-23`); there are no application container images, deployment manifests, backup/restore procedure, health/readiness endpoint, rate limiting, metrics, tracing, or alerting configuration. `apps/api-nestjs/src/app.module.ts:14-31` registers feature modules only. Before production, define deployment topology, secret injection, TLS termination, database backup/restore drills, health checks, structured logs, metrics, traces, and alert ownership.

### M-08: The printer abstraction has no production implementation or integration

**Severity:** Medium. **Status:** Confirmed

The receipt service interface and mock are present (`apps/pos-flutter/lib/features/receipts/receipt_printer.dart:40-79`), and printer dependencies are declared (`apps/pos-flutter/pubspec.yaml:22-23`). However, no `BluetoothReceiptPrinterService` implementation exists, and there is no production `printReceipt` call site. Implement the adapter, selection/reconnection behavior, ESC/POS encoding, cash-drawer support, and device-level integration tests before promising hardware printing.

### M-09: The ledger query key omits `limit`

**Severity:** Medium. **Status:** Confirmed

`queryKeys.inventory.ledger` includes filters and page but not page size (`apps/admin-react/src/api/queries/queryKeys.ts:23-31`), while `useStockLedger` accepts a `limit` and sends it to the API (`apps/admin-react/src/api/queries/index.ts:189-205`). Two requests with different limits but the same page can reuse stale cached data. Include every request-affecting parameter in the key.

### M-10: CORS defaults to `*` and Swagger is always enabled

**Severity:** Medium. **Status:** Confirmed

The API enables credentialed CORS with `origin: '*'` by default (`apps/api-nestjs/src/main.ts:16-21`) and always exposes Swagger plus raw OpenAPI JSON (`apps/api-nestjs/src/main.ts:36-52`). Use an environment-specific allowlist and disable or protect documentation in production. This is separate from authentication: the API's own authorization remains the primary control.

### M-11: Most React query failures are rendered as empty datasets

**Severity:** Medium. **Status:** Confirmed

Products, inventory, sales, ledger, and staff views consume query data/loading but not the query `error` state, so their normal empty-row branch is used for network, 401/403, and backend failures (`apps/admin-react/src/features/products/ProductsPage.tsx:36-40`, `apps/admin-react/src/features/products/ProductsPage.tsx:129-146`, `apps/admin-react/src/features/inventory/InventoryPage.tsx:35-41`, `apps/admin-react/src/features/inventory/InventoryPage.tsx:184-194`, `apps/admin-react/src/features/sales/SalesPage.tsx:27-38`, `apps/admin-react/src/features/inventory/StockLedgerTab.tsx:16-22`). The dashboard already demonstrates the correct distinct error state (`apps/admin-react/src/features/dashboard/DashboardPage.tsx:41-46`, `apps/admin-react/src/features/dashboard/DashboardPage.tsx:133-137`). Render an explicit error and retry state in every query view.

### M-12: Dashboard date ranges are timezone-shifted and unbounded

**Severity:** Medium. **Status:** Confirmed

The dashboard constructs local midnight, converts it to an ISO date string, and sends only `from` (`apps/admin-react/src/features/dashboard/DashboardPage.tsx:23-39`). In UTC+7, local midnight can become the previous UTC date. The API parses a date-only value as UTC midnight and applies no upper bound when `to` is absent (`apps/api-nestjs/src/modules/reports/reports.service.ts:18-22`). “Today,” “7 Days,” and “30 Days” can therefore start on the wrong day and include future-dated transactions. Use an explicit business-timezone half-open interval `[start, end)` and send precise timestamps.

### M-13: React's user/store authorization snapshot is never revalidated

**Severity:** Medium. **Status:** Confirmed

Session restoration trusts the persisted `pos_admin_user` and `pos_admin_stores` snapshots (`apps/admin-react/src/context/AuthContext.tsx:28-45`), and login persists the same values (`apps/admin-react/src/context/AuthContext.tsx:70-82`). The API has no current-session endpoint; refresh returns only tokens (`apps/api-nestjs/src/modules/auth/auth.controller.ts:13-44`, `apps/api-nestjs/src/modules/auth/auth.service.ts:86-111`). Role changes, deactivation, branch reassignment, and store changes therefore remain stale in the frontend after refresh or reload. Add `/auth/me` (or equivalent), hydrate from it at startup/refresh, and treat persisted data only as a temporary cache.

### M-14: Logout does not revoke access or refresh tokens

**Severity:** Medium. **Status:** Confirmed

React logout only removes browser tokens (`apps/admin-react/src/context/AuthContext.tsx:84-90`), and the auth controller exposes no logout/revocation endpoint (`apps/api-nestjs/src/modules/auth/auth.controller.ts:13-44`). Refresh validation checks signature and active-user status only (`apps/api-nestjs/src/modules/auth/auth.service.ts:86-110`); the user model has no token version or refresh-session record (`apps/api-nestjs/prisma/schema.prisma:58-74`). A copied access token remains usable until expiry, and a copied refresh token remains usable for its full lifetime. Use server-side refresh sessions or a per-user token version, revoke on logout, and invalidate the previous refresh token during rotation.

### M-15: Refund and staff forms retain sensitive or stale state

**Severity:** Medium. **Status:** Confirmed

The refund dialog resets its PIN, reason, and quantities only after a successful mutation (`apps/admin-react/src/features/sales/RefundDialog.tsx:30-33`, `apps/admin-react/src/features/sales/RefundDialog.tsx:75-93`). The staff modal resets fields only after successful creation (`apps/admin-react/src/features/settings/StaffModal.tsx:27-33`, `apps/admin-react/src/features/settings/StaffModal.tsx:64-81`). Cancelling and reopening a dialog can retain a manager PIN and prior inputs. Reset state when the dialog opens, the selected sale changes, and the dialog closes, including cancellation and failure paths.

### M-16: Documented sales-date and staff-edit workflows are absent

**Severity:** Medium. **Status:** Confirmed

The sales API supports `from`/`to`, but the React sales page always passes both as undefined and offers only status filtering (`apps/admin-react/src/api/queries/index.ts:213-233`, `apps/admin-react/src/features/sales/SalesPage.tsx:27-38`, `apps/admin-react/src/features/sales/SalesPage.tsx:63-79`). The staff table can only toggle active status even though its copy claims to manage credentials, assignments, and supervisor PINs (`apps/admin-react/src/features/settings/StaffManagementTab.tsx:14-19`, `apps/admin-react/src/features/settings/StaffManagementTab.tsx:23-26`, `apps/admin-react/src/features/settings/StaffManagementTab.tsx:103-113`). Administrators cannot perform receipt date analysis or correct staff permissions and credentials after creation, although the corresponding API update contract exists. Add the date filters and staff edit workflow.

## 8. Low-severity findings

### L-01: Pagination state survives store changes

**Severity:** Low. **Status:** Confirmed

Products, inventory, sales, and ledger keep page state locally and do not reset it when the selected store changes (`apps/admin-react/src/features/sales/SalesPage.tsx:21`, `apps/admin-react/src/features/products/ProductsPage.tsx:26`, `apps/admin-react/src/features/inventory/InventoryPage.tsx:25`, `apps/admin-react/src/features/inventory/StockLedgerTab.tsx:13`). A switch to a store with fewer pages can leave an empty, non-existent page visible. Reset page when the store or relevant filters change.

### L-02: Low-stock and negative-stock filters conflict

**Severity:** Low. **Status:** Confirmed

The UI allows both filters independently (`apps/admin-react/src/features/inventory/InventoryPage.tsx:136-165`), while the API uses `if ... else if` and silently ignores the low-stock condition when `negativeOnly` is true (`apps/api-nestjs/src/modules/inventory/inventory.service.ts:31-35`). Make the filters mutually exclusive or define explicit intersection semantics.

### L-03: Negative-stock counts are page-local

**Severity:** Low. **Status:** Confirmed

The negative-stock count is derived from the current page rather than a server-side total (`apps/admin-react/src/features/inventory/InventoryPage.tsx:43-45`, `apps/admin-react/src/features/inventory/InventoryPage.tsx:109-116`). Negative rows on later pages are omitted from the badge and alert count. Return a dedicated aggregate count.

### L-04: React validation is weaker than backend validation

**Severity:** Low. **Status:** Confirmed

Staff creation checks only that a password exists, and login accepts any one-character password (`apps/admin-react/src/features/settings/StaffModal.tsx:45-57`, `apps/admin-react/src/features/auth/LoginPage.tsx:11-14`), while backend DTOs require at least six characters. The server remains protected, but users receive avoidable late failures. Align client and server schemas.

### L-05: Vite is used directly but is not a declared dependency

**Severity:** Low. **Status:** Confirmed

The scripts invoke Vite (`apps/admin-react/package.json:6-12`), but Vite is absent from `devDependencies` and currently resolves transitively through Vitest/React tooling (`apps/admin-react/package.json:35-49`). Declare the supported Vite version directly so the development and build toolchain is reproducible.

## 9. Dependency findings

### D-01: API dependency advisories

`npm audit --omit=dev` reported six advisories on 2026-11-22:

- **Critical:** `tar` arbitrary file creation/overwrite, symlink poisoning, and path traversal through hardlink/symlink extraction.
- **High:** `deepmerge-ts` stack exhaustion on recursive object graphs.
- **High:** `effect` regular-expression denial of service.
- The affected Prisma/`@prisma/config` dependency chain pulls the vulnerable `deepmerge-ts` and `effect` versions.

Update Prisma and its toolchain through a tested dependency change, inspect the resolved dependency tree, and verify the importer/generator still works. Do not apply a blind major-version override without migration testing. The advisories are confirmed; exploitation in a given deployment depends on whether untrusted archives or recursive configuration objects reach the affected paths.

### D-02: React dependency advisories

`npm audit --omit=dev` reported three advisories:

- **High:** Zod can exhaust memory while validating oversized constrained collections.
- **Moderate:** React Router open-redirect behavior involving backslashes.
- **Moderate:** React Router SSR hydration constructor-injection behavior.

`npm audit fix --force` proposes breaking upgrades to Zod 4 and React Router 7. Upgrade deliberately with schema and routing regression tests; the current client is not SSR-hydrated, so the router SSR advisory's present exploitability is lower, but the dependency should still leave the vulnerable range.

## 10. Runtime-dependent risks

These are not counted as confirmed defects because their impact depends on deployment, workload, hardware, or external-provider behavior.

| ID | Risk | Evidence / condition | Required validation or control |
| --- | --- | --- | --- |
| R-01 | Payment methods are labels, not integrated payment transactions. No tender amount, gateway reference, authorization/capture state, void, or settlement is stored. | `apps/pos-flutter/lib/core/database/tables/local_sales.dart:29-45`, `apps/api-nestjs/prisma/schema.prisma:158-169` | Define provider integration, references, status transitions, reconciliation, and duplicate-capture handling. |
| R-02 | Large monetary values can cross JavaScript's exact-integer range because API DTOs use `number` and responses convert `BigInt` to `number`. | `apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:97-120`, `apps/api-nestjs/src/modules/sales/sales.service.ts:59-72` | Enforce a documented safe-integer ceiling or use decimal strings/BigInt-compatible serialization end to end. |
| R-03 | Allowing negative stock is intentional for concurrent offline sales, but the reconciliation policy is unspecified. | `apps/api-nestjs/src/modules/sync/sync.service.ts:159-178` | Define negative-stock approval, automatic transfer, write-off, and alert thresholds. |
| R-04 | Delta pull has no deletion/tombstone contract and the client does not persist the returned server cursor. | `apps/api-nestjs/src/modules/sync/sync.service.ts:27-76`, `apps/pos-flutter/lib/features/sync/sync_provider.dart:197-229` | Run multi-client disconnect/reconnect tests; define snapshot fallback and deactivation propagation. |
| R-05 | Bluetooth/thermal printer behavior depends on printer firmware, platform permissions, and device connectivity. | `apps/pos-flutter/lib/features/receipts/receipt_printer.dart:40-79` | Test target printer models on Android/iOS and define reconnect/receipt-replay behavior. |
| R-06 | Login, refresh, and PIN endpoints have no visible throttling or brute-force controls. | `apps/api-nestjs/src/modules/auth/auth.controller.ts:18-43` | Add rate limits, lockout/audit telemetry, and alerting before internet exposure. |
| R-07 | Backup/restore, disaster recovery, retention, and data-export obligations are not defined. | Repository contains only local database setup (`compose.yaml:1-23`) | Define RPO/RTO, encrypted backups, restore drills, and operational ownership. |
| R-08 | Production hosting must provide SPA fallback and API routing for the React `BrowserRouter`. Only the Vite development server defines the `/api` proxy. | `apps/admin-react/src/App.tsx:35`, `apps/admin-react/vite.config.ts:12-20` | Configure unknown application routes to serve `index.html` and route `/api` to NestJS; test direct navigation and refresh in the production-like host. |

## 11. Verified strengths

### 11.1 Money and tax

- Flutter's currency and cart modules use integer IDR and basis points, with truncating integer division and no floating-point money path in checkout (`apps/pos-flutter/lib/core/utils/currency.dart:1-22`, `apps/pos-flutter/lib/features/pos/cart_math.dart:1-32`).
- The API stores monetary columns as Prisma `BigInt` and has a `BigInt` basis-point helper (`apps/api-nestjs/prisma/schema.prisma:87-117`, `apps/api-nestjs/prisma/schema.prisma:158-188`, `apps/api-nestjs/src/common/utils/currency.util.ts:1-22`).
- Sync DTOs reject non-integer and negative monetary values at the validation boundary (`apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:38-50`, `apps/api-nestjs/src/modules/sync/dto/sync.dto.ts:97-120`).

### 11.2 Atomic local checkout

- Sale insertion, item insertion, stock decrement, and outbox insertion execute in one SQLite transaction: `apps/pos-flutter/lib/core/database/daos/sales_dao.dart:60-168`.
- The wrapper rolls back on any exception: `apps/pos-flutter/lib/core/database/app_database.dart:168-190`.
- A passing test deliberately fails an insert and verifies that stock and outbox are rolled back: `apps/pos-flutter/test/core/database/checkout_outbox_test.dart:95-129`.

### 11.3 Sync idempotency and inventory ledger

- Sale UUIDs are generated once and reused in the local sale item and outbox payload: `apps/pos-flutter/lib/core/database/daos/sales_dao.dart:102-109`, `apps/pos-flutter/lib/core/database/daos/sales_dao.dart:347-389`.
- The API checks sale existence inside the transaction and applies stock/ledger changes atomically: `apps/api-nestjs/src/modules/sync/sync.service.ts:120-192`.
- The e2e suite verifies that resubmitting a sale does not decrement stock twice: `apps/api-nestjs/test/sync-and-refund.e2e-spec.ts:135-185`.

### 11.4 Authentication and authorization foundations

- Passwords and supervisor PINs use bcrypt with ten rounds: `apps/api-nestjs/src/common/utils/hash.util.ts:1-19`.
- The JWT strategy reloads the user and rejects inactive accounts on each request: `apps/api-nestjs/src/modules/auth/strategies/jwt.strategy.ts:27-45`.
- Online manager-PIN verification selects active managers assigned to the sale store plus active owners: `apps/api-nestjs/src/modules/auth/auth.service.ts:114-155`, `apps/api-nestjs/src/modules/sales/sales.service.ts:144-169`.
- The role guard and controller `@Roles` decorators are consistently present on the reviewed controllers.

### 11.5 Relational integrity and auditability

- Store inventory has a composite primary key and enforced store/product relations: `apps/api-nestjs/prisma/schema.prisma:106-118`.
- Sale items, stock ledger entries, shifts, and sales have database relations: `apps/api-nestjs/prisma/schema.prisma:120-193`.
- Inventory adjustments, transfers, refunds, and offline sales append stock-ledger rows in the same transaction as the stock mutation.

### 11.6 Bulk importer

The importer is a strong current implementation:

- Required and supported headers are explicit, and unsupported/duplicate/empty headers are rejected: `apps/api-nestjs/src/imports/products-import.parser.ts:12-30`, `apps/api-nestjs/src/imports/products-import.parser.ts:81-109`.
- UTF-8 decoding is fatal, and NUL characters are rejected: `apps/api-nestjs/src/imports/products-import.parser.ts:116-133`, `apps/api-nestjs/src/imports/products-import.parser.ts:431-475`.
- Field lengths and 32-bit stock bounds are validated: `apps/api-nestjs/src/imports/products-import.parser.ts:13-19`, `apps/api-nestjs/src/imports/products-import.parser.ts:527-533`.
- All rows are validated before apply mode writes anything; any error returns a zero-write plan: `apps/api-nestjs/src/imports/products-import.service.ts:93-183`.
- Products and inventory are upserted by stable SKU/store keys, with absolute stock values in apply mode: `apps/api-nestjs/src/imports/products-import.service.ts:238-316`.
- Imports are transaction-batched, and dry-run is the default operational choice when explicitly requested: `apps/api-nestjs/src/imports/products-import.service.ts:238-246`, `apps/api-nestjs/scripts/import-products.ts:229-243`.
- The error report cannot overwrite the source CSV, and spreadsheet-formula prefixes are neutralized: `apps/api-nestjs/scripts/import-products.ts:136-160`, `apps/api-nestjs/scripts/import-products.ts:213-226`.

### 11.7 Documentation and test baseline

- Local setup, endpoints, seeded accounts/stores, build commands, and live verification order are documented (`README.md:1-123`, `README.md:155-240`).
- API e2e tests cover role denial, inventory transfers, sync idempotency, and the refund happy path.
- Flutter tests cover integer currency/cart behavior, atomic checkout rollback, shifts, route guards, and PIN validation.
- React tests cover role guards, store context, product permissions, dashboard/inventory behavior, and formatters.
- The printer interface keeps hardware-specific code out of receipt formatting, which is the correct abstraction boundary even though the production adapter is missing.

## 12. Test gaps and required regression coverage

### API

Add tests for:

- Every store-scoped endpoint with: assigned store, unassigned store, omitted store, conflicting header/body, conflicting header/route, and owner all-store mode.
- Shift close by an unassigned cashier/manager, sale detail by UUID across stores, and manager/cashier access to reports.
- Sync response containing mixed success/failure IDs and client handling of both.
- Opening then closing the same shift through two outbox commands.
- Sale whose shift belongs to another store or another cashier.
- Server-side recomputation/rejection of incorrect client totals and prices.
- Duplicate refund item IDs, concurrent refund requests, empty refund, retry after an ambiguous response, discounted lines, partial tax rounding, and sale-time tax changes.
- Concurrent transfers against limited source stock.
- Startup failure for missing or weak JWT secrets.

### Flutter

Add tests for:

- Two stores with different effective prices and stock, including switch-back behavior.
- Failed server response IDs and retry/backoff; failed rows returning to a retryable state.
- Pull with a pending local sale decrement and with a failed outbox row.
- Durable per-store pull cursor and deactivation/deletion propagation.
- Offline refund command shape, local transaction rollback, and server acknowledgment reconciliation.
- Offline PIN cache isolation by store/user, expiry, logout, store switch, and PIN revocation.
- Retry interceptor behavior for non-idempotent requests and ambiguous responses.
- Receipt-printer adapter behavior and receipt replay after printer failure.

### React and contracts

Add tests for:

- The real API staff response (`userStores`) and the branch labels rendered from it.
- Login with the API's exact response shape, including no `user.email`.
- Ledger cache isolation when `limit` changes.
- Token expiry, refresh failure, unauthorized-event cleanup, and cross-user cache isolation after logout.
- Route-level Cashier access, including direct navigation and product-cost disclosure.
- Product mutation input for decimals, exponent notation, whitespace-only values, and server validation errors.
- Distinct error states for every product, inventory, sales, ledger, and staff query.
- Dashboard date boundaries in a non-UTC business timezone.
- Current-session revalidation and logout/token revocation.
- Refund/staff form reset on cancel, failure, reopen, and selected-sale change.
- Page reset on store/filter changes, low/negative filter semantics, and server-side negative-stock totals.
- Unhandled MSW requests and UUID-shaped fixtures so missing/invalid mocks cannot pass silently.
- Generated or shared API types so a server/client shape change fails CI.

### Operational tests

- Fresh database bootstrap from committed Prisma migrations.
- Flutter upgrade from every supported local schema version.
- CI running every command listed in this audit.
- Dependency audit policy with documented exceptions.
- Backup restore and multi-client sync under intermittent connectivity.

## 13. Prioritized remediation roadmap

### P0: Block multi-store and reconnect use

1. **Make store context canonical and enforceable.** Resolve conflicts once, authorize the canonical store, scope every list/detail/mutation query, and add the complete cross-store e2e matrix. This closes C-01 and C-02.
2. **Repair the sync contract and state machine.** Return per-entity outcomes; never mark failed work synced; implement retry/backoff; persist a per-store cursor; reconcile pending deltas; and support explicit shift open/close transitions. This closes H-04, H-05, and H-06.
3. **Make the server authoritative for money and relationships.** Recompute prices/totals, bind authenticated identity, and validate shift/store/cashier linkage. This closes H-02 and H-03.
4. **Make refunds safe and compatible.** Aggregate/validate item quantities atomically, persist refundable monetary snapshots, add idempotency, require nonempty requests, and define a Flutter/API refund command. This closes H-07, H-08, and H-09.
5. **Store-scope Flutter local data.** Rebuild local product stock around `(store_id, product_id)` and bind cart/checkout/refund operations to the selected store. This closes H-01.
6. **Isolate React sessions and Admin roles.** Clear/recreate the query cache on logout and unauthorized events, scope keys by user, guard every Admin route, and restrict cost-price responses. This closes H-15 and H-17.

**P0 exit criteria:** no cross-store test can read or mutate another store; no cached data crosses a React user session; Cashier cannot enter Admin data; a simulated disconnect/reject/reconnect cycle loses no sale, shift, refund, or local stock delta; replaying every command is idempotent.

### P1: Restore financial and security controls

7. Make inventory transfer concurrency-safe and restrict HTTP retries to safe requests or idempotency-keyed operations (H-10, H-12).
8. Replace the offline PIN cache with a short-lived store/user/action-bound grant and clear it on logout (H-11).
9. Rebuild cash reconciliation with `BigInt`, immutable tender components, exact refund amounts, and split-payment support (H-13).
10. Fail startup on missing/weak secrets; fix React token storage, error disclosure, CORS, and Swagger exposure (H-14, M-02, M-03, M-10).
11. Correct the React staff-store contract, ledger cache key, product-price parser, query error states, date bounds, current-session hydration, revocation, and dialog state resets (H-16, M-01, M-09, M-11, M-12, M-13, M-14, M-15).

### P2: Productionize operations

12. Commit Prisma migrations and versioned Flutter migrations with foreign keys (M-04, M-05).
13. Add CI for all verified commands, contract tests, dependency audit, and migration checks (M-06).
14. Define production deployment, health/readiness, rate limiting, structured logs, metrics, tracing, backups, restore drills, and incident ownership (M-07, R-06, R-07).
15. Resolve dependency advisories with tested upgrades (D-01, D-02).
16. Implement and validate the production printer adapter and call path (M-08, R-05).
17. Define payment-provider, refund, settlement, and reconciliation behavior if QRIS/card are more than manual labels (R-01), and complete the React sales-date/staff-edit workflows (M-16).
18. Resolve the remaining React usability and reproducibility defects: reset pagination on scope changes, define inventory-filter semantics, return server-side negative-stock totals, align client validation, and declare Vite directly (L-01, L-02, L-03, L-04, L-05).

## 14. Final assessment

The codebase is not lacking structure or intent. It has appropriate local transaction boundaries, a useful immutable ledger, a sensible sync-idempotency starting point, and a disciplined importer. The decisive problem is that several trust decisions are still made by whichever client field happens to arrive first, while authoritative calculations and state transitions are left to clients.

The release gate should be the P0 set, demonstrated by adversarial multi-store and interrupted-connectivity tests. Once those defects are closed, the P1 work can establish trustworthy money, session, and retry semantics. P2 then turns a strong local MVP into an operable multi-store product.
