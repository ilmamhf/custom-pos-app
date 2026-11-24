import { Request } from 'express';

/**
 * Resolves the client address used for rate limiting and lockout keys.
 *
 * `X-Forwarded-For` is only trusted when the deployment explicitly opts in
 * (`TRUST_PROXY=true`), because any client can forge that header when the API
 * is reached directly. Express' `req.ip` already honours the app-level trust
 * proxy setting otherwise.
 */
export function getClientIp(request: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
      return forwarded.split(',')[0].trim();
    }
  }

  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
