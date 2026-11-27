# Flutter POS — screens, components, and functions

Base: `apps/pos-flutter/lib`. State: Riverpod. Routing: `go_router`.
Notation: `→` means "calls / navigates to". `API:` is the endpoint invoked.

## Route map and guards (`core/router/app_router.dart`)

- `/login` → `LoginScreen`
- `/store-selector` → `StoreSelectorScreen`
- `/shift` → `ShiftScreen`
- `/pos` → `PosScreen`
- `/refund/:saleId` → `RefundScreen`
- `resolveRedirect(isLoggedIn, hasStore, hasOpenShift, location)`:
  - not logged in → `/login`
  - logged in, no store → `/store-selector`
  - logged in + store, no open shift → `/shift`
  - ready → `/login` and `/store-selector` bounce to `/pos`; `/pos`, `/shift`, `/refund/*` allowed.
- Router refreshes on `authProvider` and `shiftProvider` changes.

---

## Screens

### `LoginScreen` (`features/auth/login_screen.dart`)

Contents:
- Logo (`Icons.point_of_sale`), app name, "Sign in to continue".
- Login card with form.

Components:
- Email `TextFormField`
  - validator: non-empty, contains `@`.
- Password `TextFormField`
  - obscure toggle IconButton → toggles visibility.
  - validator: non-empty, length ≥ 4.
  - submit on keyboard done → `_handleLogin`.
- Error text from `authProvider.error`.
- Button "Sign In" → `_handleLogin()`:
  - validate form → `AuthNotifier.login(email, password)` → `API: POST /auth/login` → `context.go('/store-selector')`.
  - disabled/spinner while `authState.isLoading`.
- Web only: Button "Open offline demo" → `_openOfflineDemo()`:
  - seeds demo products (`storeId = demo-store`), starts demo session, refreshes shift, opens a local shift with opening cash 0 (no sync), → `/pos`.
  - shows "Preparing demo" spinner and demo error text.
  - note: demo data never syncs to the server.

### `StoreSelectorScreen` (`features/auth/store_selector.dart`)

Contents:
- App bar "Select Store" (no back), logout IconButton.
- Welcome text with user name, instruction text.
- List of `_StoreCard`.

Components:
- Logout IconButton → `AuthNotifier.logout()` → `/login`.
- `_StoreCard` (store name, code, tax, selected check):
  - onTap → `PinService.clearCache()` → `AuthNotifier.selectStore(store)` → `/shift`.
  - Selected card styled with primary container/check icon.

### `ShiftScreen` (`features/shift/shift_screen.dart`)

Contents:
- App bar "Shift Management".
- Store info card (name, code, tax).
- If shift open: `_ActiveShiftCard` + Close Shift button.
- If no shift: `_OpenShiftCard`.
- If no store selected: "No store selected" fallback.

Components:
- App bar IconButton `Icons.store` (tooltip "Change Store") → `/store-selector`.
- `_ActiveShiftCard`
  - Header: receipt icon, "Active Shift", opened timestamp, `OPEN` badge.
  - Tiles: Opening Cash, Expected Cash (`_ShiftInfoTile`).
  - Variance banner when nonzero: "Cash Over/Short" with warning/check icon.
- Button "Close Shift" (red, disabled while closing) → `_showCloseShiftDialog`.
  - Dialog: expected cash text, actual cash input (validator ≥0), Cancel, Close Shift.
  - Confirm → `ShiftNotifier.closeShift(actualCash, syncToServer: !isDemo)` → `requestSync()` when real → snackbar with variance/error.
- `_OpenShiftCard`
  - Icon, "No Active Shift", instruction.
  - Button "Open New Shift" → `_showOpenShiftDialog`.
  - Dialog: opening cash input (validator ≥0), Cancel, Open Shift.
  - Confirm → `ShiftNotifier.openShift(amount, syncToServer: !isDemo)` → `requestSync()` when real → snackbar on error.
- `_ShiftInfoTile` (icon, label, value).

### `PosScreen` (`features/pos/pos_screen.dart`)

App bar:
- Title:
  - compact (<600px): store name.
  - wide: store name + "Shift <short-id> • Cashier <name>".
- IconButton `Icons.lock_clock` (tooltip "Shift") → `/shift`.
- IconButton `Icons.logout` (tooltip "Sign out") → `AuthNotifier.logout()` → `/login`.
- `_SyncStatusBadge` (see below).

