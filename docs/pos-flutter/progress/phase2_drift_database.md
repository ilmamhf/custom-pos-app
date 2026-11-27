# Phase 2: Drift Local DB & DAOs — Complete

> **Historical snapshot (2026-11-21):** the local schema below is v1-era (5 tables). The app now migrates to v2 with `local_sale_tenders` and `local_sync_state`. Current state: [`../../tasks/pos-flutter-screens.md`](../../tasks/pos-flutter-screens.md) and [`../../tasks/2026-11-27/README.md`](../../tasks/2026-11-27/README.md).

**Date:** 2026-11-21
**Status:** ✅ Complete

## Summary
Implemented the complete local SQLite database layer for offline-first POS operations using a custom SQLite wrapper (to avoid drift code generation analyzer compatibility issues).

## Completed Tasks

### 1. Database Schema (`lib/core/database/`)
Created 5 tables matching the offline-first requirements:

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `local_products` | Cached product catalog | SKU/barcode search, effective price, stock on hand (allows negative), delta sync cursor |
| `local_shifts` | Cash drawer sessions | Open/close tracking, opening/expected/actual cash, variance, store+user indexes |
| `local_sales` | Completed transactions | Receipt numbers, subtotal/tax/discount/grand total, payment method, status |
| `local_sale_items` | Sale line items | Product snapshots (name, price), qty, refunded qty, discounts, tax, line totals |
| `sync_outbox` | Offline sync queue | FIFO ordering, entity tracking, retry logic, status (pending/synced/failed) |

### 2. DAOs (Data Access Objects)
Implemented 4 DAOs with full CRUD and business logic:

**ProductsDao** (`lib/core/database/daos/products_dao.dart`)
- Upsert products (single & batch)
- Search by ID, SKU, barcode, name
- Low/negative stock queries
- Stock increment/decrement (allows negative for offline sales)
- Delta sync cursor support

**ShiftsDao** (`lib/core/database/daos/shifts_dao.dart`)
- Open/close shift with cash tracking
- Get open shift by store/user
- Shift history queries
- Unsynced shifts for sync push

**SalesDao** (`lib/core/database/daos/sales_dao.dart`)
- **Atomic checkout transaction** (core requirement):
  1. Insert sale + sale items
  2. Decrement product stock (allows negative)
  3. Enqueue sync outbox entry
  All in single SQLite transaction
- Sale/item queries by ID, receipt, shift, store
- Refund support (status updates, refunded qty)

**SyncDao** (`lib/core/database/daos/sync_dao.dart`)
- Outbox entry management (insert, status updates)
- Pending/failed entry queries for background sync
- Retry logic with max retries
- Cleanup of old synced entries
- Pending count stream for UI badge

### 3. Database Wrapper (`lib/core/database/app_database.dart`)
- Custom SQLite wrapper using `sqlite3` package directly
- Synchronous transaction support (`transaction()`, `transactionResult<T>()`)
- In-memory database for testing (`AppDatabase.inMemory()`)
- File-based database for production (`AppDatabase.open()`)
- Auto-creates tables and indexes on init

### 4. Table Definitions (`lib/core/database/tables/`)
Plain Dart classes with:
- Column definitions matching server schema
- Enums for PaymentMethod, SaleStatus, SyncOperationType, SyncStatus
- Data classes with equality/hashCode
- Indexes for common query patterns

## Technical Decisions

**Why custom SQLite wrapper instead of drift?**
- Drift's code generator (`drift_dev`) has analyzer compatibility issues with Dart SDK 3.14+
- The `visitDotShorthandPropertyAccess` error prevents code generation
- Custom wrapper provides same functionality with direct `sqlite3` package
- Simpler to maintain and debug

**Transaction Handling:**
- Synchronous transactions using `BEGIN IMMEDIATE TRANSACTION`
- `transaction()` for void operations
- `transactionResult<T>()` for operations returning values
- Automatic rollback on error

**Offline-First Design:**
- Stock decrements allow negative values (per spec)
- All sales committed locally first, synced later
- Sync outbox uses FIFO ordering with retry logic
- Delta sync support via `last_synced_at` cursors

## Verification
- ✅ `flutter analyze` — No errors (only deprecation warnings)
- ✅ `flutter test` — All 72 tests pass
  - 44 currency/math tests
  - 14 UUID tests
  - 10 clock tests
  - 4 integration scenario tests

## Files Created/Modified
```
lib/core/database/
├── app_database.dart              # Main database class + wrapper
├── tables/
│   ├── local_products.dart
│   ├── local_shifts.dart
│   ├── local_sales.dart
│   ├── local_sale_items.dart
│   └── sync_outbox.dart
├── daos/
│   ├── products_dao.dart
│   ├── shifts_dao.dart
│   ├── sales_dao.dart
│   └── sync_dao.dart
└── index.dart                     # Barrel exports
```

## Next Steps (Phase 3)
1. Auth & Store Selection — Login, secure storage, store picker
2. Dio interceptors (Auth JWT + X-Store-Id)
3. Shift Management UI — Open/close shift flow
4. GoRouter with auth/shift guards