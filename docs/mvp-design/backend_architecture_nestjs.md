# Backend Architecture (NestJS + Prisma + PostgreSQL)

## 1. Tech Stack
- **Framework:** NestJS (TypeScript)
- **ORM:** Prisma ORM with PostgreSQL
- **Validation:** `class-validator` & `class-transformer` via global `ValidationPipe`
- **Auth:** `@nestjs/jwt`, `passport-jwt`, `bcrypt`
- **API Docs:** `@nestjs/swagger` (auto-generates OpenAPI spec for React Admin client)

## 2. Folder Structure
```text
apps/api-nestjs/src/
├── common/
│   ├── decorators/       # @CurrentUser(), @Roles(), @StoreId()
│   ├── guards/           # JwtAuthGuard, RolesGuard, StoreAccessGuard
│   └── filters/          # HttpExceptionFilter (standard error envelope)
├── modules/
│   ├── auth/             # Login, refresh token, Manager PIN verification
│   ├── sync/             # Offline POS delta pull & idempotent batch push
│   ├── shifts/           # Open/close register shifts & cash variance
│   ├── sales/            # Receipt queries & PIN-authorized refunds
│   ├── products/         # Master catalog & per-store price overrides
│   ├── inventory/        # Stock queries, adjustments, atomic store transfers
│   ├── stores/           # Store configuration & tax rates
│   ├── users/            # Staff CRUD & store assignments
│   └── reports/          # Aggregated KPIs & top products per/all stores
└── prisma/               # schema.prisma & seed.ts
```

## 3. Core Backend Mechanics

### Tenant & Store Guard (`StoreAccessGuard`)
- Every POS request includes `X-Store-Id: <uuid>`.
- `StoreAccessGuard` verifies that `user.role === 'OWNER'` OR `storeId` exists in `user.assignedStoreIds`.
- Prevents cross-store data leaks across the 1–3 branches.

### Idempotent Sync Engine (`POST /sync/push`)
1. Receives an array of `shifts` and `sales` generated offline by the Flutter POS.
2. Wraps each sale ingestion inside a `prisma.$transaction`:
   - Checks if `sales.id` (client-generated UUID) already exists. If yes, skips insertion and returns `id` in `syncedSaleIds` (safe for network retries).
   - Inserts `sales` and `sale_items`.
   - Decrements `store_inventory.stock_on_hand` (`decrement: item.qty`).
   - Inserts `stock_ledger` rows with `reason: 'SALE'` and `reference_id: sale.id`.
3. Returns `{ syncedShiftIds, syncedSaleIds, failed }` so the POS can mark local SQLite outbox rows as synced.

### Atomic Inter-Store Transfers (`POST /inventory/transfer`)
Executes inside a single `prisma.$transaction`:
1. Validates `fromStoreId !== toStoreId` and `qty > 0`.
2. Decrements `store_inventory` for `fromStoreId` and inserts `stock_ledger` (`TRANSFER_OUT`).
3. Increments `store_inventory` for `toStoreId` and inserts `stock_ledger` (`TRANSFER_IN`).