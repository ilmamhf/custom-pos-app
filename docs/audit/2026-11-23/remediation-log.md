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

### P3.3 — M-07/R-07: encrypted backups, WAL archive, and restore drill (`126a93d`)

**The image**

- `deploy/backup/Dockerfile`: PostgreSQL 16 with `age`. The same image serves the database, the backup job, and the drill, so the tool and the server always speak the same major version, which `pg_basebackup` requires.
- `deploy/backup/pos-entrypoint.sh`: the wrapper that fixes the ownership of the mounted volumes and then drops the privileges. Docker creates the named volumes owned by root, but the server and the jobs run as the unprivileged `postgres` user. Without it the WAL archive could not be written (`mkdir: cannot create directory '/wal-archive/wal': Permission denied`).

**The backup job**

- `deploy/backup/backup.sh`: a `pg_basebackup` in the tar format with `-X stream`, so the backup is consistent and carries the WAL it needs. A logical `pg_dump` could not be combined with the archived WAL for a point-in-time recovery, and that is where the RPO of 15 minutes comes from.
- The base backup, the bundled WAL, and the manifest are encrypted with age. The public recipient is committed (`deploy/backup/age-recipient.txt`); the private identity is git-ignored and is only mounted into the drill.
- The job cannot decrypt what it wrote — it only holds the public key, which is the point of an asymmetric key. It verifies the age file header instead, so a truncated encryption is caught at backup time rather than at restore time.
- The metadata file is written last and holds the SHA-256 of the encrypted base backup. The drill verifies it, so a corrupted backup is reported as a storage failure instead of a restore failure.
- The retention prunes by age first and by count second, and it removes the files of a backup as a set.

**The WAL archive**

- `archive_mode=on` with `archive_command=/usr/local/bin/archive-wal.sh`. Every completed segment is copied into the archive, encrypted, within `archive_timeout=300` seconds.
- `deploy/backup/archive-wal.sh` is idempotent: a segment that is already in the archive is not written again, and the encryption goes to a temporary name that is moved into place, so a crash halfway through never leaves a truncated segment that looks complete.
- A failing `archive_command` never blocks the database: PostgreSQL retries it and keeps the segment in `pg_wal`. The pile-up is visible in `pg_stat_archiver`.

**The restore drill**

- `deploy/backup/restore-drill.sh`: starts its own PostgreSQL instance on port 55432 with its own data directory. The production database is never touched.
- The manifest names the WAL range the backup covers, and the end of that range is the recovery target. Without a target the instance waits for WAL that the production server has not written yet, which is what the first run of the drill did.
- The drill verifies that the tables the application needs exist, that the row counts are readable, that every sale has a grand total, and that no tender points at a missing sale. The last check is the one that catches an inconsistent restore: the tenders are the split payments of a sale.
- The newest archived WAL segment is decrypted and read with `pg_waldump`, which proves the archive is intact and usable. `pg_waldump` derives the start location from the segment name, so the segment has to sit in a directory named `pg_wal`.
- The elapsed time is the measured RTO. It is written to `report.json` and published as a Prometheus metric.

**The authentication rules**

- `deploy/backup/pg_hba.conf` replaces the rules that `initdb` writes, because the default rules only allow a replication connection from localhost and the backup job runs in its own container. The committed file allows the replication connection for the `pos` role with `scram-sha-256`.
- `pg_basebackup` opens a physical replication connection, and a plain database name is parsed as a conninfo string, which fails. The connection is given as a conninfo string (`host=… port=… user=… dbname=postgres`).

**The metrics**

- The backup job and the drill publish their results through the node_exporter textfile collector, so the `PosBackupStale` and `PosBackupMetricMissing` rules have a signal: `pos_backup_last_success_timestamp_seconds`, `pos_backup_last_drill_timestamp_seconds`, and `pos_backup_last_drill_duration_seconds`.
- Every metric gets its own file. The first version wrote them all into one file, and the drill overwrote the timestamp of the backup.

**The deployment**

- `compose.yaml`: the `backup` profile holds the `backup` and `restore-drill` services. The PostgreSQL service now runs the backup image with the WAL archiving enabled, and the `monitoring` profile gained a `node-exporter` service.
- `deploy/k8s/70-backup-cronjob.yaml` and `71-restore-drill-cronjob.yaml`: the daily backup and the quarterly drill. The backup job must not carry the private age identity, and the drill must; the offline validator checks both.
- `deploy/backup/README.md`: the keypair, the jobs, the targets, what the drill proves, and the limitations.

