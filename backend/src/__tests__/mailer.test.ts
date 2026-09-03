import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sendOtpEmail } from '../utils/mailer.js';

describe('sendOtpEmail environment-gated logging', () => {
  it('does NOT log plaintext OTP in production when send fails', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const originalError = console.error;

    let loggedOutput = '';
    console.log = (msg: string) => {
      loggedOutput += msg;
    };
    console.error = () => {};

    // Simulate Resend API failure
    globalThis.fetch = (async () => ({
      ok: false,
      json: async () => ({ error: 'API Key Invalid' }),
    })) as unknown as typeof fetch;

    try {
      process.env.NODE_ENV = 'production';
      const result = await sendOtpEmail({ to: 'user@example.com', otp: '654321' });

      assert.equal(result, false);
      assert.equal(
        loggedOutput.includes('654321'),
        false,
        'Plaintext OTP must not be logged to stdout in production',
      );
      assert.equal(
        loggedOutput.includes('[DEV MAILER FALLBACK]'),
        false,
        'DEV MAILER FALLBACK must not trigger in production',
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      globalThis.fetch = originalFetch;
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it('logs DEV MAILER FALLBACK in non-production environments when send fails', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const originalError = console.error;

    let loggedOutput = '';
    console.log = (msg: string) => {
      loggedOutput += msg;
    };
    console.error = () => {};

    // Simulate Resend API failure
    globalThis.fetch = (async () => ({
      ok: false,
      json: async () => ({ error: 'Simulated dev failure' }),
    })) as unknown as typeof fetch;

    try {
      process.env.NODE_ENV = 'development';
      const result = await sendOtpEmail({ to: 'dev@example.com', otp: '123456' });

      assert.equal(result, false);
      assert.ok(
        loggedOutput.includes('[DEV MAILER FALLBACK] Kode OTP untuk dev@example.com: 123456'),
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      globalThis.fetch = originalFetch;
      console.log = originalLog;
      console.error = originalError;
    }
  });
});
