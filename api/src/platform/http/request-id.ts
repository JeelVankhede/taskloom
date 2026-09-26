import { randomUUID } from 'node:crypto';
import { REQUEST_ID_HEADER } from '@taskloom/contracts';
import type { NextFunction, Request, Response } from 'express';

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Assigns the correlation id before any other middleware, so logs and the response share it.
 * A client-supplied id is kept only when it is short and safe to log.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