**Verification** (Docker Desktop, local PostgreSQL)

- The WAL archive fills up: the segments appear in `/wal-archive/wal`, encrypted, 16 MB each.
- The backup job writes the encrypted base backup, the bundled WAL, the manifest, and the metadata; it verifies the age headers and prunes the old backups.
- The restore drill passes: 18 tables, 2 stores, 25 products, 23 sales, 21 tenders, recovered to the LSN the manifest names, in 4 seconds.
- The archived WAL segment decrypts and is readable with `pg_waldump`.
- `pos_backup_last_success_timestamp_seconds` reaches Prometheus through the node_exporter textfile collector, and both backup alerts resolve to inactive.

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
| Encrypted backup | the base backup, the bundled WAL, and the manifest are encrypted; the metadata checksum verifies |
| WAL archive | the encrypted segments appear in the archive and the drill reads one back with `pg_waldump` |
| Restore drill | passed: 18 tables, 2 stores, 25 products, 23 sales, 21 tenders; RTO measured at 4 seconds |
| Backup metrics | `pos_backup_last_success_timestamp_seconds` reaches Prometheus; both backup alerts resolve to inactive |
| Kubernetes manifests | 18 resources from 14 files, all offline checks pass |

Additional M-02 e2e coverage: cookie mode sets the right flags and omits the body refresh token; missing/wrong CSRF is rejected with 403; the correct double-submit rotates cookies; logout clears both cookies; the native body-token refresh still returns a refresh token.

## Known limitations / follow-ups

