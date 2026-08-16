import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { requireAdmin } from '../middlewares/role.middleware.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';
import prisma from '../utils/prisma.js';

function nextSpy() {
  const spy = { calls: 0 };
  const next = () => {
    spy.calls++;
  };
  return { next, spy };
}

describe('role.middleware requireAdmin', () => {
  it('rejects with 401 when req.user is missing or invalid', async () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    await requireAdmin({} as AuthRequest, res as unknown as Response, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects with 401 when user is not found in DB or is soft-deleted', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'deleted-admin-id',
      email: 'deletedadmin@example.com',
      deletedAt: new Date(),
      role: { name: 'admin' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const res = fakeRes();
      const { next, spy } = nextSpy();
      const req = {
        user: { id: 'deleted-admin-id', email: 'deletedadmin@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      await requireAdmin(req, res as unknown as Response, next);

      assert.equal(res.status, 401);
      assert.deepEqual(res.body, {
        error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.',
      });
      assert.equal(spy.calls, 0);
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('rejects with 403 when user exists in DB but role is not Admin', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'demoted-user-id',
      email: 'user@example.com',
      deletedAt: null,
      role: { name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const res = fakeRes();
      const { next, spy } = nextSpy();
      const req = {
        user: { id: 'demoted-user-id', email: 'user@example.com', role: 'admin' }, // Stale JWT claim
      } as unknown as AuthRequest;

      await requireAdmin(req, res as unknown as Response, next);

      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'Akses ditolak. Membutuhkan hak akses Admin.' });
      assert.equal(spy.calls, 0);
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('calls next() when user exists in DB, is active, and has Admin role', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'active-admin-id',
      email: 'admin@example.com',
      deletedAt: null,
      role: { name: 'admin' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const res = fakeRes();
      const { next, spy } = nextSpy();
      const req = {
        user: { id: 'active-admin-id', email: 'admin@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      await requireAdmin(req, res as unknown as Response, next);

      assert.equal(spy.calls, 1);
      assert.notEqual(typeof res.status, 'number');
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });
});
