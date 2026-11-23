# React Admin — screens, components, and functions

Base: `apps/admin-react/src`. Router: `react-router-dom` `BrowserRouter`.
Notation: `→` means "calls / navigates to". `API:` is the endpoint invoked.

## Route map

- `/login` → `LoginPage` (public)
- `/` → `AppShell` wrapped in `ProtectedRoute`
  - `/dashboard` → `RoleGuard(OWNER, MANAGER)` → `DashboardPage`
  - `/sales` → `RoleGuard(OWNER, MANAGER)` → `SalesPage`
  - `/products` → `RoleGuard(OWNER, MANAGER)` → `ProductsPage`
  - `/inventory` → `RoleGuard(OWNER, MANAGER)` → `InventoryPage`
  - `/settings` → `RoleGuard(OWNER)` → `SettingsPage`
- `*` → redirect to `/`
- `/` index → redirect to `/dashboard`

---

## App root

### `App` (`App.tsx`)
- `QueryClientProvider` — query defaults: `staleTime 15s`, `refetchOnWindowFocus true`, `refetchOnMount true`, `retry 1`.
- `SessionCacheReset` — listens for `auth:session-changed` and `auth:unauthorized` → `queryClient.clear()`.
- `AuthProvider` → `StoreProvider` → `BrowserRouter` → routes.
- `ADMIN_ROLES = [OWNER, MANAGER]` used by all non-settings route guards.

### `AuthProvider` / `useAuth` (`context/AuthContext.tsx`)
- State: `user`, `stores`, `isLoading`; derived `role`, `isAuthenticated`.
- On mount: read token + cached user/stores → optimistic restore → `GET /auth/me` revalidation.
  - Test mode (`import.meta.env.MODE === 'test'`) skips the network call.
  - 401 → `clearSession()`; transport error → keep the cached snapshot.
- `login(email, password)` → `API: POST /auth/login` → stores tokens, sets session scope, updates user/stores, persists snapshot.
- `logout()` → fire-and-forget `API: POST /auth/logout` → `clearSession()`.
- `clearSession()` → clear tokens, user, stores, session query scope, storage → dispatch `auth:session-changed`.
- Listeners: `auth:unauthorized` → `clearSession()`.

### `StoreProvider` / `useStore` (`context/StoreContext.tsx`)
- State: `selectedStoreId` (`undefined` = All Stores), `selectedStore`, `availableStores`, `canSelectAllStores`.
- Persists selection in `localStorage['pos_admin_selected_store_id']`.
- `setSelectedStoreId(id | undefined)` → update state + storage.
- Effects: auto-select when only one store; revert if the selected store is not assigned.
- `canSelectAllStores` = role OWNER or >1 store.

### `AppShell` (`components/layout/AppShell.tsx`)
- Flex layout: `Sidebar` + main column (`Topbar` + `<Outlet>` content).

---

## Layout components

### `Sidebar` (`components/layout/Sidebar.tsx`)
- Nav items (filtered by `roles`):
  - Dashboard → `/dashboard`
  - Sales History → `/sales`
  - Master Catalog → `/products`
  - Inventory & Stock → `/inventory`
  - Store & Staff → `/settings` (OWNER only)
- User block: name, email, `StatusBadge(role)`.
- Button "Sign Out" → `useAuth().logout()`.

### `Topbar` (`components/layout/Topbar.tsx`)
- Global store switcher (`@radix-ui/react-dropdown-menu`):
  - Trigger button → shows selected store or `All Stores (n)`.
  - Item "All Stores" (only if `canSelectAllStores`) → `setSelectedStoreId(undefined)`.
  - Store items → `setSelectedStoreId(store.id)`.
- Right side: active branch chip (code + tax) and current `role`.

---

## Pages

### `LoginPage` (`features/auth/LoginPage.tsx`)
- Email input (Zod email validation).
- Password input (min 6 chars).
- Button "Sign In" → `useAuth().login()` → `navigate('/dashboard')`.
- Error banner from API (`message` string or array).
- Demo-account hint text.

### `DashboardPage` (`features/dashboard/DashboardPage.tsx`)
- Header: title, selected store chip or "Consolidated All Branches".
- Date presets: Today / 7 Days / 30 Days / All Time → set `preset` (recomputes half-open UTC range).
- Refresh button → `refetch()`.
- Error banner when `useReportSummary` fails.
- `KpiCard` × 4: Gross Sales, Refund Total, Net Sales, Transactions.
- `PaymentBreakdownChart` and `TopProductsTable`.

