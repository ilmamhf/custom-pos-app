import { randomBytes, timingSafeEqual } from 'crypto';
import { CookieOptions, Request, Response } from 'express';

/**
 * Browser session cookies for the Admin app.
 *
 * The refresh token lives in an HttpOnly cookie so it is unreachable from
 * JavaScript (and therefore from XSS). The CSRF token is a second, deliberately
 * readable cookie echoed back in the `X-CSRF-Token` header (double-submit).
 *
 * The path is scoped to the auth routes so the refresh token is not sent on
 * every API call.
 */
export const REFRESH_COOKIE_NAME = 'pos_refresh_token';
export const CSRF_COOKIE_NAME = 'pos_csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const AUTH_MODE_HEADER = 'x-auth-refresh-mode';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const DEFAULT_REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieSecure(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
}

export function refreshCookieMaxAgeMs(): number {
  const raw = process.env.AUTH_REFRESH_COOKIE_MAX_AGE_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_REFRESH_COOKIE_MAX_AGE_MS;
}

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshCookieMaxAgeMs(),
  };
}

export function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: cookieSecure(),
    sameSite: 'strict',
    path: '/',
    maxAge: refreshCookieMaxAgeMs(),
  };
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function setAuthCookies(res: Response, refreshToken: string, csrfToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[name];
}

export function readRefreshCookie(req: Request): string | undefined {
  return readCookie(req, REFRESH_COOKIE_NAME);
}

export function readCsrfCookie(req: Request): string | undefined {
  return readCookie(req, CSRF_COOKIE_NAME);
}

/**
 * True when the caller explicitly asks to keep the refresh token in cookies
 * (the React Admin app) instead of receiving it in the response body
 * (Flutter POS on a device).
 */
export function wantsCookieRefresh(req: Request): boolean {
  const header = req.headers[AUTH_MODE_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.toLowerCase() === 'cookie';
}

/**
 * Constant-time comparison used for the CSRF double-submit check. Length
 * differences short-circuit (they are not secret) and never throw.
 */
export function secureCompare(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export function verifyCsrfRequest(req: Request): boolean {
  const header = req.headers[CSRF_HEADER_NAME];
  const headerValue = Array.isArray(header) ? header[0] : header;
  return secureCompare(headerValue, readCsrfCookie(req));
}
