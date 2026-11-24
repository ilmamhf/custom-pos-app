# Deployment

Container artifacts for the POS stack: the NestJS API, the React Admin bundle
behind nginx, a PostgreSQL service for single-host Compose deployments, and
Kubernetes manifests for a managed cluster.

| Artifact | Path | Purpose |
|---|---|---|
| API image | `apps/api-nestjs/Dockerfile` | NestJS API + Prisma CLI (for `migrate deploy`) |
| Admin image | `apps/admin-react/Dockerfile` | React bundle served by unprivileged nginx |
| Admin nginx config | `apps/admin-react/nginx.conf` | SPA fallback + `/api/` reverse proxy to `api:3000` |
| Compose stack | `compose.yaml` | PostgreSQL + migration job + API + Admin (`app` profile) |
| Compose TLS overlay | `deploy/compose.tls.yaml`, `deploy/nginx/admin-tls.conf` | TLS termination in front of the Admin container |
| Kubernetes manifests | `deploy/k8s/` | Namespace, config, secrets, migration Job, Deployments, Services, Ingress |
| Secret template | `deploy/k8s/11-secret.example.yaml` | Copy, fill, and keep out of version control |
| Monitoring | `deploy/monitoring/` | Prometheus scrape configuration, alert rules, and the alert runbook |

## Prerequisites

- Docker 24+ with Compose v2 (`docker compose version`)
- Node.js 20+ only if you build outside Docker
- A PostgreSQL 16 instance. The Compose file ships one; the Kubernetes
  manifests expect a managed instance reachable from the cluster.

## Building the images

```bash
docker build -t pos-api:latest -f apps/api-nestjs/Dockerfile apps/api-nestjs
docker build -t pos-admin:latest -f apps/admin-react/Dockerfile apps/admin-react
```

Both images are multi-stage. The API image contains production dependencies,
the compiled output and the Prisma migration history, and runs as the
unprivileged `node` user. The Admin image contains only the compiled bundle and
runs nginx as UID 101 on port 8080.

The Admin bundle calls the API through the same origin (`/api/v1`). To point
it at an absolute URL instead, build with a different base URL:

```bash
docker build --build-arg VITE_API_BASE_URL=https://api.example.com/api/v1 \
  -t pos-admin:latest -f apps/admin-react/Dockerfile apps/admin-react
```

## Compose (single host)

The `app` profile holds the API and Admin services. PostgreSQL runs outside
the profile, so `docker compose up -d postgres` stays cheap for development.

```bash
export JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
export JWT_REFRESH_SECRET="$(openssl rand -base64 48)"
export CORS_ORIGIN="https://admin.example.com"

docker compose up -d postgres
docker compose --profile app up -d --build
```

The required variables are enforced with `${VAR:?…}`, so the stack refuses to
start instead of booting with a missing or wildcard secret:

| Variable | Required | Notes |
|---|---|---|
| `JWT_ACCESS_SECRET` | yes | At least 32 characters |
| `JWT_REFRESH_SECRET` | yes | At least 32 characters, different from the access secret |
| `CORS_ORIGIN` | yes | Comma-separated allowlist. The API refuses `*` when `NODE_ENV=production` |
| `JWT_ACCESS_EXPIRES_IN` | no | Default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | no | Default `7d` |
| `COOKIE_SECURE` | no | Default `true` in production |
| `TRUST_PROXY` | no | Default `true`; set to `false` when nothing proxies the API |
| `SWAGGER_ENABLED` | no | Default `false` in production |
| `OFFLINE_GRANT_TTL` | no | Default `12h` |

Secrets are read from the host environment or from a file passed with
`--env-file`. They are never baked into an image.

```bash
docker compose --profile app --env-file .env.production up -d
```

### Migrations

`migrate` is a one-shot service that applies `prisma/migrations` before the
API starts. Compose runs it automatically through
`depends_on: { migrate: { condition: service_completed_successfully } }`.
To re-run it by hand:

```bash
docker compose --profile app run --rm migrate
```

Migrations are forward-only. Take a backup before applying them to a database
that already holds data.

### Probes and health checks

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/health` | Liveness. The process answers, nothing else is checked |
| `GET /api/v1/health/ready` | Readiness. PostgreSQL is queried with `SELECT 1` |

Both images declare a `HEALTHCHECK`, so `docker compose ps` shows the state
without extra commands.

### TLS

The default Compose stack serves the Admin bundle over plain HTTP on
`http://localhost:8080`, which is enough for a local or private network. To
terminate TLS in the Admin container:

```bash
mkdir -p deploy/nginx/certs
cp fullchain.pem privkey.pem deploy/nginx/certs/
docker compose --profile app -f compose.yaml -f deploy/compose.tls.yaml up -d
```

The Admin container then listens on 8080 (HTTP, redirects to HTTPS) and 8443
(HTTPS) and serves `/etc/nginx/certs/fullchain.pem` and `privkey.pem` from the
mounted directory. The certificate directory is git-ignored.

If a load balancer or reverse proxy terminates TLS in front of the stack
instead, keep the plain config and forward `X-Forwarded-Proto`. The nginx
config preserves the incoming value, so the API still sees the original
scheme.

### Monitoring

Prometheus lives in its own Compose profile, so a development machine does
not have to run it:

```bash
docker compose --profile app up -d
docker compose --profile monitoring up -d
```

Prometheus is then available on <http://localhost:9090>. It scrapes the API
at `GET /metrics` and evaluates the 16 alert rules in
`deploy/monitoring/prometheus-rules.yaml`. The metrics, the alerts, and the
runbook actions for each alert are documented in
[`deploy/monitoring/README.md`](monitoring/README.md).

