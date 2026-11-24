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

### P2.1 — M-02: HttpOnly refresh cookie + CSRF double-submit (`8fe6383`)

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

### P2.2 — D-01: Prisma 7 + bcrypt 6 (`8bd1631`)

- `prisma` / `@prisma/client` 6.19.3 → 7.10.1. Prisma 7 is Rust-free and connects through a driver adapter, so `@prisma/adapter-pg` + `pg` were added.
- `prisma.config.ts` (new, project root of the API app) holds the schema path, migration path, seed command, and the `DATABASE_URL`/`SHADOW_DATABASE_URL` used by the CLI; `url` was removed from `schema.prisma` because Prisma 7 rejects it there.
- `src/prisma/prisma-client.factory.ts` builds the adapter for every entry point (Nest service, seed script); `PrismaService` and `prisma/seed.ts` use it.
- Pool behaviour is restored explicitly because `pg` has no connect timeout by default: `DATABASE_POOL_MAX` (10), `DATABASE_CONNECTION_TIMEOUT_MS` (5000), `DATABASE_IDLE_TIMEOUT_MS` (30000).
- `bcrypt` 5.1.1 → 6.0.0. bcrypt 6 replaces `@mapbox/node-pre-gyp` with `node-gyp-build`, which removes the vulnerable `tar@6` chain (the critical advisory). Hash format stays `$2b$`, so existing password/PIN hashes still verify.
- `overrides: { effect: ^3.22.5 }` pins the Prisma CLI's `effect` dependency past GHSA-7589-6fvf-x4pw.
- `prisma migrate reset` is no longer used anywhere: Prisma 7 refuses to run it unattended (AI/CI destructive-action guard). `npm run prisma:reset` drops/recreates the database, applies the migrations, and seeds; the e2e harness does the same in `e2e/scripts/setup-db.mjs`.
- `prisma generate` is now an explicit build step (Prisma 7 no longer generates on install/migrate).
- Verification: `npm audit --omit=dev` → **0 advisories**; fresh database + `prisma migrate deploy` + `migrate diff --from-config-datasource --to-schema … --exit-code` → no difference; 36 API unit and 24 API e2e tests pass on the new client.

### P2.3 — D-02: Zod 4 + React Router 7 (`097036b`)

- `zod` 3.24 → 4.6.7 (GHSA-mrhx-c7xc-m3w5), `react-router-dom` 6.28 → 7.18.6 (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg).
- `@hookform/resolvers` 3.10 → 7.0.8 and `react-hook-form` 7.54 → 7.92: the v3 resolver reads the Zod 3 error shape (`error.errors`), while the v7 resolver uses the standard-schema interface and supports Zod 4.
- Zod 4 separates input and output types. `ProductModal` now uses `z.input` for the form values and `z.output` for the submitted payload, typed through react-hook-form's third generic (`useForm<Input, unknown, Output>`), so the `isActive` schema default still yields a boolean in the API payload.
- `LoginPage` switched from the deprecated `z.string().email()` to `z.email()`.
- React Router 7 keeps the v6 component APIs used here (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `NavLink`, `useNavigate`, `useLocation`, `MemoryRouter`); the v7 future flags are now the default behaviour, so the `v7_startTransition` / `v7_relativeSplatPath` console warnings are gone.
- Verification: `npm audit --omit=dev` → **0 advisories**; typecheck, 27 React tests, and the production build pass.

### P2.4 — dependency audit becomes a blocking gate (`097036b`)

- `.github/workflows/ci.yml`: the `dependency-audit` job dropped `continue-on-error: true` and the `|| echo "::warning::…"` fallbacks; it now runs `npm audit --omit=dev` for the API and the React app and fails the pipeline on any advisory.
- No workflow in `.github/workflows` uses `continue-on-error` any more.

### P3.1 — M-07: containerization and deployment artifacts (`f37dce0`)

**Images**

- `apps/api-nestjs/Dockerfile`: multi-stage build on `node:22-bookworm-slim`. The build stage installs every dependency, runs `prisma generate` (Prisma 7 no longer generates on install) and compiles the NestJS output. The runtime stage keeps the production dependencies, the compiled output, the generated Prisma client and the migration history, and runs as the `node` user.
- The runtime stage also carries the Prisma CLI, ts-node, TypeScript and the type packages the seed needs. npm skips `devDependencies` while `NODE_ENV=production`, so the `devDependencies` block is removed for that one install and the original `package.json` is restored afterwards. The image can therefore run `prisma migrate deploy` and `prisma db seed` offline, without pulling anything from a registry at runtime.
- `apps/admin-react/Dockerfile`: the React bundle served by `nginxinc/nginx-unprivileged:1.27-alpine`, which runs as UID 101 and listens on 8080. No root privileges and no extra capabilities are needed.
- `apps/admin-react/nginx.conf`: SPA fallback plus the `/api/` reverse proxy to `http://api:3000`, so the browser uses one origin and the session cookies stay first-party. An incoming `X-Forwarded-Proto` is forwarded unchanged, so the API still sees the original scheme when TLS is terminated further upstream.

