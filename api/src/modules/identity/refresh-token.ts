import { createHash, randomBytes } from 'node:crypto';

/** A new opaque refresh token: 32 random bytes. Only its SHA-256 hash is stored. */
export function newRefreshToken(): { raw: string; hash: Buffer } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): Buffer {
  return createHash('sha256').update(raw).digest();
}
