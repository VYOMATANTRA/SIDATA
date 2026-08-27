import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import { extractRequestContext } from '../utils/requestContext.js';

describe('extractRequestContext', () => {
  it('reads ip and user-agent when both are present', () => {
    const req = {
      ip: '203.0.113.5',
      headers: { 'user-agent': 'Mozilla/5.0 Test' },
    } as unknown as Request;

    assert.deepEqual(extractRequestContext(req), {
      ipAddress: '203.0.113.5',
      userAgent: 'Mozilla/5.0 Test',
    });
  });

  it('returns nulls when ip and headers are both absent (e.g. a bare test-request literal)', () => {
    const req = {} as unknown as Request;
    assert.deepEqual(extractRequestContext(req), { ipAddress: null, userAgent: null });
  });

  it('does not throw when req.get is not implemented (test literals are not real Express Request objects)', () => {
    // Regression guard: an earlier implementation called req.get('user-agent'), which crashed
    // every controller test using a plain object literal as the request.
    const req = { headers: { 'user-agent': 'curl/8.0' } } as unknown as Request;
    assert.doesNotThrow(() => extractRequestContext(req));
    assert.equal(extractRequestContext(req).userAgent, 'curl/8.0');
  });

  it('ignores a non-string user-agent header value', () => {
    const req = { headers: { 'user-agent': ['a', 'b'] } } as unknown as Request;
    assert.equal(extractRequestContext(req).userAgent, null);
  });
});
