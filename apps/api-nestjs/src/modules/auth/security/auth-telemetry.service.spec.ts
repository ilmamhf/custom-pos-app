import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTelemetryService } from './auth-telemetry.service';

function createConfig(values: Record<string, string | number> = {}): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('AuthTelemetryService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-24T08:00:00.000Z'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('locks an account after the threshold and reports retry-after', () => {
    const service = new AuthTelemetryService(createConfig({ AUTH_LOCKOUT_THRESHOLD: 3 }));

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      service.registerFailure('login:127.0.0.1:kasir@toko.id', {
        endpoint: 'login',
        ip: '127.0.0.1',
        identifier: 'kasir@toko.id',
      });
    }

    try {
      service.assertNotLocked('login:127.0.0.1:kasir@toko.id');
      throw new Error('expected lockout');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = httpError.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('TOO_MANY_REQUESTS');
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
    }

    expect(service.snapshot().counters.blockedRequests).toBe(1);
  });

  it('clears the failure streak after a successful authentication', () => {
    const service = new AuthTelemetryService(createConfig({ AUTH_LOCKOUT_THRESHOLD: 3 }));
    const key = 'login:127.0.0.1:kasir@toko.id';

    service.registerFailure(key, {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    });
    service.registerFailure(key, {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    });
    service.registerSuccess(key);
    service.registerFailure(key, {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    });

    expect(() => service.assertNotLocked(key)).not.toThrow();
    expect(service.snapshot().entries[0].failures).toBe(1);
  });

  it('starts a new streak once the failure window expires', () => {
    const service = new AuthTelemetryService(
      createConfig({
        AUTH_LOCKOUT_THRESHOLD: 3,
        AUTH_LOCKOUT_WINDOW_MS: 1_000,
      }),
    );
    const key = 'login:127.0.0.1:kasir@toko.id';

    service.registerFailure(key, {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    });
    service.registerFailure(key, {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    });

    jest.setSystemTime(new Date('2026-11-24T08:00:05.000Z'));
    const record = service.registerFailure(key, {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    });

    expect(record.failures).toBe(1);
    expect(record.lockedUntil).toBeNull();
    expect(() => service.assertNotLocked(key)).not.toThrow();
  });

  it('escalates the lockout duration and caps it at the configured maximum', () => {
    const service = new AuthTelemetryService(
      createConfig({
        AUTH_LOCKOUT_THRESHOLD: 2,
        AUTH_LOCKOUT_DURATION_MS: 1_000,
        AUTH_LOCKOUT_MAX_DURATION_MS: 5_000,
        AUTH_LOCKOUT_WINDOW_MS: 3_600_000,
      }),
    );
    const key = 'login:127.0.0.1:kasir@toko.id';
    const context = {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    };

    const first = service.registerFailure(key, context);
    const second = service.registerFailure(key, context);
    expect(second.lockedUntil! - first.firstFailureAt).toBeGreaterThanOrEqual(1_000);

    // Two more failures push the escalation factor to 2 (2s).
    service.registerFailure(key, context);
    const fourth = service.registerFailure(key, context);
    const now = Date.now();
    expect(fourth.lockedUntil! - now).toBe(2_000);

    // Enough failures must never exceed the ceiling.
    let last = fourth;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      last = service.registerFailure(key, context);
    }
    expect(last.lockedUntil! - Date.now()).toBe(5_000);
  });

  it('masks identifiers in snapshots and counts active lockouts', () => {
    const service = new AuthTelemetryService(createConfig({ AUTH_LOCKOUT_THRESHOLD: 2 }));
    const key = 'login:127.0.0.1:kasir1@toko.id';
    const context = {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir1@toko.id',
    };

    service.registerFailure(key, context);
    service.registerFailure(key, context);

    const snapshot = service.snapshot();
    expect(snapshot.activeLockouts).toBe(1);
    expect(snapshot.trackedIdentifiers).toBe(1);
    expect(snapshot.entries[0].identifier).toBe('k***@toko.id');
    expect(snapshot.counters.failures).toBe(2);
    expect(snapshot.counters.lockouts).toBe(1);
  });

  it('posts a structured alert to the configured webhook on lockout', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const service = new AuthTelemetryService(
      createConfig({
        AUTH_LOCKOUT_THRESHOLD: 1,
        AUTH_ALERT_WEBHOOK_URL: 'https://alerts.example.test/auth',
      }),
    );

    service.registerFailure('login:127.0.0.1:kasir@toko.id', {
      endpoint: 'login',
      ip: '127.0.0.1',
      identifier: 'kasir@toko.id',
    });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://alerts.example.test/auth');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.event).toBe('AUTH_LOCKOUT_ALERT');
    expect(body.identifier).toBe('k***@toko.id');
    expect(body.failures).toBe(1);
  });

  it('does not call the network when no webhook is configured', () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new AuthTelemetryService(createConfig({ AUTH_LOCKOUT_THRESHOLD: 1 }));

    service.registerFailure('verify-pin:127.0.0.1:store', {
      endpoint: 'verify-pin',
      ip: '127.0.0.1',
      identifier: 'b0000000-0000-0000-0000-000000000001',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
