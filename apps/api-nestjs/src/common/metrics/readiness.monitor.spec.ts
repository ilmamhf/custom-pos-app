import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';
import { ReadinessMonitor } from './readiness.monitor';

describe('ReadinessMonitor', () => {
  let metrics: MetricsService;
  let queryRaw: jest.Mock;

  beforeEach(() => {
    metrics = new MetricsService();
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  });

  afterEach(() => {
    delete process.env.READINESS_INTERVAL_MS;
    jest.restoreAllMocks();
  });

  function createMonitor(): ReadinessMonitor {
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    return new ReadinessMonitor(prisma, metrics);
  }

  it('reports readiness when the database answers', async () => {
    const monitor = createMonitor();

    await monitor.onModuleInit();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(await metrics.render()).toContain('pos_readiness_up 1');

    monitor.onModuleDestroy();
  });

  it('reports not ready when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const monitor = createMonitor();

    await monitor.onModuleInit();

    expect(await metrics.render()).toContain('pos_readiness_up 0');

    monitor.onModuleDestroy();
  });

  it('does not schedule a timer in the test environment', async () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const monitor = createMonitor();

    await monitor.onModuleInit();

    expect(setIntervalSpy).not.toHaveBeenCalled();

    monitor.onModuleDestroy();
  });
});
