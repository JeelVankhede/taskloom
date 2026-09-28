/** Local demo accounts. Test values only, listed in seed/README.md and the root README. */
export const DEMO_PASSWORD = 'taskloom-demo-2026';

export const ACCOUNTS = {
  acmeOwner: { email: 'owner@acme.test', displayName: 'Ada Owner' },
  acmeAdmin: { email: 'admin@acme.test', displayName: 'Alan Admin' },
  acmeMember: { email: 'member@acme.test', displayName: 'Mia Member' },
  acmeContributor: { email: 'contributor@acme.test', displayName: 'Cole Contributor' },
  departed: { email: 'departed@acme.test', displayName: 'Dana Departed' },
  globexOwner: { email: 'owner@globex.test', displayName: 'Grace Owner' },
  both: { email: 'both@example.test', displayName: 'Bo Both' },
  newbie: { email: 'newbie@example.test', displayName: 'Nia Newbie' },
  requester: { email: 'requester@example.test', displayName: 'Reza Requester' },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;
