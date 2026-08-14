import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type { Request } from 'express';
import { verifyTurnstileToken } from '../utils/turnstile.js';
import { requireTurnstile } from '../middlewares/turnstile.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

// Note on scope: utils/turnstile.ts and turnstile.middleware.ts both branch on
// `if (!TURNSTILE_SECRET)`, but TURNSTILE_SECRET is read via configs/index.ts's
// requireEnv(), which throws at process boot if the var is empty/missing — so the app
// can never actually be running with a falsy TURNSTILE_SECRET. That branch is dead code
// under the current config-validation design, not a reachable prod scenario, so it's not
// covered here. Everything below exercises the branches that are actually reachable with
// TURNSTILE_SECRET always set, as it is in every real environment (see setupEnv.ts).

function withFetch(t: TestContext, impl: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  t.after(() => {
    globalThis.fetch = original;
  });
}

function req(body: Record<string, unknown> = {}, headers: Record<string, unknown> = {}): Request {
  return { body, headers, ip: '127.0.0.1' } as unknown as Request;
}

describe('utils/turnstile verifyTurnstileToken', () => {
  it('returns false when no token is provided', async () => {
    const result = await verifyTurnstileToken(undefined, '127.0.0.1');
    assert.equal(result, false);
  });

  it('returns true when Cloudflare reports success', async (t) => {
    withFetch(
      t,
      (async () =>
        ({
          ok: true,
          json: async () => ({ success: true }),
        }) as unknown as Response) as typeof fetch,
    );

    const result = await verifyTurnstileToken('valid-token', '127.0.0.1');
    assert.equal(result, true);
  });

  it('returns false when Cloudflare reports failure', async (t) => {
    withFetch(
      t,
      (async () =>
        ({
          ok: true,
          json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
        }) as unknown as Response) as typeof fetch,
    );

    const result = await verifyTurnstileToken('bad-token', '127.0.0.1');
    assert.equal(result, false);
  });

  it('returns false when the Cloudflare HTTP response is not ok', async (t) => {
    withFetch(t, (async () => ({ ok: false }) as unknown as Response) as typeof fetch);

    const result = await verifyTurnstileToken('some-token', '127.0.0.1');
    assert.equal(result, false);
  });

  it('returns false (not a throw) when the network request itself fails', async (t) => {
    withFetch(t, (async () => {
      throw new Error('network down');
    }) as typeof fetch);

    const result = await verifyTurnstileToken('some-token', '127.0.0.1');
    assert.equal(result, false);
  });
});

describe('turnstile.middleware requireTurnstile', () => {
  it('calls next() and passes the token through when verification succeeds', async (t) => {
    withFetch(
      t,
      (async () =>
        ({
          ok: true,
          json: async () => ({ success: true }),
        }) as unknown as Response) as typeof fetch,
    );

    const res = fakeRes();
    let nextCalls = 0;
    await requireTurnstile(req({ 'cf-turnstile-response': 'good-token' }), res, () => {
      nextCalls++;
    });

    assert.equal(nextCalls, 1);
    assert.notEqual(typeof res.status, 'number');
  });

  it('reads the token from body.turnstileToken as a fallback', async (t) => {
    withFetch(
      t,
      (async () =>
        ({
          ok: true,
          json: async () => ({ success: true }),
        }) as unknown as Response) as typeof fetch,
    );

    const res = fakeRes();
    let nextCalls = 0;
    await requireTurnstile(req({ turnstileToken: 'good-token' }), res, () => {
      nextCalls++;
    });

    assert.equal(nextCalls, 1);
  });

  it('reads the token from the x-turnstile-token header as a fallback', async (t) => {
    withFetch(
      t,
      (async () =>
        ({
          ok: true,
          json: async () => ({ success: true }),
        }) as unknown as Response) as typeof fetch,
    );

    const res = fakeRes();
    let nextCalls = 0;
    await requireTurnstile(req({}, { 'x-turnstile-token': 'good-token' }), res, () => {
      nextCalls++;
    });

    assert.equal(nextCalls, 1);
  });

  it('returns 400 without calling next() when verification fails', async (t) => {
    withFetch(
      t,
      (async () =>
        ({
          ok: true,
          json: async () => ({ success: false }),
        }) as unknown as Response) as typeof fetch,
    );

    const res = fakeRes();
    let nextCalls = 0;
    await requireTurnstile(req({ 'cf-turnstile-response': 'bad-token' }), res, () => {
      nextCalls++;
    });

    assert.equal(nextCalls, 0);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'Verifikasi anti-bot (Turnstile) gagal. Silakan coba lagi.',
    });
  });

  it('returns 400 without calling next() when no token is present at all', async (t) => {
    withFetch(
      t,
      (async () =>
        ({
          ok: true,
          json: async () => ({ success: true }),
        }) as unknown as Response) as typeof fetch,
    );

    const res = fakeRes();
    let nextCalls = 0;
    await requireTurnstile(req(), res, () => {
      nextCalls++;
    });

    assert.equal(nextCalls, 0);
    assert.equal(res.status, 400);
  });
});
