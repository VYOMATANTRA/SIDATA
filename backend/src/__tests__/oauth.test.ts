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
import {
  GOOGLE_OAUTH_SUCCESS_REDIRECT,
  OAUTH_STATE_TTL_SECONDS,
  OAUTH_PKCE_TTL_SECONDS,
} from '../configs/index.js';
import { googleLogin, googleCallback } from '../controllers/oauth.controller.js';

interface MockRedirectRes {
  res: Response;
  redirectedUrl: () => string;
  clearedCookieNames: () => string[];
  cookieCalls: () => Array<{ name: string; val: string }>;
}

function mockRedirectRes(): MockRedirectRes {
  let redirectedUrl = '';
  const clearedCookieNames: string[] = [];
  const cookieCalls: Array<{ name: string; val: string }> = [];

  const res = {
    redirect(url: string) {
      redirectedUrl = url;
    },
    cookie(name: string, val: string) {
      cookieCalls.push({ name, val });
      return this;
    },
    clearCookie(name: string) {
      clearedCookieNames.push(name);
      return this;
    },
  } as unknown as Response;

  return {
    res,
    redirectedUrl: () => redirectedUrl,
    clearedCookieNames: () => clearedCookieNames,
    cookieCalls: () => cookieCalls,
  };
}

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
    assert.equal(firstCall.options.maxAge, OAUTH_STATE_TTL_SECONDS * 1000);
    assert.equal(secondCall.name, 'oauth_verifier');
    assert.equal(decryptCookieValue(secondCall.val), 'verifier123');
    assert.equal(secondCall.options.maxAge, OAUTH_PKCE_TTL_SECONDS * 1000);
  });

  it('setOAuthCookies never sets a Domain option, keeping the cookies host-only', () => {
    // REGRESSION GUARD: an explicit `domain` here would narrow these cookies away from their
    // current host-only scope, which is what lets the state cookie set via the frontend's dev
    // proxy (localhost:5173) still reach the callback hit directly on the backend's raw origin
    // (localhost:3000) — cookie scoping ignores port, but a `domain` option can still break
    // cross-hostname deployments if set incorrectly. See the comment above setOAuthCookies.
    const cookieCalls: Array<{ options: Record<string, unknown> }> = [];
    const res = {
      cookie(_name: string, _val: string, options: Record<string, unknown>) {
        cookieCalls.push({ options });
        return this;
      },
    } as unknown as Response;

    setOAuthCookies(res, { state: 'state123', verifier: 'verifier123' });

    for (const call of cookieCalls) {
      assert.equal('domain' in call.options, false);
    }
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

function validOAuthCookies(state: string, verifier: string) {
  return {
    oauth_state: encryptCookieValue(state),
    oauth_verifier: encryptCookieValue(verifier),
  };
}

describe('googleLogin', () => {
  it('redirects to a Google authorize URL carrying S256 PKCE and the generated state, and sets oauth cookies', async () => {
    const { res, redirectedUrl, cookieCalls } = mockRedirectRes();

    await googleLogin({} as Request, res);

    const url = new URL(redirectedUrl());
    assert.equal(url.hostname, 'accounts.google.com');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.ok(url.searchParams.get('state'));

    const stateCookie = cookieCalls().find((c) => c.name === 'oauth_state');
    assert.ok(stateCookie, 'oauth_state cookie should be set');
    assert.equal(decryptCookieValue(stateCookie!.val), url.searchParams.get('state'));
    assert.ok(cookieCalls().some((c) => c.name === 'oauth_verifier'));
  });

  it('redirects to the failure page with reason=init_error when building the auth URL throws', async () => {
    const originalGenerateAuthUrl = OAuth2Client.prototype.generateAuthUrl;
    OAuth2Client.prototype.generateAuthUrl = () => {
      throw new Error('boom');
    };

    try {
      const { res, redirectedUrl } = mockRedirectRes();
      await googleLogin({} as Request, res);

      assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'init_error');
    } finally {
      OAuth2Client.prototype.generateAuthUrl = originalGenerateAuthUrl;
    }
  });
});

describe('googleCallback failure branches', () => {
  it('passes through the reason from a Google-supplied ?error= query param, and clears oauth cookies', async () => {
    const { res, redirectedUrl, clearedCookieNames } = mockRedirectRes();
    const reqMock = { query: { error: 'access_denied' }, cookies: {} } as unknown as Request;

    await googleCallback(reqMock, res);

    assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'access_denied');
    assert.ok(clearedCookieNames().includes('oauth_state'));
    assert.ok(clearedCookieNames().includes('oauth_verifier'));
  });

  it('redirects with reason=invalid_state when the state cookie is missing entirely', async () => {
    const { res, redirectedUrl } = mockRedirectRes();
    const reqMock = {
      query: { code: 'abc', state: 'expected-state' },
      cookies: {},
    } as unknown as Request;

    await googleCallback(reqMock, res);

    assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'invalid_state');
  });

  it('redirects with reason=invalid_state when the state cookie does not match the query state', async () => {
    const { res, redirectedUrl } = mockRedirectRes();
    const reqMock = {
      query: { code: 'abc', state: 'attacker-state' },
      cookies: validOAuthCookies('real-state', 'real-verifier'),
    } as unknown as Request;

    await googleCallback(reqMock, res);

    assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'invalid_state');
  });

  it('redirects with reason=missing_code_or_verifier when the verifier cookie is absent', async () => {
    const { res, redirectedUrl } = mockRedirectRes();
    const reqMock = {
      query: { code: 'abc', state: 'real-state' },
      cookies: { oauth_state: encryptCookieValue('real-state') },
    } as unknown as Request;

    await googleCallback(reqMock, res);

    assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'missing_code_or_verifier');
  });

  it('redirects with reason=missing_code_or_verifier when the code query param is absent', async () => {
    const { res, redirectedUrl } = mockRedirectRes();
    const reqMock = {
      query: { state: 'real-state' },
      cookies: validOAuthCookies('real-state', 'real-verifier'),
    } as unknown as Request;

    await googleCallback(reqMock, res);

    assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'missing_code_or_verifier');
  });

  it('redirects with reason=missing_id_token when the token exchange returns no id_token', async () => {
    const originalGetToken = OAuth2Client.prototype.getToken;
    OAuth2Client.prototype.getToken = (async () => ({
      tokens: {},
    })) as unknown as typeof OAuth2Client.prototype.getToken;

    try {
      const { res, redirectedUrl } = mockRedirectRes();
      const reqMock = {
        query: { code: 'abc', state: 'real-state' },
        cookies: validOAuthCookies('real-state', 'real-verifier'),
      } as unknown as Request;

      await googleCallback(reqMock, res);

      assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'missing_id_token');
    } finally {
      OAuth2Client.prototype.getToken = originalGetToken;
    }
  });

  it('redirects with reason=default_role_not_found when no user exists and the default role is missing', async () => {
    const originalGetToken = OAuth2Client.prototype.getToken;
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    const originalUserFindFirst = prisma.user.findFirst;
    const originalUserFindUnique = prisma.user.findUnique;
    const originalRoleFindUnique = prisma.role.findUnique;

    OAuth2Client.prototype.getToken = (async () => ({
      tokens: { id_token: 'fake-id-token' },
    })) as unknown as typeof OAuth2Client.prototype.getToken;
    OAuth2Client.prototype.verifyIdToken = (async () => ({
      getPayload: () => ({ sub: 'sub-1', email: 'new@example.com', email_verified: true }),
    })) as unknown as typeof OAuth2Client.prototype.verifyIdToken;
    prisma.user.findFirst = (async () => null) as unknown as typeof prisma.user.findFirst;
    prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;
    prisma.role.findUnique = (async () => null) as unknown as typeof prisma.role.findUnique;

    try {
      const { res, redirectedUrl, clearedCookieNames } = mockRedirectRes();
      const reqMock = {
        query: { code: 'abc', state: 'real-state' },
        cookies: validOAuthCookies('real-state', 'real-verifier'),
      } as unknown as Request;

      await googleCallback(reqMock, res);

      assert.equal(new URL(redirectedUrl()).searchParams.get('reason'), 'default_role_not_found');
      assert.ok(clearedCookieNames().includes('oauth_state'));
    } finally {
      OAuth2Client.prototype.getToken = originalGetToken;
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
      prisma.user.findFirst = originalUserFindFirst;
      prisma.user.findUnique = originalUserFindUnique;
      prisma.role.findUnique = originalRoleFindUnique;
    }
  });
});