## Kubernetes

### Apply order

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml
kubectl apply -f deploy/k8s/10-configmap.yaml
kubectl apply -f deploy/k8s/11-secret.example.yaml   # after filling it in
kubectl apply -f deploy/k8s/20-migration-job.yaml
kubectl apply -f deploy/k8s/31-api-service.yaml
kubectl apply -f deploy/k8s/30-api-deployment.yaml
kubectl apply -f deploy/k8s/41-admin-service.yaml
kubectl apply -f deploy/k8s/40-admin-deployment.yaml
kubectl apply -f deploy/k8s/32-api-pdb.yaml
kubectl apply -f deploy/k8s/50-ingress.yaml
```

Or apply everything except the secret template in one go:

```bash
kubectl apply -f deploy/k8s/
```

`11-secret.example.yaml` is a template with `CHANGE_ME` placeholders. Copy it
outside the repository, fill it in, and apply that copy. For a real cluster,
use an external secret manager (External Secrets Operator, Vault, AWS Secrets
Manager) and point the Deployments at the Secret it produces.

### Monitoring

The Prometheus configuration is not committed as a ConfigMap, because a copy
would drift from the canonical files in `deploy/monitoring/`. Create it from
those files:

```bash
kubectl create configmap pos-prometheus-config -n pos \
  --from-file=prometheus.yml=deploy/monitoring/prometheus.yml \
  --from-file=prometheus-rules.yaml=deploy/monitoring/prometheus-rules.yaml \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f deploy/k8s/60-prometheus-deployment.yaml
kubectl apply -f deploy/k8s/61-prometheus-service.yaml
```

Re-run the `create configmap` command and restart the pods after every change
to the rules:

```bash
kubectl rollout restart deployment/pos-prometheus -n pos
```

The scrape target `api:3000` resolves to the API Service in the `pos`
namespace. The alert rules and the runbook actions for each alert are
documented in [`deploy/monitoring/README.md`](monitoring/README.md).

### Secrets

`pos-secrets` holds `DATABASE_URL`, `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET`, plus the optional `AUTH_ALERT_WEBHOOK_URL`. Generate the
JWT secrets with:

```bash
openssl rand -base64 48
```

Rotating a JWT secret invalidates every issued access and refresh token, so
users have to sign in again. Rotation order matters: rotate the refresh
secret first, wait for the access tokens to expire, then rotate the access
secret.

### Migrations

`deploy/k8s/20-migration-job.yaml` is a `batch/v1` Job that runs
`prisma migrate deploy`. A Job's spec is immutable, so each release needs a
fresh Job:

```bash
kubectl delete job pos-migrate -n pos --ignore-not-found
kubectl apply -f deploy/k8s/20-migration-job.yaml
kubectl wait --for=condition=complete job/pos-migrate -n pos --timeout=5m
```

Only roll the API Deployment after the Job succeeded. The Job applies
migrations with a lock, so concurrent runs cannot corrupt the history.

### TLS

The Ingress references the secret `pos-tls` for the host
`admin.example.com`. Create it with your certificate:

```bash
kubectl create secret tls pos-tls \
  --cert=fullchain.pem --key=privkey.pem -n pos
```

Replace the host and the `CORS_ORIGIN` value in `deploy/k8s/10-configmap.yaml`
with the real domain. The API must trust the proxy headers, so `TRUST_PROXY`
stays `true` in the ConfigMap.

### Probes, resources and security

- The API Deployment uses `GET /api/v1/health` as the liveness and startup
  probe and `GET /api/v1/health/ready` as the readiness probe. A database
  outage therefore removes the pod from the Service instead of restarting it.
- The Admin Deployment probes `GET /` on the nginx container.
- Both Deployments run as non-root with `readOnlyRootFilesystem: true` and all
  Linux capabilities dropped. The Admin container mounts an `emptyDir` at
  `/tmp` because nginx writes its pid file and temporary paths there.
- The API requests 100m CPU and 256Mi memory and is limited to 1 CPU and
  512Mi. The Admin requests 20m CPU and 32Mi memory and is limited to 200m
  CPU and 128Mi.
- `pos-api` has a PodDisruptionBudget with `minAvailable: 1`, so a node drain
  keeps one API pod serving.

### Scaling

The API is stateless apart from the process-local auth lockout state (R-06),
which is documented in `docs/audit/2026-11-22/operations-runbook.md`. Scaling
to more than one replica is supported for availability, but the lockout
counters are not shared between replicas yet. Move that state to Redis before
running several replicas behind one load balancer.

### Rolling back

1. `kubectl rollout undo deployment/pos-api -n pos`
2. `kubectl rollout undo deployment/pos-admin -n pos`

Migrations are forward-only. A rollback to an older API version may need a
compensating migration; restoring a backup is the only safe option for a
schema change that the old code cannot read.

## Image references

The manifests use `ghcr.io/example/pos-api:latest` and
`ghcr.io/example/pos-admin:latest` as placeholders. Replace them with the
registry your cluster pulls from, and prefer an immutable tag (a commit SHA
or a release tag) over `latest` for a production rollout.

## Limitations

- The Kubernetes manifests do not install PostgreSQL. The database is expected
  to be a managed instance with its own backups and failover.
- There is no HorizontalPodAutoscaler. Add one when the traffic pattern is
  known.
- The Admin image has no image-scanning or signing step in CI yet.
