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
      const correlationId = randomUUID();
      if (exception instanceof Error) {
        this.logger.error(
          `[${correlationId}] Unhandled exception on ${request?.method} ${request?.url}: ${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.error(
          `[${correlationId}] Unhandled non-error exception on ${request?.method} ${request?.url}`,
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

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