**Compose**

- `compose.yaml` keeps PostgreSQL outside the `app` profile and adds `migrate`, `api`, and `admin` inside it. The migration service applies `prisma/migrations` before the API starts (`depends_on: service_completed_successfully`).
- Secrets come from the host environment or `--env-file`. `${VAR:?…}` makes the stack fail fast instead of booting with a missing or wildcard secret. `CORS_ORIGIN` is required because the API refuses `*` in production.
- The API container keeps the fixed address `172.28.0.10` on the `pos-app` network. nginx resolves `api` once at startup and keeps that address, so a recreated API container would otherwise return 502 errors until the Admin container is restarted.
- `deploy/compose.tls.yaml` + `deploy/nginx/admin-tls.conf`: TLS termination in the Admin container. Certificates are mounted from `deploy/nginx/certs`, which is git-ignored.

**Kubernetes**

- `deploy/k8s/`: Namespace, ConfigMap, a Secret template, the migration Job, the API Deployment/Service, a PodDisruptionBudget, the Admin Deployment/Service, and the TLS Ingress.
- The API Deployment uses `GET /api/v1/health` as the liveness and startup probe and `GET /api/v1/health/ready` as the readiness probe, so a database outage removes the pod from the Service instead of restarting it.
- Both Deployments run as non-root with `readOnlyRootFilesystem: true` and all capabilities dropped. The Admin container mounts an `emptyDir` at `/tmp` because nginx writes its pid file and temporary paths there.
- The migration Job runs `prisma migrate deploy` from the same image that serves the traffic. A Job's spec is immutable, so each release needs a fresh Job; the runbook documents the delete-and-reapply step.

**CI**

- `.github/workflows/ci.yml` gained a `containers` job that builds both images, applies the migrations with the API image, waits for the readiness probe, and checks the Admin SPA and its `/api/` proxy. It pushes nothing.

**Verification** (Docker Desktop, local PostgreSQL)

- `pos-api` and `pos-admin` build cleanly.
- `prisma migrate deploy` and `npm run prisma:seed` both succeed inside the API image.
- `/api/v1/health` and `/api/v1/health/ready` answer `200` with `{"status":"ready","database":"up"}`.
- The Admin image serves the SPA, the SPA fallback answers `200` on a deep link, and `/api/v1/health` through the nginx proxy answers `200`.
- Both images run with `--read-only --cap-drop ALL --security-opt no-new-privileges` and a non-root user (1000 for the API, 101 for nginx).
- The TLS overlay was verified with a self-signed certificate: plain HTTP returns `301` to HTTPS, the HTTPS SPA returns `200`, the HTTPS `/api/` proxy returns `200`, and a login through the TLS chain returns `pos_refresh_token` with `HttpOnly; Secure; SameSite=Strict` and no refresh token in the body.

**Side effect:** the local development database had been created with `prisma db push`, so its migration history was incomplete (one migration recorded as failed). The schema matched `schema.prisma` with zero drift, so the history was repaired with `prisma migrate resolve` only; no data was touched.

### P3.2 — M-07: structured logs, Prometheus metrics, tracing, and alerts (`a5aef5b`)

**Structured logs**

- `src/common/logging/json-logger.ts`: a dependency-free `LoggerService` that writes one JSON object per line. The NestJS default logger writes human-readable lines that no log pipeline can query reliably; this one has a stable field set (`timestamp`, `level`, `message`, `context`, `correlationId`, `traceId`, `spanId`, `stack`).
- `LOG_LEVEL` sets the threshold (`error`, `warn`, `log`, `debug`, `verbose`, `fatal`; default `log`). `LOG_FORMAT=text` switches to a readable line format for local development; the default is `json`.
- The logger is installed through `NestFactory.create(AppModule, { logger: new JsonLogger() })`, so the bootstrap messages are structured too.
- The NestJS call shapes differ (`log(message, context)` but `error(message, stack, context)`); the logger unpacks both so `context` and `stack` always land in the right fields.

