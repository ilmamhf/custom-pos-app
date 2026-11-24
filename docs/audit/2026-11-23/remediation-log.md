# P1 remediation log — 2026-11-24

Execution record for the P1 track in
[`project-audit.md`](./project-audit.md#8-prioritized-roadmap-to-multi-store-production-).
Every task below was committed separately on `main` with all suites green.

## Decisions

| Topic | Decision |
| --- | --- |
| Payment integration | Provider-agnostic REST gateway (`IPaymentProvider` + `GenericPaymentProvider`), configured per provider row; no Midtrans/Xendit SDK coupling |
| Tender model | Separate `SaleTender` rows (method, amount, change, reference) so split payments reconcile and per-method drawer totals are exact |
| Negative stock | Configurable thresholds (global default + per-store override) producing escalating `NegativeStockEvent` rows instead of hard-blocking offline sales |
| IDR bounds | 999,999,999 IDR ceiling on every monetary DTO; BigInt stays the storage/math type |
| Auth throttling | Per-route throttler plus an account-scoped lockout with structured alerts |

## Tasks

### P1.1 — H-13: tender components + BigInt reconciliation (`7c24049`)

- `SaleTender` model, `SyncSaleTenderDto`, `tenders[]` in `SyncSaleDto`.
- Sync persists client tenders; falls back to deriving one tender from `paymentMethod`.
- `shift-cash.util.ts` counts only `CASH` tenders as `amount - change`; QRIS/card/SPLIT are excluded from the drawer.
- Flutter: `local_sale_tenders` table (schema `user_version = 2`), tenders sent in the outbox payload, shift cash totals read tenders, receipt shows the breakdown, payment dialog captures a gateway reference.
- Migration `20261123134532_add_sale_tender`.

### P1.2 — R-01: payment provider interface (`3775d27`)

- Models `PaymentProvider` and `PaymentTransaction` with provider/transaction enums and a `paymentMethod` column.
- `apps/api-nestjs/src/modules/payments/` with controller, service, DTOs, `IPaymentProvider`, and `GenericPaymentProvider` (HTTP, config-driven).
- Endpoints: provider CRUD, transaction create/list/get, authorize/capture/void/refund, `POST /payments/webhook/:providerId`.
- Idempotency keys on transaction creation and refunds; HMAC webhook verification.
- Every provider type currently resolves to `GenericPaymentProvider`; provider-specific adapters can be added without changing callers.

### P1.3 — R-03: negative-stock policy engine (`7935fa5`)

- Models `NegativeStockPolicy` (global when `storeId` is null, else per-store) and `NegativeStockEvent`.
- Actions: `ALERT_ONLY`, `AUTO_TRANSFER`, `MANAGER_APPROVAL`, `WRITE_OFF` with thresholds at 0 / −10 / −50 / −100 by default.
- Endpoints under `/inventory/negative-stock-policy*` and `/inventory/negative-stock-events*`.
- Auto-transfer currently records candidate stores in the event detail; moving stock itself remains manual.
- Admin React surface for policies/events is still outstanding.

### P1.4 — R-04: tombstones + durable cursor + snapshot fallback (`bd23bd3`)

- `SyncCursor` stores the per-store cursor server-side; a pull without `since` resumes from it.
- `ProductTombstone` records deleted/deactivated products; delta pulls return a `tombstones` array.
- `GET /sync/pull?full=true` returns all products with `fullSnapshot: true`; the client then deletes local rows absent from the response.
- Flutter `_pullDelta` processes tombstones, supports forced full snapshots, and still preserves pending local stock decrements.

### P1.5 — R-02: IDR ceiling (`b368a8d`)

- `currency-limits.util.ts`: `IDR_CEILING = 999_999_999`, `validateIdrCeiling`, `toBigIntWithinCeiling`.
- `@Max(IDR_CEILING_MAX_DECORATOR)` on product prices, sync money fields, tender amount/change, and payment authorize/capture/refund amounts.
- BigInt JSON serialization already emits a number inside the safe range and a string beyond it; the ceiling keeps all valid values in the number branch.

### P1.6 — R-06: throttling + lockout telemetry (`19a222d`)

- Global `ThrottlerGuard` at 120 req/min per IP; login 5/min, verify-pin 5/min, refresh 20/min (env-configurable).
- `AuthTelemetryService` tracks failures per endpoint + IP + identifier, applies escalating lockout backoff (15 min base, 1 h cap), and throws 429 while locked.
- Successful auth clears the streak; identifiers are masked in logs.
- `AUTH_FAILURE` warnings and `AUTH_LOCKOUT_ALERT` errors are structured; lockouts can POST JSON to `AUTH_ALERT_WEBHOOK_URL`.
- Owner-only `GET /auth/security/telemetry` returns the in-memory snapshot and counters.
- 429 mapped to `TOO_MANY_REQUESTS` by the global exception filter.

### P1.7 — migration backfill (`cbeb7ae`)

- Added `20261124090000_add_payment_provider`, `20261124091000_add_negative_stock_policy`, `20261124092000_add_sync_tombstones_cursor`.
- Verified with a scratch database: `prisma migrate deploy` applies all 5 migrations, then `prisma migrate diff --from-url … --to-schema-datamodel … --exit-code` reports **no difference**.

## P2 — security & token hygiene

### P2.1 — M-02: HttpOnly refresh cookie + CSRF double-submit (`_pending_`)

- `auth-cookie.util.ts`: cookie names/options, CSRF generation, constant-time double-submit verification, refresh-cookie reader.
  - `pos_refresh_token`: `HttpOnly`, `SameSite=Strict`, `Secure` in production, path `/api/v1/auth`.
  - `pos_csrf_token`: readable by the SPA, `SameSite=Strict`; echoed in `X-CSRF-Token`.
- Refresh token lifetime is 7 days by default (`AUTH_REFRESH_COOKIE_MAX_AGE_MS`); `COOKIE_SECURE=true` forces `Secure` outside production.
- `POST /auth/login` honours `X-Auth-Refresh-Mode: cookie`: sets both cookies and omits `refreshToken` from the JSON body. Requests without the header keep the native body-token contract.
- `POST /auth/refresh`: body token → native flow; otherwise cookie + matching `X-CSRF-Token` → rotates both cookies and returns only an access token. Missing/incorrect CSRF returns `403`.
- `POST /auth/logout` clears both cookies in addition to incrementing `tokenVersion`.
- Refresh tokens now carry a unique `jti`, so rotation produces distinct tokens even within the same second.
- `cookie-parser` middleware registered in `AppModule`; `TRUST_PROXY=true` sets Express `trust proxy` so `Secure` cookies and rate-limit keys behave behind TLS termination.
- React Admin: access token held in memory only; refresh is cookie-based with `withCredentials`; the `X-CSRF-Token` header is read from the CSRF cookie on every request; login sends `X-Auth-Refresh-Mode: cookie`; bootstrap calls `/auth/refresh` then `/auth/me`; `isAuthenticated` derives from the loaded user. Test mode still seeds `pos_access_token` in localStorage so the existing suite runs without a live API.
- Flutter POS unchanged: it sends `refreshToken` in the body, receives a rotated token in the response, and keeps the token in secure storage.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` (API) | passed |
| `npm test` (API) | 36 passed / 7 suites |
| `npm run test:e2e` (API, PostgreSQL `localhost:15432`) | 24 passed / 4 suites |
| `npm test` (React) | 27 passed |
| `npm run build` (React) | passed |
| `flutter test` | 158 passed |
| `flutter analyze` | no errors (28 info-level deprecations) |
| `flutter build web` | passed |
| Fresh DB migration bootstrap | zero drift |

Additional M-02 e2e coverage: cookie mode sets the right flags and omits the body refresh token; missing/wrong CSRF is rejected with 403; the correct double-submit rotates cookies; logout clears both cookies; the native body-token refresh still returns a refresh token.

## Known limitations / follow-ups

1. **Lockout state is process-local.** Move throttler storage and lockout counters to Redis before running more than one API replica (tracked under M-07).
2. **Auto-transfer does not move stock.** It records candidates for an operator/Admin action.
3. **Negative-stock Admin UI** is not built yet; the API and events exist.
4. **Generic provider only.** Real gateway quirks (signature formats, status codes) may need adapters behind `IPaymentProvider`.
5. **Advisories unchanged.** `npm audit --omit=dev` still reports 6 (API) and 3 (React); addressed by the deferred D-01/D-02 upgrade track.
6. **Refresh rotation is stateless (M-02).** A rotated cookie produces a new `jti`, but the previously issued refresh token stays valid until expiry (7 days) or `tokenVersion` bump. Enforce one-time use with a jti denylist (Redis) before treating rotation as theft detection.
