import { type FragmentDefinitionNode, type OperationDefinitionNode, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { operationScope } from './operation-scope.js';

function scopeOf(source: string) {
  const document = parse(source);
  const operation = document.definitions.find(
    (d) => d.kind === 'OperationDefinition',
  ) as OperationDefinitionNode;
  const fragments = Object.fromEntries(
    document.definitions
      .filter((d): d is FragmentDefinitionNode => d.kind === 'FragmentDefinition')
      .map((d) => [d.name.value, d]),
  );
  return () => operationScope(operation, fragments);
}

describe('operationScope', () => {
  it.each([
    ['{ viewer { id } }', 'org-less'],
    ['{ __schema { queryType { name } } }', 'org-less'],
    ['mutation { createOrganization(input: {}) { id } }', 'org-less'],
    ['{ organization { id } }', 'org'],
    ['{ viewer { id } organization { id } }', 'org'],
    ['{ ...F } fragment F on Query { organization { id } }', 'org'],
    ['{ ... on Query { viewer { id } } }', 'org-less'],
  ])('%s is %s', (source, expected) => {
    expect(scopeOf(source)()).toBe(expected);
  });

  it('rejects an org-less mutation mixed with organization fields', () => {
    expect(
      scopeOf('mutation { createOrganization(input: {}) { id } createProject(input: {}) { id } }'),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
