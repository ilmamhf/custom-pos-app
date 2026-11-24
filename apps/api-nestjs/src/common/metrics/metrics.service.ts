import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Outcome of a single sync entity, used as a metric label. */
export type SyncOutcome = 'success' | 'failure';

export interface HttpRequestObservation {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}

/**
 * Prometheus registry and the metrics the API exposes.
 *
 * The registry is deliberately hand-rolled instead of using the global
 * prom-client registry: the API can be instantiated more than once in a test
 * run, and a global registry would carry counters over between instances.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  readonly httpRequestDurationSeconds: Histogram<'method' | 'route'>;
  readonly syncPushTotal: Counter<'entity' | 'outcome'>;
  readonly negativeStockEventsTotal: Counter<'action' | 'store'>;
  readonly authFailuresTotal: Counter<'reason'>;
  readonly authLockoutsTotal: Counter<'reason'>;
  readonly paymentTransactionsTotal: Counter<'type' | 'status'>;
  readonly readinessUp: Gauge<string>;

  constructor() {
    this.httpRequestsTotal = new Counter({
      name: 'pos_http_requests_total',
      help: 'HTTP requests handled by the API, labelled by method, route template and status code',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'pos_http_request_duration_seconds',
      help: 'HTTP request duration in seconds, labelled by method and route template',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.syncPushTotal = new Counter({
      name: 'pos_sync_push_total',
      help: 'Entities processed by POST /sync/push, labelled by entity type and outcome',
      labelNames: ['entity', 'outcome'],
      registers: [this.registry],
    });

    this.negativeStockEventsTotal = new Counter({
      name: 'pos_negative_stock_events_total',
      help: 'Negative stock events raised by the policy engine, labelled by action and store',
      labelNames: ['action', 'store'],
      registers: [this.registry],
    });

    this.authFailuresTotal = new Counter({
      name: 'pos_auth_failures_total',
      help: 'Failed authentication attempts, labelled by reason',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.authLockoutsTotal = new Counter({
      name: 'pos_auth_lockouts_total',
      help: 'Account lockouts opened by the auth telemetry tracker, labelled by reason',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.paymentTransactionsTotal = new Counter({
      name: 'pos_payment_transactions_total',
      help: 'Payment transactions recorded by the API, labelled by type and status',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });

    // The readiness gauge mirrors the result of the readiness probe. It lets
    // Prometheus alert on a database outage without a blackbox exporter:
    // the probe hits `/api/v1/health/ready` and the scrape reads the gauge.
    this.readinessUp = new Gauge({
      name: 'pos_readiness_up',
      help: '1 when the last readiness check succeeded (PostgreSQL reachable), 0 otherwise',
      registers: [this.registry],
    });
    this.readinessUp.set(0);

    // The process and Node.js collectors are collected lazily on scrape. They
    // are skipped in tests so a unit test does not report on the test runner.
    if (process.env.NODE_ENV !== 'test') {
      collectDefaultMetrics({ register: this.registry });
    }
  }

  observeHttpRequest(observation: HttpRequestObservation): void {
    const statusCode = String(observation.statusCode);
    this.httpRequestsTotal.inc({
      method: observation.method,
      route: observation.route,
      status_code: statusCode,
    });
    this.httpRequestDurationSeconds.observe(
      { method: observation.method, route: observation.route },
      observation.durationSeconds,
    );
  }

  recordSyncOutcome(entity: string, outcome: SyncOutcome, count = 1): void {
    if (count <= 0) {
      return;
    }
    this.syncPushTotal.inc({ entity, outcome }, count);
  }

  recordNegativeStockEvent(action: string, storeId: string): void {
    this.negativeStockEventsTotal.inc({ action, store: storeId });
  }

  recordAuthFailure(reason: string): void {
    this.authFailuresTotal.inc({ reason });
  }

  recordAuthLockout(reason: string): void {
    this.authLockoutsTotal.inc({ reason });
  }

  recordPaymentTransaction(type: string, status: string): void {
    this.paymentTransactionsTotal.inc({ type, status });
  }

  /** Records the outcome of the last readiness check. */
  setReadiness(ready: boolean): void {
    this.readinessUp.set(ready ? 1 : 0);
  }

  /** Renders the registry in the Prometheus text exposition format. */
  async render(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content type required by a Prometheus scrape. */
  contentType(): string {
    return this.registry.contentType;
  }
}
