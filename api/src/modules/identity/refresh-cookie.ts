import { REFRESH_COOKIE } from '@taskloom/contracts';
import type { CookieOptions, Request, Response } from 'express';

/** HttpOnly, SameSite=Strict, scoped to /auth; Secure everywhere except development. */
function options(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', path: '/auth', secure };
}

export function setRefreshCookie(
  res: Response,
  raw: string,
  expiresAt: Date,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE, raw, { ...options(secure), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, options(secure));
}

/** Reads the refresh cookie without a cookie-parser dependency. */
export function readRefreshCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
