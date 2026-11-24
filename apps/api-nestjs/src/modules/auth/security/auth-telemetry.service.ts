import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../../common/metrics/metrics.service';
import { maskIdentifier } from './auth-attempt.util';

export interface AuthFailureContext {
  endpoint: string;
  ip: string;
  identifier?: string;
}

interface AttemptRecord {
  endpoint: string;
  ip: string;
  identifier: string;
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  lockedUntil: number | null;
}

export interface AuthSecurityEntry {
  identifier: string;
  endpoint: string;
  ip: string;
  failures: number;
  firstFailureAt: string;
  lastFailureAt: string;
  lockedUntil: string | null;
}

export interface AuthSecuritySnapshot {
  generatedAt: string;
  activeLockouts: number;
  trackedIdentifiers: number;
  counters: {
    failures: number;
    lockouts: number;
    blockedRequests: number;
  };
  entries: AuthSecurityEntry[];
}

const MAX_TRACKED_ENTRIES = 5_000;

/**
 * Process-local brute-force telemetry and lockout engine.
 *
 * The throttler already limits request volume per route and IP. This service
 * adds account-scoped lockouts (so a distributed attempt against one login is
 * stopped), emits structured log events operators can alert on, and keeps a
 * bounded in-memory snapshot for the OWNER-only telemetry endpoint.
 *
 * State is intentionally process-local: the API runs as a single container
 * for the 1–3 store deployment. A shared Redis storage should replace this if
 * the API is ever horizontally scaled (tracked under M-07).
 */
@Injectable()
export class AuthTelemetryService {
  private readonly logger = new Logger('AuthSecurity');
  private readonly entries = new Map<string, AttemptRecord>();

  private readonly windowMs: number;
  private readonly threshold: number;
  private readonly lockoutDurationMs: number;
  private readonly maxLockoutDurationMs: number;
  private readonly alertWebhookUrl?: string;

