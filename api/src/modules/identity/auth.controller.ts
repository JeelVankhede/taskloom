import { Body, Controller, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSessionBody } from '@taskloom/contracts';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.js';
import { OriginGuard } from '../../platform/http/origin.guard.js';
import { RestExceptionFilter } from '../../platform/http/rest-exception.filter.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';
import { AuthService, type Session } from './auth.service.js';
import { SignInDto, SignUpDto } from './dto/auth.dto.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

/** The session body. The refresh token only ever travels in the HttpOnly cookie. */
const body = (session: Session): AuthSessionBody => ({
  accessToken: session.accessToken,
  expiresIn: session.expiresIn,
  user: session.user,
});

@Controller('auth')
@UseGuards(OriginGuard)
@UseFilters(RestExceptionFilter)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: AuthRateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get secureCookie(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) !== 'development';
  }

  @Post('signup')
  @HttpCode(201)
  async signUp(
    @Body() dto: SignUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limiter.hit('signup', { ip: req.ip ?? 'unknown' });
    const session = await this.auth.signUp(dto);
    setRefreshCookie(res, session.refresh.raw, session.refresh.expiresAt, this.secureCookie);
    return body(session);
  }

  @Post('signin')
  @HttpCode(200)
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limiter.hit('signin', {
      ip: req.ip ?? 'unknown',
      email: dto.email.trim().toLowerCase(),
    });
    const session = await this.auth.signIn(dto);
    setRefreshCookie(res, session.refresh.raw, session.refresh.expiresAt, this.secureCookie);
    return body(session);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.limiter.hit('refresh', { ip: req.ip ?? 'unknown' });
    try {
      const session = await this.auth.refresh(readRefreshCookie(req));
      setRefreshCookie(res, session.refresh.raw, session.refresh.expiresAt, this.secureCookie);
      return body(session);
    } catch (error) {
      clearRefreshCookie(res, this.secureCookie);
      throw error;
    }
  }

  @Post('signout')
  @HttpCode(204)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.limiter.hit('signout', { ip: req.ip ?? 'unknown' });
    await this.auth.signOut(readRefreshCookie(req));
    clearRefreshCookie(res, this.secureCookie);
  }
}
