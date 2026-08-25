import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { getAuditRetention, updateAuditRetention } from '../controllers/settings.controller.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    body: {},
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    ...overrides,
  } as unknown as AuthRequest;
}

describe('settings.controller getAuditRetention', () => {
  it('defaults every severity to 0 (keep forever) when no settings rows exist', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getAuditRetention(makeReq(), res as unknown as Response);

      assert.equal(res.status, 200);
      assert.deepEqual((res.body as { retention: unknown }).retention, {
        info: 0,
        warning: 0,
        critical: 0,
      });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
    }
  });

  it('reads configured values back', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'audit.retention_info_days', value: '30' },
      { key: 'audit.retention_warning_days', value: '365' },
      { key: 'audit.retention_critical_days', value: '0' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getAuditRetention(makeReq(), res as unknown as Response);

      assert.deepEqual((res.body as { retention: unknown }).retention, {
        info: 30,
        warning: 365,
        critical: 0,
      });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
    }
  });
});

describe('settings.controller updateAuditRetention', () => {
  it('returns 401 with no authenticated actor', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ user: undefined } as unknown as Partial<AuthRequest>),
      res as unknown as Response,
    );
    assert.equal(res.status, 401);
  });

  it('rejects a negative retention value', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: -1, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects a non-integer retention value', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 1.5, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects an ordering where a less severe level outlives a more severe one', async () => {
    // critical (30) would be pruned before warning (90) — the more severe event disappears
    // first, which is exactly backwards.
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 10, warning: 90, critical: 30 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects infinite info retention paired with finite critical retention', async () => {
    // info=0 (infinite) would outlive a finite critical retention — critical events would be
    // pruned before info ones, which is exactly the disallowed ordering.
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 0, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('accepts 0 (infinite) at the more-severe end of the ordering', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    const originalTransaction = prisma.$transaction;

    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;
    let transactionOps: unknown[] = [];
    prisma.$transaction = (async (ops: unknown[]) => {
      transactionOps = ops;
      return [];
    }) as unknown as typeof prisma.$transaction;

    try {
      // warning/critical=0 (infinite) with a finite, smaller info is a valid ordering: nothing
      // outlives something less severe than itself.
      const res = fakeRes();
      await updateAuditRetention(
        makeReq({ body: { info: 5, warning: 0, critical: 0 } }),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.equal(transactionOps.length, 4, 'expects 3 upserts + 1 audit log write');
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.$transaction = originalTransaction;
    }
  });

  it('writes a critical-severity audit log with before/after values on a valid change', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalAuditCreate = prisma.auditLog.create;

    prisma.systemSetting.findMany = (async () => [
      { key: 'audit.retention_info_days', value: '7' },
      { key: 'audit.retention_warning_days', value: '30' },
      { key: 'audit.retention_critical_days', value: '0' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    // $transaction below faithfully awaits its array (Promise.all) so the audit-log assertions
    // can trust what was actually passed to it — which means every other op in that array needs
    // a real stub too, or Promise.all would touch a real (absent) database.
    prisma.systemSetting.upsert = (async (args: { create: Record<string, unknown> }) => ({
      ...args.create,
      updatedAt: new Date(),
    })) as unknown as typeof prisma.systemSetting.upsert;

    let auditLogged: Record<string, unknown> | undefined;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => {
      auditLogged = args.data;
      return { id: 'audit-1', ...args.data };
    }) as unknown as typeof prisma.auditLog.create;
    prisma.$transaction = (async (ops: unknown[]) =>
      Promise.all(ops)) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      await updateAuditRetention(
        makeReq({ body: { info: 14, warning: 30, critical: 0 } }),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.equal(auditLogged?.action, 'settings.audit_retention_changed');
      assert.equal(auditLogged?.severity, 'critical');
      const metadata = auditLogged?.metadata as { before: unknown; after: unknown };
      assert.deepEqual(metadata.before, { info: 7, warning: 30, critical: 0 });
      assert.deepEqual(metadata.after, { info: 14, warning: 30, critical: 0 });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.$transaction = originalTransaction;
      prisma.auditLog.create = originalAuditCreate;
    }
  });
});
