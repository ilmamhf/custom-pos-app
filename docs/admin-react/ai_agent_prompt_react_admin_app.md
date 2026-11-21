# Role & Objective

You are a Senior Frontend Engineer specializing in React, TypeScript, and modern SaaS dashboards. Build the **React Admin Back-Office Web Application** (`apps/admin-react`) for a 1–3 store retail POS system.
Before writing code, read the specification files in `docs/mvp-design/` (`01-core-prd.md`, `02-db-design.md`, `05-frontend-admin-react.md`, and `06-api-contract.md`) and strictly adhere to all endpoints, data contracts, role permissions, and UX workflows.

# Tech Stack & Packages

- **Framework:** React 18+ with TypeScript (strict mode) + Vite

- **Styling & Component System:** Tailwind CSS + `shadcn/ui` (Radix UI primitives) + `lucide-react` icons

- **Server State & Data Fetching:** `@tanstack/react-query` (v5)

- **HTTP Client:** `axios` (with JWT Bearer interceptor + automatic `/auth/refresh` token rotation on `401`)

- **Routing:** `react-router-dom` (v6+) with role-based route protection (`OWNER` vs `MANAGER`)

- **Forms & Validation:** `react-hook-form` + `zod` + `@hookform/resolvers`

- **Tables & Charts:** `@tanstack/react-table` + `recharts`

- **Testing:** `vitest`, `@testing-library/react`, `@testing-library/user-event`, `msw` (Mock Service Worker for API mocking)

# Architecture & Folder Structure (Feature-First)

Organize `src/` into clean, modular feature slices with shared UI primitives and typed API hooks:

```
src/
├── api/
│   ├── client.ts         # Axios instance, JWT attach, 401 refresh queue, error normalizer
│   ├── types.ts          # TypeScript DTOs strictly matching 06-api-contract.md
│   └── queries/          # TanStack Query hooks & query-key factories per domain
├── components/
│   ├── layout/           # AppShell, Sidebar, Topbar with Global Store Switcher
│   ├── shared/           # MoneyText (IDR formatter), DataTable, StatusBadge, ConfirmDialog
│   └── ui/               # shadcn/ui base components (Button, Dialog, Drawer, Input, Select, etc.)
├── context/
│   ├── AuthContext.tsx   # Current user, role, assigned stores, login/logout helpers
│   └── StoreContext.tsx  # Active store filter ('ALL' | storeId) persisted in URL/localStorage
├── features/
│   ├── auth/             # Login page & ProtectedRoute / RoleGuard
│   ├── dashboard/        # KPI cards, payment method chart, top products table
│   ├── products/         # Master catalog table, create/edit product modal, per-store price drawer
│   ├── inventory/        # Stock table, negative-stock alert filter, restock/adjust modal, transfer modal, ledger tab
│   ├── sales/            # Receipt history table, filters, receipt detail drawer
│   └── settings/         # Store config & tax rate (BPS) editor, Staff & Manager PIN management (Owner only)
├── lib/
│   └── formatters.ts     # Integer IDR formatter (Rp 18.000), BPS percentage formatter, date helpers
├── App.tsx
└── main.tsx

```

# Critical Business & Engineering Rules (Non-Negotiable)

1. **Global Store Switcher Context (`StoreContext`):**
   - Render a persistent dropdown in the top header allowing the user to switch between **"All Stores"** (`storeId = undefined`, available when user has access to multiple stores) or a specific store (`Cabang Bekasi`, `Cabang Kemang`, etc.).

   - Include `selectedStoreId` in all relevant TanStack Query keys (`['reports', 'summary', selectedStoreId, dateRange]`, `['inventory', selectedStoreId]`, `['sales', selectedStoreId]`) so switching stores immediately updates every dashboard metric and table.

2. **Integer-Only Currency & Basis Points Formatting:**
   - API payloads send and expect **integers** for all currency values (e.g., `18000` -> display as `Rp 18.000`) and tax rates in basis points (`1100` -> display/edit as `11%`, convert back to `1100` on submit).

   - Ensure form inputs parse formatted numeric strings back into clean integers before calling `POST` / `PATCH` / `PUT` endpoints.

3. **Negative Stock Reconciliation UX:**
   - Because Flutter POS devices allow offline sales even when local stock hits `0`, `store_inventory.stock_on_hand` can become negative after sync.

   - Display a prominent warning banner/filter pill (`Negative Stock Alerts`) on the Inventory page highlighting negative SKUs in red with a 1-click **"Reconcile / Adjust"** button pre-filled with that store and product.

4. **Atomic Inter-Store Transfer Validation:**
   - In the Inter-Store Transfer modal, dynamically disable the selected `fromStoreId` inside the `toStoreId` dropdown so a user can never transfer stock to the same store, and enforce `qty >= 1`.

5. **Strict Role-Based UI & Routing:**
   - `MANAGER` users can view Dashboard, Products (and set store price overrides), Inventory (adjustments, transfers, ledger), and Sales, but **cannot** create/edit master products (`POST/PATCH /products`) or access Staff/Store Settings (`/settings`). Hide restricted actions/routes cleanly in the UI.

# Testing Requirements (Mandatory)

Every core workflow must include automated tests using **Vitest + React Testing Library + MSW**:

1. **Unit Tests (`lib/formatters.test.ts`):**
   - Verify integer IDR currency formatting, numeric input parsing, and basis-point (`bps` <-> `%`) conversions.

2. **Component & Integration Tests (with MSW):**
   - **Global Store Switcher:** Verify changing the store dropdown triggers refetches on Dashboard and Inventory with the updated `storeId` query parameter.

   - **Inventory & Transfer Flow:** Test submitting a restock adjustment (`POST /inventory/adjust`) and inter-store transfer (`POST /inventory/transfer`), verifying validation rules and TanStack Query cache invalidation.

   - **Role Guard:** Verify `MANAGER` role hides Owner-only actions (`New Product`, `Staff Settings`) while `OWNER` sees them.

# Execution Plan (Step-by-Step)

Work incrementally and verify each phase compiles (`tsc --noEmit`) and passes `vitest` before moving to the next:

- **Phase 1: Foundation & Typed API Layer** — Initialize Vite + React + TypeScript + Tailwind + shadcn/ui, implement integer/BPS formatters + unit tests, configure Axios with JWT refresh interceptor, and define TypeScript DTOs from `06-api-contract.md`.

- **Phase 2: Auth, Shell & Global Store Switcher** — Build Login page, `AuthContext`, `StoreContext`, `AppShell` (sidebar + topbar store switcher), and role-protected routing.

- **Phase 3: Multi-Store Dashboard & Sales History** — Build `/dashboard` (KPI cards, Recharts payment breakdown, top products, date range picker) and `/sales` (paginated receipt table + slide-over receipt detail drawer).

- **Phase 4: Master Catalog & Per-Store Price Overrides** — Build `/products` table, Owner create/edit product modal, and per-store `priceOverride` drawer (`PUT /stores/:storeId/products/:productId/price`).

- **Phase 5: Inventory Control, Transfers & Settings** — Build `/inventory` (stock levels, negative-stock alert filter, restock/adjustment modal, inter-store transfer modal, ledger audit tab) and Owner-only `/settings` (store tax config & staff/PIN management) + MSW integration tests.

Start with **Phase 1**: inspect `package.json` and `docs/mvp-design/`, configure Tailwind/shadcn utilities, implement currency/BPS formatters with unit tests, and set up the typed API client and DTOs first.
