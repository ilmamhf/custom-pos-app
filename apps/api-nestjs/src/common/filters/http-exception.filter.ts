import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { currentRequestContext } from '../logging/request-context';

const HTTP_STATUS_NAMES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // The correlation id is assigned by the request middleware, so the id in
    // the log line, the response body, and the `x-request-id` header all
    // point at the same request.
    const correlationId =
      currentRequestContext()?.correlationId ?? readCorrelationId(request) ?? randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      error = HTTP_STATUS_NAMES[status] || exception.name.replace(/Exception$/, '').toUpperCase();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        if (body.message) {
          message = body.message;
        }
        if (body.error && typeof body.error === 'string') {
          error = body.error.toUpperCase().replace(/\s+/g, '_');
        }
      }
    } else {
      // Never expose library/database messages to clients. Log the original
      // server-side with a correlation id the operator can look up.
      if (exception instanceof Error) {
        this.logger.error(
          `Unhandled exception on ${request?.method} ${request?.url}: ${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.error(
          `Unhandled non-error exception on ${request?.method} ${request?.url}`,
        );
      }
      message = 'Internal server error';
      error = 'INTERNAL_SERVER_ERROR';
      response.status(status).json({
        statusCode: status,
        error,
        message,
        correlationId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 5xx is an operator problem, 4xx is a client problem: only the first
    // group is worth an error-level log line.
    const logMessage = `${request?.method} ${request?.url} failed with ${status} ${error}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logMessage);
    } else {
      this.logger.warn(logMessage);
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}

function readCorrelationId(request: Request | undefined): string | undefined {
  const header = request?.headers?.['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
