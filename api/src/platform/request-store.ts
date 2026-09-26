import type { OrgRole } from '@taskloom/contracts';
import type { ClsStore } from 'nestjs-cls';
import type { Prisma } from '../generated/prisma/client.js';
import type { LoaderRegistry } from './loaders/loader-registry.js';

/** The request transaction: every repository query runs through it. */
export type TxClient = Prisma.TransactionClient;

/** Per-request state, held in async-local storage by nestjs-cls. */
export interface RequestStore extends ClsStore {
  userId?: string;
  /** Set only for org-scoped operations, after the caller's active membership is read. */
  orgId?: string;
  role?: OrgRole;
  tx?: TxClient;
  loaders?: LoaderRegistry;
  /** Data statements issued through DbContext in this request (lifecycle statements excluded). */
  statements?: number;
}
