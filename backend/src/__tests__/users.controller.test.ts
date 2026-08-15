import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { getUsers, createUser, deleteUser } from '../controllers/users.controller.js';
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
      assert.equal((res.body as { users: Array<{ email: string }> }).users.length, 1);
      assert.equal(
        (res.body as { users: Array<{ email: string }> }).users[0].email,
        'user1@example.com',
      );
    } finally {
      prisma.user.findMany = originalFindMany;
    }
  });

  it('createUser reactivates a soft-deleted user', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFind = prisma.role.findUnique;
    const originalUpdate = prisma.user.update;

    prisma.role.findUnique = (async () => ({
      id: 'role-editor',
      name: 'editor',
    })) as unknown as typeof prisma.role.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'deleted-user-id',
      email: 'deleted@example.com',
      deletedAt: new Date(),
    })) as unknown as typeof prisma.user.findUnique;

    let updatedData: { deletedAt?: Date | null; requires_password_change?: boolean } = {};
    prisma.user.update = (async (args: { data: Record<string, unknown> }) => {
      updatedData = args.data as typeof updatedData;
      return {
        id: 'deleted-user-id',
        email: 'deleted@example.com',
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
          email: 'deleted@example.com',
          roleId: 'role-editor',
          password: STRONG_PASSWORD,
        },
      } as AuthRequest;

      const res = fakeRes();
      await createUser(req, res as unknown as Response);

      assert.equal(res.status, 201);
      assert.equal(updatedData.deletedAt, null);
      assert.equal(updatedData.requires_password_change, true);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFind;
      prisma.user.update = originalUpdate;
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
