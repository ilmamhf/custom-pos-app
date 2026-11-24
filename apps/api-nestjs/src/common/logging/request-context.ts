import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes, randomUUID } from 'crypto';

/**
 * Per-request identifiers shared by the log lines, the metrics, and the
 * response headers.
 *
 * `correlationId` identifies one HTTP request and is returned to the caller in
 * the `x-request-id` header. `traceId` and `spanId` follow the W3C Trace
 * Context specification, so a trace started at the edge can be continued by
 * the API and by any service it calls.
 */
export interface RequestContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  /** Span id the incoming `traceparent` carried, when there was one. */
  parentSpanId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

const TRACE_ID = /^[0-9a-f]{32}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;
const HEX_BYTE = /^[0-9a-f]{2}$/;

export interface ParsedTraceparent {
  traceId: string;
  parentSpanId: string;
}

/**
 * Parses a W3C `traceparent` header (`version-traceid-parentid-flags`).
 *
 * A malformed header, an unsupported version, or an all-zero id is rejected
 * rather than trusted: a broken client must not be able to poison the trace of
 * an unrelated request.
 */
export function parseTraceparent(
  header: string | string[] | undefined,
): ParsedTraceparent | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') {
    return undefined;
  }

  const parts = value.trim().split('-');
  if (parts.length !== 4) {
    return undefined;
  }

  const [version, traceId, parentSpanId, flags] = parts;
  if (!HEX_BYTE.test(version) || !HEX_BYTE.test(flags)) {
    return undefined;
  }
  if (!TRACE_ID.test(traceId) || traceId === '0'.repeat(32)) {
    return undefined;
  }
  if (!SPAN_ID.test(parentSpanId) || parentSpanId === '0'.repeat(16)) {
    return undefined;
  }

  return { traceId, parentSpanId };
}

/** Builds the `traceparent` value for this hop. */
export function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}

export function newTraceId(): string {
  return randomBytes(16).toString('hex');
}

export function newSpanId(): string {
  return randomBytes(8).toString('hex');
}

export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Accepts an inbound `x-request-id` only when it is a short, printable
 * token. The value is echoed back to the caller and written to the logs, so
 * an unbounded or control-character-laden header must not be trusted.
 */
export function normalizeCorrelationId(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    return undefined;
  }
  if (!/^[\w.:@/-]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}
