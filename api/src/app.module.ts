import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { fileURLToPath } from 'node:url';
import { validateEnv } from './config/env.js';
import { HealthModule } from './modules/health/health.module.js';

const SCHEMA_PATH = fileURLToPath(import.meta.resolve('@taskloom/contracts/schema.graphql'));

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env'], validate: validateEnv }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [SCHEMA_PATH],
      path: '/graphql',
    }),
    HealthModule,
  ],
})
export class AppModule {}