#### `KpiCard`
- Props: title, value, currency flag, subtitle, icon, variant, badge.
- Renders formatted value (`MoneyText` or `toLocaleString`) + subtitle/badge.

#### `PaymentBreakdownChart`
- Empty state when no data.
- Recharts donut: QRIS/CASH/CARD/SPLIT, custom tooltip with total + count, legend with totals.

#### `TopProductsTable`
- Empty state when no data.
- Table: rank, product name, units sold, revenue (`MoneyText`).

### `SalesPage` (`features/sales/SalesPage.tsx`)
- Store chip; status filter `<select>` (All/COMPLETED/PARTIALLY_REFUNDED/REFUNDED) → resets page.
- Table: receipt, date, branch, cashier, payment, status badge, grand total, view button.
  - Row click / eye button → `ReceiptDetailDrawer`.
- Error / loading / empty rows.
- Pagination: Previous/Next; resets on store change.
- `ReceiptDetailDrawer` → "Process Refund" opens `RefundDialog`.

#### `ReceiptDetailDrawer`
- Header: receipt number + sale status badge.
- Metadata: date/time, payment method, store, cashier.
- Items table: item, unit price, qty, refunded qty, line total.
- Totals: subtotal, tax, discount (if any), grand total.
- Buttons:
  - "Close" → close dialog.
  - "Process Refund" (hidden when `REFUNDED`) → `onOpenRefund`.

#### `RefundDialog`
- State: manager PIN, reason, per-item quantities, error.
- Resets on open / sale change / cancel / success.
- Item list with qty inputs clamped to remaining.
- Inputs: reason, 6-digit manager PIN.
- Buttons:
  - "Cancel" → reset + close.
  - "Authorize Refund" → `useRefundSale().mutateAsync` → `API: POST /sales/:id/refund`; on success `onSuccess()` + close.

### `ProductsPage` (`features/products/ProductsPage.tsx`)
- Header: title, store chip; "Add Master Product" (OWNER only) → `ProductModal`.
- Search input → resets page; `useProducts(storeId, search, page, 15)`.
- Table: SKU, barcode, name, cost price, base price, [store price, stock], status, actions.
  - "Pricing" → `StorePriceDrawer`.
  - Edit icon (OWNER only) → `ProductModal` in edit mode.
- Error/loading/empty rows; pagination resets on store change.
- `ProductModal` and `StorePriceDrawer` rendered at page level.

#### `ProductModal`
- Zod schema: SKU/name trimmed min 1; whole-rupiah regex for base/cost.
- Fields: SKU, barcode, name, base price, cost price, active checkbox (edit).
- Preview of parsed prices.
- Buttons:
  - "Cancel" → close.
  - "Create Product" / "Update Product" → `useCreateProduct` (`API: POST /products`) or `useUpdateProduct` (`API: PATCH /products/:id`); server error shown in modal, stays open on failure.

#### `StorePriceDrawer`
- Shows central base price.
- Store selector buttons → set target store.
- Input: per-store override (number).
- Buttons:
  - "Clear Override (Reset to Base)" → `useSetStorePriceOverride` with `priceOverride: null` → `API: PUT /stores/:storeId/products/:productId/price`.
  - "Save Price" → same mutation with parsed integer.

### `InventoryPage` (`features/inventory/InventoryPage.tsx`)
- Header: title, store chip; tab switcher Stock Levels / Audit Ledger.
- Negative-stock alert banner (count from server `negativeCount`) → "1-Click Reconcile Discrepancy" opens `AdjustStockModal` for the first negative item (or enables the negative filter).
- Filter pills:
  - Negative Stock Alerts (count) → toggles negative filter; clears low-stock.
  - Low Stock (≤10) → toggles low filter; clears negative.
- Table: store, SKU, product, stock (color-coded), base price, effective price, actions.
  - "Reconcile" (negative only) / "Restock" → `AdjustStockModal`.
  - "Transfer" → `TransferStockModal`.
- Error/loading/empty rows; pagination resets on store change.
- Ledger tab → `StockLedgerTab`.

#### `AdjustStockModal`
- Fields: store select, reason (RESTOCK/ADJUSTMENT), delta qty, audit note.
- Prefills for negative-stock reconcile.
- Buttons:
  - "Cancel" → close.
  - "Submit Adjustment" → `useAdjustStock` → `API: POST /inventory/adjust` (`{storeId, productId, deltaQty, reason, note}`).

