import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { verifyToken, type AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';
import { JWT_SECRET } from '../configs/index.js';
import prisma from '../utils/prisma.js';

function req(headers: Record<string, string | undefined> = {}): AuthRequest {
  return { headers } as unknown as AuthRequest;
}

function nextSpy() {
  const spy = { calls: 0 };
  const next = () => {
    spy.calls++;
  };
  return { next, spy };
}

describe('auth.middleware verifyToken', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    await verifyToken(req(), res, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Akses ditolak.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects a header that does not start with "Bearer "', async () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    await verifyToken(req({ authorization: 'Basic abc123' }), res, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Akses ditolak.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects "Bearer " with no token following it', async () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    await verifyToken(req({ authorization: 'Bearer ' }), res, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Format token tidak valid.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();
    const badToken = jwt.sign({ id: 'user-1' }, 'not-the-real-secret');

    await verifyToken(req({ authorization: `Bearer ${badToken}` }), res, next);

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Token tidak valid atau sudah kedaluwarsa.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects an expired token', async () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();
    const expiredToken = jwt.sign({ id: 'user-1' }, JWT_SECRET, { expiresIn: -1 });

    await verifyToken(req({ authorization: `Bearer ${expiredToken}` }), res, next);

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Token tidak valid atau sudah kedaluwarsa.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects a first_login_only setup token', async () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();
    const setupToken = jwt.sign({ id: 'user-1', scope: 'first_login_only' }, JWT_SECRET);

    await verifyToken(req({ authorization: `Bearer ${setupToken}` }), res, next);

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, {
      error:
        'Token setup tidak dapat digunakan untuk mengakses endpoint ini. Silakan selesaikan pembuatan kata sandi terlebih dahulu.',
    });
    assert.equal(spy.calls, 0);
  });

  it('rejects with 401 when the user no longer exists in DB or is soft-deleted', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'deleted-user-id',
      email: 'deleted@example.com',
      deletedAt: new Date(),
      role: { name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const res = fakeRes();
      const { next, spy } = nextSpy();
      const validToken = jwt.sign(
        { id: 'deleted-user-id', email: 'deleted@example.com' },
        JWT_SECRET,
      );
      const request = req({ authorization: `Bearer ${validToken}` });

      await verifyToken(request, res, next);

      assert.equal(res.status, 401);
      assert.deepEqual(res.body, {
        error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.',
      });
      assert.equal(spy.calls, 0);
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });

  it('accepts a valid token for an active user, populates req.user from DB, and calls next()', async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => ({
      id: 'active-user-id',
      email: 'user@example.com',
      deletedAt: null,
      role: { name: 'user' },
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const res = fakeRes();
      const { next, spy } = nextSpy();
      const validToken = jwt.sign({ id: 'active-user-id', email: 'user@example.com' }, JWT_SECRET);
      const request = req({ authorization: `Bearer ${validToken}` });

      await verifyToken(request, res, next);

      assert.equal(spy.calls, 1);
      assert.notEqual(
        typeof res.status,
        'number',
        'the middleware itself must not write a status response',
      );
      assert.equal((request.user as { id: string }).id, 'active-user-id');
      assert.equal((request.user as { email: string }).email, 'user@example.com');
      assert.equal((request.user as { role: string }).role, 'user');
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });
});
