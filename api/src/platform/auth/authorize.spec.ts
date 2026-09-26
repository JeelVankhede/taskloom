import { Capability, type OrgRole } from '@taskloom/contracts';
import { describe, expect, it } from 'vitest';
import { authorize } from './authorize.js';

// The role matrix of docs/1.2-data-model.md section 2.3, written out independently of
// ROLE_MATRIX so a change to either is caught.
const EXPECTED: Record<Capability, OrgRole[]> = {
  MANAGE_OWNERS: ['owner'],
  MANAGE_ORG: ['owner', 'admin'],
  MANAGE_PROJECTS: ['owner', 'admin', 'member'],
  MANAGE_LABELS: ['owner', 'admin', 'member'],
  EDIT_TASKS: ['owner', 'admin', 'member', 'contributor'],
  COMMENT: ['owner', 'admin', 'member', 'contributor'],
  DELETE_ANY_COMMENT: ['owner', 'admin'],
  READ_ORG: ['owner', 'admin', 'member', 'contributor'],
};
const ROLES: OrgRole[] = ['owner', 'admin', 'member', 'contributor'];

describe('authorize', () => {
  const cases = Object.values(Capability).flatMap((capability) =>
    ROLES.map((role) => [capability, role, EXPECTED[capability].includes(role)] as const),
  );

  it.each(cases)('%s for %s: allowed=%s', (capability, role, allowed) => {
    // Act
    const run = () => authorize(role, capability);

    // Assert
    if (allowed) expect(run).not.toThrow();
    else expect(run).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('covers every capability', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.values(Capability).sort());
  });
});