Body (`LayoutBuilder`):
- Wide (≥900px): Row of `_CatalogPane` (expanded) + divider + `_CartPanel` (width 400).
- Narrow: `_CatalogPane` only; bottom `_CartBar` opens `_CartPanel` in a modal bottom sheet (85% height) with checkout closing the sheet first.

#### `_CatalogPane`
- Search `TextField`:
  - hint "Scan barcode or search products", autofocus.
  - `onChanged` → `productQueryProvider`.
  - `onSubmitted` → `_submitSearch`: exact barcode lookup, then exact SKU lookup, else set query; adds the product to the cart on exact match; refocuses.
  - Clear IconButton → clears controller + query, refocus.
- `catalogProvider` states:
  - loading spinner.
  - error text "Could not load products".
  - empty state with icon + "Sync the catalog or adjust the search."
  - grid of `_ProductCard`.

#### `_ProductCard`
- Shows name (2 lines), stock badge ("Out" or qty; red if ≤0, amber if ≤5), SKU, effective price.
- `InkWell.onTap` → `CartNotifier.addProduct(product)`.

#### `_CartPanel`
- Header:
  - "Cart" + count `Chip`.
  - TextButton "Clear" (disabled when empty) → `CartNotifier.clear()`.
- Empty state: cart icon, "Cart is empty", instruction.
- List of `_CartLineTile`:
  - Name, unit price.
  - Percent IconButton (tooltip "Item discount") → item discount dialog.
  - Close IconButton (tooltip "Remove") → `CartNotifier.remove`.
  - Quantity `_QtyButton` minus/plus → `decrement` / `increment`.
  - Gross (strikethrough if discounted) and net total.
- `_CartTotals`:
  - Subtotal row.
  - Item discounts row (if any).
  - Order discount row with TextButton "Add" / "<x>%" → order discount dialog.
  - Tax row.
  - Total row.
  - Button "Charge <total>" (disabled when empty) → `onCheckout`.
- Item discount dialog: amount input (IDR), Cancel, Apply → `CartNotifier.setItemDiscount`.
- Order discount dialog: percent input, quick chips 0/5/10/20, Cancel, Apply → `CartNotifier.setOrderDiscountBps`.

#### `_CartBar` (mobile)
- Key `mobile-cart-bar`; cart icon + badge, "View cart", grand total; tap opens the cart sheet.

#### `_SaleCompleteDialog`
- Check icon, "Sale complete", receipt number, payment method, change (cash).
- Button "New sale" → close.

#### `_SyncStatusBadge`
- Icons/states:
  - offline → `cloud_off` (light red)
  - syncing → `sync` (app-bar foreground/white)
  - pending → `cloud_upload` (amber)
  - failed → `error` (light red)
  - synced → `cloud_done` (white)
- Tap:
  - Load failed outbox entries.
  - If any: "N sync issue(s)" dialog listing entity id + `last_error`; buttons Close / "Retry now" → `SyncNotifier.retryFailed()`.
  - Else: `SyncNotifier.requestSync()` + snackbar "Sync requested".
- Tooltip includes "• tap to sync".

#### Checkout flow
- `_checkout()` → `showPaymentDialog` → `PaymentDialog`; on result → `_SaleCompleteDialog`.

### `PaymentDialog` (`features/pos/payment_dialog.dart`)

Contents:
- "Payment" title, amount due, tax.
- `SegmentedButton` Cash / QRIS / Card.
- Cash mode: cash received input, suggested cash chips, change display.
- Error text.

Components:
- Cash `TextField` (digits only) + suggestion `ActionChip`s (tap fills amount).
- Cancel button → close (disabled while processing).
- "Complete Sale • <total>" button (disabled when cash < total) → `_confirm()`:
  - validates store/user/open shift.
  - `CheckoutService.checkout(...)` → local atomic sale/items/stock/outbox (`SalesDao.completeSale`).
  - clears cart, invalidates `catalogProvider`, refreshes shift, `requestSync()`.
  - returns `PaymentResult` (sale, method, tendered, change) or shows an error.

### `RefundScreen` (`features/receipts/refund_screen.dart`)

Route: `/refund/:saleId`.

Contents:
- App bar "Refund", back arrow → `/pos`.
- Loading spinner / "Sale not found".
- Sale card: receipt, date, original total.
- Item list:
  - Refund qty `Slider` (0..remaining), refund amount, "x/y" remaining.
  - Fully refunded items show check + "Fully refunded".
