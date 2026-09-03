import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { requireAdmin } from '../middlewares/role.middleware.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

function nextSpy() {
  const spy = { calls: 0 };
  const next = () => {
    spy.calls++;
  };
  return { next, spy };
}

describe('role.middleware requireAdmin', () => {
  it('rejects with 401 when req.user is missing', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    requireAdmin({} as AuthRequest, res as unknown as Response, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects with 401 when req.user is a string or has no role property', () => {
    const res1 = fakeRes();
    const { next: next1, spy: spy1 } = nextSpy();
    requireAdmin({ user: 'invalid' } as unknown as AuthRequest, res1 as unknown as Response, next1);
    assert.equal(res1.status, 401);
    assert.equal(spy1.calls, 0);

    const res2 = fakeRes();
    const { next: next2, spy: spy2 } = nextSpy();
    requireAdmin(
      { user: { id: 'user-1' } } as unknown as AuthRequest,
      res2 as unknown as Response,
      next2,
    );
    assert.equal(res2.status, 401);
    assert.equal(spy2.calls, 0);
  });

  it('rejects with 403 when req.user role is not Admin (e.g. user or editor)', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();
    const req = {
      user: { id: 'user-1', email: 'user@example.com', role: 'user' },
    } as unknown as AuthRequest;

    requireAdmin(req, res as unknown as Response, next);

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Akses ditolak. Membutuhkan hak akses Admin.' });
    assert.equal(spy.calls, 0);
  });

  it('calls next() when req.user role is Admin (case-insensitive)', () => {
    const res1 = fakeRes();
    const { next: next1, spy: spy1 } = nextSpy();
    const req1 = {
      user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    } as unknown as AuthRequest;

    requireAdmin(req1, res1 as unknown as Response, next1);
    assert.equal(spy1.calls, 1);
    assert.notEqual(typeof res1.status, 'number');

    const res2 = fakeRes();
    const { next: next2, spy: spy2 } = nextSpy();
    const req2 = {
      user: { id: 'admin-2', email: 'admin2@example.com', role: 'Admin' },
    } as unknown as AuthRequest;

    requireAdmin(req2, res2 as unknown as Response, next2);
    assert.equal(spy2.calls, 1);
    assert.notEqual(typeof res2.status, 'number');
  });
});
