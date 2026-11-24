import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { ReadinessMonitor } from './readiness.monitor';

/**
 * The metrics registry is global: the request middleware and the domain
 * services (sync, inventory, auth, payments) all report into the same
 * registry, and none of them should have to import a module just for that.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, ReadinessMonitor],
  exports: [MetricsService],
})
export class MetricsModule {}
