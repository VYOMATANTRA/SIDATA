import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  getCsrfToken,
} from '../controllers/auth.controller.js';
import prisma from '../utils/prisma.js';
import { fakePrisma, type FakePrismaState } from './helpers/fakePrisma.js';
import { fakeRes } from './helpers/fakeRes.js';
import { fakeMailer, type FakeMailerOptions } from './helpers/fakeMailer.js';
import { hashOtp } from '../utils/otp.js';
import { JWT_REFRESH_SECRET } from '../configs/index.js';

const STRONG_PASSWORD = 'Xk9$mQp2vNz7Lw4!'; // zxcvbn score 4 — clears the register() >=2 gate

function req(body: Record<string, unknown>): Request {
  return { body } as Request;
}

function withDb(t: TestContext, state: FakePrismaState = {}) {
  const db = fakePrisma(state);
  t.after(db.restore);
  return db;
}

function withMailer(t: TestContext, options: FakeMailerOptions = {}) {
  const mail = fakeMailer(options);
  t.after(mail.restore);
  return mail;
}

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

// Part of the OTP mechanism: register() is what actually issues the first-ever OTP for a
// new account, before verify-otp/resend-otp ever run. See otp.controller.test.ts for the
// verify/resend side of the lifecycle.
describe('auth.controller register — OTP issuance', () => {
  it('creates an unverified user and an OTP row whose hash matches the emailed code', async (t) => {
    const db = withDb(t, {
      user: null,
      role: { id: 'role-1', name: 'user' },
    });
    const mail = withMailer(t, { ok: true });
    const res = fakeRes();

    await register(req({ email: 'new@example.com', password: STRONG_PASSWORD }), res);

    assert.equal(res.status, 201);
    assert.equal(db.state.user!.email_verified, false);
    assert.ok(mail.lastOtp, 'an OTP should have been emailed');
    assert.equal(db.state.otp!.otpHash, hashOtp(mail.lastOtp!));
    assert.equal((res.body as { requiresOtp: boolean }).requiresOtp, true);
    assert.equal(
      'otp' in (res.body as object),
      false,
      'the raw OTP must never appear in the API response',
    );
  });

  it('reports the OTP-sent message on a successful send', async (t) => {
    withDb(t, { user: null, role: { id: 'role-1', name: 'user' } });
    withMailer(t, { ok: true });
    const res = fakeRes();

    await register(req({ email: 'new@example.com', password: STRONG_PASSWORD }), res);

    assert.equal(res.status, 201);
    assert.equal(
      (res.body as { message: string }).message,
      'Registrasi berhasil. Kode OTP verifikasi telah dikirim ke email Anda.',
    );
    assert.equal((res.body as { otpSent: boolean }).otpSent, true);
  });

  it(
    'REGRESSION (PR #41, fixed in 33efd4c): still returns 201 with a fallback message ' +
      '(not a swallowed failure) when the OTP email fails to send',
    async (t) => {
      const db = withDb(t, { user: null, role: { id: 'role-1', name: 'user' } });
      withMailer(t, { ok: false });
      const res = fakeRes();

      await register(req({ email: 'new@example.com', password: STRONG_PASSWORD }), res);

      assert.equal(res.status, 201);
      assert.equal(
        (res.body as { message: string }).message,
        'Registrasi berhasil, tetapi gagal mengirim email OTP. Silakan tekan tombol kirim ulang OTP.',
      );
      assert.equal((res.body as { requiresOtp: boolean }).requiresOtp, true);
      assert.equal(
        (res.body as { otpSent: boolean }).otpSent,
        false,
        'the frontend needs this to avoid claiming an OTP was sent when it was not',
      );
      assert.equal(
        db.state.otp,
        null,
        'no OTP row should be committed when the send failed, so an immediate resend is not cooldown-locked',
      );
    },
  );
});

describe('auth.controller register — input validation', () => {
  it('rejects a password shorter than 8 characters', async (t) => {
    withDb(t, { user: null });
    const res = fakeRes();

    await register(req({ email: 'new@example.com', password: 'Short1!' }), res);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'Password minimal harus 8 karakter (Standar NIST).',
    });
  });

  it('rejects a password longer than 128 characters', async (t) => {
    withDb(t, { user: null });
    const res = fakeRes();

    await register(req({ email: 'new@example.com', password: 'Aa1!'.repeat(40) }), res);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'Password terlalu panjang (maksimal 128 karakter).',
    });
  });

  it('rejects a weak/common password (zxcvbn score < 2) and surfaces suggestions', async (t) => {
    withDb(t, { user: null });
    const res = fakeRes();

    await register(req({ email: 'new@example.com', password: 'password123' }), res);

    assert.equal(res.status, 400);
    const body = res.body as { error: string; suggestions: string[] };
    assert.equal(body.error, 'Password terlalu lemah atau umum digunakan.');
    assert.ok(Array.isArray(body.suggestions));
  });

  it('returns 500 when the default "user" role is missing from the database', async (t) => {
    // fakePrisma's `role` state falls back to a default via `??`, which treats an explicit
    // `null` as "not provided" — so the null-role case has to go through `overrides` instead.
    withDb(t, { user: null, overrides: { role: { findUnique: async () => null } } });
    const res = fakeRes();

    await register(req({ email: 'new@example.com', password: STRONG_PASSWORD }), res);

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Role default tidak ditemukan di server' });
  });
});

