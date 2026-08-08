import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import {
  generateOAuthState,
  createPkcePair,
  setOAuthCookies,
  clearOAuthCookies,
} from '../utils/oauth.js';

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
    assert.equal(firstCall.val, 'state123');
    assert.equal(firstCall.options.httpOnly, true);
    assert.equal(secondCall.name, 'oauth_verifier');
    assert.equal(secondCall.val, 'verifier123');
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
