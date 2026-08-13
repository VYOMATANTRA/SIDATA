import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generate6DigitOtp, hashOtp, verifyOtpHash, getOtpExpiration } from '../utils/otp.js';

describe('OTP Utility Functions', () => {
  it('generate6DigitOtp returns a 6-digit numeric string', () => {
    const otp = generate6DigitOtp();
    assert.equal(typeof otp, 'string');
    assert.equal(otp.length, 6);
    assert.ok(/^\d{6}$/.test(otp), 'OTP harus 6 digit angka');
  });

  it('generate6DigitOtp always stays within the [100000, 999999] range', () => {
    // crypto.randomInt(100000, 1000000) excludes a leading zero by construction — worth
    // pinning explicitly since a naive 6-digit generator would allow one.
    for (let i = 0; i < 200; i++) {
      const otp = generate6DigitOtp();
      const num = Number(otp);
      assert.equal(otp.length, 6);
      assert.ok(num >= 100000 && num <= 999999, `${otp} out of range`);
    }
  });

  it('hashOtp is deterministic and differs across inputs', () => {
    assert.equal(hashOtp('482910'), hashOtp('482910'));
    assert.notEqual(hashOtp('482910'), hashOtp('482911'));
  });

  it('verifyOtpHash validates correct OTP hash', () => {
    const otp = '482910';
    const hashed = hashOtp(otp);

    assert.equal(typeof hashed, 'string');
    assert.equal(hashed.length, 64); // SHA-256 hex length
    assert.ok(verifyOtpHash('482910', hashed));
    assert.equal(verifyOtpHash('123456', hashed), false);
  });

  it('verifyOtpHash returns false (not a false positive) for a same-length, non-hex mismatch', () => {
    // hashOtp/verifyOtpHash compare via Buffer.from(str) at default (utf8) encoding, i.e. raw
    // character bytes, not decoded hex — so any 64-char string is a valid comparison operand.
    assert.equal(verifyOtpHash('482910', 'z'.repeat(64)), false);
  });

  it('verifyOtpHash throws (does not just return false) when the stored hash has the wrong length', () => {
    // crypto.timingSafeEqual requires equal-length buffers. A truncated/corrupt otpHash row
    // (e.g. DB truncation, migration bug) surfaces as an exception here, not a clean reject —
    // see otp.controller.test.ts for how that propagates to a 500 at the controller layer.
    assert.throws(() => verifyOtpHash('482910', 'not-64-characters-long'));
  });

  it('getOtpExpiration returns date in the future', () => {
    const now = new Date();
    const expiration = getOtpExpiration(15);

    assert.ok(expiration > now);
    const diffMinutes = Math.round((expiration.getTime() - now.getTime()) / (60 * 1000));
    assert.equal(diffMinutes, 15);
  });

  it('getOtpExpiration defaults to 15 minutes when called with no argument', () => {
    const now = new Date();
    const expiration = getOtpExpiration();
    const diffMinutes = Math.round((expiration.getTime() - now.getTime()) / (60 * 1000));
    assert.equal(diffMinutes, 15);
  });

  it('getOtpExpiration(0) resolves to approximately now', () => {
    const now = Date.now();
    const expiration = getOtpExpiration(0);
    assert.ok(Math.abs(expiration.getTime() - now) < 1000);
  });
});
