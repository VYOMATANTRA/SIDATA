import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../configs/index.js';

describe('generateAccessToken', () => {
  it('signs a token carrying id/email/role', () => {
    const token = generateAccessToken({ id: 'user-1', email: 'user@example.com', role: 'user' });
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };

    assert.equal(payload.id, 'user-1');
    assert.equal(payload.email, 'user@example.com');
    assert.equal(payload.role, 'user');
  });
});

describe('generateRefreshToken', () => {
  it('signs a token carrying the user id', () => {
    const token = generateRefreshToken('user-1');
    const payload = jwt.verify(token, JWT_REFRESH_SECRET) as { id: string; jti: string };

    assert.equal(payload.id, 'user-1');
    assert.equal(typeof payload.jti, 'string');
    assert.ok(payload.jti.length > 0);
  });

  it('REGRESSION (session.ts issueSession P2002 race): two tokens issued for the same user in the same second are distinct', () => {
    // Before jti was added, the payload was just {id} with second-granularity iat/exp, so
    // two refresh tokens minted for the same user inside the same wall-clock second were
    // byte-identical and collided against the refresh_tokens.token UNIQUE constraint.
    const tokenA = generateRefreshToken('user-1');
    const tokenB = generateRefreshToken('user-1');

    assert.notEqual(tokenA, tokenB);
  });
});
