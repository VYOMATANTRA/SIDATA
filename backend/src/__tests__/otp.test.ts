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

  it('verifyOtpHash validates correct OTP hash', () => {
    const otp = '482910';
    const hashed = hashOtp(otp);

    assert.equal(typeof hashed, 'string');
    assert.equal(hashed.length, 64); // SHA-256 hex length
    assert.ok(verifyOtpHash('482910', hashed));
    assert.equal(verifyOtpHash('123456', hashed), false);
  });

  it('getOtpExpiration returns date in the future', () => {
    const now = new Date();
    const expiration = getOtpExpiration(15);

    assert.ok(expiration > now);
    const diffMinutes = Math.round((expiration.getTime() - now.getTime()) / (60 * 1000));
    assert.equal(diffMinutes, 15);
  });
});