describe('auth.controller login — email_verified gate', () => {
  async function seededUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: 'user@example.com',
      password_hash: await bcrypt.hash(STRONG_PASSWORD, 10),
      email_verified: false,
      ...overrides,
    };
  }

  it('blocks login for an unverified user with the correct password and does not issue a session', async (t) => {
    const db = withDb(t, { user: await seededUser({ email_verified: false }) });
    const res = fakeRes();

    await login(req({ email: 'user@example.com', password: STRONG_PASSWORD }), res);

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, {
      error: 'Email Anda belum diverifikasi. Silakan masukkan kode OTP yang dikirim ke email Anda.',
      requiresOtp: true,
      email: 'user@example.com',
    });
    assert.equal(res.cookies.refreshToken, undefined);
    assert.equal(db.calls.refreshToken, undefined);
  });

  it('logs in a verified user with the correct password and issues a session', async (t) => {
    const db = withDb(t, { user: await seededUser({ email_verified: true }) });
    const res = fakeRes();

    await login(req({ email: 'user@example.com', password: STRONG_PASSWORD }), res);

    assert.equal(res.status, 200);
    assert.ok(res.cookies.refreshToken);
    assert.equal(db.calls.refreshToken!.create!.length, 1);
    assert.ok((res.body as { accessToken: string }).accessToken);
  });

  it(
    'rejects a wrong password with the same generic error regardless of verification state ' +
      '(password check precedes the email_verified check, so this endpoint never leaks it)',
    async (t) => {
      withDb(t, { user: await seededUser({ email_verified: false }) });
      const res = fakeRes();

      await login(req({ email: 'user@example.com', password: 'totally-wrong-password' }), res);

      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { error: 'Kredensial tidak valid' });
    },
  );
});

describe('auth.controller refreshToken', () => {
  it('returns 200 with new accessToken and user profile object when refresh token is valid', async () => {
    const validToken = jwt.sign({ id: 'user-1' }, JWT_REFRESH_SECRET);
    const originalFindUnique = prisma.refreshToken.findUnique;

    prisma.refreshToken.findUnique = (async () => ({
      id: 'token-1',
      token: validToken,
      userId: 'user-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: { id: 'role-1', name: 'user', createdAt: new Date(), updatedAt: new Date() },
      },
    })) as unknown as typeof prisma.refreshToken.findUnique;

    try {
      const reqMock = {
        cookies: { refreshToken: validToken },
      } as unknown as Request;
      const res = fakeRes();

      await refreshToken(reqMock, res);

      assert.equal(res.status, 200);
      const body = res.body as {
        message: string;
        accessToken: string;
        user: { id: string; email: string; role: string };
      };
      assert.equal(body.message, 'Token berhasil diperbarui');
      assert.ok(body.accessToken);
      assert.deepEqual(body.user, {
        id: 'user-1',
        email: 'user@example.com',
        role: 'user',
      });
    } finally {
      prisma.refreshToken.findUnique = originalFindUnique;
    }
  });

  it('returns 401 when no refresh token cookie is present', async () => {
    const res = fakeRes();

    await refreshToken({ cookies: {} } as unknown as Request, res);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Refresh token tidak ditemukan' });
  });

  it('returns 403 when the refresh token does not match any stored record', async () => {
    const originalFindUnique = prisma.refreshToken.findUnique;
    prisma.refreshToken.findUnique = (async () =>
      null) as unknown as typeof prisma.refreshToken.findUnique;

    try {
      const res = fakeRes();
      await refreshToken({ cookies: { refreshToken: 'unknown-token' } } as unknown as Request, res);

      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'Refresh token tidak valid' });
    } finally {
      prisma.refreshToken.findUnique = originalFindUnique;
    }
  });

  it('returns 403 when the stored refresh token has already been revoked', async () => {
    const validToken = jwt.sign({ id: 'user-1' }, JWT_REFRESH_SECRET);
    const originalFindUnique = prisma.refreshToken.findUnique;
    prisma.refreshToken.findUnique = (async () => ({
      id: 'token-1',
      token: validToken,
      userId: 'user-1',
      isRevoked: true,
      expiresAt: new Date(Date.now() + 3600000),
      user: { id: 'user-1', email: 'user@example.com', role: { name: 'user' } },
    })) as unknown as typeof prisma.refreshToken.findUnique;

    try {
      const res = fakeRes();
      await refreshToken({ cookies: { refreshToken: validToken } } as unknown as Request, res);

      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'Refresh token sudah dicabut' });
    } finally {
      prisma.refreshToken.findUnique = originalFindUnique;
    }
  });

  it('rejects an expired refresh token with 403 and revokes it as a side effect', async () => {
    const expiredToken = jwt.sign({ id: 'user-1' }, JWT_REFRESH_SECRET);
    const originalFindUnique = prisma.refreshToken.findUnique;
    const originalUpdate = prisma.refreshToken.update;

    let updateArgs: unknown;
    prisma.refreshToken.findUnique = (async () => ({
      id: 'token-1',
      token: expiredToken,
      userId: 'user-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'user-1', email: 'user@example.com', role: { name: 'user' } },
    })) as unknown as typeof prisma.refreshToken.findUnique;
    prisma.refreshToken.update = (async (args: unknown) => {
      updateArgs = args;
      return {};
    }) as unknown as typeof prisma.refreshToken.update;

    try {
      const res = fakeRes();
      await refreshToken({ cookies: { refreshToken: expiredToken } } as unknown as Request, res);

      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'Refresh token sudah kedaluwarsa, silakan login ulang' });
      assert.deepEqual(updateArgs, { where: { id: 'token-1' }, data: { isRevoked: true } });
    } finally {
      prisma.refreshToken.findUnique = originalFindUnique;
      prisma.refreshToken.update = originalUpdate;
    }
  });

  it('returns 403 when the JWT payload id does not match the stored token’s userId', async () => {
    // A token signed for a different user id than the DB record it happens to match on
    // string equality — this is the "token tidak cocok" integrity check.
    const mismatchedToken = jwt.sign({ id: 'attacker-id' }, JWT_REFRESH_SECRET);
    const originalFindUnique = prisma.refreshToken.findUnique;
    prisma.refreshToken.findUnique = (async () => ({
      id: 'token-1',
      token: mismatchedToken,
      userId: 'user-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
      user: { id: 'user-1', email: 'user@example.com', role: { name: 'user' } },
    })) as unknown as typeof prisma.refreshToken.findUnique;

    try {
      const res = fakeRes();
      await refreshToken({ cookies: { refreshToken: mismatchedToken } } as unknown as Request, res);

      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'Token tidak cocok' });
    } finally {
      prisma.refreshToken.findUnique = originalFindUnique;
    }
  });
});

