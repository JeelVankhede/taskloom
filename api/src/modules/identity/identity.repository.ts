import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@taskloom/contracts';
import { mapDatabaseError } from '../../platform/errors/database-errors.js';
import { DomainError } from '../../platform/errors/domain-error.js';
import type { TxClient } from '../../platform/request-store.js';

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
}

export interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

const USER_SELECT = { id: true, email: true, displayName: true } as const;

/** Users and refresh tokens. Every method runs inside an app_identity transaction. */
@Injectable()
export class IdentityRepository {
  async createUser(
    tx: TxClient,
    input: { email: string; displayName: string; passwordHash: string },
  ): Promise<UserRow> {
    try {
      return await tx.user.create({ data: input, select: USER_SELECT });
    } catch (error) {
      if (
        mapDatabaseError(error)?.code === ErrorCode.VALIDATION_FAILED &&
        isUniqueViolation(error)
      ) {
        throw new DomainError(ErrorCode.EMAIL_TAKEN, 'An account with this email already exists');
      }
      throw error;
    }
  }

  findCredentials(
    tx: TxClient,
    email: string,
  ): Promise<{ id: string; passwordHash: string | null } | null> {
    return tx.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  }

  findUser(tx: TxClient, id: string): Promise<UserRow | null> {
    return tx.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  async createRefreshToken(
    tx: TxClient,
    input: { userId: string; familyId: string; tokenHash: Buffer; expiresAt: Date },
  ): Promise<string> {
    const row = await tx.refreshToken.create({
      data: { ...input, tokenHash: new Uint8Array(input.tokenHash) },
      select: { id: true },
    });
    return row.id;
  }

  /** Locks the token row, so concurrent refreshes of one token serialize here. */
  async lockRefreshToken(tx: TxClient, tokenHash: Buffer): Promise<RefreshTokenRow | undefined> {
    const [row] = await tx.$queryRaw<RefreshTokenRow[]>`
      SELECT id, user_id AS "userId", family_id AS "familyId", expires_at AS "expiresAt", revoked_at AS "revokedAt"
      FROM refresh_tokens WHERE token_hash = ${new Uint8Array(tokenHash)}
      FOR UPDATE`;
    return row;
  }

  async markRotated(tx: TxClient, id: string, replacedById: string): Promise<void> {
    await tx.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById },
      select: { id: true },
    });
  }

  async revokeFamily(tx: TxClient, familyId: string): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (
    error as {
      meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
      code?: string;
    }
  )?.meta?.driverAdapterError?.cause?.originalCode;
  return cause === '23505' || (error as { code?: string })?.code === 'P2002';
}