#### `TransferStockModal`
- Fields: source select, destination select (source disabled), qty (≥1), note.
- Changing source auto-moves destination if equal; prevents same-store.
- Buttons:
  - "Cancel" → close.
  - "Execute Transfer" → `useTransferStock` → `API: POST /inventory/transfer` (`{fromStoreId, toStoreId, productId, qty, note}`).

#### `StockLedgerTab`
- Reason filter `<select>` (All/RESTOCK/SALE/TRANSFER_IN/TRANSFER_OUT/ADJUSTMENT/REFUND).
- Table: date/time, store, product, delta (signed color), reason badge, note/reference, author.
- Error/loading/empty rows; pagination; `useStockLedger(...,limit 20)`.

### `SettingsPage` (`features/settings/SettingsPage.tsx`)
- Header: title + tab switcher Stores & Tax / Staff & PIN.
- Renders `StoreConfigTab` or `StaffManagementTab`.

#### `StoreConfigTab`
- Store cards: code, name, address, active status, tax rate.
- Button "Edit Configuration" → edit dialog.
- Edit dialog fields: name, address, tax percent.
- Buttons:
  - "Cancel" → close.
  - "Save Configuration" → `useUpdateStore` → `API: PATCH /stores/:id` (`{name, address, taxRateBps}`).

#### `StaffManagementTab`
- `useUsers()` (`API: GET /users`) and `useStores()`.
- Button "Add Staff Member" → `StaffModal`.
- Table: name, email, role badge, assigned branches (`u.stores`), status, action.
  - "Deactivate"/"Activate" → `useUpdateUser` → `API: PATCH /users/:id` (`{isActive}`).
- Error/loading/empty rows.

#### `StaffModal`
- Fields: name, email, password, role (CASHIER/MANAGER), supervisor PIN, store checkboxes.
- Resets on open/cancel/success.
- Validation: name/email/password required, password ≥6, manager PIN exactly 6 digits, PIN 4–8 digits if provided, ≥1 store.
- Buttons:
  - "Cancel" → reset + close.
  - "Create Account" → `useCreateUser` → `API: POST /users`.

---

## Auth/guard components

### `ProtectedRoute` (`features/auth/ProtectedRoute.tsx`)
- Shows loading while `isLoading`.
- Not authenticated → `<Navigate to="/login" state={{ from }} />`.
- Else renders children.

### `RoleGuard` (`features/auth/RoleGuard.tsx`)
- `allowedRoles` check via `useAuth().role`.
- Unauthorized → custom `fallback` or "Access Restricted" panel.

---

## Shared components

### `StatusBadge`
- Maps status/role to color classes; uppercases and replaces `_` with spaces.

### `MoneyText`
- Formats an integer IDR via `formatIdr`; negative → red; optional `+` sign.

### `ConfirmDialog`
- Generic dialog: title, description, Cancel, Confirm (`variant`, `isLoading`).

---

## UI primitives

- `Button` (`components/ui/Button.tsx`) — variants: default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon.
- `Input` — text input with optional error message.
- `Card` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `Dialog` — Radix wrappers: `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, overlay/close.

---

## Data hooks (`api/queries/index.ts`)

| Hook | API |
|---|---|
| `useStores` | `GET /stores` |
| `useUpdateStore` | `PATCH /stores/:id` |
| `useReportSummary` | `GET /reports/summary` |
| `useProducts` | `GET /products` |
| `useCreateProduct` | `POST /products` |
| `useUpdateProduct` | `PATCH /products/:id` |
| `useSetStorePriceOverride` | `PUT /stores/:storeId/products/:productId/price` |
| `useInventory` | `GET /inventory` |
| `useAdjustStock` | `POST /inventory/adjust` |
| `useTransferStock` | `POST /inventory/transfer` |
| `useStockLedger` | `GET /inventory/ledger` |
| `useSales` | `GET /sales` |
| `useRefundSale` | `POST /sales/:id/refund` |
| `useUsers` | `GET /users` |
| `useCreateUser` | `POST /users` |
| `useUpdateUser` | `PATCH /users/:id` |

Polling: inventory/sales every 15s; ledger/reports every 30s.

## Utilities

- `lib/formatters.ts`: `formatIdr`, `parseIdr`, `parseIntegerIdr` (strict), `formatBps`, `parseBps`, `formatDate`, `formatDateTime`, `formatTime`.
- `lib/utils.ts`: `cn` class merge.
- `api/client.ts`: axios instance, token storage, 401 refresh queue, `auth:unauthorized` event.
