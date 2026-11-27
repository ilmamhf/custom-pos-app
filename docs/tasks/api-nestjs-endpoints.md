# NestJS API — modules, endpoints, and functions

Base: `apps/api-nestjs`. Global prefix `/api/v1`. Auth: bearer JWT.
Roles: `O`=OWNER, `M`=MANAGER, `C`=CASHIER.
Notation: `→` means "calls / delegates to".

## Bootstrap (`src/main.ts`)

- `configureBigIntSerialization()` — BigInt JSON handling.
- `NestFactory.create(AppModule)`.
- CORS: `CORS_ORIGIN` allowlist; a lone `*` stays a wildcard; production rejects `*` and non-explicit values.
- Global prefix `api/v1`.
- Global `ValidationPipe` (`whitelist`, `transform`).
- Global `HttpExceptionFilter`.
- Swagger at `/api/docs` + raw OpenAPI `/api/docs-json` (disabled in production unless `SWAGGER_ENABLED=true`).
- Listen on `PORT` (default 3000).

`app.module.ts` imports: ConfigModule (global), ThrottlerModule, PrismaModule, MetricsModule, Auth, Stores, Users, Products, Inventory, Shifts, Sales, Sync, Reports, Payments; controller: HealthController. Global guard: `ThrottlerGuard` (`APP_GUARD`); `cookie-parser` and `RequestContextMiddleware` are applied to `*`.

---

## Auth (`modules/auth`)

### Controller `AuthController`
- `POST /auth/login` (public) → `AuthService.login`
  - normalize email, bcrypt compare, reject inactive, resolve accessible stores (owner: all active), issue access+refresh tokens with `ver`.
  - `X-Auth-Refresh-Mode: cookie` (React Admin): sets `pos_refresh_token` (HttpOnly, SameSite=Strict) and `pos_csrf_token`, and omits `refreshToken` from the response body.
- `POST /auth/refresh` (public) → `AuthService.refreshToken`
  - body `refreshToken` (native): verify refresh secret, load user, check active + token version, issue new tokens (returned in body).
  - no body (browser): read the HttpOnly cookie, require a matching `X-CSRF-Token` header (double-submit, else 403), rotate both cookies, and return only an access token.
- `GET /auth/me` (JWT) → `AuthService.me`
  - current user + accessible stores; used by React to revalidate.
- `POST /auth/logout` (JWT) → `AuthService.logout`
  - increment `User.tokenVersion` (revokes both token types) and clear the auth cookies.
- `POST /auth/verify-pin` (JWT, O/M/C) → `AuthService.verifyPin`
  - find active managers assigned to the store or any owner, bcrypt PIN compare, returns `{authorized, managerId, managerName, offlineGrant}`.

### `AuthService`
- `login`, `refreshToken`, `me`, `logout`, `verifyPin`
- `verifyOfflineGrant(token, {storeId, action})` — verifies a store/user/action-bound signed grant.
- `resolveAccessibleStores`, `issueOfflineGrant`, `generateTokens`.

### JWT strategy (`strategies/jwt.strategy.ts`)
- Extracts bearer token, `resolveAccessSecret`, loads user, rejects inactive or stale `ver`, returns `RequestUser` (`id`, `email`, `role`, `name`, `assignedStoreIds`).

### DTOs
- `LoginDto`, `RefreshTokenDto`, `VerifyPinDto`, response DTOs (`LoginResponseDto`, `RefreshResponseDto`, `VerifyPinResponseDto`, `CurrentSessionResponseDto`).

---

## Stores (`modules/stores`)

### `StoresController`
- `GET /stores` (O/M/C) → `StoresService.findAll(user)`
  - owner: all stores; manager/cashier: assigned active stores.
- `GET /stores/:id` (O/M) → `findOne(id, user)` — non-owner must be assigned; includes staff assignments.
- `POST /stores` (O) → `create(dto)` — unique code; initializes `StoreInventory` rows for all products.
- `PATCH /stores/:id` (O) → `update(dto)` — name/address/taxRateBps/isActive.
- `PUT /stores/:storeId/products/:productId/price` (O/M, `StoreAccessGuard`) → `ProductsService.setPriceOverride`
  - upserts `StoreInventory.priceOverride` (null clears).

### DTOs
- `CreateStoreDto`, `UpdateStoreDto`.

---

## Users (`modules/users`)

