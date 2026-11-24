import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint.
 *
 * The route is served at `/metrics` (outside the `/api/v1` prefix) because
 * that is where Prometheus expects it. Set `METRICS_AUTH_TOKEN` to require a
 * bearer token; the endpoint is open when the variable is unset, which is the
 * normal setup when the API sits on a private network.
 */
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    if (this.config.get<string>('METRICS_ENABLED') === 'false') {
      throw new NotFoundException();
    }

    const token = this.config.get<string>('METRICS_AUTH_TOKEN');
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException();
    }

    return this.metrics.render();
  }
}
