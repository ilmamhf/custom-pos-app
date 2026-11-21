# Phase 2: Auth, Shell & Global Store Switcher — Complete

**Date:** 2026-11-21  
**Status:** ✅ Complete  
**Application Root:** `apps/admin-react`  

## Summary
Implemented the Authentication layer, Role-based route protection (`OWNER` vs `MANAGER`), Global Store Switcher context, application shell layout (`AppShell`, `Sidebar`, `Topbar`), and the TanStack Query hook layer.

## Completed Deliverables

### 1. Authentication State (`src/context/AuthContext.tsx`)
- Provides `user`, `role`, `stores`, `isAuthenticated`, and `isLoading`.
- Implements `login(email, password)` communicating with `POST /api/v1/auth/login`.
- Automatically restores session from `localStorage` on page reload.
- Listens to global `auth:unauthorized` events from the Axios client to seamlessly log out expired sessions.

### 2. Global Store Context (`src/context/StoreContext.tsx`)
- Persistent store selector across all views (`selectedStoreId = undefined` for "All Stores (N)", or specific store UUID).
- Automatically persists active selection in `localStorage`.
- Restricts single-store managers to their assigned store while enabling multi-store owners to view consolidated data.

### 3. Application Shell & Navigation
- **`Sidebar.tsx`**: Clean dark slate theme (`bg-slate-900`) with active navigation indicator, store icon branding, user profile badge, and role pill.
  - Dynamically hides the **Store & Staff Settings** (`/settings`) link from `MANAGER` users while displaying it for `OWNER`.
- **`Topbar.tsx`**: Sticky top header featuring the **Global Store Switcher** dropdown (Radix UI dropdown with checkmark indicators), active branch code, and current tax rate display.
- **`AppShell.tsx`**: Responsive layout combining Sidebar, Topbar, and content outlet.

### 4. Route Protection & Role Guards
- **`ProtectedRoute.tsx`**: Guards private routes, redirecting unauthenticated visitors to `/login`.
- **`RoleGuard.tsx`**: Enforces granular role-based UI and route permissions (e.g., restricting `/settings` exclusively to `OWNER`).
- **`LoginPage.tsx`**: Clean, accessible login form with `react-hook-form` + `zod` validation and server error messaging.

### 5. Automated Tests
- `RoleGuard.test.tsx`: Tests that restricted views are blocked for `MANAGER` and visible for `OWNER`, plus verifies custom fallback components.
- `StoreContext.test.tsx`: Tests initialization to "All Stores" for multi-store owners and switching to specific retail branches.

## Verification
- ✅ `npm run typecheck` — 0 TypeScript errors.
- ✅ `npm run test` — 21 passing tests across 3 test suites.
