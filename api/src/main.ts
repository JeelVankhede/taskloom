import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { configureApp } from './platform/http/configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule.register(), { bufferLogs: true });
  configureApp(app);
  await app.listen(
    app.get<ConfigService<Env, true>>(ConfigService).get('API_PORT', { infer: true }),
  );
}

void bootstrap();