### `UsersController` (all OWNER)
- `GET /users` → `UsersService.findAll` — safe fields + `userStores` + normalized `stores` alias.
- `GET /users/:id` → `findOne`.
- `POST /users` → `create` — hashes password/PIN, creates store assignments.
- `PATCH /users/:id` → `update` — optional name/email/role/isActive/password/pin, replaces assignments.

### DTOs
- `CreateUserDto`, `UpdateUserDto`.

---

## Products (`modules/products`)

### `ProductsController`
- `GET /products` (O/M) → `ProductsService.findAll(query, user)`
  - search SKU/barcode/name; includes store inventory scoped to the caller's store set.
- `GET /products/:id` (O/M) → `findOne(id, storeId?, user)` — scoped inventory.
- `POST /products` (O) → `create` — unique SKU; initializes inventory for all active stores.
- `PATCH /products/:id` (O) → `update` — SKU/barcode/name/prices/isActive; SKU conflict check.

Cashier access is intentionally excluded (cashiers use `GET /sync/pull`).

### DTOs
- `CreateProductDto`, `UpdateProductDto`, `SetPriceOverrideDto`, `QueryProductDto`.

---

## Inventory (`modules/inventory`)

### `InventoryController`
- `GET /inventory` (O/M) → `InventoryService.findAll(query, user)`
  - scope by store set; `storeId`, `lowStockOnly` (≤10), `negativeOnly` (<0), `search`; returns `negativeCount`.
- `POST /inventory/adjust` (O/M, `StoreAccessGuard`, canonical store) → `adjust(userId, dto, storeId)`
  - upsert stock delta + append `StockLedger` row (`RESTOCK`/`ADJUSTMENT`).
- `POST /inventory/transfer` (O/M, `StoreAccessGuard`) → `transfer(userId, dto)`
  - validate stores/product/qty; read source; conditional `updateMany` (`stockOnHand >= qty`); two ledger rows (`TRANSFER_OUT`/`TRANSFER_IN`) in one transaction.
- `GET /inventory/ledger` (O/M) → `getLedger(query, user)`
  - scoped paginated audit trail; filters product/reason.

Negative-stock policy (engine + API; Admin UI not built):
- `POST /inventory/negative-stock-policy` (O) → `createPolicy(dto, user)` — global or per-store thresholds.
- `GET /inventory/negative-stock-policy` (O/M) → `getAllPolicies()`.
- `GET /inventory/negative-stock-policy/:storeId` (O/M) → `getPolicy(storeId)`; returns/creates the global default when `storeId` is omitted.
- `PUT /inventory/negative-stock-policy` (O) → `updatePolicy(storeId ?? null, dto, user)`.
- `PUT /inventory/negative-stock-policy/:storeId` (O, legacy) → `updatePolicy(storeId, dto, user)`.
- `DELETE /inventory/negative-stock-policy/:storeId` (O) → `deletePolicy(storeId)`.
- `GET /inventory/negative-stock-events` (O/M) → `getEvents(query, user)` — paginated, filterable.
- `GET /inventory/negative-stock-events/stats` (O/M) → `getEventStats(storeId)`.
- `GET /inventory/negative-stock-events/unresolved` (O/M) → `getUnresolvedEvents(storeId)`.
- `GET /inventory/negative-stock-events/:eventId` (O/M) → `getEventById(eventId)`.
- `PUT /inventory/negative-stock-events/:eventId/resolve` (O/M) → `resolveEvent(eventId, dto, user)`.

### DTOs
- `AdjustInventoryDto`, `TransferInventoryDto`, `QueryInventoryDto`, `QueryLedgerDto`, `CreateNegativeStockPolicyDto`, `UpdateNegativeStockPolicyDto`, `ResolveNegativeStockEventDto`, `QueryNegativeStockEventsDto`, response DTOs.

---

## Shifts (`modules/shifts`)

### `ShiftsController`
- `GET /shifts` (O/M) → `findAll(query, user)` — scoped paginated shifts + variance.
- `POST /shifts/open` (O/M/C, `StoreAccessGuard`, canonical store) → `openShift(userId, dto, storeId)`
  - idempotent on client UUID; creates shift for the authenticated user.
- `POST /shifts/:id/close` (O/M/C) → `closeShift(id, dto, user)`
  - scope + ownership (cashier must own the shift); reject if already closed; compute expected cash with `expectedCashForSales` (BigInt, immutable line refunds) and actual/variance.

### DTOs
- `OpenShiftDto`, `CloseShiftDto`, `QueryShiftDto`.

---

## Sales (`modules/sales`)

