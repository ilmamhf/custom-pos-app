# Operations runbook — Retail POS

Companion to the 2026-11-22 audit remediation. This document covers the
production-facing concerns the audit flagged as incomplete (M-07, R-06, R-07,
R-08). It is a starting runbook, not a substitute for environment-specific
review.

## 1. Deployment topology

```text
Browser / device
   │  HTTPS (TLS terminated by the edge)
   ├─ React Admin (static build, SPA fallback → index.html)
   ├─ Flutter POS (static web build or native app)
   └─ /api/v1 → NestJS API (container or managed runtime)
                    │
                    └─ PostgreSQL 16 (managed or self-hosted, private network)
```

- Build artifacts: `apps/admin-react/dist` and `apps/pos-flutter/build/web`.
- The API exposes a global prefix `/api/v1`; route all `/api` traffic to it.
- The API container should listen on `PORT` and be reachable only through the
  edge/reverse proxy. Do not publish PostgreSQL publicly.

### SPA fallback (R-08)

Serve unknown non-API routes from `index.html` so `BrowserRouter` deep links
work. Example nginx:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
location /api/ {
  proxy_pass http://api:3000;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Test direct navigation to `/sales`, `/products`, and a hard refresh.

## 2. Required configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV=production` | yes | Enables fail-closed secret checks and disables Swagger by default |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes | ≥32 chars, unique, not the example value |
| `JWT_REFRESH_SECRET` | yes | ≥32 chars, unique, not the example value |
| `CORS_ORIGIN` | yes | Explicit comma-separated allowlist; `*` is rejected |
| `PORT` | optional | Defaults to 3000 |
| `OFFLINE_GRANT_TTL` | optional | Defaults to `12h`; shorten if offline refunds are not a requirement |
| `SWAGGER_ENABLED` | optional | Leave unset/`false` in production |
| `TRUST_PROXY` | optional | Set `true` only behind a trusted reverse proxy so `X-Forwarded-For` is honoured for rate limits |
| `THROTTLE_GLOBAL_LIMIT` / `THROTTLE_GLOBAL_TTL_MS` | optional | Global request budget per IP (default `120` per `60000` ms) |
| `AUTH_LOGIN_THROTTLE_LIMIT` / `AUTH_LOGIN_THROTTLE_TTL_MS` | optional | Login attempts per IP (default `5` per `60000` ms) |
| `AUTH_PIN_THROTTLE_LIMIT` / `AUTH_PIN_THROTTLE_TTL_MS` | optional | PIN verification attempts per IP (default `5` per `60000` ms) |
| `AUTH_REFRESH_THROTTLE_LIMIT` / `AUTH_REFRESH_THROTTLE_TTL_MS` | optional | Token refresh attempts per IP (default `20` per `60000` ms) |
| `AUTH_LOCKOUT_THRESHOLD` | optional | Failed logins/PINs before the account-scoped lockout opens (default `5`) |
| `AUTH_LOCKOUT_WINDOW_MS` | optional | Failure counting window (default `900000`) |
| `AUTH_LOCKOUT_DURATION_MS` / `AUTH_LOCKOUT_MAX_DURATION_MS` | optional | Base and capped lockout duration with escalating backoff (defaults `900000` / `3600000`) |
| `AUTH_ALERT_WEBHOOK_URL` | optional | Receives `AUTH_LOCKOUT_ALERT` JSON; otherwise alerts are structured error logs only |
| `COOKIE_SECURE` | optional | Force `Secure` auth cookies outside production (default: Secure whenever `NODE_ENV=production`) |
| `AUTH_REFRESH_COOKIE_MAX_AGE_MS` | optional | Refresh/CSRF cookie lifetime in ms (default `604800000`, 7 days) |

Secrets must be injected by the platform secret store, not baked into images or
committed `.env` files. Rotate `JWT_*` secrets on a schedule; note that rotating
the access secret invalidates live access tokens.

### Browser session tokens

The React Admin app never stores the refresh token in JavaScript-accessible
storage. It logs in with `X-Auth-Refresh-Mode: cookie`, so the API returns only
the access token in the body and places the refresh token in an `HttpOnly`,
`SameSite=Strict` cookie scoped to `/api/v1/auth`. A second, readable
`pos_csrf_token` cookie carries the CSRF double-submit value that the SPA echoes
in `X-CSRF-Token` on refresh. `POST /auth/refresh` rotates both cookies and
returns only a new access token. `POST /auth/logout` clears the cookies and bumps
the user's `tokenVersion`.

The Flutter POS runs on a device and keeps using secure storage: it omits the
mode header, receives the refresh token in the body, and posts it back in the
refresh request body.

Deployment notes:

- Serve the SPA and API over HTTPS; `SameSite=Strict` plus `Secure` cookies
  require it, and cross-site SPA/API hosting must allow credentials
  (`Access-Control-Allow-Credentials`) with an explicit `CORS_ORIGIN`.
- Set `TRUST_PROXY=true` behind a reverse proxy so the refresh cookie's `Secure`
  and rate-limit keys reflect the real client.
- Rotating `JWT_REFRESH_SECRET` invalidates every active browser session and
  every native refresh token at once; plan a sign-out window.


### Auth lockout telemetry

Rate limiting uses `@nestjs/throttler`; failed logins and PIN checks also feed a
process-local lockout tracker. On every lockout the API writes an
`AUTH_LOCKOUT_ALERT` error log with masked identifiers, and POSTs the same JSON
to `AUTH_ALERT_WEBHOOK_URL` when configured. Alert on that event in the log
pipeline or webhook consumer. Owners can inspect the current snapshot at
`GET /api/v1/auth/security/telemetry`. If the API is ever horizontally scaled,
move the counter/lockout storage to Redis so all replicas share state (M-07).


## 3. Database migrations and seed

- Apply migrations with `npm run prisma:migrate:deploy` before starting a new
  API version. Never use `prisma db push` in production.
- Run `npm run prisma:seed` only for a brand-new environment; it resets seeded
  passwords and stock.
- Keep a pre-deploy backup. Migrations in this repository are forward-only.

## 4. Health, readiness, and probes

- Liveness: `GET /api/v1/health`
- Readiness (checks PostgreSQL): `GET /api/v1/health/ready`

Configure the orchestrator to restart on liveness failure and remove an
instance from the load balancer on readiness failure. A readiness failure
usually means the database is unreachable.

## 5. Backups and recovery (R-07)

- Take automated encrypted PostgreSQL backups at least daily; retain according
  to business policy.
- Define RPO/RTO explicitly. A pragmatic starting point: RPO ≤ 15 minutes with
  WAL archiving, RTO ≤ 1 hour.
- Run a restore drill into an isolated environment at least quarterly and
  record the result. A backup is not verified until it has been restored.
- Store backups outside the database host and restrict access to operators.
- Document data-retention and export obligations for sales/personal data.

## 6. Observability

- **Logs:** structured JSON from the API (the global filter logs unhandled
  errors with a `correlationId` that is also returned to the client). Ship logs
  to a central store with retention.
- **Metrics:** request rate/latency/error rate, sync push outcomes by entity
  type, inventory negative-stock count, login failures, and database
  connections. Add a Prometheus/OpenTelemetry exporter or use the platform's
  managed metrics.
- **Tracing:** enable request tracing at the reverse proxy and propagate a
  request id; correlate with the API `correlationId`.
- **Alerts:** 5xx rate, readiness failures, backup failures, rising negative
  stock, and repeated sync failures per store.

## 7. Rate limiting and brute-force protection (R-06)

Not yet implemented in code. Before internet exposure:

- Add `@nestjs/throttler` with a global limit and stricter limits on
  `/auth/login`, `/auth/refresh`, and `/auth/verify-pin`.
- Add account/IP lockout and audit telemetry for repeated PIN/password
  failures.
- Alert on spikes in authentication failures.

## 8. Payment and offline behavior

- `CASH`, `QRIS`, `CARD`, and `SPLIT` are stored as labels. There is no provider
  integration, tender allocation, capture/void, or settlement (R-01). Treat
  non-cash methods as manual until a provider contract is defined.
- Negative stock is intentional for concurrent offline sales; define an
  approval/write-off/alert policy (R-03).
- The Flutter client reconciles pending sales on pull and retries failed outbox
  entries. Refunds require a manager PIN/offline grant; without a grant, the
  cashier must reconnect once.

## 9. Printer hardware (M-08, R-05) — deferred

Bluetooth thermal-printer integration is intentionally not implemented in this
remediation. The `ReceiptPrinterService` interface and mock remain, but there is
no production adapter, device selection/reconnection, ESC/POS encoding, or
cash-drawer call site. Do not promise hardware printing until that work is done
and validated against the target printer models on Android/iOS.

## 10. Incident ownership

Define on-call ownership for: API availability, database/storage, sync
escalations from stores, backup/restore, and security incidents. Keep a short
incident checklist: confirm scope, preserve logs, pause risky deploys, restore
from a verified backup if data is corrupted, and record a post-incident review.
