// Controller-level coverage for the OTP email-verification mechanism (verifyOtp/resendOtp).
// No live database or network: prisma.* is stubbed via fakePrisma, outbound email via
// fakeMailer (globalThis.fetch), and the Express response via fakeRes.
//
// The "regression" tests lock down bugs found in PR #41 review and fixed this session;
// the "KNOWN DEFECT" test characterizes one that's still open, so it fails loudly instead
// of silently once someone fixes it.

import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { verifyOtp, resendOtp } from '../controllers/otp.controller.js';
import { fakePrisma, type FakePrismaState } from './helpers/fakePrisma.js';
import { fakeRes } from './helpers/fakeRes.js';
import { fakeMailer, type FakeMailerOptions } from './helpers/fakeMailer.js';
import { hashOtp, getOtpExpiration } from '../utils/otp.js';
import { JWT_SECRET } from '../configs/index.js';

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

function unverifiedUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-1', email: 'user@example.com', email_verified: false, ...overrides };
}

function verifiedUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-1', email: 'user@example.com', email_verified: true, ...overrides };
}

function otpRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'otp-1',
    userId: 'user-1',
    otpHash: hashOtp('123456'),
    attempts: 0,
    expiresAt: getOtpExpiration(15),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('verifyOtp', () => {
  it('rejects when email is missing', async (t) => {
    withDb(t);
    const res = fakeRes();
    await verifyOtp(req({ otp: '123456' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Email dan kode OTP wajib diisi' });
  });

  it('rejects when otp is missing', async (t) => {
    withDb(t);
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Email dan kode OTP wajib diisi' });
  });

  it('rejects when otp is an empty string (presence check, not just undefined)', async (t) => {
    withDb(t);
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Email dan kode OTP wajib diisi' });
  });

  it('rejects a malformed email', async (t) => {
    withDb(t);
    const res = fakeRes();
    await verifyOtp(req({ email: 'not-an-email', otp: '123456' }), res);
    assert.equal(res.status, 400);
    assert.equal((res.body as { error: string }).error, 'Format email tidak valid');
  });

  it('normalizes the email (trim + lowercase) before looking up the user', async (t) => {
    const db = withDb(t); // no user in state -> 404, but we only care about the lookup args
    const res = fakeRes();
    await verifyOtp(req({ email: '  User@Example.COM  ', otp: '123456' }), res);
    assert.equal(res.status, 404);
    const findArgs = db.calls.user!.findUnique![0]![0];
    assert.equal((findArgs as { where: { email: string } }).where.email, 'user@example.com');
  });

  it('returns 404 when no user matches the email', async (t) => {
    withDb(t);
    const res = fakeRes();
    await verifyOtp(req({ email: 'nobody@example.com', otp: '123456' }), res);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Pengguna tidak ditemukan' });
  });

  it(
    'REGRESSION (PR #41 Critical auth bypass, otp.controller.ts:34): an already-verified ' +
      'user submitting a garbage OTP is rejected outright — no session is issued and the ' +
      'OTP table is never even queried',
    async (t) => {
      const db = withDb(t, { user: verifiedUser() });
      const res = fakeRes();

      await verifyOtp(req({ email: 'user@example.com', otp: '000000' }), res);

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: 'Email Anda sudah terverifikasi' });
      assert.equal((res.body as { accessToken?: string }).accessToken, undefined);
      assert.equal(res.cookies.refreshToken, undefined);
      assert.equal(db.calls.refreshToken, undefined, 'no refresh token should ever be persisted');
      assert.equal(
        db.calls.emailOtp,
        undefined,
        'the OTP table must never be touched once email_verified short-circuits',
      );
    },
  );

  it('returns 400 when there is no OTP record for the user', async (t) => {
    withDb(t, { user: unverifiedUser() });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Kode OTP tidak ditemukan. Silakan minta kode baru.' });
  });

  it('deletes and rejects an expired OTP', async (t) => {
    const db = withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ expiresAt: new Date(Date.now() - 1000) }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.' });
    assert.equal(db.calls.emailOtp!.delete!.length, 1);
  });

  it('still accepts an OTP that has not yet expired (boundary)', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ expiresAt: new Date(Date.now() + 50) }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 200);
  });

  it('locks out and deletes the record after 5 failed attempts, even with the correct code', async (t) => {
    const db = withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ attempts: 5 }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 429);
    assert.deepEqual(res.body, {
      error: 'Batas percobaan salah telah tercapai. Silakan minta kode OTP baru.',
    });
    assert.equal(db.calls.emailOtp!.delete!.length, 1);
  });

  it('does not lock out at 4 attempts', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ attempts: 4 }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 200);
  });

  it('rejects a wrong OTP, increments attempts, and reports remaining tries', async (t) => {
    const db = withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ otpHash: hashOtp('111111'), attempts: 2 }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '999999' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Kode OTP salah. Sisa percobaan: 2' });
    assert.equal(db.calls.emailOtp!.update!.length, 1);
    assert.equal(db.state.otp!.attempts, 3);
  });

  it('clamps the reported remaining attempts at zero', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ otpHash: hashOtp('111111'), attempts: 4 }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '999999' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Kode OTP salah. Sisa percobaan: 0' });
  });

  it('on a correct OTP: verifies the email, clears OTPs, and issues a real session', async (t) => {
    const db = withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ otpHash: hashOtp('123456') }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);

    assert.equal(res.status, 200);
    assert.equal((res.body as { message: string }).message, 'Verifikasi email berhasil');
    assert.equal(db.state.user!.email_verified, true);
    assert.equal(db.state.otp, null, 'emailOtp.deleteMany should have cleared the record');

    assert.ok(res.cookies.refreshToken, 'refreshToken cookie should be set');
    assert.equal(db.calls.refreshToken!.create!.length, 1);

    const accessToken = (res.body as { accessToken: string }).accessToken;
    const decoded = jwt.verify(accessToken, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };
    assert.equal(decoded.id, 'user-1');
    assert.equal(decoded.email, 'user@example.com');
    assert.equal(decoded.role, 'user');
  });

  it('coerces a numeric otp to a string before comparing', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ otpHash: hashOtp('123456') }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: 123456 }), res);
    assert.equal(res.status, 200);
  });

  it('returns 500 when the user lookup throws unexpectedly', async (t) => {
    withDb(t, {
      overrides: {
        user: {
          findUnique: () => {
            throw new Error('simulated DB outage');
          },
        },
      },
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Terjadi kesalahan pada server saat verifikasi OTP' });
  });

  it('returns 500 if session issuance fails after verification already committed (partial-commit characterization)', async (t) => {
    const db = withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ otpHash: hashOtp('123456') }),
      overrides: {
        refreshToken: {
          create: () => {
            throw new Error('simulated DB outage');
          },
        },
      },
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 500);
    // email_verified + OTP cleanup already happened before the session-issuance throw.
    assert.equal(db.state.user!.email_verified, true);
    assert.equal(db.state.otp, null);
  });

  it('returns 500 when the stored OTP hash is a corrupt/mismatched length', async (t) => {
    // crypto.timingSafeEqual requires equal-length buffers and throws otherwise —
    // a truncated otpHash surfaces as a 500, not a clean "wrong code" 400.
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ otpHash: 'not-a-real-hash' }),
    });
    const res = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: '123456' }), res);
    assert.equal(res.status, 500);
  });
});

