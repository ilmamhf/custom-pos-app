import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Reads a positive integer from the environment at request time.
 *
 * Nest instantiates modules before `.env` is guaranteed to be loaded in every
 * bootstrap path, and tests frequently mutate `process.env` after import. A
 * resolver keeps the value correct without freezing it at import time.
 */
export function envInt(name: string, fallback: number): () => number {
  return () => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };
}

export const THROTTLE_LIMITS = {
  global: envInt('THROTTLE_GLOBAL_LIMIT', 120),
  globalTtl: envInt('THROTTLE_GLOBAL_TTL_MS', 60_000),
  login: envInt('AUTH_LOGIN_THROTTLE_LIMIT', 5),
  loginTtl: envInt('AUTH_LOGIN_THROTTLE_TTL_MS', 60_000),
  refresh: envInt('AUTH_REFRESH_THROTTLE_LIMIT', 20),
  refreshTtl: envInt('AUTH_REFRESH_THROTTLE_TTL_MS', 60_000),
  pin: envInt('AUTH_PIN_THROTTLE_LIMIT', 5),
  pinTtl: envInt('AUTH_PIN_THROTTLE_TTL_MS', 60_000),
} as const;

export function buildThrottlerOptions(): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'default',
        limit: THROTTLE_LIMITS.global,
        ttl: THROTTLE_LIMITS.globalTtl,
      },
    ],
    errorMessage: 'Too many requests. Please slow down and try again later.',
  };
}

export const LOGIN_THROTTLE = {
  default: { limit: THROTTLE_LIMITS.login, ttl: THROTTLE_LIMITS.loginTtl },
};

export const REFRESH_THROTTLE = {
  default: { limit: THROTTLE_LIMITS.refresh, ttl: THROTTLE_LIMITS.refreshTtl },
};

export const PIN_THROTTLE = {
  default: { limit: THROTTLE_LIMITS.pin, ttl: THROTTLE_LIMITS.pinTtl },
};
