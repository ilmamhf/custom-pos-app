# Role & Objective

You are a Senior Backend Engineer specializing in Node.js, TypeScript, and PostgreSQL. Build the **NestJS REST API & Offline Sync Engine** (`apps/api-nestjs`) for a 1–3 store retail POS system.
Before writing code, read the specification files in `docs/mvp-design` (`01-core-prd.md`, `02-db-design.md`, `03-backend-nestjs.md`, and `06-api-contract.md`) and strictly adhere to all database schemas, REST endpoints, request/response payloads, and business rules.

# Tech Stack & Packages

- **Framework:** NestJS (latest stable) with TypeScript (strict mode enabled)
- **Database & ORM:** PostgreSQL + Prisma ORM (`@prisma/client`, `prisma`)
- **Validation & Serialization:** `class-validator`, `class-transformer` (global `ValidationPipe` with `whitelist: true`, `transform: true`)
- **Authentication & Security:** `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`
- **API Documentation:** `@nestjs/swagger` (expose OpenAPI JSON at `/api/docs-json` for React Admin codegen)
- **Configuration:** `@nestjs/config` with schema validation
- **Testing:** `jest`, `@nestjs/testing`, `supertest` (for E2E API tests against a test PostgreSQL database)

# Architecture & Folder Structure (Modular)

Organize `src/` into clean domain modules with strict separation between HTTP controllers, business services, and Prisma database transactions:

```text
src/
├── common/
│   ├── decorators/       # @CurrentUser(), @Roles(), @StoreId()
│   ├── dto/              # PaginationQueryDto, StandardErrorDto
│   ├── filters/          # HttpExceptionFilter (enforces standard JSON error envelope)
│   ├── guards/           # JwtAuthGuard, RolesGuard, StoreAccessGuard
│   └── utils/            # Integer BPS tax math, PIN/password hashing helpers
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── modules/
│   ├── auth/             # Login, refresh token, Manager/Owner PIN verification
│   ├── sync/             # Delta pull (/sync/pull) & idempotent batch push (/sync/push)
│   ├── shifts/           # Open shift, close shift & expected vs. actual cash variance
│   ├── sales/            # Receipt history & PIN-authorized item-level refunds
│   ├── products/         # Master catalog CRUD & per-store price overrides
│   ├── inventory/        # Stock queries, manual adjustments, atomic inter-store transfers, ledger
│   ├── stores/           # Store configuration & tax rate management
│   ├── users/            # Staff CRUD, roles, PIN assignment & store mappings
│   └── reports/          # Multi-store & per-store aggregated KPIs and top products
├── app.module.ts
└── main.ts               # Global prefix /api/v1, Swagger setup, CORS, global filters/pipes
prisma/
├── schema.prisma         # Exact relational schema from 02-db-design.md
└── seed.ts               # Idempotent seed script (Owner, Manager, Cashier, 2 stores, sample SKUs)
```

# Critical Business & Engineering Rules (Non-Negotiable)

1. **Integer-Only Currency & BigInt Handling:**
   - All monetary fields (`base_price`, `cost_price`, `price_override`, `opening_cash`, `expected_cash`, `actual_cash`, `subtotal`, `tax_total`, `discount_total`, `grand_total`, `unit_price`) MUST use PostgreSQL `BIGINT` / Prisma `BigInt` (or safe 53-bit integer serialization) — NEVER `Float` or `Decimal` with floating-point drift.
   - Configure global JSON serialization so `BigInt` values serialize cleanly as JSON numbers without throwing `TypeError: Do not know how to serialize a BigInt`.
2. **Idempotent Batch Sync (`POST /api/v1/sync/push`):**
   - Flutter POS clients retry failed network requests. Processing a duplicate `sales.id` or `shifts.id` (client-generated UUID v4) MUST NOT fail or double-deduct stock.
   - Wrap each sale ingestion in `prisma.$transaction`:
     1. Check if `sales.id` already exists. If it does, treat it as already processed and include its ID in `syncedSaleIds`.
     2. Insert `sales` and `sale_items`.
     3. Decrement `store_inventory.stock_on_hand` (`decrement: item.qty`) — allow negative stock without throwing an error (concurrent offline sales must always succeed).
     4. Append an immutable row to `stock_ledger` (`reason: 'SALE'`, `delta_qty: -item.qty`, `reference_id: sale.id`).