### `SalesController`
- `GET /sales` (O/M) → `findAll(query, user)` — scoped; filters status/from/to.
- `GET /sales/:id` (O/M/C) → `findOne(id, user)` — scope; cashier limited to own sale.
- `POST /sales/:id/refund` (O/M/C) → `processRefund(id, user, dto)`
  - scope + cashier ownership; manager/owner PIN verification; `executeRefund`.

### `SalesService`
- `processRefund` → `verifyManagerPin` → `executeRefund`.
- `applyAuthorizedRefund(params)` — used by sync refunds (grant already verified; optional `expectedStoreId`).
- `executeRefund`:
  - aggregate duplicate sale-item ids, require ≥1 item;
  - idempotency-key short-circuit;
  - per item: remaining quantity check, proportional `lineTotal` allocation (final unit exact), optimistic conditional update (`refundedQty` unchanged), stock restore, `REFUND` ledger row;
  - recalc sale status; write `Refund` record.

### DTOs
- `RefundItemDto`, `ProcessRefundDto` (≥1 item, optional idempotencyKey), `QuerySaleDto`.

---

## Sync (`modules/sync`)

### `SyncController`
- `GET /sync/pull` (O/M/C, `StoreAccessGuard`) → `SyncService.pull(query)`
  - `full=true` returns a full snapshot (`fullSnapshot: true`, no tombstones); otherwise uses `since` or the durable `SyncCursor` row for the store.
  - returns changed products (effective price/stock), `tombstones[]` (`productId`, `deletedAt`), `serverTime`, and persists the cursor.
- `POST /sync/push` (O/M/C, `StoreAccessGuard`, canonical store) → `SyncService.push(userId, dto, storeId)`
  - ensures referenced shifts exist (owned by the authenticated user; store match);
  - ingests sales in transactions: server-authoritative unit price/name, item + bounded order discount allocation, tax at store rate, proportional per-line tax, snapshot fields; validates shift existence/store/user/timing; decrements stock; ledger rows;
  - applies refund commands (idempotency short-circuit, offline grant or manager PIN, store match);
  - applies shift-close transitions after sales (expected/actual cash, idempotent);
  - returns `syncedShiftIds`, `syncedSaleIds`, `syncedRefundIds`, `failed[]`.

### DTOs
- `SyncShiftDto`, `SyncSaleItemDto`, `SyncSaleDto`, `SyncRefundItemDto`, `SyncRefundDto`, `SyncPushDto`, `SyncPullQueryDto`.

---

## Reports (`modules/reports`)

### `ReportsController`
- `GET /reports/summary` (O/M) → `ReportsService.getSummary(query, user)`
  - scoped; half-open `[from, to)` with `to` defaulting to now;
  - gross sales, refunds from immutable snapshots, net sales, transaction count, payment breakdown, top products by net revenue.

### DTOs
- `ReportSummaryQueryDto`.

---

## Payments (`modules/payments`)

> **Security note:** the controller has no `@UseGuards`/`@Roles` (only the global `ThrottlerGuard`), so these routes are currently unauthenticated. Recorded as an open finding in `docs/tasks/2026-11-27/README.md`; the docs pass did not change behavior.

### `PaymentsController`
Provider management:
- `POST /payments/providers` → `createProvider(dto)`
- `GET /payments/providers` → `getProviders()`
- `GET /payments/providers/default` → `getDefaultProvider()`
- `GET /payments/providers/:id` → `getProviderById(id)`
- `PUT /payments/providers/:id` → `updateProvider(id, dto)`
- `DELETE /payments/providers/:id` → `deleteProvider(id)` (409 when transactions exist)

Transactions:
- `POST /payments/transactions` (current user) → `createTransaction(dto, userId)`
- `GET /payments/transactions` → filters `providerId`, `saleId`, `tenderId`, `status`, `type`, `paymentMethod`, `page`, `limit`
- `GET /payments/transactions/:id`
- `POST /payments/transactions/:id/authorize`
- `POST /payments/transactions/:id/capture`
- `POST /payments/transactions/:id/void`
- `POST /payments/transactions/:id/refund` (idempotency key)
- `POST /payments/webhook/:providerId` → `handleWebhook(providerId, payload, signature)` (HMAC signature)

### `PaymentsService`
- Provider CRUD, default selection, and `getProviderForMethod`.
- Transaction lifecycle: `createTransaction`, `authorizePayment`, `capturePayment`, `voidPayment`, `refundPayment`, `handleWebhook`.
- `GenericPaymentProvider` (HTTP, config-driven) behind `IPaymentProvider`; every provider type resolves to it today.

