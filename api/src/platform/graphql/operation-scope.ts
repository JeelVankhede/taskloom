import type { FragmentDefinitionNode, OperationDefinitionNode, SelectionSetNode } from 'graphql';
import { validationFailed } from '../errors/domain-error.js';

/** Root fields that run without an organization (design reference 7.1). */
const ORG_LESS_FIELDS = new Set([
  'viewer',
  'createOrganization',
  'requestToJoinOrganization',
  'cancelJoinRequest',
  '__schema',
  '__type',
  '__typename',
]);

/** Org-less mutations may not share an operation with org-scoped fields. */
const ORG_LESS_MUTATIONS = new Set([
  'createOrganization',
  'requestToJoinOrganization',
  'cancelJoinRequest',
]);

export type OperationScope = 'org' | 'org-less';

function rootFields(
  selectionSet: SelectionSetNode,
  fragments: Record<string, FragmentDefinitionNode>,
  into: string[] = [],
): string[] {
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') into.push(selection.name.value);
    else if (selection.kind === 'InlineFragment')
      rootFields(selection.selectionSet, fragments, into);
    else {
      const fragment = fragments[selection.name.value];
      if (fragment) rootFields(fragment.selectionSet, fragments, into);
    }
  }
  return into;
}

/** Decides whether an operation needs the selected organization. */
export function operationScope(
  operation: OperationDefinitionNode,
  fragments: Record<string, FragmentDefinitionNode>,
): OperationScope {
  const fields = rootFields(operation.selectionSet, fragments);
  const orgScoped = fields.some((field) => !ORG_LESS_FIELDS.has(field));
  const orgLessMutation = fields.some((field) => ORG_LESS_MUTATIONS.has(field));
  if (orgScoped && orgLessMutation) {
    throw validationFailed('Org-less mutations cannot be combined with organization fields');
  }
  return orgScoped ? 'org' : 'org-less';
}
