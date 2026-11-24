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

### Container images (M-07)

| Image | Dockerfile | Contents |
| --- | --- | --- |
| `pos-api` | `apps/api-nestjs/Dockerfile` | Production dependencies, compiled NestJS output, the generated Prisma client, the migration history, the Prisma CLI, and ts-node for the seed |
| `pos-admin` | `apps/admin-react/Dockerfile` | The compiled React bundle behind unprivileged nginx (UID 101, port 8080) |

- Both images run as a non-root user, declare a `HEALTHCHECK`, and work with a
  read-only root filesystem and all Linux capabilities dropped.
- The API image is also the migration runner. `npx prisma migrate deploy` runs
  from the same image that serves the traffic, so the deployed artifact and the
  schema history cannot diverge.
- The Admin image proxies `/api/` to `http://api:3000`, so the browser talks to
  a single origin and the session cookies stay first-party.
- `deploy/README.md` holds the full build, Compose, and Kubernetes instructions.

### Compose

```bash
docker compose up -d postgres
docker compose --profile app up -d --build
```

- PostgreSQL runs outside the `app` profile; the profile holds the migration
  job, the API, and the Admin.
- The `migrate` service applies `prisma/migrations` before the API starts.
  Compose runs it automatically through
  `depends_on: { migrate: { condition: service_completed_successfully } }`.
- The API container keeps a fixed address (`172.28.0.10`) on the `pos-app`
  network. nginx resolves `api` once at startup and keeps that address, so a
  recreated API container would otherwise return 502 errors until the Admin
  container is restarted.
- `docker compose --profile app run --rm migrate` re-runs the migrations by
  hand.

### Kubernetes

`deploy/k8s/` contains the Namespace, ConfigMap, Secret template, migration
Job, API and Admin Deployments with their Services, a PodDisruptionBudget, and
the TLS Ingress. Apply order is documented in `deploy/README.md`; the short
version is namespace → config → secret → migration Job → workloads → Ingress.

- The API Deployment uses `GET /api/v1/health` as the liveness and startup
  probe and `GET /api/v1/health/ready` as the readiness probe. A database
  outage removes the pod from the Service instead of restarting it.
- The Admin Deployment probes `GET /` on the nginx container.
- The migration Job applies the schema before the API is rolled out. A Job's
  spec is immutable, so each release needs a fresh Job
  (`kubectl delete job pos-migrate` then apply it again).
- Both Deployments run as non-root with `readOnlyRootFilesystem: true` and all
  capabilities dropped.

### Secret injection

- Compose reads secrets from the host environment or from a file passed with
  `--env-file`. `${VAR:?…}` makes the stack fail fast instead of booting with a
  missing or wildcard secret.
- Kubernetes reads them from the `pos-secrets` Secret. Use an external secret
  manager (External Secrets Operator, Vault, AWS Secrets Manager) for a real
  cluster and keep the filled-in Secret out of version control.
- Never bake secrets into an image, and never commit a filled-in Secret.

### TLS

- Compose: `deploy/compose.tls.yaml` mounts `deploy/nginx/admin-tls.conf` and
  the certificates from `deploy/nginx/certs`, and the Admin container serves
  HTTPS on 8443 and redirects plain HTTP.
- Kubernetes: the Ingress references the `pos-tls` Secret for the admin host.
- The Admin nginx forwards an incoming `X-Forwarded-Proto` unchanged, so the
  API still sees the original scheme when TLS is terminated further upstream.
- The API needs `TRUST_PROXY=true` so `X-Forwarded-For` is used for the
  rate-limit key instead of the proxy's address.

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
| `LOG_LEVEL` | optional | Log threshold: `error`, `warn`, `log` (default), `debug`, `verbose`, `fatal` |
| `LOG_FORMAT` | optional | `json` (default) or `text` for a readable local format |
| `METRICS_ENABLED` | optional | Set `false` to switch off the `/metrics` endpoint (default: enabled) |
| `METRICS_AUTH_TOKEN` | optional | When set, a scrape needs `Authorization: Bearer <token>` |
| `READINESS_INTERVAL_MS` | optional | How often the API checks the database for the readiness gauge (default `15000`) |

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
- Prisma 7 no longer generates the client automatically. The build pipeline must
  run `npm run prisma:generate` (or `npx prisma generate`) after `npm ci` and
  before compiling the API.
