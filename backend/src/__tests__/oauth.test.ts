import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  generateOAuthState,
  createPkcePair,
  setOAuthCookies,
  clearOAuthCookies,
} from '../utils/oauth.js';
import { decryptCookieValue, encryptCookieValue } from '../utils/cookieSecurity.js';
import prisma from '../utils/prisma.js';
import { GOOGLE_OAUTH_SUCCESS_REDIRECT } from '../configs/index.js';
import { googleCallback } from '../controllers/oauth.controller.js';

describe('oauth utility module', () => {
  it('generateOAuthState returns a secure 64-char hex string', () => {
    const state1 = generateOAuthState();
    const state2 = generateOAuthState();

    assert.equal(typeof state1, 'string');
    assert.equal(state1.length, 64);
    assert.notEqual(state1, state2);
  });

  it('createPkcePair returns verifier and challenge base64url strings', () => {
    const { verifier, challenge } = createPkcePair();

    assert.equal(typeof verifier, 'string');
    assert.equal(typeof challenge, 'string');
    assert.ok(verifier.length > 30);
    assert.ok(challenge.length > 30);
    assert.notEqual(verifier, challenge);
  });

  it('setOAuthCookies sets httpOnly short-lived cookies', () => {
    const cookieCalls: Array<{ name: string; val: string; options: Record<string, unknown> }> = [];

    const res = {
      cookie(name: string, val: string, options: Record<string, unknown>) {
        cookieCalls.push({ name, val, options });
        return this;
      },
    } as unknown as Response;

    setOAuthCookies(res, { state: 'state123', verifier: 'verifier123' });

    assert.equal(cookieCalls.length, 2);
    const firstCall = cookieCalls[0]!;
    const secondCall = cookieCalls[1]!;
    assert.equal(firstCall.name, 'oauth_state');
    assert.equal(decryptCookieValue(firstCall.val), 'state123');
    assert.equal(firstCall.options.httpOnly, true);
    assert.equal(secondCall.name, 'oauth_verifier');
    assert.equal(decryptCookieValue(secondCall.val), 'verifier123');
  });

  it('clearOAuthCookies clears temporary oauth cookies', () => {
    const clearCalls: Array<{ name: string; options: Record<string, unknown> }> = [];

    const res = {
      clearCookie(name: string, options: Record<string, unknown>) {
        clearCalls.push({ name, options });
        return this;
      },
    } as unknown as Response;

    clearOAuthCookies(res);

    assert.equal(clearCalls.length, 2);
    const firstClear = clearCalls[0]!;
    const secondClear = clearCalls[1]!;
    assert.equal(firstClear.name, 'oauth_state');
    assert.equal(secondClear.name, 'oauth_verifier');
  });
});

describe('googleCallback P2002 race condition handling', () => {
  it('catches P2002 on user.create, re-fetches winning user row, and issues session successfully', async () => {
    const originalGetToken = OAuth2Client.prototype.getToken;
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    const originalUserFindFirst = prisma.user.findFirst;
    const originalUserFindUnique = prisma.user.findUnique;
    const originalRoleFindUnique = prisma.role.findUnique;
    const originalUserCreate = prisma.user.create;
    const originalRefreshTokenCreate = prisma.refreshToken.create;

    const mockUser = {
      id: 'concurrent-user-1',
      email: 'concurrent@example.com',
      auth_provider: 'google',
      provider_id: 'google-sub-123',
      roleId: 'role-1',
      role: { id: 'role-1', name: 'user' },
    };

    // 1. Initial lookups find no user
    let findFirstCalls = 0;
    prisma.user.findFirst = (async () => {
      findFirstCalls++;
      if (findFirstCalls === 1) return null; // initial lookup
      return mockUser; // re-fetch after P2002
    }) as unknown as typeof prisma.user.findFirst;

    prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;
    prisma.role.findUnique = (async () => ({
      id: 'role-1',
      name: 'user',
    })) as unknown as typeof prisma.role.findUnique;
    prisma.refreshToken.create = (async () => ({
      id: 1,
      userId: 'concurrent-user-1',
      token: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
      isRevoked: false,
      createdAt: new Date(),
    })) as unknown as typeof prisma.refreshToken.create;

    // 2. user.create throws P2002
    prisma.user.create = (async () => {
      const err = new Error('Unique constraint failed') as Error & { code?: string };
      err.code = 'P2002';
      throw err;
    }) as unknown as typeof prisma.user.create;

    // 3. Mock OAuth2Client methods
    OAuth2Client.prototype.getToken = (async () => ({
      tokens: { id_token: 'fake-id-token' },
    })) as unknown as typeof OAuth2Client.prototype.getToken;

    OAuth2Client.prototype.verifyIdToken = (async () => ({
      getPayload: () => ({
        sub: 'google-sub-123',
        email: 'concurrent@example.com',
        email_verified: true,
      }),
    })) as unknown as typeof OAuth2Client.prototype.verifyIdToken;

    try {
      const state = 'valid-state-123';
      const verifier = 'valid-verifier-123';

      const reqMock = {
        query: { code: 'fake-code', state },
        cookies: {
          oauth_state: encryptCookieValue(state),
          oauth_verifier: encryptCookieValue(verifier),
        },
      } as unknown as Request;

      let redirectedUrl = '';
      const resMock = {
        redirect(url: string) {
          redirectedUrl = url;
        },
        cookie() {
          return this;
        },
        clearCookie() {
          return this;
        },
      } as unknown as Response;

      await googleCallback(reqMock, resMock);

      assert.equal(redirectedUrl, GOOGLE_OAUTH_SUCCESS_REDIRECT);
      assert.equal(
        findFirstCalls,
        2,
        'findFirst should be called twice: initial lookup and P2002 fallback',
      );
    } finally {
      OAuth2Client.prototype.getToken = originalGetToken;
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
      prisma.user.findFirst = originalUserFindFirst;
      prisma.user.findUnique = originalUserFindUnique;
      prisma.role.findUnique = originalRoleFindUnique;
      prisma.user.create = originalUserCreate;
      prisma.refreshToken.create = originalRefreshTokenCreate;
    }
  });
});
