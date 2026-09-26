import { Injectable } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ErrorCode } from '@taskloom/contracts';
import { DbContext } from '../../../src/platform/database/db-context.js';
import { DomainError } from '../../../src/platform/errors/domain-error.js';

/**
 * Test-only schema and resolvers that probe the request lifecycle. They are registered only
 * by the API tests (AppModule.register({ extraTypeDefs, extraProviders })), never in the app.
 */
export const PROBE_TYPE_DEFS = /* GraphQL */ `
  type Probe {
    value: Int!
    child: Probe
    list(first: Int): [Probe!]!
  }

  extend type Query {
    probe: Probe!
    "Counts tasks, runs the between hook, and counts again, inside one request (T22)."
    snapshotProbe: [Int!]!
    writeInQuery: Boolean!
    leakyFailure: Boolean!
    slowProbe(ms: Int!): Boolean!
    "Runs the between hook mid-request (T22: another session commits while this request reads)."
    commitDuringRequest: Boolean!
  }

  extend type Mutation {
    insertLabel(name: String!): Boolean!
    insertLabelThenFail(name: String!): Boolean!
    demoteSelf: Boolean!
  }
`;

/** Hooks a test can set to act between two reads of one request. */
export const probeHooks: { between?: () => Promise<void> } = {};

const probeNode = () => ({ value: 1, child: null, list: [] });

@Injectable()
@Resolver('Probe')
export class ProbeResolver {
  constructor(private readonly db: DbContext) {}

  @Query('probe')
  probe() {
    return probeNode();
  }

  @Query('snapshotProbe')
  async snapshotProbe(): Promise<number[]> {
    const count = async () =>
      Number((await this.db.tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM tasks`)[0]!.n);
    const before = await count();
    await probeHooks.between?.();
    return [before, await count()];
  }

  @Query('writeInQuery')
  async writeInQuery(): Promise<boolean> {
    await this.db.tx
      .$executeRaw`INSERT INTO labels (org_id, name, color) VALUES (${this.db.orgId}::uuid, 'from-query', 'red')`;
    return true;
  }

  @Query('leakyFailure')
  leakyFailure(): boolean {
    throw new Error('connection string postgresql://secret@internal');
  }

  @Query('commitDuringRequest')
  async commitDuringRequest(): Promise<boolean> {
    await probeHooks.between?.();
    return true;
  }

  @Query('slowProbe')
  async slowProbe(): Promise<boolean> {
    await this.db.tx.$queryRaw`SELECT pg_sleep(0.5)`;
    return true;
  }

  @Mutation('insertLabel')
  async insertLabel(@Args('name') name: string): Promise<boolean> {
    await this.db.tx
      .$executeRaw`INSERT INTO labels (org_id, name, color) VALUES (${this.db.orgId}::uuid, ${name}, 'red')`;
    return true;
  }

  @Mutation('insertLabelThenFail')
  async insertLabelThenFail(@Args('name') name: string): Promise<boolean> {
    await this.insertLabel(name);
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Deliberate failure after a write');
  }

  /** Demotes the only owner: the statement succeeds, and the deferred LAST_OWNER check fails at commit. */
  @Mutation('demoteSelf')
  async demoteSelf(): Promise<boolean> {
    await this.db.tx
      .$executeRaw`UPDATE org_memberships SET role = 'admin' WHERE user_id = ${this.db.userId}::uuid`;
    return true;
  }
}
