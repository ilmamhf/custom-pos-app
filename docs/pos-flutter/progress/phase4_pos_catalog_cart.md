# Phase 4: POS Catalog, Cart & Offline Checkout — Complete

**Date:** 2026-11-22
**Status:** ✅ Complete

## Summary
The POS checkout screen works entirely offline. Cart math uses integer IDR and
basis-point tax, checkout writes the sale + items + stock decrement + sync
outbox entry in a single SQLite transaction.

## What Was Implemented

### Cart math (`lib/features/pos/cart_math.dart`)
- `CartLine` / `CartState` — immutable value objects with derived totals
- Integer-only math: `subtotal`, `itemDiscountTotal`, `orderDiscountAmount`,
  `taxableAmount`, `taxTotal`, `grandTotal`
- `allocateProportionally` splits the sale-level tax across lines so the parts
  sum exactly to `taxTotal` (no invented/lost rupiah)
- `roundUpToStep` / `suggestedCashAmounts` — one-tap cash buttons (5k, 10k,
  50k, 100k rounded up from the total)

### Cart state (`lib/features/pos/cart_provider.dart`)
- `CartNotifier` — add/merge, increment/decrement, remove, item discount,
  order discount (bps), clear
- Tax rate follows the active store via `shiftAuthProvider`

### Catalog (`lib/features/catalog/catalog_provider.dart`)
- `productQueryProvider` — search text / scanned barcode
- `catalogProvider` — exact barcode/SKU match first, then case-insensitive
  name/SKU search; only active products

### Checkout service (`lib/features/pos/checkout_service.dart`)
- Never touches the network
- Generates daily sequence receipt numbers (`{STORE}-{YYYYMMDD}-{SEQ}`)
- Validates: non-empty cart, non-negative total, cash tendered ≥ total
- Delegates atomic persistence to `SalesDao.completeSale`

### UI
- `PosScreen` — responsive split layout (catalog left, cart right on ≥900dp,
  bottom-sheet cart on narrow)
- `_CatalogPane` — search field + product grid (barcode scan friendly)
- `_CartPanel` — line tiles with qty buttons, item discount, order discount
  quick-chips, totals breakdown, charge button
- `PaymentDialog` — method selector (Cash/QRIS/Card), cash tendered field,
  suggested amount chips, live change display

### DAO additions
- `SalesDao.getCashTotalForShift` — expected cash = opening + cash sales -
  refunded cash
- `SalesDao.countSalesForDay` — daily receipt sequence

### Tests added (42 new, 150 total)

| Test file | Coverage |
|---|---|
| `cart_math_test.dart` | allocation, rounding, suggestions, CartState scenarios |
| `cart_provider_test.dart` | merge, inc/dec, remove, discount clamping |
| `catalog_provider_test.dart` | empty query, barcode, SKU, partial name |
| `checkout_service_test.dart` | offline sale, receipt seq, tax share, validation, non-cash, payload |
| `pos_screen_test.dart` | tap product → pay cash, barcode submit, qty buttons, empty cart |

## Files
```
lib/features/pos/
├── cart_math.dart              # pure cart & tax arithmetic
├── cart_provider.dart          # CartNotifier + provider
├── checkout_service.dart       # offline checkout orchestration
├── payment_dialog.dart         # payment method + cash dialog
├── pos_screen.dart             # responsive POS checkout UI
├── index.dart                  # barrel export

lib/features/catalog/
├── catalog_provider.dart       # product search + query provider
├── index.dart

lib/core/database/daos/sales_dao.dart   # getCashTotalForShift, countSalesForDay
```

## Verification
```
flutter analyze   → no errors (only Flutter SDK deprecation infos)
flutter test      → 150 passed
```

## Next
Phase 5: Sync engine (push outbox + pull delta), ESC/POS receipt printing,
PIN-gated refund screen, sync status badge in app bar.