# Phase 1: Foundation & Typed API Layer — Complete

**Date:** 2026-11-21  
**Status:** ✅ Complete  
**Application Root:** `apps/admin-react`  

## Summary
Initialized the React Admin Back-Office Web Application (`apps/admin-react`) with Vite, React 18, TypeScript (strict mode), Tailwind CSS, shadcn/ui design tokens, integer/BPS currency formatters with unit tests, typed Axios API client with 401 refresh interceptor queue, and TypeScript DTOs strictly matching the REST API contract.

## Completed Deliverables

### 1. Project Scaffolding & Configuration
- `package.json`: Vite, React 18, `@tanstack/react-query` v5, `@tanstack/react-table` v8, `react-router-dom` v6, `react-hook-form` + `zod`, `recharts`, `lucide-react`, Radix UI primitives, Vitest, Testing Library, MSW.
- `tsconfig.json`: TypeScript strict mode enabled (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`).
- `tailwind.config.js` & `src/index.css`: Tailwind configuration with CSS variables for clean SaaS palette (neutral slate ground, high contrast typography, accessible status colors).
- `vite.config.ts`: Path alias `@/`, Vitest configuration with JSDOM and `@testing-library/jest-dom` test setup.

### 2. Integer-Only Currency & BPS Formatters (`src/lib/formatters.ts`)
Strict compliance with non-negotiable business rules: all monetary values are integers (no floating point currency):
- `formatIdr(amount)`: Formats integer IDR with Indonesian dot thousand separator (e.g. `18000` -> `Rp 18.000`, `0` -> `Rp 0`, `-5000` -> `-Rp 5.000`).
- `parseIdr(value)`: Parses formatted string or numeric inputs back to clean integer (e.g. `"Rp 18.000"` -> `18000`, `"-Rp 5.000"` -> `-5000`).
- `formatBps(bps)`: Formats basis points into percentage display string (e.g. `1100` -> `"11%"`, `1150` -> `"11.5%"`).
- `parseBps(value)`: Parses percentage string to basis points integer (e.g. `"11%"` -> `1100`, `"11.5%"` -> `1150`).
- `formatDate(isoString)` & `formatDateTime(isoString)`: Standardized Indonesian date/time helpers.

### 3. Unit Tests (`src/lib/formatters.test.ts`)
- 16 tests covering integer IDR formatting, negative amounts, decimal rounding, empty/invalid inputs, BPS conversions, and ISO date rendering.
- All 16 unit tests passing with Vitest.

### 4. Typed Axios Client & 401 Refresh Queue (`src/api/client.ts`)
- Pre-configured Axios instance with base URL `/api/v1`.
- Request interceptor attaching `Authorization: Bearer <accessToken>`.
- Automatic 401 token refresh queue: concurrent requests wait in a pending promise queue while `/auth/refresh` executes, and are replayed once fresh tokens are obtained.
- Auto-logout and event dispatch `auth:unauthorized` upon refresh failure.

### 5. TypeScript DTOs (`src/api/types.ts`)
- Strict TypeScript interfaces for `User`, `Store`, `Product`, `StoreInventoryItem`, `StockLedgerEntry`, `Sale`, `SaleItem`, `ReportSummaryResponse`, `RefundRequest`, `StockAdjustmentRequest`, `StockTransferRequest`, `CreateUserRequest`.
- Strictly matches `complete_rest_api_contract.md` and NestJS Prisma schema.

## Verification
- ✅ `npm run typecheck` — 0 TypeScript errors (`tsc --noEmit`).
- ✅ `npm run test` — 16 passing unit tests.
