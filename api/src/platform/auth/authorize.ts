import { type Capability, type OrgRole, roleCan } from '@taskloom/contracts';
import { forbidden } from '../errors/domain-error.js';

/**
 * Pure authorization over the role matrix (docs/1.2-data-model.md section 2.3).
 * The role was read once per request, so this never touches the database.
 */
export function authorize(role: OrgRole, capability: Capability): void {
  if (!roleCan(role, capability)) throw forbidden();
}
