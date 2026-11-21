# Frontend POS Architecture (Flutter)

## 1. Tech Stack
- **Framework:** Flutter (Android Tablet / iPad / Desktop)
- **State Management:** Riverpod (`flutter_riverpod`)
- **Local Database:** Drift (Type-safe SQLite wrapper)
- **Networking:** Dio (with auth token interceptor & retry logic)
- **Hardware Integration:** `esc_pos_utils_plus` + `print_bluetooth_thermal` (Bluetooth/USB thermal receipt printers) & HID/Camera barcode scanner support

## 2. Folder Structure
```text
apps/pos-flutter/lib/
├── core/
│   ├── db/               # Drift tables (local_products, local_sales, sync_outbox)
│   ├── network/          # Dio client, JWT refresh interceptor, connectivity monitor
│   └── printer/          # ESC/POS receipt layout builder & Bluetooth service
├── features/
│   ├── auth/             # Login screen, store selector, PIN dialog widget
│   ├── shift/            # Open shift modal, active shift drawer, close shift summary
│   ├── checkout/         # Product grid/search, barcode listener, cart, payment modal
│   ├── history/          # Local/synced receipts list & item-level refund flow
│   └── sync/             # Background outbox worker & manual "Sync Now" status badge
└── main.dart
```

## 3. Offline-First Data Flow (SQLite Outbox Pattern)
1. **Initial & Delta Pull (`GET /sync/pull`):**
   - On login and every 5 minutes (or manual refresh), fetches updated products, `effectivePrice`, and `stockOnHand` since `lastSyncedAt`.
   - Upserts into Drift `local_products` table so search and barcode scans run in `< 10ms` completely offline.
2. **Checkout Commit (100% Local First):**
   - Cashier taps **Charge** -> App generates a UUIDv4 `saleId` and deterministic `receiptNo` (`{STORE_CODE}-{YYYYMMDD}-{LOCAL_SEQ}`).
   - Inside a Drift SQLite transaction:
     - Writes to `local_sales` and `local_sale_items`.
     - Decrements local `stock_on_hand` in `local_products`.
     - Enqueues payload into `sync_outbox` (`status = PENDING`).
   - Triggers thermal receipt print immediately without waiting for network.
3. **Background Sync Worker:**
   - Listens to `connectivity_plus` and periodic timers.
   - Reads `PENDING` rows from `sync_outbox`, batches them to `POST /sync/push`, and marks acknowledged UUIDs as `SYNCED`.

## 4. Key UI Screens
- **Store & Shift Gate:** Blocks checkout until a store is selected and an active shift is open.
- **Split-Pane Checkout Screen:** Left pane = category tabs, barcode input, product grid; Right pane = active cart, discount toggle, tax calculation, and **Charge** button.
- **Sync Status Pill:** Top-bar indicator showing `Online (Synced)` or `Offline (X pending)` so cashiers always know sync health.