import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { checkSignUp, ErrorCode, normalizeEmail } from '@taskloom/contracts';
import type { Env } from '../../config/env.js';
import { IdentityTx } from '../../platform/database/identity-tx.js';
import { DomainError, unauthenticated } from '../../platform/errors/domain-error.js';
import type { TxClient } from '../../platform/request-store.js';
import { IdentityRepository, type UserRow } from './identity.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { hashRefreshToken, newRefreshToken } from './refresh-token.js';
import { type AccessToken, TokenIssuer } from './token-issuer.js';

export interface Session extends AccessToken {
  user: UserRow;
  refresh: { raw: string; expiresAt: Date };
}

const DAY_MS = 86_400_000;

/**
 * Sign up, sign in, refresh, sign out.
 * - Password hashing runs outside transactions; transactions stay short.
 * - A refresh family lives at most REFRESH_TOKEN_TTL_DAYS from sign in (absolute).
 * - Strict rotation: presenting a rotated or revoked token revokes the whole family.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly identity: IdentityTx,
    private readonly repo: IdentityRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signUp(input: { email: string; password: string; displayName: string }): Promise<Session> {
    const [violation] = checkSignUp(input);
    if (violation)
      throw new DomainError(ErrorCode.VALIDATION_FAILED, violation.message, violation.field);

    const passwordHash = await this.hasher.hash(input.password);
    return this.identity.run(async (tx) => {
      const user = await this.repo.createUser(tx, {
        email: normalizeEmail(input.email),
        displayName: input.displayName.trim(),
        passwordHash,
      });
      return this.startFamily(tx, user);
    });
  }

  async signIn(input: { email: string; password: string }): Promise<Session> {
    const email = normalizeEmail(input.email);
    const credentials = await this.identity.run((tx) => this.repo.findCredentials(tx, email));
    const valid = await this.hasher.verify(credentials?.passwordHash, input.password);
    if (!credentials || !valid) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
    }
    return this.identity.run(async (tx) => {
      const user = await this.repo.findUser(tx, credentials.id);
      if (!user)
        throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
      return this.startFamily(tx, user);
    });
  }

  async refresh(raw: string | undefined): Promise<Session> {
    if (!raw) throw unauthenticated();
    // The reuse branch must commit its revocation, so the outcome is decided inside the
    // transaction and the error is thrown after it commits.
    const outcome = await this.identity.run(async (tx) => {
      const current = await this.repo.lockRefreshToken(tx, hashRefreshToken(raw));
      if (!current) return { kind: 'unknown' as const };
      if (current.revokedAt) {
        await this.repo.revokeFamily(tx, current.familyId);
        return { kind: 'reused' as const };
      }
      if (current.expiresAt.getTime() <= Date.now()) return { kind: 'expired' as const };

      const user = await this.repo.findUser(tx, current.userId);
      if (!user) return { kind: 'unknown' as const };
      const next = newRefreshToken();
      const nextId = await this.repo.createRefreshToken(tx, {
        userId: user.id,
        familyId: current.familyId,
        tokenHash: next.hash,
        expiresAt: current.expiresAt,
      });
      await this.repo.markRotated(tx, current.id, nextId);
      return { kind: 'ok' as const, session: this.session(user, next.raw, current.expiresAt) };
    });
    if (outcome.kind !== 'ok') throw unauthenticated();
    return outcome.session;
  }

  /** Revokes the presented token's family. Unknown tokens are ignored, so sign out always succeeds. */
  async signOut(raw: string | undefined): Promise<void> {
    if (!raw) return;
    await this.identity.run(async (tx) => {
      const current = await this.repo.lockRefreshToken(tx, hashRefreshToken(raw));
      if (current) await this.repo.revokeFamily(tx, current.familyId);
    });
  }

  private async startFamily(tx: TxClient, user: UserRow): Promise<Session> {
    const expiresAt = new Date(
      Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_MS,
    );
    const token = newRefreshToken();
    await this.repo.createRefreshToken(tx, {
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: token.hash,
      expiresAt,
    });
    return this.session(user, token.raw, expiresAt);
  }

  private session(user: UserRow, raw: string, expiresAt: Date): Session {
    return { ...this.tokens.issue(user.id), user, refresh: { raw, expiresAt } };
  }
}
