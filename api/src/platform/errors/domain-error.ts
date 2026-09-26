import { ErrorCode } from '@taskloom/contracts';

/** An expected failure with a public GraphQL error code (design reference section 7.5). */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (detail?: string) =>
  new DomainError(ErrorCode.NOT_FOUND, 'Not found', detail);
export const forbidden = () => new DomainError(ErrorCode.FORBIDDEN, 'Forbidden');
export const unauthenticated = () =>
  new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication required');
export const validationFailed = (message: string) =>
  new DomainError(ErrorCode.VALIDATION_FAILED, message);
