import { INestApplication, RequestMethod } from '@nestjs/common';

/** The prefix every business route lives under. */
export const GLOBAL_PREFIX = 'api/v1';

/**
 * Routes that stay outside the prefix.
 *
 * Prometheus expects the scrape endpoint at `/metrics`, not under the API
 * prefix, so it is excluded here.
 */
export const GLOBAL_PREFIX_EXCLUDES = [{ path: 'metrics', method: RequestMethod.GET }];

/**
 * Applies the global prefix in one place.
 *
 * The bootstrap and the e2e suite must agree on the routing, otherwise the
 * tests would exercise a different URL space than production.
 */
export function applyGlobalPrefix(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDES });
}
