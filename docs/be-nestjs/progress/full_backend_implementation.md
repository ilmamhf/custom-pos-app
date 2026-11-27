# NestJS Backend & Offline Sync Engine — Implementation Progress

**Date:** 2026-11-21  
**Git Branch:** `be-nestjs`  
**Application Root:** `apps/api-nestjs`  
**Status:** ✅ All Phases (1 to 5) Complete & Verified  

---

## Executive Summary

Built the complete **NestJS REST API & Offline Sync Engine** (`apps/api-nestjs`) for a 1–3 store retail Point of Sale system. The backend strictly follows all specifications from `docs/mvp-design`:
- `core_prd_overview.md`
- `database_design_schema.md`
- `backend_architecture_nestjs.md`
- `complete_rest_api_contract.md`

All unit tests and end-to-end integration tests are passing against local PostgreSQL database instances (`pos-postgres` on port `15432` and `pos-test-db` on port `5433`).

---

## Completed Phases Overview

| Phase | Domain | Status | Key Deliverables |
| :--- | :--- | :---: | :--- |
| **Phase 1** | Foundation & Prisma Schema | ✅ Complete | Prisma schema, seed script, BigInt serialization, standard error filter, global ValidationPipe, Swagger UI & OpenAPI JSON. |
| **Phase 2** | Auth & Multi-Store Guards | ✅ Complete | JWT login & refresh, Manager/Owner PIN verification, `JwtAuthGuard`, `RolesGuard`, `StoreAccessGuard`. |
| **Phase 3** | Catalog, Stores & Users | ✅ Complete | Stores CRUD, user provisioning with store bindings, product catalog CRUD, per-store price overrides. |
| **Phase 4** | Inventory & Atomic Transfers | ✅ Complete | Stock level queries, restocks & adjustments, atomic inter-store transfers (`TRANSFER_OUT` / `TRANSFER_IN`), audit ledger. |
| **Phase 5** | Shifts, Sales, Refunds & Sync | ✅ Complete | Cash register shifts (variance tracking), PIN-authorized item refunds, idempotent batch offline push (`/sync/push`), delta pull (`/sync/pull`), KPI reports. |

---

## Detailed Architectural Breakdown

