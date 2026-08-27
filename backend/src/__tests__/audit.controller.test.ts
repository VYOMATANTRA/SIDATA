import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import {
  listAuditLogs,
  getAuditLogsSummary,
  acknowledgeAuditLogEntry,
} from '../controllers/audit.controller.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    query: {},
    params: {},
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    ...overrides,
  } as unknown as AuthRequest;
}

describe('audit.controller listAuditLogs', () => {
  it('returns paginated logs with default pagination', async () => {
    const originalFindMany = prisma.auditLog.findMany;
    const originalCount = prisma.auditLog.count;

    let findManyArgs: unknown;
    prisma.auditLog.findMany = (async (args: unknown) => {
      findManyArgs = args;
      return [{ id: 'audit-1', action: 'auth.login', severity: 'info' }];
    }) as unknown as typeof prisma.auditLog.findMany;
    prisma.auditLog.count = (async () => 1) as unknown as typeof prisma.auditLog.count;

    try {
      const res = fakeRes();
      await listAuditLogs(makeReq(), res as unknown as Response);

      assert.equal(res.status, 200);
      const body = res.body as { logs: unknown[]; total: number; page: number; pageSize: number };
      assert.equal(body.logs.length, 1);
      assert.equal(body.total, 1);
      assert.equal(body.page, 1);
      assert.equal(body.pageSize, 50);
      assert.deepEqual((findManyArgs as { skip: number; take: number }).skip, 0);
      assert.deepEqual((findManyArgs as { skip: number; take: number }).take, 50);
    } finally {
      prisma.auditLog.findMany = originalFindMany;
      prisma.auditLog.count = originalCount;
    }
  });

  it('caps pageSize at 200 even if a larger value is requested', async () => {
    const originalFindMany = prisma.auditLog.findMany;
    const originalCount = prisma.auditLog.count;

    let findManyArgs: unknown;
    prisma.auditLog.findMany = (async (args: unknown) => {
      findManyArgs = args;
      return [];
    }) as unknown as typeof prisma.auditLog.findMany;
    prisma.auditLog.count = (async () => 0) as unknown as typeof prisma.auditLog.count;

    try {
      const res = fakeRes();
      await listAuditLogs(
        makeReq({ query: { pageSize: '9999' } } as unknown as Partial<AuthRequest>),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.equal((res.body as { pageSize: number }).pageSize, 200);
      assert.equal((findManyArgs as { take: number }).take, 200);
    } finally {
      prisma.auditLog.findMany = originalFindMany;
      prisma.auditLog.count = originalCount;
    }
  });

  it('translates severity/acknowledged query params into the where clause', async () => {
    const originalFindMany = prisma.auditLog.findMany;
    const originalCount = prisma.auditLog.count;

    let whereArg: unknown;
    prisma.auditLog.findMany = (async (args: { where: unknown }) => {
      whereArg = args.where;
      return [];
    }) as unknown as typeof prisma.auditLog.findMany;
    prisma.auditLog.count = (async () => 0) as unknown as typeof prisma.auditLog.count;

    try {
      const res = fakeRes();
      await listAuditLogs(
        makeReq({
          query: { severity: 'critical', acknowledged: 'false' },
        } as unknown as Partial<AuthRequest>),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.deepEqual(whereArg, { severity: 'critical', acknowledgedAt: null });
    } finally {
      prisma.auditLog.findMany = originalFindMany;
      prisma.auditLog.count = originalCount;
    }
  });

  it('ignores an invalid severity value rather than erroring', async () => {
    const originalFindMany = prisma.auditLog.findMany;
    const originalCount = prisma.auditLog.count;

    let whereArg: unknown;
    prisma.auditLog.findMany = (async (args: { where: unknown }) => {
      whereArg = args.where;
      return [];
    }) as unknown as typeof prisma.auditLog.findMany;
    prisma.auditLog.count = (async () => 0) as unknown as typeof prisma.auditLog.count;

    try {
      const res = fakeRes();
      await listAuditLogs(
        makeReq({ query: { severity: 'not-a-real-severity' } } as unknown as Partial<AuthRequest>),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.deepEqual(whereArg, {});
    } finally {
      prisma.auditLog.findMany = originalFindMany;
      prisma.auditLog.count = originalCount;
    }
  });
});

describe('audit.controller getAuditLogsSummary', () => {
  it('returns per-severity counts and the open-critical count', async () => {
    const originalGroupBy = prisma.auditLog.groupBy;
    const originalCount = prisma.auditLog.count;

    prisma.auditLog.groupBy = (async () => [
      { severity: 'info', _count: { _all: 10 } },
      { severity: 'warning', _count: { _all: 3 } },
      { severity: 'critical', _count: { _all: 2 } },
    ]) as unknown as typeof prisma.auditLog.groupBy;
    prisma.auditLog.count = (async () => 1) as unknown as typeof prisma.auditLog.count;

    try {
      const res = fakeRes();
      await getAuditLogsSummary(makeReq(), res as unknown as Response);

      assert.equal(res.status, 200);
      assert.deepEqual((res.body as { counts: unknown }).counts, {
        info: 10,
        warning: 3,
        critical: 2,
      });
      assert.equal((res.body as { openCritical: number }).openCritical, 1);
    } finally {
      prisma.auditLog.groupBy = originalGroupBy;
      prisma.auditLog.count = originalCount;
    }
  });
});

describe('audit.controller acknowledgeAuditLogEntry', () => {
  it('returns 401 when the request has no authenticated actor', async () => {
    const res = fakeRes();
    await acknowledgeAuditLogEntry(
      makeReq({ user: undefined, params: { id: 'audit-1' } } as unknown as Partial<AuthRequest>),
      res as unknown as Response,
    );
    assert.equal(res.status, 401);
  });

  it('returns 404 when the audit log does not exist', async () => {
    const originalFindUnique = prisma.auditLog.findUnique;
    prisma.auditLog.findUnique = (async () => null) as unknown as typeof prisma.auditLog.findUnique;

    try {
      const res = fakeRes();
      await acknowledgeAuditLogEntry(
        makeReq({ params: { id: 'missing' } } as unknown as Partial<AuthRequest>),
        res as unknown as Response,
      );
      assert.equal(res.status, 404);
    } finally {
      prisma.auditLog.findUnique = originalFindUnique;
    }
  });

  it('returns 400 when the log is not a critical-severity row', async () => {
    const originalFindUnique = prisma.auditLog.findUnique;
    prisma.auditLog.findUnique = (async () => ({
      id: 'audit-1',
      severity: 'info',
      acknowledgedAt: null,
    })) as unknown as typeof prisma.auditLog.findUnique;

    try {
      const res = fakeRes();
      await acknowledgeAuditLogEntry(
        makeReq({ params: { id: 'audit-1' } } as unknown as Partial<AuthRequest>),
        res as unknown as Response,
      );
      assert.equal(res.status, 400);
    } finally {
      prisma.auditLog.findUnique = originalFindUnique;
    }
  });

  it('returns 400 when the log was already acknowledged', async () => {
    const originalFindUnique = prisma.auditLog.findUnique;
    prisma.auditLog.findUnique = (async () => ({
      id: 'audit-1',
      severity: 'critical',
      acknowledgedAt: new Date(),
    })) as unknown as typeof prisma.auditLog.findUnique;

    try {
      const res = fakeRes();
      await acknowledgeAuditLogEntry(
        makeReq({ params: { id: 'audit-1' } } as unknown as Partial<AuthRequest>),
        res as unknown as Response,
      );
      assert.equal(res.status, 400);
    } finally {
      prisma.auditLog.findUnique = originalFindUnique;
    }
  });

  it('acknowledges an open critical row and stamps the acting admin', async () => {
    const originalFindUnique = prisma.auditLog.findUnique;
    const originalUpdate = prisma.auditLog.update;

    prisma.auditLog.findUnique = (async () => ({
      id: 'audit-1',
      severity: 'critical',
      acknowledgedAt: null,
    })) as unknown as typeof prisma.auditLog.findUnique;

    let updateArgs: unknown;
    prisma.auditLog.update = (async (args: unknown) => {
      updateArgs = args;
      return { id: 'audit-1', severity: 'critical', acknowledgedById: 'admin-1' };
    }) as unknown as typeof prisma.auditLog.update;

    try {
      const res = fakeRes();
      await acknowledgeAuditLogEntry(
        makeReq({ params: { id: 'audit-1' } } as unknown as Partial<AuthRequest>),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      const args = updateArgs as { where: { id: string }; data: { acknowledgedById: string } };
      assert.equal(args.where.id, 'audit-1');
      assert.equal(args.data.acknowledgedById, 'admin-1');
    } finally {
      prisma.auditLog.findUnique = originalFindUnique;
      prisma.auditLog.update = originalUpdate;
    }
  });
});
