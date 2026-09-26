import { Module } from '@nestjs/common';
import { OriginGuard } from '../../platform/http/origin.guard.js';
import { AUTH_RATE_LIMITS, AuthRateLimiter, DEFAULT_AUTH_LIMITS } from './auth-rate-limiter.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { IdentityRepository } from './identity.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { TokenIssuer } from './token-issuer.js';

/** Accounts and sessions: the /auth REST routes. */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    IdentityRepository,
    PasswordHasher,
    TokenIssuer,
    AuthRateLimiter,
    OriginGuard,
    { provide: AUTH_RATE_LIMITS, useValue: DEFAULT_AUTH_LIMITS },
  ],
})
export class IdentityModule {}