  private counters = { failures: 0, lockouts: 0, blockedRequests: 0 };

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.windowMs = this.readPositiveInt('AUTH_LOCKOUT_WINDOW_MS', 15 * 60_000);
    this.threshold = this.readPositiveInt('AUTH_LOCKOUT_THRESHOLD', 5);
    this.lockoutDurationMs = this.readPositiveInt('AUTH_LOCKOUT_DURATION_MS', 15 * 60_000);
    this.maxLockoutDurationMs = this.readPositiveInt('AUTH_LOCKOUT_MAX_DURATION_MS', 60 * 60_000);
    const webhook = this.configService.get<string>('AUTH_ALERT_WEBHOOK_URL');
    this.alertWebhookUrl = webhook?.trim() || undefined;
  }

  /** Throws 429 while an account-scoped lockout is active. */
  assertNotLocked(key: string): void {
    const record = this.entries.get(key);
    if (!record) {
      return;
    }

    const now = Date.now();
    if (record.lockedUntil !== null && record.lockedUntil > now) {
      this.counters.blockedRequests += 1;
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'TOO_MANY_REQUESTS',
          message: `Too many failed authentication attempts. Try again in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (record.lockedUntil !== null) {
      // Expired lockout: start a clean slate on the next failure.
      this.entries.delete(key);
    }
  }

  /** Records a failed attempt and opens/extents a lockout when due. */
  registerFailure(key: string, context: AuthFailureContext): AttemptRecord {
    const now = Date.now();
    const existing = this.entries.get(key);
    const isExpired =
      existing !== undefined &&
      now - existing.firstFailureAt > this.windowMs &&
      (existing.lockedUntil === null || existing.lockedUntil <= now);

    const record: AttemptRecord =
      existing && !isExpired
        ? existing
        : {
            endpoint: context.endpoint,
            ip: context.ip,
            identifier: context.identifier ?? 'n/a',
            failures: 0,
            firstFailureAt: now,
            lastFailureAt: now,
            lockedUntil: null,
          };

    record.endpoint = context.endpoint;
    record.ip = context.ip;
    if (context.identifier) {
      record.identifier = context.identifier;
    }
    record.failures += 1;
    record.lastFailureAt = now;
    this.counters.failures += 1;
    this.metrics.recordAuthFailure(context.endpoint);

    const shouldLock = record.failures >= this.threshold;
    if (shouldLock) {
      // Escalating backoff: threshold failures lock for the base duration,
      // each further threshold multiple doubles it up to the ceiling.
      const escalation = Math.max(1, Math.floor(record.failures / this.threshold));
      const duration = Math.min(
        this.lockoutDurationMs * 2 ** (escalation - 1),
        this.maxLockoutDurationMs,
      );
      record.lockedUntil = now + duration;
    }

    this.entries.set(key, record);
    this.prune(now);

    const maskedIdentifier = maskIdentifier(record.identifier);
    if (shouldLock) {
      this.counters.lockouts += 1;
      this.metrics.recordAuthLockout(context.endpoint);
      this.emitAlert({
        event: 'AUTH_LOCKOUT_ALERT',
        endpoint: record.endpoint,
        identifier: maskedIdentifier,
        ip: record.ip,
        failures: record.failures,
        lockedUntil: new Date(record.lockedUntil as number).toISOString(),
        detectedAt: new Date(now).toISOString(),
      });
    } else if (record.failures >= Math.max(2, this.threshold - 2)) {
      this.logger.warn(
        `AUTH_FAILURE ${JSON.stringify({
          endpoint: record.endpoint,
          identifier: maskedIdentifier,
          ip: record.ip,
          failures: record.failures,
          timestamp: new Date(now).toISOString(),
        })}`,
      );
    }

    return record;
  }

  /** Clears the failure streak after a successful authentication. */
  registerSuccess(key: string): void {
    this.entries.delete(key);
  }

  /** Returns a bounded snapshot for the OWNER-only telemetry endpoint. */
  snapshot(): AuthSecuritySnapshot {
    const now = Date.now();
    this.prune(now);

    const records = [...this.entries.values()];
    const entries: AuthSecurityEntry[] = records
      .map((record) => ({
        identifier: maskIdentifier(record.identifier),
        endpoint: record.endpoint,
        ip: record.ip,
        failures: record.failures,
        firstFailureAt: new Date(record.firstFailureAt).toISOString(),
        lastFailureAt: new Date(record.lastFailureAt).toISOString(),
        lockedUntil:
          record.lockedUntil !== null ? new Date(record.lockedUntil).toISOString() : null,
      }))
      .sort((a, b) => b.lastFailureAt.localeCompare(a.lastFailureAt));

    return {
      generatedAt: new Date(now).toISOString(),
      activeLockouts: records.filter(
        (record) => record.lockedUntil !== null && record.lockedUntil > now,
      ).length,
      trackedIdentifiers: entries.length,
      counters: { ...this.counters },
      entries,
    };
  }

  /** Test helper: clears tracked failures and counters. */
  reset(): void {
    this.entries.clear();
    this.counters = { failures: 0, lockouts: 0, blockedRequests: 0 };
  }

  private emitAlert(payload: Record<string, unknown>): void {
    this.logger.error(`${payload.event} ${JSON.stringify(payload)}`);
    this.sendWebhook(payload);
  }

  private sendWebhook(payload: Record<string, unknown>): void {
    const url = this.alertWebhookUrl;
    if (!url) {
      return;
    }

    try {
      void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3_000),
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`AUTH_ALERT_WEBHOOK_FAILED ${message}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AUTH_ALERT_WEBHOOK_FAILED ${message}`);
    }
  }

  private prune(now: number): void {
    for (const [key, record] of this.entries) {
      const lockActive = record.lockedUntil !== null && record.lockedUntil > now;
      const windowExpired = now - record.firstFailureAt > this.windowMs;
      if (!lockActive && windowExpired) {
        this.entries.delete(key);
      }
    }

    if (this.entries.size <= MAX_TRACKED_ENTRIES) {
      return;
    }

    const oldest = [...this.entries.entries()]
      .sort((a, b) => a[1].lastFailureAt - b[1].lastFailureAt)
      .slice(0, this.entries.size - MAX_TRACKED_ENTRIES);
    for (const [key] of oldest) {
      this.entries.delete(key);
    }
  }

  private readPositiveInt(name: string, fallback: number): number {
    const raw = this.configService.get<string | number>(name);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }
}
