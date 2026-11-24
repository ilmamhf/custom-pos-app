import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('exposes the Prometheus text exposition format', async () => {
    metrics.observeHttpRequest({
      method: 'GET',
      route: '/api/v1/health',
      statusCode: 200,
      durationSeconds: 0.01,
    });

    const output = await metrics.render();

    expect(output).toContain('# HELP pos_http_requests_total');
    expect(output).toContain(
      'pos_http_requests_total{method="GET",route="/api/v1/health",status_code="200"} 1',
    );
    expect(metrics.contentType()).toContain('text/plain');
  });

  it('counts requests per method, route, and status code', async () => {
    metrics.observeHttpRequest({
      method: 'GET',
      route: '/api/v1/products',
      statusCode: 200,
      durationSeconds: 0.02,
    });
    metrics.observeHttpRequest({
      method: 'GET',
      route: '/api/v1/products',
      statusCode: 200,
      durationSeconds: 0.03,
    });
    metrics.observeHttpRequest({
      method: 'GET',
      route: '/api/v1/products',
      statusCode: 500,
      durationSeconds: 0.04,
    });

    const output = await metrics.render();

    expect(output).toContain(
      'pos_http_requests_total{method="GET",route="/api/v1/products",status_code="200"} 2',
    );
    expect(output).toContain(
      'pos_http_requests_total{method="GET",route="/api/v1/products",status_code="500"} 1',
    );
    expect(output).toContain(
      'pos_http_request_duration_seconds_count{method="GET",route="/api/v1/products"} 3',
    );
  });

  it('records the sync outcome per entity type', async () => {
    metrics.recordSyncOutcome('sale', 'success', 4);
    metrics.recordSyncOutcome('sale', 'failure');
    metrics.recordSyncOutcome('refund', 'success');

    const output = await metrics.render();

    expect(output).toContain('pos_sync_push_total{entity="sale",outcome="success"} 4');
    expect(output).toContain('pos_sync_push_total{entity="sale",outcome="failure"} 1');
    expect(output).toContain('pos_sync_push_total{entity="refund",outcome="success"} 1');
  });

  it('ignores a non-positive sync count', async () => {
    metrics.recordSyncOutcome('sale', 'success', 0);
    metrics.recordSyncOutcome('sale', 'success', -3);

    const output = await metrics.render();

    expect(output).not.toContain('pos_sync_push_total{entity="sale",outcome="success"}');
  });

  it('records negative stock events with the action and the store', async () => {
    metrics.recordNegativeStockEvent('MANAGER_APPROVAL', 'store-1');

    const output = await metrics.render();

    expect(output).toContain(
      'pos_negative_stock_events_total{action="MANAGER_APPROVAL",store="store-1"} 1',
    );
  });

  it('records auth failures and lockouts separately', async () => {
    metrics.recordAuthFailure('login');
    metrics.recordAuthFailure('login');
    metrics.recordAuthLockout('login');

    const output = await metrics.render();

    expect(output).toContain('pos_auth_failures_total{reason="login"} 2');
    expect(output).toContain('pos_auth_lockouts_total{reason="login"} 1');
  });

  it('records payment transactions by type and status', async () => {
    metrics.recordPaymentTransaction('CAPTURE', 'CAPTURED');
    metrics.recordPaymentTransaction('CAPTURE', 'FAILED');

    const output = await metrics.render();

    expect(output).toContain('pos_payment_transactions_total{type="CAPTURE",status="CAPTURED"} 1');
    expect(output).toContain('pos_payment_transactions_total{type="CAPTURE",status="FAILED"} 1');
  });

  it('keeps a separate registry per instance so tests do not leak counters', async () => {
    metrics.recordAuthFailure('login');

    const other = new MetricsService();
    const output = await other.render();

    expect(output).not.toContain('pos_auth_failures_total{reason="login"} 1');
  });

  it('exposes the readiness gauge and flips it with the last check', async () => {
    expect(await metrics.render()).toContain('pos_readiness_up 0');

    metrics.setReadiness(true);
    expect(await metrics.render()).toContain('pos_readiness_up 1');

    metrics.setReadiness(false);
    expect(await metrics.render()).toContain('pos_readiness_up 0');
  });
});
