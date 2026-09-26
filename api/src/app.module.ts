import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { type Env, validateEnv } from './config/env.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { LabelModule } from './modules/label/label.module.js';
import { MembershipModule } from './modules/membership/membership.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { ProjectModule } from './modules/project/project.module.js';
import { TaskModule } from './modules/task/task.module.js';
import { UserModule } from './modules/user/user.module.js';
import { ViewerModule } from './modules/viewer/viewer.module.js';
import { graphqlOptions } from './platform/graphql/graphql.options.js';
import { LimitsPlugin } from './platform/graphql/limits.plugin.js';
import { TransactionPlugin } from './platform/graphql/transaction.plugin.js';
import { PlatformModule } from './platform/platform.module.js';

export interface AppModuleOptions {
  /** Test builds only: extra schema and resolvers that probe the lifecycle. */
  extraTypeDefs?: string[];
  extraProviders?: Provider[];
}

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env'], validate: validateEnv }),
        PlatformModule,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
          driver: ApolloDriver,
          inject: [LimitsPlugin, TransactionPlugin, ConfigService],
          useFactory: (
            limits: LimitsPlugin,
            transaction: TransactionPlugin,
            config: ConfigService<Env, true>,
          ) =>
            graphqlOptions({
              limits,
              transaction,
              production: config.get('NODE_ENV', { infer: true }) === 'production',
              extraTypeDefs: options.extraTypeDefs,
            }),
        }),
        IdentityModule,
        ViewerModule,
        OrganizationModule,
        UserModule,
        MembershipModule,
        ProjectModule,
        TaskModule,
        LabelModule,
      ],
      providers: options.extraProviders ?? [],
    };
  }
}
