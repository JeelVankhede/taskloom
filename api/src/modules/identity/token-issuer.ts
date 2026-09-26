import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '@taskloom/contracts';
import type { Env } from '../../config/env.js';

export interface AccessToken {
  accessToken: string;
  /** Seconds until expiry. */
  expiresIn: number;
}

/** Issues the 15-minute access token (HS256, sub = user id, iss and aud checked on use). */
@Injectable()
export class TokenIssuer {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  issue(userId: string): AccessToken {
    const expiresIn = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const accessToken = this.jwt.sign(
      { sub: userId },
      { algorithm: 'HS256', expiresIn, issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE },
    );
    return { accessToken, expiresIn };
  }
}
