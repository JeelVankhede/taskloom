import { randomBytes } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

/** OWASP argon2id parameters: 19 MiB memory, 2 iterations, parallelism 1. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordHasher implements OnModuleInit {
  /** Verified against when the email is unknown, so both failures take the same time. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash(randomBytes(32).toString('hex'), OPTIONS);
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  /** Always performs one argon2 verification, whether or not the account exists. */
  async verify(storedHash: string | null | undefined, password: string): Promise<boolean> {
    const matches = await argon2.verify(storedHash ?? this.dummyHash, password);
    return matches && Boolean(storedHash);
  }
}
