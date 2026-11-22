# Role & Objective

You are a Senior Flutter Engineer. Build the **Flutter POS Cashier App** (`apps/pos-flutter`) for a 1–3 store retail POS system.
Before writing code, read the specification files in `docs/mvp-design` (`01-core-prd.md`, `02-db-design.md`, `04-frontend-pos-flutter.md`, and `06-api-contract.md`) and strictly adhere to all schemas, endpoints, and architectural constraints.

---

# Tech Stack & Packages

- **Framework:** Flutter (latest stable) with Dart 3+ (null-safe, strict lints)
- **State Management & DI:** `flutter_riverpod` + `riverpod_annotation` (with `build_runner`)
- **Local Database (Offline-First):** `drift` + `sqlite3_flutter_libs` + `path_provider`
- **Networking:** `dio` (with Auth JWT + `X-Store-Id` interceptor & retry logic)
- **Routing:** `go_router` (with auth & active-shift route guards)
- **Connectivity & Background Sync:** `connectivity_plus`
- **Hardware / Printing:** `esc_pos_utils_plus` + `print_bluetooth_thermal` (abstracted behind a service interface so UI/tests never depend on physical hardware)
- **Utilities:** `uuid` (v4 client-side IDs), `intl` (IDR currency formatting), `flutter_secure_storage` (JWT storage)
- **Testing:** `flutter_test`, `mocktail`, `drift` in-memory `NativeDatabase.memory()`

---

# Architecture & Folder Structure (Feature-First)

Organize `lib/` using clean, feature-first layering so business logic is completely decoupled from UI and hardware:

```text
lib/
├── core/
│   ├── config/          # Env config, API base URL, constants
│   ├── database/        # Drift database, tables, DAOs, migrations
│   ├── network/         # Dio client, Auth/Store interceptors, API error mapper
│   ├── router/          # GoRouter setup & auth/shift guards
│   ├── theme/           # AppTheme, colors, typography (tablet/pos-friendly touch targets)
│   └── utils/           # Currency formatter (integer IDR), UUID helper, clock wrapper
├── features/
│   ├── auth/            # Login, store selector, token storage, Manager PIN verification
│   ├── shift/           # Open shift, active shift state, cash drawer count & close shift
│   ├── catalog/         # Local Drift product/barcode search, category filter, stock badge
│   ├── pos/             # Cart state, item/order discounts, tax (BPS) calculation, checkout
│   ├── receipts/        # Receipt history, item-level refund flow (PIN-gated), ESC/POS printer
│   └── sync/            # Outbox queue processor, delta pull worker, sync status indicator
└── main.dart
```

---

# Critical Business & Engineering Rules (Non-Negotiable)

1. **Integer-Only Money Math:** Never use `double` for currency or tax calculations. Store and compute all prices, discounts, tax (`tax_rate_bps`), and totals as `int` (smallest currency unit, e.g., IDR `18000`). Use integer basis-point math: `tax = (taxableAmount * taxRateBps) ~/ 10000`.
2. **True Offline-First Checkout:**
   - Checkout MUST NEVER require an active internet connection.
   - Completing a sale must execute inside a **single Drift atomic transaction**:
     1. Insert into `local_sales` and `local_sale_items` (with `product_name_snapshot` and `unit_price` snapshot).
     2. Decrement `stock_on_hand` in `local_products` (allow negative stock locally; do not block checkout).
     3. Enqueue a `SYNC_SALE` payload into `sync_outbox` (`status = PENDING`).
3. **Idempotent Sync Engine:**
   - Generate UUID v4 on the client for `shifts.id`, `sales.id`, and `sale_items.id`.
   - `SyncService` watches network connectivity and drains `sync_outbox` FIFO via `POST /api/v1/sync/push`, marking items `SYNCED` only upon server confirmation, followed by `GET /api/v1/sync/pull?storeId=...&since=...` to upsert local catalog/stock.
4. **Shift & PIN Guards:**
   - Cashiers cannot access the POS checkout screen unless an open shift exists for the active `store_id`.
   - Order/item discounts exceeding cashier threshold and all refunds require Manager PIN verification (`POST /auth/verify-pin` when online, or offline cached PIN hash fallback).
5. **Hardware Abstraction:**
   - Define `abstract interface class ReceiptPrinterService` with a `BluetoothReceiptPrinterService` implementation and a `MockReceiptPrinterService` fallback so receipt formatting and checkout flows run cleanly in emulators and tests.

---

# Testing Requirements (Mandatory)

Every module must include automated tests under `test/`:

1. **Unit Tests:**
   - Cart & tax calculation engine (BPS rounding, item vs. order discounts, split/cash change calculation, zero/negative edge cases).
   - Sync outbox state machine (retry backoff, idempotent state transitions, delta pull upsert).
2. **Database Integration Tests (In-Memory Drift):**
   - Verify atomic checkout transaction: confirms `local_sales` row, `local_sale_items` snapshots, `local_products.stock_on_hand` decrement, and `sync_outbox` entry all commit or rollback together.
3. **Widget Tests:**
   - POS Checkout screen: barcode/search add-to-cart, quantity updates, payment modal, and verifying checkout succeeds when network is offline.
   - Shift open/close variance calculation UI.

---

# Execution Plan (Step-by-Step)

Work incrementally and verify each phase compiles and passes `flutter test` before moving to the next:

- **Phase 1: Foundation** — Initialize `pubspec.yaml`, folder structure, integer currency/BPS math utilities + unit tests, and `AppTheme`.
- **Phase 2: Drift Local DB & DAOs** — Define `local_products`, `local_shifts`, `local_sales`, `local_sale_items`, and `sync_outbox` tables, run `build_runner`, and write in-memory DB transaction tests.
- **Phase 3: Auth, Store Selection & Shift Management** — Implement login, `flutter_secure_storage`, Dio interceptors (`Authorization` + `X-Store-Id`), and open/close shift flow with `go_router` guards.
- **Phase 4: POS Catalog, Cart & Offline Checkout** — Build responsive POS split-screen UI (product grid/barcode search on left, cart & payment drawer on right) wired to Riverpod and atomic Drift checkout.
- **Phase 5: Sync Engine & Receipt Printing/Refunds** — Build background `SyncService` (push outbox + pull delta), sync status badge in app bar, ESC/POS receipt builder, and PIN-gated refund screen.

Start with **Phase 1**: inspect `pubspec.yaml` and `docs/mvp-design`, set up dependencies, and implement the core integer math utilities with unit tests first.

Always document notable progress with an md file in `docs/pos-flutter/progress/` and don't forget to commit git.
