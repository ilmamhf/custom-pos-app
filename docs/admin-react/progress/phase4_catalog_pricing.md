# Phase 4: Master Catalog & Per-Store Price Overrides — Complete

**Date:** 2026-11-21  
**Status:** ✅ Complete  
**Application Root:** `apps/admin-react`  

## Summary
Implemented the Centralized Master Product Catalog (`/products`) and the Per-Store Price Override module (`PUT /stores/:storeId/products/:productId/price`), enforcing strict role boundaries between `OWNER` (master catalog CRUD) and `MANAGER` (pricing overrides only).

## Completed Deliverables

### 1. Master Product Catalog (`src/features/products/ProductsPage.tsx`)
- Paginated catalog table listing SKU, Barcode, Product Name, Cost Price, Master Base Price, Store-specific Price Override, Stock on Hand, Active Status, and Action controls.
- Fast client & server search filter supporting SKU, Barcode, and Name queries.
- Dynamically hides "Add Master Product" button and "Edit Master" actions for `MANAGER` users while displaying them for `OWNER`.

### 2. Owner Product Creation & Editing (`ProductModal.tsx`)
- Modal with `react-hook-form` and `zod` validation.
- Parses user-input price strings into clean integer IDR values (`parseIdr`).
- Communicates with `POST /api/v1/products` and `PATCH /api/v1/products/:id`.
- Automatically invalidates both product catalog and store inventory caches upon mutation.

### 3. Per-Store Price Override Drawer (`StorePriceDrawer.tsx`)
- Displays central master base price alongside store selection pills.
- Allows Managers and Owners to set a custom retail price for a specific branch (`PUT /api/v1/stores/:storeId/products/:productId/price`).
- Provides a 1-click **"Clear Override (Reset to Base)"** action (`priceOverride = null`) so branches can easily return to charging central base price.

## Verification
- ✅ `npm run typecheck` — 0 TypeScript errors.
- ✅ `npm run test` — 21 passing unit & component tests.