- The CLI reads `DATABASE_URL` from `apps/api-nestjs/prisma.config.ts`; the API
  process connects with the `@prisma/adapter-pg` driver adapter. Both must point
  at the same database.
- Pool settings moved from Prisma to the `pg` driver. The defaults are
  `DATABASE_POOL_MAX=10`, `DATABASE_CONNECTION_TIMEOUT_MS=5000`, and
  `DATABASE_IDLE_TIMEOUT_MS=30000`; tune them if the database limits
  connections.

## 4. Health, readiness, and probes

- Liveness: `GET /api/v1/health`
- Readiness (checks PostgreSQL): `GET /api/v1/health/ready`

Configure the orchestrator to restart on liveness failure and remove an
instance from the load balancer on readiness failure. A readiness failure
usually means the database is unreachable.

| Runtime | Liveness | Readiness |
| --- | --- | --- |
| Docker Compose | `healthcheck` on `http://127.0.0.1:3000/api/v1/health` | `docker compose ps` shows `healthy` only when the database answers |
| Kubernetes | `startupProbe` + `livenessProbe` on `/api/v1/health` | `readinessProbe` on `/api/v1/health/ready` |

The probe paths are global-prefix aware, so they must be requested with the
`/api/v1` prefix and without a trailing slash.

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

Implemented. The API writes structured JSON logs, exposes a Prometheus
registry at `GET /metrics`, and propagates a W3C trace context. The scrape
configuration and the alert rules live in `deploy/monitoring/`.

### Structured logs

Every log line is one JSON object with a stable field set:

```json
{"timestamp":"2026-11-24T04:14:10.299Z","level":"log","message":"Mapped {/api/v1/auth/login, POST} route","context":"RouterExplorer"}
```

| Field | Meaning |
|---|---|
| `timestamp` | ISO 8601 timestamp |
| `level` | `log`, `warn`, `error`, `fatal`, `debug`, `verbose` |
| `message` | The log text |
| `context` | The NestJS context that produced the line |
| `correlationId` | The id of the request. Also returned as `x-request-id` |
| `traceId`, `spanId` | The W3C trace context of the request |
| `stack` | The stack trace, on error lines |

- `LOG_LEVEL` sets the threshold: `error`, `warn`, `log` (default), `debug`,
  `verbose`, `fatal`.
- `LOG_FORMAT=text` switches to a readable line format for local
  development. The default is `json`.
- Error responses carry the same `correlationId` in the body, so a support
  request can be matched to the log lines without a timestamp guess.
- A request that arrives with an `x-request-id` header gets that id back, as
  long as it is a short printable token. Anything else is replaced with a
  fresh UUID, so a client cannot inject a value into the logs.

### Metrics

`GET /metrics` serves the Prometheus text format. The route sits outside the
`/api/v1` prefix, because that is where Prometheus expects a scrape endpoint.

| Metric | Labels | Meaning |
|---|---|---|
| `pos_http_requests_total` | `method`, `route`, `status_code` | Requests handled by the API. `route` is the route template, never the raw path |
| `pos_http_request_duration_seconds` | `method`, `route` | Request duration histogram |
| `pos_readiness_up` | – | `1` when the last database check succeeded |
| `pos_sync_push_total` | `entity`, `outcome` | Entities processed by the sync push, split by outcome |
| `pos_negative_stock_events_total` | `action`, `store` | Negative stock events and the action taken |
| `pos_auth_failures_total` | `reason` | Failed authentication attempts |
| `pos_auth_lockouts_total` | `reason` | Account lockouts |
| `pos_payment_transactions_total` | `type`, `status` | Payment transactions by type and final status |

- The endpoint is open by default, which is correct when the API sits on a
  private network. Set `METRICS_AUTH_TOKEN` to require a bearer token, and
  `METRICS_ENABLED=false` to switch the endpoint off entirely.
- The readiness gauge is maintained by the API itself every 15 seconds
  (`READINESS_INTERVAL_MS`). It does not depend on an external prober, so the
  metric is correct in a plain Compose deployment as well as in Kubernetes.

### Tracing

The API implements the W3C Trace Context without the OpenTelemetry SDK:

- An inbound `traceparent` continues that trace. A malformed header, an
  unsupported version, or an all-zero id is rejected and a new trace is
  started, so a broken client cannot poison an unrelated request.
