import { Injectable } from '@nestjs/common';
import { Capability, type OrgRole } from '@taskloom/contracts';
import { ClsService } from 'nestjs-cls';
import { authorize } from '../auth/authorize.js';
import { notFound } from '../errors/domain-error.js';
import type { LoaderRegistry } from '../loaders/loader-registry.js';
import type { RequestStore, TxClient } from '../request-store.js';

/**
 * The request's database context. Repositories inject this, never PrismaService.
 * Reading `tx` outside a request transaction throws: there is no fallback connection.
 */
@Injectable()
export class DbContext {
  constructor(private readonly cls: ClsService<RequestStore>) {}

  get tx(): TxClient {
    const tx = this.cls.isActive() ? this.cls.get('tx') : undefined;
    if (!tx)
      throw new Error('No request transaction: database access outside the request lifecycle');
    return countingProxy(tx, () =>
      this.cls.set('statements', (this.cls.get('statements') ?? 0) + 1),
    );
  }

  get userId(): string {
    const userId = this.cls.get('userId');
    if (!userId) throw new Error('No authenticated user in the request context');
    return userId;
  }

  /** The selected org. Throws NOT_FOUND for org-less operations. */
  get orgId(): string {
    const orgId = this.cls.get('orgId');
    if (!orgId) throw notFound('organization');
    return orgId;
  }

  get role(): OrgRole {
    const role = this.cls.get('role');
    if (!role) throw notFound('organization');
    return role;
  }

  get loaders(): LoaderRegistry {
    const loaders = this.cls.get('loaders');
    if (!loaders) throw new Error('No request loaders: outside the request lifecycle');
    return loaders;
  }

  /** True when the caller is an active owner or admin of the selected org. */
  get isOrgManager(): boolean {
    const role = this.cls.get('role');
    return role === 'owner' || role === 'admin';
  }

  /** Throws FORBIDDEN unless the caller's role in the selected org grants the capability. */
  require(capability: Capability): void {
    authorize(this.role, capability);
  }
}

const RAW_OPERATIONS = new Set(['$queryRaw', '$executeRaw']);

/**
 * Counts every statement a resolver issues: raw queries and model operations. The count is
 * logged per request and bounds the board and summary in tests (N+1 regressions show up).
 */
function countingProxy(tx: TxClient, count: () => void): TxClient {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop === 'string' && RAW_OPERATIONS.has(prop) && typeof value === 'function') {
        return (...args: unknown[]) => {
          count();
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (typeof prop === 'string' && !prop.startsWith('$') && value && typeof value === 'object') {
        return new Proxy(value, {
          get(delegate, operation, delegateReceiver) {
            const fn = Reflect.get(delegate, operation, delegateReceiver) as unknown;
            if (typeof fn !== 'function') return fn;
            return (...args: unknown[]) => {
              count();
              return (fn as (...a: unknown[]) => unknown).apply(delegate, args);
            };
          },
        });
      }
      return value;
    },
  });
}