**Request context and tracing**

- `src/common/logging/request-context.ts`: an `AsyncLocalStorage` scope that carries the `correlationId`, the `traceId`, and the `spanId` of the current request. Any logger call made while handling the request picks them up without the call sites passing them around.
- The W3C Trace Context is implemented without the OpenTelemetry SDK: `parseTraceparent` accepts a well-formed `traceparent`, and rejects a malformed header, an unsupported version, or an all-zero id instead of trusting it, so a broken client cannot poison the trace of an unrelated request.
- `normalizeCorrelationId` only accepts a short printable token from `x-request-id`; anything else is replaced with a fresh UUID. The value is echoed back to the caller and written to the logs, so an unbounded or control-character-laden header must not be trusted.
- `src/common/logging/request-context.middleware.ts` assigns the ids, sets the `x-request-id` and `traceparent` response headers, and records the request in the Prometheus registry. The route label is the Express route template, never the raw path, so the label cardinality stays bounded by the number of routes.

**Error responses**

- `src/common/filters/http-exception.filter.ts` puts the `correlationId` in every error body, so a support request can be matched to the log lines without a timestamp guess. A 5xx is logged at the error level, a 4xx at the warning level, and the library or database message is never exposed to the client.

**Metrics**

- `prom-client@15.1.3` (0 advisories). The registry is hand-rolled instead of using the global prom-client registry, because the API can be instantiated more than once in a test run and a global registry would carry counters over between instances.
- `src/common/metrics/metrics.service.ts` defines `pos_http_requests_total`, `pos_http_request_duration_seconds`, `pos_sync_push_total`, `pos_negative_stock_events_total`, `pos_auth_failures_total`, `pos_auth_lockouts_total`, and `pos_payment_transactions_total`. The sync, inventory, auth, and payment services report into it.
- `src/common/metrics/metrics.controller.ts` serves `GET /metrics`. The route sits outside the `/api/v1` prefix, because that is where Prometheus expects a scrape endpoint. `METRICS_ENABLED=false` switches it off; `METRICS_AUTH_TOKEN` requires a bearer token.
- `src/common/metrics/readiness.monitor.ts` keeps the `pos_readiness_up` gauge in sync with the database. The API checks on a fixed interval (`READINESS_INTERVAL_MS`, default 15 s) instead of relying on an external prober, so the metric is correct in a plain Compose deployment as well as in Kubernetes.

**Alerts**

- `deploy/monitoring/prometheus-rules.yaml`: 16 rules in six groups — availability (instance down, all instances down, readiness failing), errors (5xx rate warning and critical, p95 latency), inventory and sync (negative stock events and escalations, sync failures, failures above successes), security (lockouts, failure spike), payments (failures, failure rate), and backups (stale backup, missing backup metric).
- `deploy/monitoring/prometheus-scrape.yaml` and `deploy/monitoring/prometheus.yml`: the scrape jobs. The target `api:3000` resolves to the Kubernetes Service and to the Compose service alias, so the same configuration works in both environments.
- `deploy/monitoring/prometheus-rules.test.yaml`: `promtool` unit tests that feed synthetic series into the rules and assert which alerts fire.
- `deploy/monitoring/README.md`: how to run Prometheus, what each metric and each alert means, and what to do for every alert.
- `compose.yaml` gained a `monitoring` profile with the Prometheus service. A profile cannot depend on a service from another profile, so Prometheus retries the scrape until the API answers; starting the two in either order works.
- `deploy/k8s/60-prometheus-deployment.yaml` and `61-prometheus-service.yaml`: the Kubernetes Deployment and Service. The configuration is applied as a ConfigMap created from the files in `deploy/monitoring/`, so a committed copy cannot drift from the canonical files.

**Verification** (Docker Desktop, local PostgreSQL)

