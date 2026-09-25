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

  it('does not stall OTP dispatch when database query hangs or times out, falling back safely to default settings', async () => {
    const originalFetch = globalThis.fetch;
    let sentPayload: { subject: string; html: string; to: string[] } | null = null;

    // Simulate database query hanging for 1000ms (far exceeding the 200ms bounded timeout)
    prisma.systemSetting.findMany = (() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve([{ key: 'public.app_name', value: 'Delayed Portal' }]);
        }, 1000);
      });
    }) as unknown as typeof prisma.systemSetting.findMany;

    globalThis.fetch = (async (_url: string, options: { body: string }) => {
      sentPayload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ id: 'email-timeout-123' }),
      };
    }) as unknown as typeof fetch;

    try {
      const startTime = Date.now();
      const result = await sendOtpEmail({ to: 'urgent@example.com', otp: '889900' });
      const durationMs = Date.now() - startTime;

      assert.equal(result, true);
      assert.ok(sentPayload);
      // Verify bounded latency: must abort waiting and return well before the 1000ms DB hang
      assert.ok(
        durationMs < 600,
        `OTP dispatch took ${durationMs}ms, expected bounded execution under 600ms`,
      );
      // Subject should fall back to default appName ('SIDATA')
      const payload = sentPayload as { subject: string; html: string };
      assert.ok(
        payload.subject.includes('[SIDATA]'),
        'Must fall back to default app name in subject when DB stalls',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('boundary testing: handles empty arrays, nulls, zero, negative numbers, and MAX_SAFE_INTEGER inputs (testing happy path last)', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled: boolean;
    let lastSentBody: { to: string[]; subject: string; html: string } | null = null;

    globalThis.fetch = (async (_url: string, options: { body: string }) => {
      fetchCalled = true;
      lastSentBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ id: 'email-boundary-test' }),
      };
    }) as unknown as typeof fetch;

    try {
      // 1. Boundary: Invalid/empty "to" inputs return false early without calling fetch
      const invalidToInputs = ['', '   ', null, undefined, 0, false, []];
      for (const badTo of invalidToInputs) {
        fetchCalled = false;
        const res = await sendOtpEmail({
          to: badTo as unknown as string,
          otp: '123456',
        });
        assert.equal(res, false, `Expected sendOtpEmail to return false for to="${badTo}"`);
        assert.equal(fetchCalled, false, 'Fetch must not be called when "to" is invalid');
      }

      // 2. Boundary: Invalid/empty "otp" inputs return false early without calling fetch
      const invalidOtpInputs = ['', '   ', null, undefined];
      for (const badOtp of invalidOtpInputs) {
        fetchCalled = false;
        const res = await sendOtpEmail({
          to: 'user@example.com',
          otp: badOtp as unknown as string,
        });
        assert.equal(res, false, `Expected sendOtpEmail to return false for otp="${badOtp}"`);
        assert.equal(fetchCalled, false, 'Fetch must not be called when "otp" is invalid');
      }

      // 3. Boundary: Numeric OTP (e.g. 123456) must be safely coerced to string without throwing TypeError
      const getSentBody = () =>
        lastSentBody as { to: string[]; subject: string; html: string } | null;

      // 3. Boundary: Numeric OTP (e.g. 123456) must be safely coerced to string without throwing TypeError
      fetchCalled = false;
      const numRes = await sendOtpEmail({
        to: 'user@example.com',
        otp: 123456 as unknown as string,
      });
      assert.equal(numRes, true);
      assert.equal(fetchCalled, true);
      assert.ok(getSentBody()?.subject.includes('123456'));
      assert.ok(getSentBody()?.html.includes('123456'));

      // 4. Boundary: Zero OTP (0) must be converted to '0' without being treated as empty
      fetchCalled = false;
      const zeroRes = await sendOtpEmail({
        to: 'user@example.com',
        otp: 0 as unknown as string,
      });
      assert.equal(zeroRes, true);
      assert.equal(fetchCalled, true);
      assert.ok(getSentBody()?.subject.includes(': 0'));
      assert.ok(getSentBody()?.html.includes('0'));

      // 5. Boundary: Negative integer OTP (-1)
      fetchCalled = false;
      const negRes = await sendOtpEmail({
        to: 'user@example.com',
        otp: -1 as unknown as string,
      });
      assert.equal(negRes, true);
      assert.equal(fetchCalled, true);
      assert.ok(getSentBody()?.subject.includes('-1'));

      // 6. Boundary: MAX_SAFE_INTEGER OTP (9007199254740991)
      fetchCalled = false;
      const maxIntRes = await sendOtpEmail({
        to: 'user@example.com',
        otp: Number.MAX_SAFE_INTEGER as unknown as string,
      });
      assert.equal(maxIntRes, true);
      assert.equal(fetchCalled, true);
      assert.ok(getSentBody()?.subject.includes('9007199254740991'));

      // Happy path last: valid email and valid 6-digit OTP string
      fetchCalled = false;
      const happyPathRes = await sendOtpEmail({
        to: 'citizen@example.com',
        otp: '654321',
      });
      assert.equal(happyPathRes, true);
      assert.equal(fetchCalled, true);
      assert.deepEqual(getSentBody()?.to, ['citizen@example.com']);
      assert.ok(getSentBody()?.subject.includes('654321'));
      assert.ok(getSentBody()?.html.includes('654321'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
