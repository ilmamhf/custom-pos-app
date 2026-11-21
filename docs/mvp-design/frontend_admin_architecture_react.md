# Frontend Admin Architecture (React)

## 1. Tech Stack
- **Framework:** React 18 + TypeScript + Vite
- **Styling & UI:** Tailwind CSS + shadcn/ui (Radix primitives)
- **Server State & Caching:** TanStack Query (`@tanstack/react-query`)
- **Routing:** React Router v6
- **Charts & Tables:** Recharts + TanStack Table

## 2. Folder Structure
```text
apps/admin-react/src/
├── api/                  # Axios instance + typed API hooks (generated from OpenAPI)
├── components/
│   ├── layout/           # Sidebar, Topbar with Global Store Switcher ("All Stores" vs Store 1-3)
│   └── shared/           # CurrencyFormatter (IDR), DataTable, StatusBadge
├── features/
│   ├── auth/             # Login page & ProtectedRoute (Owner/Manager role guard)
│   ├── dashboard/        # Revenue KPIs, payment split chart, top products table
│   ├── products/         # Master catalog CRUD & per-store price override drawer
│   ├── inventory/        # Stock levels, Restock/Adjustment modal, Store Transfer modal, Ledger log
│   ├── sales/            # Receipt search, date/store filters, receipt detail drawer
│   └── settings/         # Store info/tax config & Staff/PIN management (Owner only)
└── App.tsx
```

## 3. Key UX & Functional Flows
- **Global Store Switcher:** A persistent dropdown in the top navigation bar (`All Stores (3)` | `Cabang Bekasi` | `Cabang Kemang` | `Cabang Depok`). Selecting a store automatically updates TanStack Query keys across Dashboard, Inventory, and Sales views.
- **Negative Stock Reconciliation Alert:** Highlights any SKU where `stock_on_hand < 0` (caused by concurrent offline POS sales) with a 1-click **Adjust Stock** action.
- **Per-Store Price Override:** In the Product Detail drawer, managers can view the central `base_price` alongside input fields for each of the 1–3 stores to set a store-specific price override.
- **Inter-Store Transfer Workflow:** Simple modal selecting `Source Store`, `Destination Store`, `Product`, and `Quantity`, immediately updating both stores' stock balances and appending two entries to the audit ledger.