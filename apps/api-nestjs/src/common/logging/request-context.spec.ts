import {
  formatTraceparent,
  newCorrelationId,
  newSpanId,
  newTraceId,
  normalizeCorrelationId,
  parseTraceparent,
  runWithRequestContext,
  currentRequestContext,
} from './request-context';

describe('request context', () => {
  describe('parseTraceparent', () => {
    it('accepts a well-formed W3C traceparent', () => {
      const parsed = parseTraceparent(
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      );

      expect(parsed).toEqual({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        parentSpanId: '00f067aa0ba902b7',
      });
    });

    it('rejects a malformed header instead of trusting it', () => {
      expect(parseTraceparent('not-a-traceparent')).toBeUndefined();
      expect(parseTraceparent('00-abc-def-01')).toBeUndefined();
      expect(parseTraceparent(undefined)).toBeUndefined();
      expect(parseTraceparent('')).toBeUndefined();
    });

    it('rejects an all-zero trace or span id', () => {
      expect(
        parseTraceparent(`00-${'0'.repeat(32)}-${'0'.repeat(16)}-01`),
      ).toBeUndefined();
      expect(
        parseTraceparent(`00-4bf92f3577b34da6a3ce929d0e0e4736-${'0'.repeat(16)}-01`),
      ).toBeUndefined();
    });

    it('takes the first value when the header is repeated', () => {
      const parsed = parseTraceparent([
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        '00-11111111111111111111111111111111-2222222222222222-01',
      ]);

      expect(parsed?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    });
  });

  describe('normalizeCorrelationId', () => {
    it('keeps a short printable token', () => {
      expect(normalizeCorrelationId('req-123.abc')).toBe('req-123.abc');
    });

    it('drops an empty, oversized, or control-character value', () => {
      expect(normalizeCorrelationId('')).toBeUndefined();
      expect(normalizeCorrelationId('   ')).toBeUndefined();
      expect(normalizeCorrelationId('x'.repeat(129))).toBeUndefined();
      expect(normalizeCorrelationId('bad value with spaces')).toBeUndefined();
      expect(normalizeCorrelationId('inject\nheader')).toBeUndefined();
    });
  });

  describe('identifiers', () => {
    it('generates ids with the expected shape', () => {
      expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/);
      expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/);
      expect(newCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('formats a traceparent for the current hop', () => {
      const traceparent = formatTraceparent('a'.repeat(32), 'b'.repeat(16));
      expect(traceparent).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    });
  });

  describe('AsyncLocalStorage scope', () => {
    it('exposes the context inside the scope and hides it outside', () => {
      expect(currentRequestContext()).toBeUndefined();

      const context = {
        correlationId: 'corr-1',
        traceId: 'c'.repeat(32),
        spanId: 'd'.repeat(16),
      };

      runWithRequestContext(context, () => {
        expect(currentRequestContext()).toBe(context);
      });

      expect(currentRequestContext()).toBeUndefined();
    });

    it('keeps the context across an async boundary', async () => {
      const context = {
        correlationId: 'corr-2',
        traceId: 'e'.repeat(32),
        spanId: 'f'.repeat(16),
      };

      await runWithRequestContext(context, async () => {
        await new Promise((resolve) => setImmediate(resolve));
        expect(currentRequestContext()?.correlationId).toBe('corr-2');
      });
    });
  });
});
