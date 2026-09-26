import { ClsServiceManager } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import { DbContext } from './db-context.js';

describe('DbContext', () => {
  it('refuses database access outside a request transaction (no fallback connection)', () => {
    const db = new DbContext(ClsServiceManager.getClsService());
    expect(() => db.tx).toThrow(/No request transaction/);
  });

  it('refuses org access for an org-less request with NOT_FOUND', async () => {
    const cls = ClsServiceManager.getClsService();
    const db = new DbContext(cls);
    await cls.run(async () => {
      cls.set('userId', 'u');
      expect(() => db.orgId).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });
  });
});
