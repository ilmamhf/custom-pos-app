# Monitoring

Prometheus configuration for the POS stack: the scrape jobs, the alert rules,
and what to do when an alert fires.

| File | Purpose |
|---|---|
| `prometheus.yml` | Standalone Prometheus configuration (global settings, rule files, scrape jobs) |
| `prometheus-scrape.yaml` | The scrape jobs alone, for merging into an existing Prometheus |
| `prometheus-rules.yaml` | The alert rules |
| `prometheus-rules.test.yaml` | Unit tests for the alert rules (`promtool test rules`) |

## The API's metrics

The API serves its registry at `GET /metrics`, outside the `/api/v1` prefix.
Prometheus expects the scrape endpoint at the root path, and keeping it out of
the versioned prefix means a future `/api/v2` does not move the scrape URL.

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `pos_http_requests_total` | counter | `method`, `route`, `status_code` | Requests handled by the API. `route` is the route template (`/api/v1/sales/:id`), never the raw path, so the label cardinality stays bounded |
| `pos_http_request_duration_seconds` | histogram | `method`, `route` | Request duration. The buckets cover 10 ms to 10 s |
| `pos_readiness_up` | gauge | – | `1` when the last database check succeeded, `0` otherwise |
| `pos_sync_push_total` | counter | `entity`, `outcome` | Entities processed by `POST /api/v1/sync/push`, split into `success` and `failure` |
| `pos_negative_stock_events_total` | counter | `action`, `store` | Negative stock events raised by the policy engine, with the action that was taken |
| `pos_auth_failures_total` | counter | `reason` | Failed authentication attempts |
| `pos_auth_lockouts_total` | counter | `reason` | Account lockouts opened by the lockout tracker |
| `pos_payment_transactions_total` | counter | `type`, `status` | Payment transactions, labelled by type and final status |

The registry also carries the default `process_*` and `nodejs_*` collectors.

The readiness gauge is maintained by the API itself (every 15 seconds, see
`READINESS_INTERVAL_MS`). It does not depend on an external prober, so the
metric is correct in a plain Compose deployment as well as in Kubernetes.

### Protecting the scrape endpoint

`GET /metrics` is open by default, which is the normal setup when the API
sits on a private network. To require a token, set `METRICS_AUTH_TOKEN` on
the API and uncomment the `authorization` block in `prometheus.yml`:

```yaml
authorization:
  type: Bearer
  credentials_file: /etc/prometheus/secrets/pos-metrics-token
```

Keep the token in a mounted secret, never in the configuration file. The
endpoint can also be switched off entirely with `METRICS_ENABLED=false`, in
which case it answers `404`.

## Running Prometheus

### Compose

```bash
docker compose --profile app up -d
docker compose --profile monitoring up -d
```

Prometheus is then available on <http://localhost:9090>. The `monitoring`
profile does not depend on the `app` profile (a profile cannot depend on a
service from another profile), so Prometheus retries the scrape until the API
answers. Starting the two in either order works.

Check the setup:

```bash
# The API target must be "up"
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'

# The rules must be loaded
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | {name, state}'
```

### Kubernetes

The configuration is not committed as a ConfigMap, because a copy would drift
from the canonical files in this directory. Create it from the files:

```bash
kubectl create configmap pos-prometheus-config -n pos \
  --from-file=prometheus.yml=deploy/monitoring/prometheus.yml \
  --from-file=prometheus-rules.yaml=deploy/monitoring/prometheus-rules.yaml \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f deploy/k8s/60-prometheus-deployment.yaml
kubectl apply -f deploy/k8s/61-prometheus-service.yaml
```

Re-run the `create configmap` command (it is idempotent) and restart the pods
after every change to the rules:

```bash
kubectl rollout restart deployment/pos-prometheus -n pos
```

The scrape target `api:3000` resolves to the API Service in the `pos`
namespace, which is why the same configuration works in Compose and in
Kubernetes.

The ConfigMap volume maps the two keys onto the paths `prometheus.yml`
expects: the configuration at `/etc/prometheus/prometheus.yml` and the rules
at `/etc/prometheus/rules/prometheus-rules.yaml`.

### Standalone Prometheus

```bash
docker run --rm \
  -v "$(pwd)/deploy/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$(pwd)/deploy/monitoring/prometheus-rules.yaml:/etc/prometheus/rules/prometheus-rules.yaml:ro" \
  -p 9090:9090 \
  prom/prometheus:v3.5.0 \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.retention.time=15d \
  --web.enable-lifecycle
```

The rule file has to be mounted under `/etc/prometheus/rules/`, because that is
the path `rule_files` in `prometheus.yml` points at.

## Verifying the configuration

```bash
# The configuration and the rules are valid
docker run --rm --entrypoint promtool \
  -v "$(pwd)/deploy/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$(pwd)/deploy/monitoring/prometheus-rules.yaml:/etc/prometheus/rules/prometheus-rules.yaml:ro" \
  prom/prometheus:v3.5.0 check config /etc/prometheus/prometheus.yml

# The rules behave as expected
docker run --rm --entrypoint promtool \
  -v "$(pwd)/deploy/monitoring:/etc/prometheus:ro" \
  prom/prometheus:v3.5.0 test rules /etc/prometheus/prometheus-rules.test.yaml
```

The unit test file feeds synthetic series into the rules and asserts which
alerts fire. Add a case whenever a rule changes.

## The alerts

