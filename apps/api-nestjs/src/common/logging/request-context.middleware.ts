import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';
import {
  RequestContext,
  formatTraceparent,
  newCorrelationId,
  newSpanId,
  newTraceId,
  normalizeCorrelationId,
  parseTraceparent,
  runWithRequestContext,
} from './request-context';

/**
 * Gives every request a correlation id and a W3C trace context, echoes both
 * back to the caller, and records the request in the Prometheus registry.
 *
 * The identifiers live in an `AsyncLocalStorage` scope, so any logger call
 * made while handling the request carries them without the call sites having
 * to pass them around.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = normalizeCorrelationId(req.headers['x-request-id']) ?? newCorrelationId();
    const incoming = parseTraceparent(req.headers.traceparent);
    const traceId = incoming?.traceId ?? newTraceId();
    const spanId = newSpanId();

    const context: RequestContext = {
      correlationId,
      traceId,
      spanId,
      parentSpanId: incoming?.parentSpanId,
    };

    res.setHeader('x-request-id', correlationId);
    res.setHeader('traceparent', formatTraceparent(traceId, spanId));

    const startedAt = process.hrtime.bigint();

    runWithRequestContext(context, () => {
      res.on('finish', () => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        // The scrape endpoint is excluded so the metrics do not observe
        // themselves.
        if (!isMetricsPath(req.originalUrl)) {
          this.metrics.observeHttpRequest({
            method: req.method,
            route: routeLabel(req),
            statusCode: res.statusCode,
            durationSeconds,
          });
        }
      });
      next();
    });
  }
}

/**
 * Route template for the metric label.
 *
 * The raw path contains resource ids, so it would explode the label
 * cardinality. Express exposes the matched route template once routing is
 * done, which keeps the label set bounded by the number of routes.
 */
export function routeLabel(req: Request): string {
  const routePath = (req as Request & { route?: { path?: string } }).route?.path;
  if (typeof routePath !== 'string') {
    return 'unmatched';
  }
  const baseUrl = (req as Request & { baseUrl?: string }).baseUrl ?? '';
  const label = `${baseUrl}${routePath}`.replace(/\/{2,}/g, '/');
  return label.length > 0 ? label : 'unmatched';
}

function isMetricsPath(originalUrl: string | undefined): boolean {
  if (!originalUrl) {
    return false;
  }
  const path = originalUrl.split('?')[0];
  return path === '/metrics' || path.endsWith('/metrics');
}
