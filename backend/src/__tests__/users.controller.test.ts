import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import {
  getUsers,
  createUser,
  updateUserRole,
  deleteUser,
} from '../controllers/users.controller.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

const STRONG_PASSWORD = 'Xk9$mQp2vNz7Lw4!';

describe('users.controller', () => {
  it('getUsers returns only active users', async () => {
    const originalFindMany = prisma.user.findMany;
    prisma.user.findMany = (async () => {
      return [
        {
          id: 'user-1',
          email: 'user1@example.com',
          auth_provider: 'local',
          email_verified: true,
          requires_password_change: false,
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
      const body = res.body as { users: Array<{ email: string }> };
      assert.ok(body.users && body.users[0]);
      assert.equal(body.users.length, 1);
      assert.equal(body.users[0].email, 'user1@example.com');
    } finally {
      prisma.user.findMany = originalFindMany;
    }
  });

  it('createUser reactivates a soft-deleted Google-linked user and resets auth_provider to local', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFind = prisma.role.findUnique;
    const originalUpdate = prisma.user.update;

    prisma.role.findUnique = (async () => ({
      id: 'role-editor',
      name: 'editor',
    })) as unknown as typeof prisma.role.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'deleted-google-user-id',
      email: 'googleuser@example.com',
      auth_provider: 'google',
      provider_id: 'google-sub-123',
      deletedAt: new Date(),
    })) as unknown as typeof prisma.user.findUnique;

    let updatedData: {
      deletedAt?: Date | null;
      requires_password_change?: boolean;
      auth_provider?: string;
      provider_id?: string | null;
    } = {};
    prisma.user.update = (async (args: { data: Record<string, unknown> }) => {
      updatedData = args.data as typeof updatedData;
      return {
        id: 'deleted-google-user-id',
        email: 'googleuser@example.com',
        auth_provider: 'local',
        email_verified: true,
        requires_password_change: true,
        role: { id: 'role-editor', name: 'editor' },
        createdAt: new Date(),
      };
    }) as unknown as typeof prisma.user.update;

    try {
      const req = {
        body: {
          email: 'googleuser@example.com',
          roleId: 'role-editor',
          password: STRONG_PASSWORD,
        },
      } as AuthRequest;

      const res = fakeRes();
      await createUser(req, res as unknown as Response);

      assert.equal(res.status, 201);
      assert.equal(updatedData.deletedAt, null);
      assert.equal(updatedData.requires_password_change, true);
      assert.equal(updatedData.auth_provider, 'local');
      assert.equal(updatedData.provider_id, null);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
      prisma.user.update = originalUpdate;
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
      assert.deepEqual(res.body, { error: 'Email sudah terdaftar.' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
      prisma.user.create = originalCreate;
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
    assert.deepEqual(res.body, { error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
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
      assert.deepEqual(res.body, { error: 'Admin tidak dapat menghapus sesama akun Admin.' });
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