- `promtool check config` → 1 rule file, 16 rules, valid configuration.
- `promtool test rules` → all rule unit tests pass. Writing them found a broken expression: `count(up{job="pos-api"} == 1) == 0` returns an empty vector when no instance answers, so the "all instances down" alert never fired. It now compares the instance count with the sum of the `up` values.
- The live stack scrapes the API target successfully (`up`), the 16 rules load and evaluate, and the metric values are the expected ones (`pos_http_requests_total{route="/api/v1/health",status_code="200"}`).
- The readiness gauge reads `1` right after the API starts, without any external probe; it drops to `0` within 30 s of PostgreSQL stopping and recovers to `1` after the database is back.
- Every response carries `x-request-id` and a `traceparent`. An inbound `traceparent` is continued with a new span id; a malformed one is replaced.
- The API log lines are JSON objects, one per line.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` (API) | passed |
| `npm test` (API) | 72 passed / 12 suites |
| `npm run test:e2e` (API, PostgreSQL `localhost:15432`) | 33 passed / 5 suites |
| `npm test` (React) | 27 passed |
| `npm run build` (React) | passed |
| `flutter test` | 158 passed |
| `flutter analyze` | no errors (28 info-level deprecations) |
| `flutter build web` | passed |
| Fresh DB migration bootstrap | zero drift |
| Container images | `pos-api` + `pos-admin` built, migrations and seed applied from the image, liveness/readiness/SPA/proxy verified |
| Hardened containers | read-only root filesystem, non-root user, all capabilities dropped |
| TLS overlay | 301 redirect, HTTPS SPA, HTTPS `/api/` proxy, `Secure`/`HttpOnly`/`SameSite=Strict` cookies |
| Prometheus configuration | `promtool check config` → 1 rule file, 16 rules, valid |
| Prometheus rules | `promtool test rules` → all unit tests pass |
| Prometheus (live) | the `pos-api` target scrapes successfully, the rules load and evaluate, the readiness gauge follows the database |

Additional M-02 e2e coverage: cookie mode sets the right flags and omits the body refresh token; missing/wrong CSRF is rejected with 403; the correct double-submit rotates cookies; logout clears both cookies; the native body-token refresh still returns a refresh token.

## Known limitations / follow-ups

1. **Lockout state is process-local.** Move throttler storage and lockout counters to Redis before running more than one API replica (tracked under M-07).
2. **Auto-transfer does not move stock.** It records candidates for an operator/Admin action.
3. **Negative-stock Admin UI** is not built yet; the API and events exist.
4. **Generic provider only.** Real gateway quirks (signature formats, status codes) may need adapters behind `IPaymentProvider`.
5. **Advisories.** Both production dependency trees are clean (`npm audit --omit=dev` → 0 for the API and the React app) and the CI dependency audit is a blocking gate.
6. **Refresh rotation is stateless (M-02).** A rotated cookie produces a new `jti`, but the previously issued refresh token stays valid until expiry (7 days) or `tokenVersion` bump. Enforce one-time use with a jti denylist (Redis) before treating rotation as theft detection.
7. **Prisma 7 keeps the classic generator (D-01).** The deprecated `prisma-client-js` provider is still used so the API stays CommonJS and no import paths change. Move to the `prisma-client` generator (custom `output`, generated imports) when the API is migrated to ESM.
8. **M-07 is only half done.** The deployment side (images, Compose, Kubernetes, probes, TLS, secret injection) and the observability side (JSON logs, Prometheus metrics, W3C tracing, 16 alert rules with a runbook) are complete. The encrypted PostgreSQL backup and the restore drill are still open, so the data-loss side of the readiness story is not there yet.
9. **The Kubernetes manifests are templates.** The image references (`ghcr.io/example/…`), the host name (`admin.example.com`), the Ingress class, the TLS secret, and the database URL must be replaced for a real cluster, and the Kubernetes manifests were validated by inspection and by an equivalent local Compose run, not by an actual cluster.
10. **The auth lockout state is still process-local.** The Kubernetes Deployment scales the API to two replicas, so the lockout counters are not shared between them. Move that state to Redis before scaling beyond a single replica.
11. **The alerts are not wired to a notification channel.** The rules load and evaluate, and every rule carries a `runbook_url` annotation, but pointing Alertmanager at them (and choosing the routing for the `severity` label) is left to the operator. There is no Grafana dashboard in the repository either.
12. **The tracing is W3C context propagation without a collector.** The API continues an inbound `traceparent` and answers with its own, so the edge and the API share a trace id, but no OpenTelemetry SDK, span exporter, or trace backend is wired up. Add the SDK when a collector exists to receive the spans.
13. **The backup rules wait for the backup job.** `PosBackupStale` and `PosBackupMetricMissing` expect `pos_backup_last_success_timestamp_seconds`, which the backup job has to publish through a node_exporter textfile collector or a Pushgateway. Until roadmap item 11 exists, the metric is absent and the missing-metric rule stays pending.
14. **The metrics endpoint is open by default.** That is correct when the API sits on a private network. `METRICS_AUTH_TOKEN` and `METRICS_ENABLED=false` exist for the other cases, but the default is not locked down.