### DTOs
- `CreatePaymentProviderDto`, `UpdatePaymentProviderDto`, `CreatePaymentTransactionDto`, `CapturePaymentDto`, `VoidPaymentDto`, `RefundPaymentDto`, response DTOs.

---

## Health & metrics

- `GET /health` (`src/health.controller.ts`) — liveness `{status:'ok'}`.
- `GET /health/ready` — `SELECT 1`; 503 when the DB is unreachable.
- `GET /metrics` (`src/common/metrics/metrics.controller.ts`) — Prometheus registry, outside the `/api/v1` prefix.

---

## Cross-cutting

### Guards (`src/common/guards`)
- `JwtAuthGuard` — passport JWT.
- `RolesGuard` — enforces `@Roles(...)` against `RequestUser.role`.
- `StoreAccessGuard` — collects header `X-Store-Id`, route/query `storeId`, body `storeId`/`fromStoreId`; rejects conflicting values (400); authorizes the canonical store; verifies `toStoreId` for transfers; attaches `request.storeId`/`request.storeScope`.

### Decorators (`src/common/decorators`)
- `@Roles(...)` — required roles metadata.
- `@CurrentUser()` — `RequestUser` or a field.
- `@StoreId(required)` — canonical store id resolved by the guard.

### Utils (`src/common/utils`)
- `store-scope.util.ts` — `resolveStoreScope`, `storeScopeWhere`, `assertStoreInScope`.
- `currency.util.ts` — `calculateTaxBps`, `calculateGrandTotal`.
- `shift-cash.util.ts` — `expectedCashForSales` (BigInt).
- `hash.util.ts` — bcrypt password/PIN.
- `bigint.util.ts` — BigInt JSON serialization.

### Config (`src/common/config/security.config.ts`)
- `resolveJwtSecret` / `resolveAccessSecret` / `resolveRefreshSecret` — production fails closed on missing/short/example secrets.

### Errors (`src/common/filters/http-exception.filter.ts`)
- Normalizes responses; non-HTTP exceptions return a generic message + `correlationId` and log the original.

---

## Prisma models (`prisma/schema.prisma`)

- `Store` — id, name, code (unique), address, taxRateBps, isActive.
- `User` — id, name, email (unique), passwordHash, pinHash, role, isActive, tokenVersion.
- `UserStore` — `(userId, storeId)` composite PK.
- `Product` — id, sku (unique), barcode, name, basePrice, costPrice, isActive, timestamps.
- `StoreInventory` — `(storeId, productId)` PK, priceOverride, stockOnHand, updatedAt.
- `StockLedger` — store, product, deltaQty, reason, referenceId, note, createdBy, createdAt.
- `Shift` — id, store, user, openedAt/closedAt, openingCash/expectedCash/actualCash.
- `Sale` — id, store, shift, cashier, receiptNo (unique), subtotal/taxTotal/discountTotal/grandTotal, taxRateBps, paymentMethod, status, createdAt.
- `SaleItem` — sale, product, name snapshot, unitPrice, qty, refundedQty, gross/discount/tax/lineTotal/refundedAmount.
- `PaymentProvider` — name, type, config (JSON), supportedMethods[], isActive, isDefault.
- `PaymentTransaction` — provider, optional sale/tender, type, status, paymentMethod, amount, currency, externalId, reference, payloads, errorMessage, idempotencyKey, settledAt.
- `SaleTender` — sale, paymentMethod, amount, change, reference, optional paymentTransactionId.
- `Refund` — id, sale, store, creator, amount, reason, unique idempotencyKey, createdAt.
- `NegativeStockPolicy` — optional store (global when null), alert/autoTransfer/approval/writeOff thresholds, isActive.
- `NegativeStockEvent` — store, product, currentStock, actionTaken, detail, resolvedBy/resolvedAt.
- `SyncCursor` — store (unique), cursor (ISO timestamp).
- `ProductTombstone` — `(storeId, productId)` unique, deletedAt.

Migrations: `20261123000000_init`, `20261123134532_add_sale_tender`, `20261124090000_add_payment_provider`, `20261124091000_add_negative_stock_policy`, `20261124092000_add_sync_tombstones_cursor`.

---

## Importer (`src/imports`, `scripts/import-products.ts`)

- `products-import.parser.ts` — header validation, UTF-8/NUL checks, field bounds, formula neutralization.
- `products-import.service.ts` — validate-all-before-apply, upsert by SKU/store, transaction batches, dry-run.
- `scripts/import-products.ts` — CLI `--apply` / `--dry-run`, report file safe from source overwrite.
