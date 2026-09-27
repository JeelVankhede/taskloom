import { ErrorCode } from '@taskloom/contracts';

/** User-facing text for API error codes that any screen can meet. Screens override as needed. */
const MESSAGES: Partial<Record<string, string>> = {
  [ErrorCode.RATE_LIMITED]: 'Too many attempts. Wait a minute, then try again.',
  [ErrorCode.UNAUTHENTICATED]: 'Your session has ended. Sign in again.',
  [ErrorCode.FORBIDDEN]: 'You do not have permission to do that.',
  [ErrorCode.NOT_FOUND]: 'This no longer exists, or you do not have access to it.',
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'Something went wrong on our side. Try again.',
  NETWORK_ERROR: 'Could not reach Taskloom. Check your connection and try again.',
};

export function messageFor(
  code: string | undefined,
  fallback = 'Something went wrong. Try again.',
): string {
  return (code && MESSAGES[code]) || fallback;
}