3. **Immutable Stock Ledger:**
   - `store_inventory.stock_on_hand` MUST NEVER be modified outside a `prisma.$transaction` that simultaneously inserts a corresponding audit row in `stock_ledger` (`SALE`, `RESTOCK`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT`, `REFUND`).
4. **Multi-Store Access Enforcement (`StoreAccessGuard`):**
   - Validate `X-Store-Id` header or `storeId` param/body on store-scoped routes.
   - Allow access only if `user.role === 'OWNER'` OR `storeId` is present in the user's `user_stores` assignments.
5. **PIN-Gated Refunds (`POST /api/v1/sales/:id/refund`):**
   - Verify `managerPin` against active `MANAGER` or `OWNER` users assigned to that store using `bcrypt.compare`.
   - Inside `prisma.$transaction`: validate `refundQty <= (qty - refunded_qty)`, increment `sale_items.refunded_qty`, update `sales.status` (`PARTIALLY_REFUNDED` or `REFUNDED`), increment `store_inventory.stock_on_hand`, and insert a `REFUND` entry into `stock_ledger`.
6. **Standard Error Envelope:**
   - All HTTP and validation errors must conform to the contract in `06-api-contract.md`:
     `{ "statusCode": number, "error": string, "message": string | string[], "timestamp": ISO8601 }`.

# Testing Requirements (Mandatory)

Every module must include automated tests:

1. **Unit Tests (`*.spec.ts`):**
   - `SyncService`: verify idempotency when the same `saleId` is pushed twice (stock only decrements once, ledger only gets one row).
   - `InventoryService`: verify atomic inter-store transfer decrements source store, increments destination store, and writes two ledger rows.
   - `ShiftsService`: verify `expected_cash` calculation (`opening_cash + cash_sales - cash_refunds`).
2. **E2E Integration Tests (`test/*.e2e-spec.ts`):**
   - Auth flow (login, refresh, invalid credentials, `verify-pin` with Cashier PIN rejected vs. Manager PIN accepted).
   - `StoreAccessGuard` rejecting a Cashier accessing an unassigned store (`403 Forbidden`).
   - Full offline sync lifecycle: `POST /sync/push` -> verify inventory & ledger -> `GET /sync/pull?since=...` returns updated stock -> `POST /sales/:id/refund` restores stock.

# Execution Plan (Step-by-Step)

Work incrementally and verify each phase compiles and passes tests before moving to the next:

- **Phase 1: Foundation & Prisma Schema** — Initialize NestJS project, configure `PrismaService`, write `prisma/schema.prisma` matching `02-db-design.md`, create `prisma/seed.ts`, and implement global `HttpExceptionFilter`, `ValidationPipe`, and `BigInt` JSON serializer.
- **Phase 2: Auth & Multi-Store Guards** — Implement `/auth/login`, `/auth/refresh`, `/auth/verify-pin`, `JwtAuthGuard`, `RolesGuard`, and `StoreAccessGuard` + E2E auth tests.
- **Phase 3: Catalog, Stores & Users (Admin CRUD)** — Implement `/stores`, `/users`, `/products`, and per-store `priceOverride` endpoints.
- **Phase 4: Inventory & Atomic Transfers** — Implement `/inventory`, `/inventory/adjust`, `/inventory/transfer`, and `/inventory/ledger` with unit and E2E tests.
- **Phase 5: Shifts, Sales, Refunds & Sync Engine** — Implement `/shifts/open`, `/shifts/:id/close`, `/sales/:id/refund`, `/sync/push`, `/sync/pull`, and `/reports/summary` + full E2E sync/refund tests.

Start with **Phase 1**: inspect `package.json` and `docs/mvp-design`, configure Prisma with `schema.prisma` and `seed.ts`, and verify migrations and global exception/validation pipes first.
