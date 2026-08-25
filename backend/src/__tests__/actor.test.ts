import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractRequestActor } from '../utils/actor.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';

describe('extractRequestActor', () => {
  it('extracts id/email/role when req.user is a well-formed decoded token', () => {
    const req = {
      user: { id: 'user-1', email: 'user@example.com', role: 'admin' },
    } as unknown as AuthRequest;

    assert.deepEqual(extractRequestActor(req), {
      id: 'user-1',
      email: 'user@example.com',
      role: 'admin',
    });
  });

  it('returns null when req.user is undefined (unauthenticated request)', () => {
    const req = {} as unknown as AuthRequest;
    assert.equal(extractRequestActor(req), null);
  });

  it('returns null when req.user is not an object', () => {
    const req = { user: 'not-an-object' } as unknown as AuthRequest;
    assert.equal(extractRequestActor(req), null);
  });

  it('returns null when req.user has no string id', () => {
    const req = { user: { email: 'user@example.com', role: 'user' } } as unknown as AuthRequest;
    assert.equal(extractRequestActor(req), null);
  });

  it('defaults email/role to null when absent, without discarding a valid id', () => {
    const req = { user: { id: 'user-1' } } as unknown as AuthRequest;
    assert.deepEqual(extractRequestActor(req), { id: 'user-1', email: null, role: null });
  });
});
