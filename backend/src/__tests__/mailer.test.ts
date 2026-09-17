import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { sendOtpEmail } from '../utils/mailer.js';
import { invalidatePublicSettingsCache } from '../services/settings.service.js';
import prisma from '../utils/prisma.js';

describe('sendOtpEmail environment-gated logging', () => {
  let originalFindMany: typeof prisma.systemSetting.findMany;

  beforeEach(() => {
    invalidatePublicSettingsCache();
    originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;
  });

  afterEach(() => {
    prisma.systemSetting.findMany = originalFindMany;
    invalidatePublicSettingsCache();
  });

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

  it('interpolates dynamic public settings into email subject and HTML content', async () => {
    const originalFetch = globalThis.fetch;
    let sentPayload: { subject: string; html: string; to: string[] } | null = null;

    globalThis.fetch = (async (_url: string, options: { body: string }) => {
      sentPayload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ id: 'email-123' }),
      };
    }) as unknown as typeof fetch;

    try {
      const result = await sendOtpEmail({ to: 'warga@example.com', otp: '998877' });

      assert.equal(result, true);
      assert.ok(sentPayload);
      assert.ok((sentPayload as { subject: string }).subject.includes('998877'));
      assert.ok((sentPayload as { html: string }).html.includes('998877'));
      assert.ok((sentPayload as { html: string }).html.includes('Verifikasi Akun'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sanitizes subject against CRLF injection and escapes HTML characters in email body', async () => {
    const originalFetch = globalThis.fetch;
    let sentPayload: { subject: string; html: string; to: string[] } | null = null;

    // Simulate database returning settings with CRLF or HTML characters
    prisma.systemSetting.findMany = (async () => [
      { key: 'public.app_name', value: 'Portal Manggar\r\nBcc: evil@attacker.com' },
      { key: 'public.tagline', value: 'Maju & <Sejahtera> "Bersama"' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    globalThis.fetch = (async (_url: string, options: { body: string }) => {
      sentPayload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ id: 'email-456' }),
      };
    }) as unknown as typeof fetch;

    try {
      const result = await sendOtpEmail({ to: 'user@example.com', otp: '112233\r\n' });

      assert.equal(result, true);
      assert.ok(sentPayload);
      const payload = sentPayload as { subject: string; html: string };

      // Subject MUST NOT contain raw \r or \n
      assert.equal(payload.subject.includes('\r'), false, 'Subject must not contain \\r');
      assert.equal(payload.subject.includes('\n'), false, 'Subject must not contain \\n');
      assert.ok(payload.subject.includes('Portal Manggar Bcc: evil@attacker.com'));

      // HTML body MUST escape &, <, >, "
      assert.ok(payload.html.includes('&amp;'), '& should be escaped as &amp;');
      assert.ok(payload.html.includes('&lt;Sejahtera&gt;'), '<Sejahtera> should be escaped');
      assert.ok(payload.html.includes('&quot;Bersama&quot;'), '" should be escaped as &quot;');
      assert.equal(
        payload.html.includes('<Sejahtera>'),
        false,
        'Raw <Sejahtera> must not exist in HTML',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