| Alert | Severity | Fires when | What to do |
|---|---|---|---|
| `PosApiInstanceDown` | critical | An API instance cannot be scraped for 2 minutes | Check the pod (`kubectl logs`, `kubectl describe`). Check the container image and the `METRICS_AUTH_TOKEN` — a wrong token also makes the scrape fail |
| `PosApiAllInstancesDown` | critical | Every API instance is down | The point of sale is offline. Check the nodes, the image pull, and the database first: the API cannot start without `DATABASE_URL` |
| `PosApiReadinessFailing` | critical | `pos_readiness_up` is `0` for 2 minutes | PostgreSQL is unreachable. Check the database, the connection limit, and the network path. The API answers requests but cannot serve business traffic |
| `PosApiHighErrorRate` | warning | More than 5% of the requests return 5xx for 10 minutes | Look at the failing route in the logs, filtered by `status_code`. A single failing route is usually a bad migration or a missing configuration |
| `PosApiCriticalErrorRate` | critical | More than 25% of the requests return 5xx for 5 minutes | Treat the deployment as degraded. Page the on-call operator and check whether the last deployment broke the API |
| `PosApiHighLatency` | warning | The p95 request duration is above 2 seconds for 10 minutes | Check the database first (slow queries, locks), then the API resource limits |
| `PosNegativeStockEvents` | warning | A negative stock event was raised in the last 15 minutes | The store sold more than it has on hand. Ask whether the last delivery was received and counted in |
| `PosNegativeStockEscalated` | critical | A negative stock event needed a manager approval or a write-off | Resolve the discrepancy with the store and review the policy thresholds |
| `PosSyncFailures` | warning | The sync push rejects entities for 5 minutes | The affected stores keep their sales locally. Check the error log lines for the rejected entity type |
| `PosSyncFailingContinuously` | critical | More entities fail than succeed for 30 minutes | The offline queue is not draining. Check the API logs for the rejection reason and the store's local database |
| `PosAuthLockouts` | warning | An account was locked out in the last 15 minutes | Decide whether this is a brute-force attempt or a user who forgot the PIN. The lockout counters are process-local, so a second replica keeps its own state |
| `PosAuthFailureSpike` | warning | More than one failed authentication per second for 10 minutes | Look for a credential-stuffing attempt. The API also posts an `AUTH_LOCKOUT_ALERT` to `AUTH_ALERT_WEBHOOK_URL` |
| `PosPaymentFailures` | warning | A payment transaction ends in `FAILED` | The electronic payment path is broken. Tell the store to use the cash tender and check the provider configuration |
| `PosPaymentFailureRateHigh` | critical | More than 10% of the payment transactions fail for 10 minutes | The payment provider is unreachable or rejecting the requests. Check `PaymentProvider.config` |
| `PosBackupStale` | critical | The last successful backup is older than 26 hours | The RPO of 15 minutes is not met. Run the backup by hand and fix the schedule |
| `PosBackupMetricMissing` | warning | No backup success timestamp is published for 24 hours | The backup job does not publish `pos_backup_last_success_timestamp_seconds`, so no backup age can be verified |

## The backup metric

`PosBackupStale` and `PosBackupMetricMissing` expect the metric
`pos_backup_last_success_timestamp_seconds`, published by the backup job.
Until the automated backups are in place (roadmap item 11), no backup job
publishes it, so `PosBackupMetricMissing` is pending and `PosBackupStale`
stays silent. Both alerts are documented in the operations runbook.

Two ways to publish the metric, both supported by Prometheus:

- **node_exporter textfile collector**: the backup script writes
  `/var/lib/node_exporter/textfile_collector/pos_backup.prom` with
  `pos_backup_last_success_timestamp_seconds <unix timestamp>`.
- **Pushgateway**: the backup script pushes the gauge to a Pushgateway, and
  the Pushgateway is scraped like any other target.

## Structured logs

The API writes one JSON object per line. The fields an operator needs:

| Field | Meaning |
|---|---|
| `timestamp` | ISO 8601 timestamp |
| `level` | `log`, `warn`, `error`, `fatal`, `debug`, `verbose` |
| `message` | The log text |
| `context` | The NestJS context that produced the line |
| `correlationId` | The id of the request. Also returned as `x-request-id` |
| `traceId`, `spanId` | The W3C trace context of the request |
| `stack` | The stack trace, on error lines |

`LOG_LEVEL` sets the threshold (`error`, `warn`, `log`, `debug`, `verbose`,
`fatal`; the default is `log`). `LOG_FORMAT=text` switches to a readable line
format for local development; the default is `json`.

To follow one request:

```bash
# The correlation id of a failing request
curl -s -i http://localhost:3000/api/v1/health | grep -i x-request-id

# Every log line of that request
docker logs pos-api-1 2>&1 | jq -c 'select(.correlationId == "<id>")'
```

A request that arrives with a `traceparent` header continues that trace; the
API answers with its own `traceparent`, so the edge, the API, and any service
it calls share one trace id.

## Limitations

- The alert rules are not wired to a notification channel. Point
  Alertmanager at the `pos-api` rules and choose the routing for the
  `severity` label (`warning` and `critical`).
- There is no Grafana dashboard in the repository. The metrics and the rule
  names above are the intended starting points for one.
- The lockout counters behind `pos_auth_lockouts_total` are process-local.
  With more than one API replica, the counts are per replica.
- The backup rules depend on a metric that the backup job has to publish.