### 1. Foundation & Database Layer (Phase 1)
- **Directory:** `apps/api-nestjs/src/prisma/`, `apps/api-nestjs/prisma/`
- **Prisma Schema (`prisma/schema.prisma`):**
  - Models: `Store`, `User`, `UserStore`, `Product`, `StoreInventory`, `StockLedger`, `Shift`, `Sale`, `SaleItem`.
  - Enums: `Role` (`OWNER`, `MANAGER`, `CASHIER`), `StockLedgerReason` (`SALE`, `RESTOCK`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT`, `REFUND`), `PaymentMethod` (`CASH`, `QRIS`, `CARD`, `SPLIT`), `SaleStatus` (`COMPLETED`, `PARTIALLY_REFUNDED`, `REFUNDED`).
  - **Integer Currency:** All monetary columns (`base_price`, `cost_price`, `price_override`, `opening_cash`, `expected_cash`, `actual_cash`, `subtotal`, `tax_total`, `discount_total`, `grand_total`, `unit_price`) use PostgreSQL `BIGINT` mapped safely to Prisma `BigInt`.
  - Column names in PostgreSQL are snake_case (`tax_rate_bps`, `stock_on_hand`, etc.) via `@map`, while exposing idiomatic camelCase to NestJS TypeScript DTOs.
- **Idempotent Seed Script (`prisma/seed.ts`):**
  - Stores: `Cabang Bekasi` (`BKS`, 11% tax) and `Cabang Kemang` (`KMG`, 11% tax).
  - Users: Owner (`owner@toko.id`), Manager (`manager.bks@toko.id`), Cashier (`kasir1@toko.id`).
  - Catalog: Sample SKUs (`KOPI-001`, `ROTI-001`, `TEH-001`) with initialized stock on hand and price overrides.
- **BigInt JSON Serialization (`src/common/utils/bigint.util.ts`):**
  - Patches `(BigInt.prototype as any).toJSON` to output numbers safely, preventing `TypeError: Do not know how to serialize a BigInt`.
- **Standard Error Filter (`src/common/filters/http-exception.filter.ts`):**
  - Standardizes all exceptions to:
    ```json
    {
      "statusCode": 400,
      "error": "BAD_REQUEST",
      "message": "Human-readable error description",
      "timestamp": "2026-11-21T14:24:00.000Z"
    }
    ```
- **OpenAPI / Swagger Documentation:**
  - Interactive UI at `http://localhost:3000/api/docs`.
  - Raw JSON spec at `http://localhost:3000/api/docs-json` for React Admin client code-gen.

---

### 2. Authentication & Access Control (Phase 2)
- **Directory:** `apps/api-nestjs/src/modules/auth/`, `apps/api-nestjs/src/common/guards/`
- **Endpoints:**
  - `POST /api/v1/auth/login`: Validates credentials, issues access/refresh tokens, and returns user profile + accessible stores.
  - `POST /api/v1/auth/refresh`: Verifies refresh token and generates fresh access/refresh token pair.
  - `POST /api/v1/auth/verify-pin`: Validates Manager or Owner PIN for supervisor overrides on voids and refunds.
- **Guards:**
  - `JwtAuthGuard`: Passport JWT bearer token verification.
  - `RolesGuard`: Role-based access control based on `@Roles(Role.OWNER, Role.MANAGER, ...)`.
  - `StoreAccessGuard`: Restricts store-level operations to users explicitly assigned to that store in `user_stores`, while granting universal access to `OWNER`.

---

### 3. Catalog, Stores & Staff Management (Phase 3)
- **Directories:** `apps/api-nestjs/src/modules/stores/`, `src/modules/users/`, `src/modules/products/`
- **Stores Management:**
  - `GET /api/v1/stores`: Lists retail stores.
  - `POST /api/v1/stores`: Creates store and auto-initializes `0` stock for existing catalog items.
  - `PATCH /api/v1/stores/:id`: Updates tax rate, address, or active state.
- **Staff User Provisioning:**
  - `GET /api/v1/users`: Staff directory (Owner only).
  - `POST /api/v1/users`: Provisions staff with bcrypt hashed password, optional PIN, role, and store mappings.
  - `PATCH /api/v1/users/:id`: Updates profile, role, and store assignments.
- **Master Catalog & Store Pricing:**
  - `GET /api/v1/products`: Paginated product query with search. When `storeId` is provided, includes store-specific `stockOnHand`, `priceOverride`, and `effectivePrice`.
  - `POST /api/v1/products`: Creates master product and automatically seeds `0` inventory across all retail stores.
  - `PATCH /api/v1/products/:id`: Updates SKU, barcode, name, prices.
  - `PUT /api/v1/stores/:storeId/products/:productId/price`: Sets or removes (`null`) a store-specific price override (protected by `StoreAccessGuard`).

---

### 4. Inventory Control & Atomic Stock Transfers (Phase 4)
- **Directory:** `apps/api-nestjs/src/modules/inventory/`
- **Endpoints:**
  - `GET /api/v1/inventory`: Per-store stock queries with filters for low stock (`stockOnHand <= 10`) and negative stock (`stockOnHand < 0`).
  - `POST /api/v1/inventory/adjust`: Restocks (`RESTOCK`) and manual adjustments (`ADJUSTMENT`). Updates `store_inventory.stock_on_hand` and inserts an immutable audit record into `stock_ledger`.
  - `POST /api/v1/inventory/transfer`: Atomically transfers stock between two branches inside a single `prisma.$transaction`. Decrements source store stock, increments destination store stock, and generates two audit rows (`TRANSFER_OUT` and `TRANSFER_IN`) linked by a single `transferId`.
  - `GET /api/v1/inventory/ledger`: Paginated audit log tracking every inventory movement.

---

### 5. Shifts, Sales, Refunds & Sync Engine (Phase 5)
- **Directories:** `apps/api-nestjs/src/modules/shifts/`, `src/modules/sales/`, `src/modules/sync/`, `src/modules/reports/`
- **Register Shifts (`/shifts`):**
  - `POST /api/v1/shifts/open`: Opens a cash register session with client-generated UUID and opening cash.
  - `POST /api/v1/shifts/:id/close`: Closes drawer and reconciles cash:
    $$\text{expectedCash} = \text{openingCash} + \text{cashSales} - \text{cashRefunds}$$
    $$\text{variance} = \text{actualCash} - \text{expectedCash}$$
- **Sales & PIN-Gated Refunds (`/sales`):**
  - `GET /api/v1/sales`: Paginated receipt history.
  - `POST /api/v1/sales/:id/refund`: Requires Manager or Owner PIN. Validates remaining refundable qty, updates `refundedQty`, adjusts sale status (`PARTIALLY_REFUNDED` or `REFUNDED`), restores inventory, logs a `REFUND` ledger entry, and computes integer BPS tax refund.
- **Offline Sync Engine (`/sync`):**
  - `POST /api/v1/sync/push`: Idempotent batch ingestion for offline Flutter POS transactions. Processing duplicate `sales.id` or `shifts.id` returns safely without double-decrementing stock. Tolerates negative stock so offline checkouts are never blocked.
  - `GET /api/v1/sync/pull`: Incremental delta sync returning server timestamp cursor and products updated since last sync.
- **Business Intelligence & Reporting (`/reports`):**
  - `GET /api/v1/reports/summary`: Consolidated or store-filtered metrics: gross sales, refunds, net sales, transaction count, payment method breakdown, and top-selling products.

---

## Test Coverage & Verification

### Unit Tests (`npm test`)
- `src/modules/inventory/inventory.service.spec.ts`: Validates atomic inter-store transfer (source decrement, destination increment, dual ledger creation).
- `src/modules/sync/sync.service.spec.ts`: Validates idempotency when the same sale ID is pushed twice.
- `src/modules/shifts/shifts.service.spec.ts`: Validates drawer cash variance and expected cash formula.

```text
PASS src/modules/shifts/shifts.service.spec.ts
PASS src/modules/sync/sync.service.spec.ts
PASS src/modules/inventory/inventory.service.spec.ts

Test Suites: 3 passed, 3 total
Tests:       5 passed, 5 total
```

### End-to-End Integration Tests (`npm run test:e2e`)
- `test/auth.e2e-spec.ts`: Cashier login, token refresh, invalid credential rejection, PIN verification.
- `test/catalog-admin.e2e-spec.ts`: Product creation, store inventory auto-init, store price overrides, `StoreAccessGuard` 403 enforcement, staff creation.
- `test/inventory.e2e-spec.ts`: Restock adjustments, atomic transfers between branches, ledger audit trail.
- `test/sync-and-refund.e2e-spec.ts`: Full offline sync lifecycle (batch push -> inventory/ledger validation -> duplicate retry idempotency -> delta pull -> PIN-authorized refund restoring stock -> summary KPI reports).

```text
PASS test/catalog-admin.e2e-spec.ts
PASS test/sync-and-refund.e2e-spec.ts
PASS test/auth.e2e-spec.ts
PASS test/inventory.e2e-spec.ts

Test Suites: 4 passed, 4 total
Tests:       19 passed, 19 total
```

---

## Git Commit & Repository State

- **Branch:** `be-nestjs`
- **Latest Commit:** `ef1c55f` (`feat(api-nestjs): implement NestJS REST API and offline sync engine per spec`)
- **Ready for Next Steps:** Monorepo is prepared for React Admin (`apps/admin-react`) codegen and Flutter POS (`apps/pos-flutter`) API integration.