1. **Lockout state is process-local.** Move throttler storage and lockout counters to Redis before running more than one API replica (tracked under M-07).
2. **Auto-transfer does not move stock.** It records candidates for an operator/Admin action.
3. **Negative-stock Admin UI** is not built yet; the API and events exist.
4. **Generic provider only.** Real gateway quirks (signature formats, status codes) may need adapters behind `IPaymentProvider`.
5. **Advisories.** Both production dependency trees are clean (`npm audit --omit=dev` → 0 for the API and the React app) and the CI dependency audit is a blocking gate.
6. **Refresh rotation is stateless (M-02).** A rotated cookie produces a new `jti`, but the previously issued refresh token stays valid until expiry (7 days) or `tokenVersion` bump. Enforce one-time use with a jti denylist (Redis) before treating rotation as theft detection.
7. **Prisma 7 keeps the classic generator (D-01).** The deprecated `prisma-client-js` provider is still used so the API stays CommonJS and no import paths change. Move to the `prisma-client` generator (custom `output`, generated imports) when the API is migrated to ESM.
8. **M-07 is complete, but the operator work is not.** The deployment side (images, Compose, Kubernetes, probes, TLS, secret injection), the observability side (JSON logs, Prometheus metrics, W3C tracing, 16 alert rules with a runbook), and the data-protection side (encrypted backups, the WAL archive, the restore drill with the RTO measured) are done. What is left is operational: the age private identity has to be in the secret store, the backups have to be copied outside the deployment, and the alert rules have to be wired to a notification channel.
9. **The Kubernetes manifests are templates.** The image references (`ghcr.io/example/…`), the host name (`admin.example.com`), the Ingress class, the TLS secret, and the database URL must be replaced for a real cluster, and the Kubernetes manifests were validated by inspection and by an equivalent local Compose run, not by an actual cluster.
10. **The auth lockout state is still process-local.** The Kubernetes Deployment scales the API to two replicas, so the lockout counters are not shared between them. Move that state to Redis before scaling beyond a single replica.
11. **The alerts are not wired to a notification channel.** The rules load and evaluate, and every rule carries a `runbook_url` annotation, but pointing Alertmanager at them (and choosing the routing for the `severity` label) is left to the operator. There is no Grafana dashboard in the repository either.
12. **The tracing is W3C context propagation without a collector.** The API continues an inbound `traceparent` and answers with its own, so the edge and the API share a trace id, but no OpenTelemetry SDK, span exporter, or trace backend is wired up. Add the SDK when a collector exists to receive the spans.
13. **The backups live in the deployment.** The encrypted files are on a volume of the same cluster, which is a copy and not a backup. Copy them to an object store, and encrypt them again with a key that the object store does not hold.
14. **Nothing prunes the WAL archive.** `archive_mode=on` archives every segment and there is no retention job for them, so a long-running deployment fills the WAL volume.
15. **The drill restores on the same node.** It proves that the backups are readable, that the data is complete, and that the archive is usable, and it measures the restore time. It does not prove that the failover procedure of the production cluster works.
16. **The metrics endpoint is open by default.** That is correct when the API sits on a private network. `METRICS_AUTH_TOKEN` and `METRICS_ENABLED=false` exist for the other cases, but the default is not locked down.
# # #   P 3 . 4   � �    M - 1 6 :   s a l e s   d a t e - r a n g e   f i l t e r   a n d   s t a f f   e d i t   w o r k f l o w   i n   R e a c t   ( ` 3 c a a 4 0 3 ` )  
  
 * * T h e   s a l e s   d a t e   f i l t e r * *  
  
 -   A   b o r d e r e d   f i l t e r   s t r i p   s i t s   a b o v e   t h e   r e c e i p t s   t a b l e :   F r o m ,   T o ,   S t a t u s ,  
     a n d   a   C l e a r   f i l t e r s   b u t t o n   t h a t   s t a y s   d i s a b l e d   u n t i l   a   f i l t e r   i s   s e t .  
 -   T h e   A d m i n   n o w   s e n d s   t h e   ` f r o m `   a n d   ` t o `   p a r a m e t e r s   t h e   A P I   a l r e a d y  
     a c c e p t e d .   T h e   c o n v e r s i o n   l i v e s   i n   ` s r c / l i b / d a t e - r a n g e . t s ` :   t h e   o p e r a t o r  
     p i c k s   c a l e n d a r   d a y s ,   t h e   h e l p e r   t u r n s   t h e m   i n t o   t h e   i n c l u s i v e   l o c a l - d a y  
     b o u n d s   t h e   A P I   e x p e c t s .   A   b r a n c h   i n   W I B   t h a t   p i c k s   " 2 4   N o v "   m e a n s  
     0 0 : 0 0   t h r o u g h   2 3 : 5 9 : 5 9 . 9 9 9   l o c a l   t i m e .   S e n d i n g   t h e   b a r e   ` 2 0 2 6 - 1 1 - 2 4 `  
     w o u l d   c o v e r   o n l y   t h e   f i r s t   i n s t a n t   o f   t h a t   d a y   a n d   q u i e t l y   h i d e   t h e  
     r e s t   o f   i t .  
 -   A   r e v e r s e d   r a n g e   i s   r e f u s e d   i n   t h e   b r o w s e r   w i t h   a   r e a d a b l e   ` r o l e = a l e r t `  
     a n d   n o   q u e r y   a t   a l l ,   r a t h e r   t h a n   b e i n g   s e n t   a s   a   r a n g e   t h a t   c a n n o t  
     m a t c h .   T h e   s e r v e r   a l s o   v a l i d a t e s :   ` @ I s D a t e S t r i n g ( ) `   o n   t h e   D T O   a n d   a  
     ` r e s o l v e D a t e B o u n d s ( ) `   t h a t   t u r n s   a   m a l f o r m e d   o r   r e v e r s e d   r a n g e   i n t o   a  
     4 0 0   w i t h   a   r e a d a b l e   m e s s a g e   i n s t e a d   o f   a   P r i s m a   e r r o r .  
 -   E v e r y   f i l t e r   c h a n g e   r e s e t s   t h e   p a g e   t o   1 ,   a n d   t h e   e m p t y   s t a t e   n a m e s  
     t h e   r e a s o n   i n s t e a d   o f   s h o w i n g   a   b a r e   " n o   r e c o r d s " .  
  
 * * T h e   s t a f f   e d i t   w o r k f l o w * *  
  
 -   T h e   s t a f f   l i s t   h a d   a   D e a c t i v a t e   t o g g l e   a n d   n o t h i n g   e l s e .   T h e r e   w a s   n o  
     w a y   t o   r e n a m e   a n   a c c o u n t ,   c h a n g e   a   r o l e ,   o r   m o v e   s o m e b o d y   t o   a n o t h e r  
     b r a n c h .  
 -   ` S t a f f M o d a l `   i s   n o w   a   c r e a t e / e d i t   d u a l   m o d e .   I t   o p e n s   f i l l e d   w i t h   t h e  
     s t a f f   m e m b e r   b e i n g   e d i t e d ,   a n d   t h e   p a s s w o r d   a n d   P I N   f i e l d s   a r e   b l a n k  
     w i t h   " L e a v e   b l a n k   t o   k e e p "   s o   a n   e d i t   n e v e r   c l e a r s   a   c r e d e n t i a l   b y  
     a c c i d e n t .  
 -   A   m a n a g e r   n e e d s   a   6 - d i g i t   P I N ,   b e c a u s e   a   m a n a g e r   a u t h o r i z e s   r e f u n d s  
     w i t h   i t .   T h e   A P I   n o w   r e p o r t s   ` h a s P i n `   s o   t h e   A d m i n   k n o w s   w h e t h e r   a   P I N  
     i s   a l r e a d y   s e t ;   t h e   h a s h   i t s e l f   n e v e r   l e a v e s   t h e   s e r v i c e .   A   c a s h i e r  
     p r o m o t e d   t o   m a n a g e r   i s   a s k e d   f o r   a   P I N .  
 -   A n   o w n e r   r e a c h e s   e v e r y   b r a n c h ,   s o   t h e   r o l e   s e l e c t   a n d   t h e   b r a n c h  
     a s s i g n m e n t   a r e   d i s a b l e d   f o r   a n   o w n e r ,   w i t h   a   l i n e   s a y i n g   w h y .  
 -   T h e   r o l e   n a m e s   s t a y   s h o r t   s o   t h e   s e l e c t   n e v e r   t r u n c a t e s   t h e m ;   w h a t  
     e a c h   r o l e   m a y   d o   i s   s p e l l e d   o u t   u n d e r n e a t h   i n s t e a d .  
  
 * * T h e   A P I   g u a r d s   t h e   s t a f f   u p d a t e * *  
  
 -   A   d u p l i c a t e   e m a i l   i s   a   4 0 9   i n s t e a d   o f   a   P r i s m a   u n i q u e - c o n s t r a i n t  
     e r r o r .  
 -   T h e   l a s t   a c t i v e   o w n e r   c a n n o t   b e   d e m o t e d   o r   d e a c t i v a t e d .   T h e   s t a f f  
     d i r e c t o r y   i s   o w n e r - o n l y :   w i t h   e v e r y   o w n e r   g o n e ,   n o b o d y   c a n   r e a c h   i t  
     a n d   t h e   a c c o u n t s   b e l o w   a r e   l o c k e d   o u t   o f   t h e i r   b r a n c h e s   a s   w e l l .   T h e  
     r u l e   c o u n t s   t h e   o t h e r   a c t i v e   o w n e r s ,   s o   a   h a n d - o v e r   b e t w e e n   t w o  
     o w n e r s   s t i l l   w o r k s .  
 -   T h e   e d i t   r e s p o n s e   c a r r i e s   t h e   s a m e   s h a p e   a s   t h e   l i s t ,   s o   t h e   A d m i n  
     d o e s   n o t   h a v e   t o   r e f e t c h   t o   l e a r n   t h e   n e w   a s s i g n m e n t .  
  
 * * T e s t s   a d d e d * *  
  
 -   ` s r c / l i b / d a t e - r a n g e . t e s t . t s `   � �    8   c a s e s :   l o c a l - m i d n i g h t   p a r s i n g ,   n o  
     r o l l o v e r   o n   i n v a l i d   d a t e s ,   i n c l u s i v e   b o u n d s ,   o p e n   b o u n d s ,   r e v e r s e d  
     r a n g e ,   i n v a l i d   d a t e .  
 -   ` s r c / f e a t u r e s / s a l e s / S a l e s P a g e . t e s t . t s x `   � �    5   c a s e s :   t h e   p i c k e d   d a y s  
     r e a c h   t h e   A P I   a s   i n c l u s i v e   l o c a l - d a y   b o u n d s ,   C l e a r   r e s e t s   t h e   r a n g e ,  
     r e v e r s e d   r a n g e   s h o w s   t h e   a l e r t   a n d   s e n d s   n o t h i n g ,   p a g e   r e s e t s   t o   1 ,  
     e m p t y - s t a t e   m e s s a g e   n a m e s   t h e   f i l t e r .  
 -   ` s r c / f e a t u r e s / s e t t i n g s / S t a f f M a n a g e m e n t . t e s t . t s x `   � �    6   c a s e s :   t h e   l i s t  
     s h o w s   b r a n c h e s ,   t h e   e d i t   d i a l o g   o p e n s   p r e f i l l e d ,   a   s a v e   u p d a t e s   t h e  
     n a m e / r o l e / b r a n c h ,   e m p t y   n a m e   i s   r e f u s e d ,   m a n a g e r   p r o m o t i o n   r e q u i r e s  
     P I N ,   t h e   o w n e r   i s   k e p t   o u t   o f   t h e   r o l e / s t a t u s   c o n t r o l s .  
 -   ` t e s t / s a l e s - s t a f f . e 2 e - s p e c . t s `   � �    1 0   c a s e s :   s a l e s   r a n g e   r e t u r n s   o n l y  
     t h e   s a l e s   i n s i d e   t h e   r a n g e ,   w i d e r   r a n g e   c o v e r s   b o t h ,   b o u n d s   a r e  
     i n c l u s i v e ,   m a l f o r m e d   d a t e   i s   4 0 0 ,   r e v e r s e d   r a n g e   i s   4 0 0 ,   P I N   f l a g   i s  
     p r e s e n t   w i t h o u t   t h e   h a s h ,   e d i t   u p d a t e s   n a m e / r o l e / b r a n c h ,   d u p l i c a t e  
     e m a i l   i s   4 0 9 ,   l a s t   a c t i v e   o w n e r   c a n n o t   b e   d e a c t i v a t e d ,   m a n a g e r   s t i l l  
     r e a d s   t h e i r   b r a n c h .  
  
 * * V e r i f i c a t i o n * *   ( D o c k e r   D e s k t o p ,   l i v e   s t a c k )  
  
 |   C h e c k   |   R e s u l t   |  
 |   - - -   |   - - -   |  
 |   ` n p m   r u n   b u i l d `   ( A P I )   |   p a s s e d   |  
 |   ` n p m   t e s t `   ( A P I )   |   7 2   p a s s e d   /   1 2   s u i t e s   |  
 |   ` n p m   r u n   t e s t : e 2 e `   ( A P I )   |   4 3   p a s s e d   /   6   s u i t e s   ( i n c l u d e s   t h e   n e w   ` s a l e s - s t a f f . e 2 e - s p e c . t s ` )   |  
 |   ` n p m   t e s t `   ( R e a c t )   |   4 6   p a s s e d   /   9   s u i t e s   ( w a s   2 7   /   6 )   |  
 |   ` n p m   r u n   b u i l d `   ( R e a c t )   |   p a s s e d   |  
 |   ` n p m   a u d i t   - - o m i t = d e v `   ( A P I )   |   0   a d v i s o r i e s   |  
 |   ` n p m   a u d i t   - - o m i t = d e v `   ( R e a c t )   |   0   a d v i s o r i e s   |  
 |   L i v e   A d m i n   ( C D P   c l i c k - t h r o u g h )   |   S a l e s   f i l t e r :   F r o m / T o / S t a t u s   s t r i p   p r e s e n t ,   p i c k e d   d a y   s e n d s   l o c a l - d a y   b o u n d s ,   r e v e r s e d   r a n g e   r e f u s e d   w i t h   z e r o   b o u n d - c a r r y i n g   r e q u e s t s ,   C l e a r   r e s e t s   f i e l d s .   S t a f f :   l i s t   s h o w s   b r a n c h e s ,   e d i t   d i a l o g   o p e n s   f i l l e d   w i t h   t h e   m a n a g e r ,   e m p t y   n a m e   r e f u s e d ,   s a v e   s e n d s   P A T C H   t h a t   r e n a m e s   t h e   r o w .   B r o w s e r   c o n s o l e   c l e a n   t h r o u g h o u t   |  
  
 * * K n o w n   l i m i t a t i o n s   /   f o l l o w - u p s * *  
  
 1 .   T h e   d a s h b o a r d ' s   d a t e   b o u n d a r i e s   s t i l l   u s e   ` n e w   D a t e ( ) `   a n d   ` t o I S O S t r i n g ( ) `   f o r   t h e   h a l f - o p e n   i n t e r v a l ;   t h e y   s h o u l d   s h a r e   t h e   s a m e   l o c a l - d a y   h e l p e r s   t o   b e   c o n s i s t e n t   w i t h   t h e   s a l e s   f i l t e r   ( t r a c k e d   u n d e r   t h e   b r o a d e r   t i m e z o n e   w o r k ) .  
 2 .   T h e   F l u t t e r   l o c a l   D B   m i g r a t i o n   f r o m   v 0 �    v 1   i s   n o t   y e t   e x e r c i s e d   o n   a   r e a l   d e v i c e   ( M - 0 4 ) .  
 