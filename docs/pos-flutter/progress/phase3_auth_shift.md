# Phase 3: Auth, Store Selection & Shift Management — Complete

**Date:** 2026-11-22
**Status:** ✅ Complete

## Summary
Authentication, store selection and shift management are implemented and
verified. Shifts are now local-first: opening and closing a shift writes to
SQLite and enqueues a `SYNC_SHIFT` payload in the outbox, so the POS guard works
without a network connection.

## What Changed Since the WIP Commit

### Wiring and guards
- `lib/main.dart` now opens `AppDatabase`, builds the Dio client with a single
  shared `AuthInterceptor`, and overrides `databaseProvider`, `dioProvider`,
  `authInterceptorProvider` and `secureStorageProvider` in `ProviderScope`.
- `lib/core/router/app_router.dart` exposes a pure `resolveRedirect(...)`
  function (unit tested) and a `routerProvider` with a `refreshListenable`, so
  auth/shift changes refresh guards without rebuilding `GoRouter`.
- Route order: `/login` → `/store-selector` → `/shift` → `/pos`
  (`/refund/:saleId` is reachable once a shift is open).

### Auth
- `User.email` is optional (the contract's login response omits it).
- Login no longer auto-selects the first store, so the store selector is always
  part of the flow.
- `AuthState.copyWith` gained `clearError` / `clearStore` flags.
- Dio errors map to a readable message (including offline).

### Shift (local-first)
- `ShiftsDao.openShift` inserts the shift **and** its outbox entry in one
  transaction; `closeShift` updates the shift and enqueues the closed version.
- Shift IDs are UUID v4 generated on the client.
- `ShiftNotifier` reads/writes only the local database; expected cash is
  `openingCash + SUM(cash sales − refunded cash)` for the shift.
- `ShiftState.isOpen` requires an actual shift row (`id != null`), fixing the
  bug where an empty state looked like an open shift.
- In-flight loads are token-guarded so they cannot overwrite a newer open/close
  action.

### Manager PIN
- `lib/features/auth/pin_service.dart`: `validatePin`, salted SHA-256
  `hashPin`, and `PinService` which calls `POST /auth/verify-pin` and falls back
  to the cached hash only on network errors (4xx is a definitive rejection).
- `pin_dialog.dart` uses the service and no longer needs a `Dio` parameter.
- Fixed the keypad backspace implementation (previous `StringBuffer` logic
  crashed).

### Sync payloads
- `SalesDao.completeSale` now generates sale-item UUIDs once and reuses them in
  the outbox payload, so local rows and server rows share idempotency keys.
- Payloads are produced with `jsonEncode` instead of hand-built strings.

## Tests Added (36 new, 108 total)

| Test file | Coverage |
|---|---|
| `test/features/auth/auth_state_test.dart` | User/UserStore parsing, copyWith flags |
| `test/features/auth/pin_service_test.dart` | PIN format rules, salted hashing |
| `test/features/shift/shift_state_test.dart` | `isOpen`, `fromShift`, error clearing |
| `test/features/shift/shift_provider_test.dart` | Local open/close, outbox enqueue, expected cash, variance, non-cash exclusion |
| `test/core/router/route_guard_test.dart` | Full guard matrix |
| `test/core/database/checkout_outbox_test.dart` | Atomic checkout, payload item IDs, rollback on failure |

`flutter analyze`: no errors or warnings (only Flutter deprecation infos).
`flutter test`: **108 passed**.

## Files
```
lib/core/database/
├── database_provider.dart        # new: AppDatabase provider
└── daos/
    ├── shifts_dao.dart           # transactional open/close + outbox
    └── sales_dao.dart            # jsonEncode payloads, cash total helper

lib/features/auth/
├── auth_provider.dart            # optional email, error flags
├── pin_service.dart              # new: online + offline PIN verification
└── pin_dialog.dart               # uses PinService, fixed keypad

lib/features/shift/shift_provider.dart  # local-first shift state
lib/core/router/app_router.dart         # pure guard + refreshListenable
lib/main.dart                           # real provider wiring
```

## Next
Phase 4: POS catalog, cart and offline checkout.
