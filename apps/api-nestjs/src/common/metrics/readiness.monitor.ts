import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Keeps the `pos_readiness_up` gauge in sync with the database.
 *
 * The gauge answers the question Prometheus asks: "can the API serve
 * traffic right now?". Relying on an external prober to maintain it would
 * leave the metric stale in environments that do not run a readiness probe
 * (a plain Compose deployment, for example), so the API checks the database
 * itself on a fixed interval.
 */
@Injectable()
export class ReadinessMonitor implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly intervalMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {
    this.intervalMs = readPositiveInt('READINESS_INTERVAL_MS', 15_000);
  }

  async onModuleInit(): Promise<void> {
    await this.check();

    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);
    // The timer must not keep the process alive on shutdown.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async check(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.metrics.setReadiness(true);
    } catch {
      this.metrics.setReadiness(false);
    }
  }
}
