import { Query, Resolver } from '@nestjs/graphql';

interface Health {
  ok: boolean;
}

@Resolver('Health')
export class HealthResolver {
  @Query('health')
  health(): Health {
    return { ok: true };
  }
}
