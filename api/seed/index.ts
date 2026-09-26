import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { config } from 'dotenv';
import { ARGON2_OPTIONS } from '../src/modules/identity/argon2-options.js';
import { SeedDb } from './db.js';
import { ACCOUNTS, type AccountKey, DEMO_PASSWORD } from './demo-accounts.js';
import { Random } from './random.js';
import {
  addMembers,
  createLabels,
  createOrganization,
  createProject,
  deactivateMember,
  seedTasks,
} from './seed-org.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** Refuses to run anywhere but a local development database. */
function guard(): string {
  const url = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed: NODE_ENV is production');
  if (!url) throw new Error('Refusing to seed: DATABASE_URL is not set');
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host))
    throw new Error(`Refusing to seed: database host "${host}" is not local`);
  return url;
}

async function main(): Promise<void> {
  const db = new SeedDb(guard());
  try {
    const seeded = await db.transaction((session) =>
      session.run({ role: 'app_identity' }, async (client) => {
        const { rowCount } = await client.query(`SELECT 1 FROM users WHERE email = $1`, [
          ACCOUNTS.acmeOwner.email,
        ]);
        return (rowCount ?? 0) > 0;
      }),
    );
    if (seeded) {
      console.log('Already seeded. Run `npm run db:reset` to start over (local development only).');
      return;
    }

    // Hashes first (CPU work), then everything else in one transaction.
    const accounts = Object.entries(ACCOUNTS) as [AccountKey, (typeof ACCOUNTS)[AccountKey]][];
    const hashes = await Promise.all(
      accounts.map(() => argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS)),
    );
    const summary = await db.transaction(async (tx) => {
      // Accounts, hashed exactly as sign up hashes them.
      const ids = {} as Record<AccountKey, string>;
      for (const [index, [key, account]] of accounts.entries()) {
        const hash = hashes[index]!;
        ids[key] = await tx.run({ role: 'app_identity' }, async (client) => {
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
            [account.email, account.displayName, hash],
          );
          return rows[0]!.id;
        });
      }

      // Acme: every role, a departed member, a 2,500-task project, and a small one.
      const acme = await createOrganization(tx, ids.acmeOwner, {
        name: 'Acme',
        slug: 'acme',
        timezone: 'Asia/Kolkata',
      });
      await addMembers(tx, acme, ids.acmeOwner, [
        [ids.acmeAdmin, 'admin'],
        [ids.acmeMember, 'member'],
        [ids.acmeContributor, 'contributor'],
        [ids.both, 'member'],
        [ids.departed, 'member'],
      ]);
      const acmeLabels = await createLabels(tx, acme, ids.acmeOwner, [
        ['bug', 'red'],
        ['feature', 'blue'],
        ['infra', 'slate'],
        ['design', 'purple'],
        ['docs', 'teal'],
        ['security', 'orange'],
      ]);
      const acmePeople = [
        ids.acmeOwner,
        ids.acmeAdmin,
        ids.acmeMember,
        ids.acmeContributor,
        ids.both,
      ];
      const eng = await createProject(tx, acme, ids.acmeOwner, {
        name: 'Engineering',
        key: 'ENG',
        description: 'Product engineering. Large enough to exercise the board.',
      });
      const ops = await createProject(tx, acme, ids.acmeAdmin, {
        name: 'Operations',
        key: 'OPS',
        description: 'On-call and infra.',
      });
      const engResult = await seedTasks(tx, {
        orgId: acme,
        project: eng,
        count: 2500,
        people: acmePeople,
        departedId: ids.departed,
        labelIds: acmeLabels,
        random: new Random(20260927),
      });
      const opsResult = await seedTasks(tx, {
        orgId: acme,
        project: ops,
        count: 40,
        people: acmePeople,
        departedId: ids.departed,
        labelIds: acmeLabels,
        random: new Random(40),
      });
      await deactivateMember(tx, acme, ids.acmeOwner, ids.departed);

      // Globex: its own owner, the user who belongs to both orgs, and a pending request.
      const globex = await createOrganization(tx, ids.globexOwner, {
        name: 'Globex',
        slug: 'globex',
        timezone: 'America/New_York',
      });
      await addMembers(tx, globex, ids.globexOwner, [[ids.both, 'member']]);
      const globexLabels = await createLabels(tx, globex, ids.globexOwner, [
        ['bug', 'red'],
        ['content', 'green'],
        ['seo', 'amber'],
      ]);
      const web = await createProject(tx, globex, ids.globexOwner, {
        name: 'Website',
        key: 'WEB',
        description: 'Marketing site.',
      });
      const webResult = await seedTasks(tx, {
        orgId: globex,
        project: web,
        count: 60,
        people: [ids.globexOwner, ids.both],
        labelIds: globexLabels,
        random: new Random(60),
      });
      await tx.run({ role: 'app_user', userId: ids.requester }, (client) =>
        client.query(`SELECT * FROM app.submit_join_request('globex')`),
      );

      return { engResult, opsResult, webResult };
    });
    const { engResult, opsResult, webResult } = summary;

    console.log(
      [
        'Seeded:',
        `  Acme   ENG ${engResult.created} tasks (${engResult.archived} archived), OPS ${opsResult.created} tasks`,
        `  Globex WEB ${webResult.created} tasks, 1 pending join request`,
        `  ${Object.keys(ACCOUNTS).length} accounts, password "${DEMO_PASSWORD}" (see api/seed/README.md)`,
      ].join('\n'),
    );
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