describe('auth.controller logout', () => {
  it('returns 204 and makes no DB write when there is no refresh token cookie', async () => {
    const originalUpdateMany = prisma.refreshToken.updateMany;
    let called = false;
    prisma.refreshToken.updateMany = (async () => {
      called = true;
      return { count: 0 };
    }) as unknown as typeof prisma.refreshToken.updateMany;

    try {
      const res = fakeRes();
      await logout({ cookies: {} } as unknown as Request, res);

      assert.equal(res.status, 204);
      assert.equal(called, false, 'logout with no cookie must not touch the DB');
    } finally {
      prisma.refreshToken.updateMany = originalUpdateMany;
    }
  });

  it('revokes the stored token and clears the cookie when a refresh token cookie is present', async () => {
    const originalUpdateMany = prisma.refreshToken.updateMany;
    let updateArgs: unknown;
    prisma.refreshToken.updateMany = (async (args: unknown) => {
      updateArgs = args;
      return { count: 1 };
    }) as unknown as typeof prisma.refreshToken.updateMany;

    try {
      const res = fakeRes();
      await logout({ cookies: { refreshToken: 'some-token' } } as unknown as Request, res);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { message: 'Logout berhasil' });
      assert.deepEqual(updateArgs, {
        where: { token: 'some-token' },
        data: { isRevoked: true },
      });
      const clearedRefreshCookie = res.clearedCookies.find((c) => c.name === 'refreshToken');
      assert.ok(clearedRefreshCookie, 'the refreshToken cookie should be cleared');
      assert.equal(
        clearedRefreshCookie?.options?.path,
        '/',
        // Must match the path issueSession() set the cookie with (session.ts), or the
        // browser won't recognize this as clearing the same cookie (RFC 6265).
        'clearCookie must use the same path the cookie was originally set with',
      );
    } finally {
      prisma.refreshToken.updateMany = originalUpdateMany;
    }
  });
});

describe('auth.controller getMe', () => {
  it('echoes back req.user at 200 (dummy profile endpoint)', async () => {
    const res = fakeRes();
    const decodedUser = { id: 'user-1', email: 'user@example.com', role: 'user' };

    await getMe({ user: decodedUser } as unknown as Request & { user: unknown }, res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      message: 'Berhasil mengakses profil',
      user: decodedUser,
    });
  });
});

describe('auth.controller getCsrfToken', () => {
  it('returns 200 with a csrfToken string', async () => {
    const res = fakeRes();

    await getCsrfToken({ ip: '127.0.0.1', cookies: {} } as unknown as Request, res);

    assert.equal(res.status, 200);
    assert.equal(typeof (res.body as { csrfToken: string }).csrfToken, 'string');
    assert.ok((res.body as { csrfToken: string }).csrfToken.length > 0);
  });
});