// SPEC.md §3: "If a verified Google account matches an existing local user's email, the
// account is automatically linked." This is a settled product rule with no prior test
// coverage at all — googleCallback lines 99-117.
describe('googleCallback auto-link by email', () => {
  it('links an existing local user to the Google account on first-time Google sign-in with a matching email', async () => {
    const originalGetToken = OAuth2Client.prototype.getToken;
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    const originalUserFindFirst = prisma.user.findFirst;
    const originalUserFindUnique = prisma.user.findUnique;
    const originalUserUpdate = prisma.user.update;
    const originalRefreshTokenCreate = prisma.refreshToken.create;
    const originalRefreshTokenUpdateMany = prisma.refreshToken.updateMany;

    const existingLocalUser = {
      id: 'local-user-1',
      email: 'linked@example.com',
      auth_provider: 'local',
      provider_id: null,
      password_hash: 'some-hash',
      roleId: 'role-1',
      role: { id: 'role-1', name: 'user' },
    };

    OAuth2Client.prototype.getToken = (async () => ({
      tokens: { id_token: 'fake-id-token' },
    })) as unknown as typeof OAuth2Client.prototype.getToken;
    OAuth2Client.prototype.verifyIdToken = (async () => ({
      getPayload: () => ({
        sub: 'google-sub-linked',
        email: 'linked@example.com',
        email_verified: true,
      }),
    })) as unknown as typeof OAuth2Client.prototype.verifyIdToken;

    // No user found by provider_id (first-time Google sign-in for this account)...
    prisma.user.findFirst = (async () => null) as unknown as typeof prisma.user.findFirst;
    // ...but an existing local user shares the email.
    prisma.user.findUnique = (async () =>
      existingLocalUser) as unknown as typeof prisma.user.findUnique;

    let updateArgs: unknown;
    prisma.user.update = (async (args: unknown) => {
      updateArgs = args;
      return {
        ...existingLocalUser,
        auth_provider: 'google',
        provider_id: 'google-sub-linked',
        email_verified: true,
        password_hash: null,
      };
    }) as unknown as typeof prisma.user.update;

    prisma.refreshToken.create = (async () => ({
      id: 1,
      userId: 'local-user-1',
      token: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
      isRevoked: false,
      createdAt: new Date(),
    })) as unknown as typeof prisma.refreshToken.create;

    let revokeArgs: unknown;
    prisma.refreshToken.updateMany = (async (args: unknown) => {
      revokeArgs = args;
      return { count: 1 };
    }) as unknown as typeof prisma.refreshToken.updateMany;

    try {
      const { res, redirectedUrl } = mockRedirectRes();
      const reqMock = {
        query: { code: 'abc', state: 'real-state' },
        cookies: validOAuthCookies('real-state', 'real-verifier'),
      } as unknown as Request;

      await googleCallback(reqMock, res);

      assert.equal(redirectedUrl(), GOOGLE_OAUTH_SUCCESS_REDIRECT);
      assert.deepEqual(
        updateArgs,
        {
          where: { id: 'local-user-1' },
          data: {
            auth_provider: 'google',
            provider_id: 'google-sub-linked',
            email_verified: true,
            password_hash: null,
          },
          include: { role: true },
        },
        'auto-link must set auth_provider/provider_id/email_verified and clear the local password hash',
      );
      assert.deepEqual(
        revokeArgs,
        {
          where: { userId: 'local-user-1', isRevoked: false },
          data: { isRevoked: true },
        },
        "auto-link must revoke the linked account's pre-existing refresh tokens, so a " +
          'session obtained under the old local password stops working',
      );
    } finally {
      OAuth2Client.prototype.getToken = originalGetToken;
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
      prisma.user.findFirst = originalUserFindFirst;
      prisma.user.findUnique = originalUserFindUnique;
      prisma.user.update = originalUserUpdate;
      prisma.refreshToken.create = originalRefreshTokenCreate;
      prisma.refreshToken.updateMany = originalRefreshTokenUpdateMany;
    }
  });
});
