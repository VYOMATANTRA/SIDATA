import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { register, login, refreshToken } from '../controllers/auth.controller.js';
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
  });

  it(
    'REGRESSION (PR #41, fixed in 33efd4c): still returns 201 with a fallback message ' +
      '(not a swallowed failure) when the OTP email fails to send',
    async (t) => {
      withDb(t, { user: null, role: { id: 'role-1', name: 'user' } });
      withMailer(t, { ok: false });
      const res = fakeRes();

      await register(req({ email: 'new@example.com', password: STRONG_PASSWORD }), res);

      assert.equal(res.status, 201);
      assert.equal(
        (res.body as { message: string }).message,
        'Registrasi berhasil, tetapi gagal mengirim email OTP. Silakan tekan tombol kirim ulang OTP.',
      );
      assert.equal((res.body as { requiresOtp: boolean }).requiresOtp, true);
    },
  );
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
});
