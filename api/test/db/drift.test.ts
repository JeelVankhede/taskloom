import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, inject, it } from 'vitest';

const apiDir = fileURLToPath(new URL('../..', import.meta.url));

describe('T13: the migrated database matches schema.prisma', () => {
  it('produces an empty diff', () => {
    // Act
    const diff = execFileSync(
      'npx',
      [
        'prisma',
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema',
        '--script',
      ],
      {
        cwd: apiDir,
        env: {
          ...process.env,
          DIRECT_DATABASE_URL: inject('ownerUrl'),
          PRISMA_HIDE_UPDATE_MESSAGE: '1',
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    // Assert
    expect(diff.trim()).toBe('-- This is an empty migration.');
  });
});
