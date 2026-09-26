import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { unauthenticated } from '../errors/domain-error.js';

const TOKEN_ERRORS = new Set(['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies the access token (HS256, signature and expiry) and returns the user id from `sub`.
 * Issuing tokens is Phase 3; this only verifies them.
 */
@Injectable()
export class TokenVerifier {
  constructor(private readonly jwt: JwtService) {}

  async userIdFrom(authorization: string | undefined): Promise<string> {
    const match = /^Bearer (.+)$/.exec(authorization ?? '');
    if (!match) throw unauthenticated();
    let payload: { sub?: unknown };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: unknown }>(match[1]!, { algorithms: ['HS256'] });
    } catch (error) {
      // Only token problems mean "unauthenticated"; anything else is a bug and must surface.
      if (error instanceof Error && TOKEN_ERRORS.has(error.name)) throw unauthenticated();
      throw error;
    }
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw unauthenticated();
    return payload.sub;
  }
}
