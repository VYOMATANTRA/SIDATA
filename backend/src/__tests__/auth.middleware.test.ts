import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { verifyToken, type AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';
import { JWT_SECRET } from '../configs/index.js';

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
  it('rejects a request with no Authorization header', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    verifyToken(req(), res, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Akses ditolak.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects a header that does not start with "Bearer "', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    verifyToken(req({ authorization: 'Basic abc123' }), res, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Akses ditolak.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects "Bearer " with no token following it', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();

    verifyToken(req({ authorization: 'Bearer ' }), res, next);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Format token tidak valid.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects a token signed with the wrong secret', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();
    const badToken = jwt.sign({ id: 'user-1' }, 'not-the-real-secret');

    verifyToken(req({ authorization: `Bearer ${badToken}` }), res, next);

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Token tidak valid atau sudah kedaluwarsa.' });
    assert.equal(spy.calls, 0);
  });

  it('rejects an expired token', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();
    const expiredToken = jwt.sign({ id: 'user-1' }, JWT_SECRET, { expiresIn: -1 });

    verifyToken(req({ authorization: `Bearer ${expiredToken}` }), res, next);

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Token tidak valid atau sudah kedaluwarsa.' });
    assert.equal(spy.calls, 0);
  });

  it('accepts a valid token, populates req.user, and calls next() exactly once', () => {
    const res = fakeRes();
    const { next, spy } = nextSpy();
    const validToken = jwt.sign({ id: 'user-1', email: 'user@example.com' }, JWT_SECRET);
    const request = req({ authorization: `Bearer ${validToken}` });

    verifyToken(request, res, next);

    assert.equal(spy.calls, 1);
    assert.notEqual(
      typeof res.status,
      'number',
      'the middleware itself must not write a status response',
    );
    assert.equal((request.user as jwt.JwtPayload).id, 'user-1');
    assert.equal((request.user as jwt.JwtPayload).email, 'user@example.com');
  });
});
