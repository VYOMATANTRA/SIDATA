import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import {
  getUsers,
  createUser,
  reactivateUser,
  updateUserRole,
  deleteUser,
} from '../controllers/users.controller.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

const STRONG_PASSWORD = 'Xk9$mQp2vNz7Lw4!';

describe('users.controller', () => {
  it('getUsers returns all users including deletedAt status', async () => {
    const originalFindMany = prisma.user.findMany;
    prisma.user.findMany = (async () => {
      return [
        {
          id: 'user-1',
          email: 'user1@example.com',
          auth_provider: 'local',
          email_verified: true,
          requires_password_change: false,
          deletedAt: null,
          roleId: 'role-user',
          role: { id: 'role-user', name: 'user' },
          createdAt: new Date(),
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          auth_provider: 'local',
          email_verified: true,
          requires_password_change: false,
          deletedAt: new Date(),
          roleId: 'role-user',
          role: { id: 'role-user', name: 'user' },
          createdAt: new Date(),
        },
      ];
    }) as unknown as typeof prisma.user.findMany;

    try {
      const res = fakeRes();
      await getUsers({} as AuthRequest, res as unknown as Response);

      assert.equal(res.status, 200);
      const body = res.body as { users: Array<{ email: string; deletedAt: Date | null }> };
      assert.ok(body.users);
      assert.equal(body.users.length, 2);
      assert.equal(body.users[0]?.email, 'user1@example.com');
      assert.equal(body.users[0]?.deletedAt, null);
      assert.equal(body.users[1]?.email, 'user2@example.com');
      assert.notEqual(body.users[1]?.deletedAt, null);
    } finally {
      prisma.user.findMany = originalFindMany;
    }
  });

  it('createUser rejects with 409 if email already exists', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFind = prisma.role.findUnique;

    prisma.role.findUnique = (async () => ({
      id: 'role-editor',
      name: 'editor',
    })) as unknown as typeof prisma.role.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'existing-user-id',
      email: 'existing@example.com',
      auth_provider: 'local',
      deletedAt: null,
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const req = {
        body: {
          email: 'existing@example.com',
          roleId: 'role-editor',
          password: STRONG_PASSWORD,
        },
      } as AuthRequest;

      const res = fakeRes();
      await createUser(req, res as unknown as Response);

      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { error: 'Email ini sudah dipakai' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
    }
  });

  it('createUser catches Prisma P2002 race condition and returns 409', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFind = prisma.role.findUnique;
    const originalCreate = prisma.user.create;

    prisma.role.findUnique = (async () => ({
      id: 'role-1',
      name: 'user',
    })) as unknown as typeof prisma.role.findUnique;
    prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;

    prisma.user.create = (async () => {
      const err = new Error('Unique constraint violation') as Error & { code?: string };
      err.code = 'P2002';
      throw err;
    }) as unknown as typeof prisma.user.create;

    try {
      const req = {
        body: {
          email: 'duplicate@example.com',
          roleId: 'role-1',
          password: STRONG_PASSWORD,
        },
      } as AuthRequest;

      const res = fakeRes();
      await createUser(req, res as unknown as Response);

      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { error: 'Email ini sudah dipakai' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
      prisma.user.create = originalCreate;
    }
  });

  it('reactivateUser returns 404 when user is not found', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;

    try {
      const req = {
        params: { id: 'non-existent-user' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await reactivateUser(req, res as unknown as Response);

      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: 'Pengguna tidak ditemukan.' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('reactivateUser returns 400 when user is already active', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'active-user',
      email: 'active@example.com',
      deletedAt: null,
      role: { name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const req = {
        params: { id: 'active-user' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await reactivateUser(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: 'Pengguna sudah dalam status aktif.' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('reactivateUser successfully clears deletedAt and reactivates account', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalUpdate = prisma.user.update;

    prisma.user.findUnique = (async () => ({
      id: 'deactivated-user',
      email: 'deactivated@example.com',
      deletedAt: new Date(),
      role: { name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    let updatedPayload: { deletedAt?: Date | null } = {};
    prisma.user.update = (async (args: { data: { deletedAt: Date | null } }) => {
      updatedPayload = args.data;
      return {
        id: 'deactivated-user',
        email: 'deactivated@example.com',
        auth_provider: 'local',
        email_verified: true,
        requires_password_change: false,
        deletedAt: null,
        roleId: 'role-user',
        role: { id: 'role-user', name: 'user' },
        createdAt: new Date(),
      };
    }) as unknown as typeof prisma.user.update;

    try {
      const req = {
        params: { id: 'deactivated-user' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await reactivateUser(req, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.equal(updatedPayload.deletedAt, null);
      assert.deepEqual(res.body, {
        message: 'Pengguna berhasil diaktifkan kembali.',
        user: {
          id: 'deactivated-user',
          email: 'deactivated@example.com',
          auth_provider: 'local',
          email_verified: true,
          requires_password_change: false,
          deletedAt: null,
          roleId: 'role-user',
          role: { id: 'role-user', name: 'user' },
          createdAt: (res.body as { user: { createdAt: Date } }).user.createdAt,
        },
      });
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.user.update = originalUpdate;
    }
  });

  it('updateUserRole prevents self-demotion of admin', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFind = prisma.role.findUnique;

    prisma.user.findUnique = (async () => ({
      id: 'admin-1',
      email: 'admin@example.com',
      deletedAt: null,
      role: { id: 'role-admin', name: 'admin' },
    })) as unknown as typeof prisma.user.findUnique;

    prisma.role.findUnique = (async () => ({
      id: 'role-user',
      name: 'user',
    })) as unknown as typeof prisma.role.findUnique;

    try {
      const req = {
        params: { id: 'admin-1' },
        body: { roleId: 'role-user' },
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await updateUserRole(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, {
        error: 'Anda tidak dapat menurunkan role akun Anda sendiri.',
      });
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
    }
  });

  it('updateUserRole prevents demoting the last active admin', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFind = prisma.role.findUnique;
    const originalCount = prisma.user.count;

    prisma.user.findUnique = (async () => ({
      id: 'admin-2',
      email: 'admin2@example.com',
      deletedAt: null,
      role: { id: 'role-admin', name: 'admin' },
    })) as unknown as typeof prisma.user.findUnique;

    prisma.role.findUnique = (async () => ({
      id: 'role-user',
      name: 'user',
    })) as unknown as typeof prisma.role.findUnique;

    prisma.user.count = (async () => 1) as unknown as typeof prisma.user.count;

    try {
      const req = {
        params: { id: 'admin-2' },
        body: { roleId: 'role-user' },
        user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await updateUserRole(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: 'Tidak dapat mengubah role Admin terakhir.' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
      prisma.user.count = originalCount;
    }
  });

  it('updateUserRole updates role and revokes refresh tokens in transaction', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFind = prisma.role.findUnique;
    const originalTransaction = prisma.$transaction;

    prisma.user.findUnique = (async () => ({
      id: 'user-1',
      email: 'user1@example.com',
      deletedAt: null,
      role: { id: 'role-user', name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    prisma.role.findUnique = (async () => ({
      id: 'role-admin',
      name: 'admin',
    })) as unknown as typeof prisma.role.findUnique;

    let transactionCalled = false;
    prisma.$transaction = (async () => {
      transactionCalled = true;
      return [
        {
          id: 'user-1',
          email: 'user1@example.com',
          auth_provider: 'local',
          deletedAt: null,
          role: { id: 'role-admin', name: 'admin' },
        },
        { count: 1 },
      ];
    }) as unknown as typeof prisma.$transaction;

    try {
      const req = {
        params: { id: 'user-1' },
        body: { roleId: 'role-admin' },
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await updateUserRole(req, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.equal(transactionCalled, true);
      assert.equal((res.body as { message: string }).message, 'Role pengguna berhasil diperbarui.');
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
      prisma.$transaction = originalTransaction;
    }
  });

  it('deleteUser prevents self deletion', async () => {
    const req = {
      params: { id: 'admin-1' },
      user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    } as unknown as AuthRequest;

    const res = fakeRes();
    await deleteUser(req, res as unknown as Response);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
  });

  it('deleteUser prevents deleting an Admin account', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'admin-2',
      email: 'admin2@example.com',
      deletedAt: null,
      role: { name: 'admin' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const req = {
        params: { id: 'admin-2' },
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await deleteUser(req, res as unknown as Response);

      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'Admin tidak dapat menonaktifkan sesama akun Admin.' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('deleteUser returns 400 when user is already deactivated', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'user-already-deleted',
      email: 'deleted@example.com',
      deletedAt: new Date(),
      role: { name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const req = {
        params: { id: 'user-already-deleted' },
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await deleteUser(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: 'Pengguna sudah dalam status nonaktif.' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('deleteUser soft deletes non-admin user and revokes refresh tokens', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalTransaction = prisma.$transaction;

    prisma.user.findUnique = (async () => ({
      id: 'user-2',
      email: 'user2@example.com',
      deletedAt: null,
      role: { name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    let transactionCalled = false;
    prisma.$transaction = (async () => {
      transactionCalled = true;
      return [];
    }) as unknown as typeof prisma.$transaction;

    try {
      const req = {
        params: { id: 'user-2' },
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      } as unknown as AuthRequest;

      const res = fakeRes();
      await deleteUser(req, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.equal(transactionCalled, true);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.$transaction = originalTransaction;
    }
  });
});