- Error text.
- Buttons:
  - "Cancel" → `/pos`.
  - "Refund <amount>" → `_confirmRefund()`.

`_confirmRefund()`:
- Requires at least one item.
- `showPinDialog` → `PinService.verify` (online `API: POST /auth/verify-pin` or offline cached grant); requires `grant`.
- Local transaction: increment `refunded_qty`, increment store-scoped stock, update sale status.
- Enqueues a `refund` outbox command (`refunds[]`, `authorizationToken`, idempotency id).
- `requestSync()` → `/pos` + snackbar.

### PIN dialog (`features/auth/pin_dialog.dart`)

- `showPinDialog(context, title, message, storeId)` → `PinVerification?`.
- `_PinDialog`: title, message, PIN `TextFormField` (6 digits), error text.
  - "Cancel" → pop null.
  - "Verify" → `PinService.verify(pin, storeId, userId)`; success → pop verification; failure → inline error.
- `PinKeypad` reusable numeric keypad widget (digit/backspace/clear, calls `onComplete`).

---

## State providers

- `authProvider` (`StateNotifierProvider<AuthNotifier, AuthState>`)
  - `login`, `selectStore`, `startDemoSession`, `logout`, `clearError`.
- `shiftAuthProvider` — auth identity used by shift logic (overridable in tests).
- `shiftProvider` (`StateNotifierProvider<ShiftNotifier, ShiftState>`)
  - loads open shift for selected store/user; computes expected cash.
  - `refresh`, `openShift`, `closeShift`, `clearError`.
- `cartProvider` (`StateNotifierProvider<CartNotifier, CartState>`)
  - `addProduct`, `addLine`, `increment`, `decrement`, `setQty`, `remove`,
    `setItemDiscount`, `setOrderDiscountBps`, `applyPrices` (sync refresh), `clear`.
- `catalogProvider` (`FutureProvider<List<LocalProduct>>`) — active-store search/catalog.
- `productQueryProvider` — search text/scan input.
- `activeStoreIdProvider` — store used by the catalog (overridden in `main.dart` from auth).
- `syncProvider` / `syncStatusProvider` (`SyncNotifier` / `SyncStatusState`)
  - `requestSync`, `retryFailed`, `syncNow(force)`, periodic pull every 30s.
- `databaseProvider` — `AppDatabase`.
- `pinServiceProvider`, `secureStorageProvider`.

---

## Dialogs and helper widgets (summary)

- Open Shift dialog, Close Shift dialog.
- Item discount dialog, Order discount dialog.
- Payment dialog, Sale complete dialog.
- Sync issues dialog.
- PIN dialog.
- `_QtyButton`, `_TotalRow`, `_ShiftInfoTile`, `_StoreCard`, `_ProductCard`, `_CartLineTile`, `_SyncStatusBadge`.

---

## Local data and services (non-UI)

- `core/database/app_database.dart` — SQLite schema + versioned migrations (`PRAGMA user_version`), foreign keys.
  - Tables: `local_products` (PK `store_id,id`), `local_shifts`, `local_sales`, `local_sale_items`, `local_sale_tenders` (v2 tender breakdown), `sync_outbox`, `local_sync_state`.
- DAOs:
  - `products_dao` — store-scoped catalog/stock upsert/query/decrement/increment.
  - `sales_dao` — atomic checkout (sale + items + stock + outbox), receipt sequence, cash totals, pending stock deltas, push payloads.
  - `shifts_dao` — open/close shift, outbox enqueue, push payloads.
  - `sync_dao` — outbox pending/failed/retry/reset, per-store cursor.
- `features/sync/sync_provider.dart`
  - pushes outbox per entity (only marks acknowledged ids synced), retries failed, pulls deltas, preserves pending stock, refreshes catalog/cart prices.
- `features/pos/checkout_service.dart` — cart → `SalesDao.completeSale` (offline, no network).
- `core/network/dio_client.dart` — auth interceptor (token/refresh), `X-Store-Id`, retry interceptor (safe methods / idempotency key only), API error mapper.
- `features/auth/pin_service.dart` — online verify + scoped, expiring offline PIN/grant cache.
- `features/receipts/receipt_printer.dart` — printer interface + mock; **no production Bluetooth/hardware adapter** (deferred).
- `core/config/app_config.dart` — API base URL, tax defaults, timeouts, retry count, sync interval.
