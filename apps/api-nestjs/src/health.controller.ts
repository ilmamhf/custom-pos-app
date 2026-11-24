import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';
import { MetricsService } from './common/metrics/metrics.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks the database)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // The gauge is what Prometheus alerts on, so a database outage is
      // visible in the metrics even though the scrape endpoint itself keeps
      // working.
      this.metrics.setReadiness(true);
      return {
        status: 'ready',
        database: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch {
      this.metrics.setReadiness(false);
      throw new ServiceUnavailableException('Database is not reachable');
    }
  }
}
