import { describe, expect, it, vi } from 'vitest';
import type { TxClient } from '../../platform/request-store.js';
import { AuthService } from './auth.service.js';
import type { IdentityRepository, RefreshTokenRow } from './identity.repository.js';
import { hashRefreshToken } from './refresh-token.js';

const USER = { id: 'u1', email: 'a@example.test', displayName: 'A' };

function build(row: RefreshTokenRow | undefined) {
  const repo = {
    lockRefreshToken: vi.fn(async () => row),
    revokeFamily: vi.fn(async () => undefined),
    findUser: vi.fn(async () => USER),
    createRefreshToken: vi.fn(async () => 'next-id'),
    markRotated: vi.fn(async () => undefined),
  };
  const identity = { run: <T>(work: (tx: TxClient) => Promise<T>) => work({} as TxClient) };
  const tokens = { issue: () => ({ accessToken: 'jwt', expiresIn: 900 }) };
  const config = { get: () => 30 };
  const service = new AuthService(
    identity as never,
    repo as unknown as IdentityRepository,
    {} as never,
    tokens as never,
    config as never,
  );
  return { service, repo };
}

const token = (overrides: Partial<RefreshTokenRow> = {}): RefreshTokenRow => ({
  id: 't1',
  userId: USER.id,
  familyId: 'f1',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  ...overrides,
});

describe('AuthService.refresh', () => {
  it('rotates within the family and keeps the family expiry (absolute lifetime)', async () => {
    // Arrange
    const current = token();
    const { service, repo } = build(current);

    // Act
    const session = await service.refresh('raw');

    // Assert
    expect(repo.lockRefreshToken).toHaveBeenCalledWith({}, hashRefreshToken('raw'));
    expect(repo.createRefreshToken).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ familyId: 'f1', expiresAt: current.expiresAt }),
    );
    expect(repo.markRotated).toHaveBeenCalledWith({}, 't1', 'next-id');
    expect(session.refresh.expiresAt).toBe(current.expiresAt);
  });

  it('rejects an expired family without rotating', async () => {
    const { service, repo } = build(token({ expiresAt: new Date(Date.now() - 1) }));
    await expect(service.refresh('raw')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(repo.createRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes the family when a revoked token is reused (strict rotation)', async () => {
    const { service, repo } = build(token({ revokedAt: new Date() }));
    await expect(service.refresh('raw')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(repo.revokeFamily).toHaveBeenCalledWith({}, 'f1');
    expect(repo.createRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects an unknown or missing token', async () => {
    await expect(build(undefined).service.refresh('raw')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(build(undefined).service.refresh(undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
