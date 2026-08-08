import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { register } from '../controllers/auth.controller.js';
import prisma from '../utils/prisma.js';

describe('auth.controller register', () => {
  it('returns 409 when findUnique detects an existing user', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => {
      return {
        id: '1',
        email: 'test@example.com',
        password_hash: 'hashed',
        auth_provider: 'local',
        roleId: 'role-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }) as unknown as typeof prisma.user.findUnique;

    try {
      let statusCode: number | undefined;
      let jsonBody: unknown;

      const req = {
        body: {
          email: 'test@example.com',
          password: 'StrongPassword123!',
        },
      } as Request;

      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: unknown) {
          jsonBody = data;
          return this;
        },
      } as unknown as Response;

      await register(req, res);

      assert.equal(statusCode, 409);
      assert.deepEqual(jsonBody, { error: 'Email sudah terdaftar' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('returns 409 when prisma.user.create throws P2002 unique constraint error (TOCTOU race condition)', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRoleFindUnique = prisma.role.findUnique;
    const originalCreate = prisma.user.create;

    prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;
    prisma.role.findUnique = (async () => ({
      id: 'role-1',
      name: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as unknown as typeof prisma.role.findUnique;
    prisma.user.create = (async () => {
      const error = new Error('Unique constraint failed on the fields: (`email`)') as Error & {
        code?: string;
      };
      error.code = 'P2002';
      throw error;
    }) as unknown as typeof prisma.user.create;

    try {
      let statusCode: number | undefined;
      let jsonBody: unknown;

      const req = {
        body: {
          email: 'race@example.com',
          password: 'StrongPassword123!',
        },
      } as Request;

      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: unknown) {
          jsonBody = data;
          return this;
        },
      } as unknown as Response;

      await register(req, res);

      assert.equal(statusCode, 409);
      assert.deepEqual(jsonBody, { error: 'Email sudah terdaftar' });
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.role.findUnique = originalRoleFindUnique;
      prisma.user.create = originalCreate;
    }
  });
});
