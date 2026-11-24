import { Injectable, LoggerService } from '@nestjs/common';
import { currentRequestContext } from './request-context';

export type JsonLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

const LEVEL_WEIGHT: Record<JsonLogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  log: 30,
  debug: 20,
  verbose: 10,
};

const DEFAULT_LEVEL: JsonLogLevel = 'log';

function parseLevel(raw: string | undefined): JsonLogLevel {
  const value = (raw ?? '').trim().toLowerCase();
  if (value in LEVEL_WEIGHT) {
    return value as JsonLogLevel;
  }
  return DEFAULT_LEVEL;
}

/**
 * Logger that writes one JSON object per line.
 *
 * The NestJS default logger writes human-readable lines that no log pipeline
 * can query reliably. Every line here is a single JSON object with a stable
 * field set, so a collector can index `level`, `context`, `correlationId`,
 * and `traceId` without a regex.
 *
 * `LOG_LEVEL` controls the threshold (`error`, `warn`, `log`, `debug`,
 * `verbose`, `fatal`). `LOG_FORMAT=text` switches to a readable line format
 * for local development; the default is `json`.
 */
@Injectable()
export class JsonLogger implements LoggerService {
  private threshold: number;
  private readonly format: 'json' | 'text';

  constructor() {
    this.threshold = LEVEL_WEIGHT[parseLevel(process.env.LOG_LEVEL)];
    this.format = process.env.LOG_FORMAT === 'text' ? 'text' : 'json';
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    const { context, stack, extra } = splitParams(optionalParams, false);
    this.write('log', message, context, stack, extra);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const { context, stack, extra } = splitParams(optionalParams, true);
    this.write('error', message, context, stack, extra);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    const { context, stack, extra } = splitParams(optionalParams, false);
    this.write('warn', message, context, stack, extra);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    const { context, stack, extra } = splitParams(optionalParams, false);
    this.write('debug', message, context, stack, extra);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    const { context, stack, extra } = splitParams(optionalParams, false);
    this.write('verbose', message, context, stack, extra);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    const { context, stack, extra } = splitParams(optionalParams, true);
    this.write('fatal', message, context, stack, extra);
  }

  setLogLevels(levels: JsonLogLevel[]): void {
    const weights = levels.map((level) => LEVEL_WEIGHT[level] ?? 0);
    this.threshold = weights.length > 0 ? Math.min(...weights) : 0;
  }

  private write(
    level: JsonLogLevel,
    message: unknown,
    context?: string,
    stack?: string,
    extra?: Record<string, unknown>,
  ): void {
    if (LEVEL_WEIGHT[level] < this.threshold) {
      return;
    }

    const requestContext = currentRequestContext();
    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: stringifyMessage(message),
    };

    if (context) {
      payload.context = context;
    }
    if (requestContext) {
      payload.correlationId = requestContext.correlationId;
      payload.traceId = requestContext.traceId;
      payload.spanId = requestContext.spanId;
    }
    if (message !== null && typeof message === 'object') {
      for (const [key, value] of Object.entries(message as Record<string, unknown>)) {
        if (key !== 'message' && !(key in payload)) {
          payload[key] = value;
        }
      }
    }
    if (extra) {
      Object.assign(payload, extra);
    }
    const resolvedStack = stack ?? (message instanceof Error ? message.stack : undefined);
    if (resolvedStack) {
      payload.stack = resolvedStack;
    }

    const line =
      this.format === 'text'
        ? `${payload.timestamp} ${level.toUpperCase()} ${context ?? '-'}: ${payload.message}`
        : JSON.stringify(payload);

    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }
}

function stringifyMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  if (message === null || message === undefined) {
    return '';
  }
  if (typeof message === 'object') {
    // A structured message usually carries its own text in a `message` field;
    // the remaining fields are flattened into the log line.
    const nested = (message as Record<string, unknown>).message;
    if (typeof nested === 'string') {
      return nested;
    }
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/**
 * NestJS calls the logger with different argument shapes: `log(message,
 * context)` but `error(message, stack, context)`. Both are unpacked here so
 * the emitted object always has a `context` and, for errors, a `stack`.
 *
 * `error(message, context)` is ambiguous, so the second argument is only
 * treated as a stack when it actually looks like one. This mirrors what the
 * NestJS logger does internally.
 */
function splitParams(
  optionalParams: unknown[],
  stackFirst: boolean,
): { context?: string; stack?: string; extra?: Record<string, unknown> } {
  let context: string | undefined;
  let stack: string | undefined;
  let extra: Record<string, unknown> | undefined;

  const params = [...optionalParams];
  if (stackFirst && typeof params[0] === 'string' && isStackFormat(params[0])) {
    stack = params.shift() as string;
  }
  if (typeof params[0] === 'string') {
    context = params.shift() as string;
  }
  if (params[0] && typeof params[0] === 'object') {
    extra = params.shift() as Record<string, unknown>;
  }

  return { context, stack, extra };
}

/** A stack trace starts with a message line and an `at …` frame. */
function isStackFormat(value: string): boolean {
  return /^(.)+\n\s+at .+:\d+:\d+/.test(value);
}
