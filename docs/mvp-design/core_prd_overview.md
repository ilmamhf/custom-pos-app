# Retail POS System — Core PRD (1–3 Stores)

## 1. Product Vision & Scope
A lean, offline-resilient Point of Sale (POS) and Back-Office system built specifically for small retail businesses operating **1 to 3 store locations**. It eliminates enterprise bloat while guaranteeing financial accuracy, atomic inventory ledgers, and uninterrupted checkout during internet outages.

## 2. Target User Roles
| Role | Platform | Permissions |
| :--- | :--- | :--- |
| **Owner** | React Admin & Flutter POS | Full access across all 1–3 stores, master catalog creation, store settings, staff management, consolidated financial reports. |
| **Manager** | React Admin & Flutter POS | Store-scoped inventory adjustments, inter-store transfers, store price overrides, shift reconciliation, PIN approval for voids/refunds. |
| **Cashier** | Flutter POS | Open/close register shifts, process sales/payments, print receipts, request Manager PIN for refunds. |

## 3. Core Functional Requirements (MVP)
### Point of Sale (Flutter App)
- **Store & Shift Session:** Select assigned store on login; open/close cash drawer shifts with starting cash and expected vs. actual cash variance tracking.
- **Fast Checkout:** Barcode scanning or instant SKU/name search, cart quantity/discount adjustments, and single/split payments (Cash, QRIS, Card).
- **Offline-First Checkout:** Transactions commit locally to SQLite first using client-generated UUIDs and sync asynchronously when online.
- **Receipts & Refunds:** Thermal Bluetooth printing (ESC/POS) and item-level refunds authorized by Manager PIN.

### Back-Office (React Web Admin)
- **Multi-Store Dashboard:** Daily revenue, transaction volume, payment method breakdown, and top-selling items filtered by store or consolidated across all stores.
- **Catalog & Store Pricing:** Central product/SKU management with optional per-store price overrides.
- **Inventory Control:** Real-time per-store stock levels, restock entries, shrinkage/damage adjustments, and inter-store stock transfers.
- **Staff & Access Control:** User provisioning, store assignments, and Manager PIN configuration.

## 4. Non-Functional & Architectural Rules
1. **Zero Checkout Blocking:** Never block a sale due to poor connectivity or local stock hitting `0`. Allow offline sales and flag negative inventory in React Admin for manager reconciliation.
2. **Integer Currency:** Store all monetary values as `BIGINT` in the smallest currency unit (e.g., IDR `18000` = Rp 18.000) to prevent floating-point rounding bugs.
3. **Immutable Historical Snapshots:** Save `product_name_snapshot` and `unit_price` on every sale line item so future catalog edits never alter past receipts.
4. **Monorepo Structure:** Maintain `apps/pos-flutter`, `apps/admin-react`, and `apps/api-nestjs` in a single repository to share OpenAPI types.