- The API answers with its own `traceparent`, so the edge, the API, and any
  service it calls share one trace id.
- The trace id and the span id appear in every log line of the request.

### Alerts

`deploy/monitoring/prometheus-rules.yaml` holds 16 rules in six groups:
availability, errors and latency, inventory and sync, security, payments, and
backups. They cover the 5xx rate, readiness failures, rising negative stock,
sync failures, authentication lockouts, payment failures, and the age of the
last backup.

| Alert | Severity | Fires when |
|---|---|---|
| `PosApiInstanceDown` | critical | An API instance cannot be scraped for 2 minutes |
| `PosApiAllInstancesDown` | critical | Every API instance is down |
| `PosApiReadinessFailing` | critical | The database was unreachable for 2 minutes |
| `PosApiHighErrorRate` | warning | More than 5% of the requests return 5xx for 10 minutes |
| `PosApiCriticalErrorRate` | critical | More than 25% of the requests return 5xx for 5 minutes |
| `PosApiHighLatency` | warning | The p95 request duration is above 2 seconds for 10 minutes |
| `PosNegativeStockEvents` | warning | A negative stock event was raised in the last 15 minutes |
| `PosNegativeStockEscalated` | critical | A negative stock event needed an approval or a write-off |
| `PosSyncFailures` | warning | The sync push rejects entities for 5 minutes |
| `PosSyncFailingContinuously` | critical | More sync entities fail than succeed for 30 minutes |
| `PosAuthLockouts` | warning | An account was locked out in the last 15 minutes |
| `PosAuthFailureSpike` | warning | More than one failed authentication per second for 10 minutes |
| `PosPaymentFailures` | warning | A payment transaction ends in `FAILED` |
| `PosPaymentFailureRateHigh` | critical | More than 10% of the payment transactions fail |
| `PosBackupStale` | critical | The last successful backup is older than 26 hours |
| `PosBackupMetricMissing` | warning | No backup success timestamp is published for 24 hours |

Every rule carries a `runbook_url` annotation, and
`deploy/monitoring/README.md` describes what to do for each alert.

### Running Prometheus

```bash
docker compose --profile app up -d
docker compose --profile monitoring up -d
```

Prometheus is then available on <http://localhost:9090>. In Kubernetes the
configuration is applied as a ConfigMap created from the files in
`deploy/monitoring/`; the exact command is in `deploy/monitoring/README.md`.

The alert rules are not wired to a notification channel. Point Alertmanager
at the `pos-api` rules and route on the `severity` label.

## 7. Rate limiting and brute-force protection (R-06)

Implemented. `@nestjs/throttler` applies a global per-IP budget and stricter
per-route limits on `/auth/login`, `/auth/refresh`, and `/auth/verify-pin`.
Failed logins and PIN checks additionally feed a process-local lockout tracker
with escalating backoff.

Operational notes:

- Tune the limits with the `THROTTLE_GLOBAL_*` and `AUTH_*_THROTTLE_*`
  variables listed in section 2. The defaults are deliberately strict.
- Set `TRUST_PROXY=true` behind the edge proxy, otherwise every request
  arrives with the proxy's address and the per-IP limits become a global
  limit.
- The lockout state is process-local. Several API replicas behind one load
  balancer each keep their own counters; move the state to Redis (M-07
  follow-up) before scaling out.
- Alert on the `AUTH_LOCKOUT_ALERT` log event and on the
  `AUTH_ALERT_WEBHOOK_URL` deliveries.

## 8. Payment and offline behavior

- The API exposes a configurable payment gateway: `IPaymentProvider` with a
  generic REST implementation (`GenericPaymentProvider`). The provider
  configuration (base URL, paths, credentials, signature mode) lives in the
  `PaymentProvider.config` JSON column, so a new gateway is a configuration
  change rather than a code change.
- `SaleTender` rows hold the split payment breakdown (method, amount, change,
  reference) and link to an optional `PaymentTransaction`. Authorize, capture,
  void, and refund are implemented, webhook signatures are verified with
  HMAC, and idempotency keys protect the write paths.
- Negative stock is a deliberate policy, not an accident: the policy engine
  supports `ALERT_ONLY`, `AUTO_TRANSFER`, `MANAGER_APPROVAL`, and `WRITE_OFF`,
  and every escalation is recorded as a `NegativeStockEvent`. A per-store
  policy overrides the global default.
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
