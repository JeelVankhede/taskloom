import type { AuthErrorBody, AuthSessionBody } from '@taskloom/contracts';

/** A failed auth call. `code` is an API error code, or NETWORK_ERROR when the API was not reached. */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly field?: AuthErrorBody['field'],
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * The REST auth routes. Same origin (the dev server and production proxy /auth to the API),
 * so the HttpOnly refresh cookie travels without CORS. The client never reads the cookie.
 */
async function post<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/auth/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError('NETWORK_ERROR', 'Could not reach Taskloom. Check your connection.', 0);
  }
  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (json ?? {}) as Partial<AuthErrorBody>;
    throw new AuthError(
      error.code ?? 'INTERNAL_SERVER_ERROR',
      error.message ?? 'Something went wrong',
      response.status,
      error.field,
    );
  }
  return json as T;
}

export const authApi = {
  signUp: (input: { email: string; password: string; displayName: string }) =>
    post<AuthSessionBody>('signup', input),
  signIn: (input: { email: string; password: string }) => post<AuthSessionBody>('signin', input),
  refresh: () => post<AuthSessionBody>('refresh'),
  signOut: () => post<void>('signout'),
};
