import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Env } from '../../config/env.js';
import { requestId } from './request-id.js';

/** HTTP setup shared by main.ts and the API tests, so tests run the real pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.useLogger(app.get(Logger));
  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy:
        config.get('NODE_ENV', { infer: true }) === 'production' ? undefined : false,
    }),
  );
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
}
