import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { ErrorCode } from '@taskloom/contracts';
import type { Response } from 'express';
import { DomainError } from '../errors/domain-error.js';

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  RATE_LIMITED: 429,
};

/**
 * REST errors use the same codes as GraphQL: { statusCode, code, message, field? }.
 * Unexpected errors are masked for the client and logged in full.
 */
@Catch()
export class RestExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('REST');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const statusCode = STATUS[exception.code] ?? 400;
      res.status(statusCode).json({
        statusCode,
        code: exception.code,
        message: exception.message,
        ...(exception.code === ErrorCode.VALIDATION_FAILED && exception.detail
          ? { field: exception.detail }
          : {}),
      });
      return;
    }
    if (exception instanceof BadRequestException) {
      res.status(400).json({
        statusCode: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Invalid request body',
      });
      return;
    }
    this.logger.error({ err: exception }, 'Unexpected REST error');
    res.status(500).json({
      statusCode: 500,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
