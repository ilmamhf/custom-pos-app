import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export const EXAMPLE_ACCESS_SECRET = 'pos-access-secret-key-12345';
export const EXAMPLE_REFRESH_SECRET = 'pos-refresh-secret-key-67890';

export function isProduction(config: ConfigService): boolean {
  return (config.get<string>('NODE_ENV') || 'development') === 'production';
}

const logger = new Logger('SecurityConfig');

/**
 * Resolve a signing secret, failing closed in production.
 *
 * Development may keep using the documented example secret (with a loud
 * warning) so the local quick-start still works. Production refuses to boot
 * when a secret is absent, short, or still equal to the published example.
 */
export function resolveJwtSecret(
  config: ConfigService,
  key: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET',
  example: string,
  minLength = 32,
): string {
  const value = config.get<string>(key);
  const unsafe = !value || value.length < minLength || value === example;

  if (unsafe) {
    if (isProduction(config)) {
      throw new Error(
        `${key} must be provided as a unique secret of at least ${minLength} characters in production`,
      );
    }
    logger.warn(
      `${key} is missing, too short, or equal to the published example. ` +
        'This is allowed for local development only; set a unique secret before deployment.',
    );
    return value && value !== example ? value : example;
  }

  return value as string;
}

export function resolveAccessSecret(config: ConfigService): string {
  return resolveJwtSecret(config, 'JWT_ACCESS_SECRET', EXAMPLE_ACCESS_SECRET);
}

export function resolveRefreshSecret(config: ConfigService): string {
  return resolveJwtSecret(config, 'JWT_REFRESH_SECRET', EXAMPLE_REFRESH_SECRET);
}
