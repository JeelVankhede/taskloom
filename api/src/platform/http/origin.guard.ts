import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@taskloom/contracts';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import { DomainError } from '../errors/domain-error.js';

/**
 * CSRF defence in depth for cookie-authenticated routes: on top of SameSite=Strict, the
 * request must come from the web app's origin. Browsers always send Origin on POST.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin !== this.config.get('WEB_ORIGIN', { infer: true })) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Request origin is not allowed');
    }
    return true;
  }
}
