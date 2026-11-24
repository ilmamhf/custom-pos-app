import { ConfigService } from '@nestjs/config';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

function createConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('MetricsController', () => {
  let controller: MetricsController;
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
    controller = new MetricsController(metrics, createConfig());
  });

  it('renders the registry', async () => {
    metrics.recordAuthFailure('login');

    const output = await controller.scrape();

    expect(output).toContain('pos_auth_failures_total{reason="login"} 1');
  });

  it('serves the scrape without a token when none is configured', async () => {
    await expect(controller.scrape()).resolves.toContain('pos_http_requests_total');
  });

  it('rejects a scrape without the configured token', async () => {
    const guarded = new MetricsController(
      metrics,
      createConfig({ METRICS_AUTH_TOKEN: 'scrape-token' }),
    );

    await expect(guarded.scrape()).rejects.toMatchObject({ status: 401 });
    await expect(guarded.scrape('Bearer wrong-token')).rejects.toMatchObject({ status: 401 });
  });

  it('accepts a scrape with the configured token', async () => {
    const guarded = new MetricsController(
      metrics,
      createConfig({ METRICS_AUTH_TOKEN: 'scrape-token' }),
    );

    await expect(guarded.scrape('Bearer scrape-token')).resolves.toContain(
      'pos_http_requests_total',
    );
  });

  it('returns 404 when the metrics endpoint is disabled', async () => {
    const disabled = new MetricsController(metrics, createConfig({ METRICS_ENABLED: 'false' }));

    await expect(disabled.scrape()).rejects.toMatchObject({ status: 404 });
  });
});