describe('resendOtp', () => {
  it('rejects when email is missing', async (t) => {
    withDb(t);
    const res = fakeRes();
    await resendOtp(req({}), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Email wajib diisi' });
  });

  it('rejects a malformed email', async (t) => {
    withDb(t);
    const res = fakeRes();
    await resendOtp(req({ email: 'not-an-email' }), res);
    assert.equal(res.status, 400);
  });

  it('returns 404 when no user matches the email', async (t) => {
    withDb(t);
    const res = fakeRes();
    await resendOtp(req({ email: 'nobody@example.com' }), res);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Pengguna tidak ditemukan' });
  });

  it('rejects when the account is already verified', async (t) => {
    withDb(t, { user: verifiedUser() });
    const res = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Email Anda sudah terverifikasi' });
  });

  it('enforces the 60s cooldown between resends', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ createdAt: new Date(Date.now() - 10_000) }),
    });
    const res = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 429);
    assert.deepEqual(res.body, {
      error: 'Silakan tunggu 50 detik sebelum meminta kode OTP baru.',
    });
  });

  it('allows a resend exactly at the 60s boundary', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ createdAt: new Date(Date.now() - 60_000) }),
    });
    withMailer(t, { ok: true });
    const res = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 200);
  });

  it('reports 1 second remaining at 59 elapsed seconds', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      otp: otpRecord({ createdAt: new Date(Date.now() - 59_000) }),
    });
    const res = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 429);
    assert.deepEqual(res.body, { error: 'Silakan tunggu 1 detik sebelum meminta kode OTP baru.' });
  });

  it('sends a fresh OTP and stores a hash matching the emailed code', async (t) => {
    const db = withDb(t, { user: unverifiedUser() });
    const mail = withMailer(t, { ok: true });
    const res = fakeRes();

    await resendOtp(req({ email: 'user@example.com' }), res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Kode OTP baru berhasil dikirim ke email Anda' });
    assert.equal(db.calls.emailOtp!.deleteMany!.length, 1, 'prior codes should be cleared first');
    assert.equal(db.calls.emailOtp!.create!.length, 1);
    assert.ok(mail.lastOtp, 'an OTP should have been emailed');
    assert.equal(db.state.otp!.otpHash, hashOtp(mail.lastOtp!));
  });

  it('returns 500 (without crashing) when the Resend API reports failure', async (t) => {
    withDb(t, { user: unverifiedUser() });
    withMailer(t, { ok: false });
    const res = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, {
      error: 'Gagal mengirim email OTP. Silakan coba beberapa saat lagi.',
    });
  });

  it('returns 500 when the network request itself fails', async (t) => {
    withDb(t, { user: unverifiedUser() });
    withMailer(t, { reject: true });
    const res = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 500);
  });

  it(
    'KNOWN DEFECT (PR #41 open finding, otp.controller.ts:176): the OTP row — and its ' +
      'cooldown-triggering createdAt — is committed BEFORE the send is attempted, so a ' +
      "failed send still starts the 60s lockout. Pins today's behavior; update this test " +
      'when the ordering is fixed to create-after-send.',
    async (t) => {
      const db = withDb(t, { user: unverifiedUser() });
      withMailer(t, { ok: false });
      const res = fakeRes();

      await resendOtp(req({ email: 'user@example.com' }), res);

      assert.equal(res.status, 500);
      assert.equal(
        db.calls.emailOtp!.create!.length,
        1,
        'the OTP row was committed despite the send failing',
      );
    },
  );

  it('returns 500 when an unexpected Prisma error occurs', async (t) => {
    withDb(t, {
      user: unverifiedUser(),
      overrides: {
        emailOtp: {
          deleteMany: () => {
            throw new Error('simulated DB outage');
          },
        },
      },
    });
    const res = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), res);
    assert.equal(res.status, 500);
  });
});

describe('resend -> verify round trip', () => {
  it('the OTP actually emailed by resendOtp is accepted by verifyOtp', async (t) => {
    const db = withDb(t, { user: unverifiedUser() });
    const mail = withMailer(t, { ok: true });

    const resendRes = fakeRes();
    await resendOtp(req({ email: 'user@example.com' }), resendRes);
    assert.equal(resendRes.status, 200);

    const emailedOtp = mail.lastOtp;
    assert.ok(emailedOtp, 'resendOtp should have emailed a code');

    const verifyRes = fakeRes();
    await verifyOtp(req({ email: 'user@example.com', otp: emailedOtp }), verifyRes);

    assert.equal(verifyRes.status, 200);
    assert.equal(db.state.user!.email_verified, true);
    assert.ok(verifyRes.cookies.refreshToken, 'a session should have been issued');
  });
});
