import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encryptCookieValue, decryptCookieValue } from '../utils/cookieSecurity.js';

describe('Cookie Security Utilities', () => {
  it('should encrypt and decrypt a sensitive cookie value correctly', () => {
    const sensitiveData = 'secret-pkce-verifier-12345';
    const encrypted = encryptCookieValue(sensitiveData);

    assert.notStrictEqual(encrypted, sensitiveData);
    assert.strictEqual(typeof encrypted, 'string');
    assert.strictEqual(encrypted.split(':').length, 3);

    const decrypted = decryptCookieValue(encrypted);
    assert.strictEqual(decrypted, sensitiveData);
  });

  it('should return null when decrypting invalid or tampered ciphertext', () => {
    const invalidFormat = 'invalid:format';
    assert.strictEqual(decryptCookieValue(invalidFormat), null);

    const tampered = '00'.repeat(12) + ':' + '00'.repeat(16) + ':' + 'deadbeef';
    assert.strictEqual(decryptCookieValue(tampered), null);
  });

  it('should return null for undefined or non-string input', () => {
    assert.strictEqual(decryptCookieValue(undefined), null);
    assert.strictEqual(decryptCookieValue(''), null);
  });
});
