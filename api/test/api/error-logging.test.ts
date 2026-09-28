import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createOrg, type OrgFixture } from '../db/support/fixtures.js';
import { codeOf, startApp, type TestApp } from './support/app.js';

/**
 * Expected failures are logged quietly; unexpected ones exactly once, in full. Nest's Logger
 * methods are spied before pino applies its level, so this works with test logging silenced.
 */
let api: TestApp;
let org: OrgFixture;
const error = vi.spyOn(Logger.prototype, 'error');
const debug = vi.spyOn(Logger.prototype, 'debug');

beforeAll(async () => {
  api = await startApp();
  org = await createOrg();
});
afterAll(() => api.close());
afterEach(() => {
  error.mockClear();
  debug.mockClear();
});

const gql = (query: string, variables?: Record<string, unknown>) =>
  api.gql(query, { token: api.token(org.ownerId), orgId: org.orgId, variables });

const CREATE_PROJECT = `mutation ($i: CreateProjectInput!) { createProject(input: $i) { id } }`;

describe('GraphQL error logging', () => {
  it('logs a database-raised domain error (PROJECT_KEY_TAKEN) at debug, not error', async () => {
    // Arrange
    const input = { i: { name: 'Logs', key: 'LOG' } };
    expect(codeOf(await gql(CREATE_PROJECT, input))).toBeUndefined();
    debug.mockClear();

    // Act
    const result = await gql(CREATE_PROJECT, input);

    // Assert
    expect(codeOf(result)).toBe('PROJECT_KEY_TAKEN');
    expect(error).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(
      { code: 'PROJECT_KEY_TAKEN', path: ['createProject'] },
      'Expected GraphQL error',
    );
  });

  it('logs a DomainError thrown by a resolver (NOT_FOUND) at debug, not error', async () => {
    // The membership service throws notFound() itself; the database raises nothing here.
    const result = await gql(`mutation ($id: ID!) { approveJoinRequest(id: $id) { role } }`, {
      id: randomUUID(),
    });

    expect(codeOf(result)).toBe('NOT_FOUND');
    expect(error).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(
      { code: 'NOT_FOUND', path: ['approveJoinRequest'] },
      'Expected GraphQL error',
    );
  });

  it('logs an unexpected error once, in full, and masks it for the client', async () => {
    const result = await gql('{ leakyFailure }');

    expect(codeOf(result)).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(result.body)).not.toContain('secret');
    expect(error).toHaveBeenCalledTimes(1);
    const [fields, message] = error.mock.calls[0]!;
    expect(message).toBe('Unexpected GraphQL error');
    expect((fields as { err: Error }).err.message).toContain('postgresql://secret@internal');
    expect((fields as { err: Error }).err.stack).toBeDefined();
  });
});
