import { JsonLogger } from './json-logger';
import { runWithRequestContext } from './request-context';

describe('JsonLogger', () => {
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;
  let lines: string[];

  beforeEach(() => {
    lines = [];
    stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        lines.push(String(chunk));
        return true;
      });
    stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        lines.push(String(chunk));
        return true;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
  });

  function parsed(): Record<string, unknown>[] {
    return lines
      .join('')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  }

  it('writes one JSON object per line with the stable field set', () => {
    const logger = new JsonLogger();
    logger.log('service started', 'Bootstrap');

    const [entry] = parsed();
    expect(entry.level).toBe('log');
    expect(entry.message).toBe('service started');
    expect(entry.context).toBe('Bootstrap');
    expect(typeof entry.timestamp).toBe('string');
  });

  it('keeps the stack of an error and writes it to stderr', () => {
    const logger = new JsonLogger();
    logger.error(
      'boom',
      'Error: boom\n    at Object.<anonymous> (/app/src/payments.service.ts:42:13)',
      'PaymentsService',
    );

    expect(stderr).toHaveBeenCalled();
    const [entry] = parsed();
    expect(entry.level).toBe('error');
    expect(entry.stack).toContain('Error: boom');
    expect(entry.context).toBe('PaymentsService');
  });

  it('treats the second argument of an error as the context when it is not a stack', () => {
    const logger = new JsonLogger();
    logger.error('boom', 'PaymentsService');

    const [entry] = parsed();
    expect(entry.context).toBe('PaymentsService');
    expect(entry.stack).toBeUndefined();
  });

  it('takes the stack of an Error object when no stack was passed', () => {
    const logger = new JsonLogger();
    logger.error(new Error('kaboom'), 'PaymentsService');

    const [entry] = parsed();
    expect(entry.message).toBe('kaboom');
    expect(entry.stack).toContain('kaboom');
    expect(entry.context).toBe('PaymentsService');
  });

  it('adds the correlation id and trace id of the active request', () => {
    const logger = new JsonLogger();

    runWithRequestContext(
      {
        correlationId: 'corr-1',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
      },
      () => logger.warn('inside a request'),
    );

    const [entry] = parsed();
    expect(entry.correlationId).toBe('corr-1');
    expect(entry.traceId).toBe('a'.repeat(32));
    expect(entry.spanId).toBe('b'.repeat(16));
  });

  it('flattens an object message into fields', () => {
    const logger = new JsonLogger();
    logger.log({ message: 'object message', storeId: 'store-1' });

    const [entry] = parsed();
    expect(entry.message).toBe('object message');
    expect(entry.storeId).toBe('store-1');
  });

  it('drops everything below the configured level', () => {
    process.env.LOG_LEVEL = 'warn';
    const logger = new JsonLogger();

    logger.log('not important');
    logger.debug('not important either');
    expect(lines).toHaveLength(0);

    logger.warn('important');
    expect(parsed()).toHaveLength(1);
  });

  it('honours setLogLevels', () => {
    const logger = new JsonLogger();
    logger.setLogLevels(['error']);

    logger.warn('ignored');
    expect(lines).toHaveLength(0);

    logger.error('kept');
    expect(parsed()).toHaveLength(1);
  });

  it('writes a readable line when LOG_FORMAT=text', () => {
    process.env.LOG_FORMAT = 'text';
    const logger = new JsonLogger();
    logger.log('readable', 'Bootstrap');

    expect(lines.join('')).toContain('LOG Bootstrap: readable');
    expect(() => JSON.parse(lines.join(''))).toThrow();
  });
});
