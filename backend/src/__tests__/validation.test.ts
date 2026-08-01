import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeEmail } from '../utils/validation.js';

describe('normalizeEmail', () => {
  it('normalizes and validates an email before storage', () => {
    assert.equal(normalizeEmail('  User@Example.COM  '), 'user@example.com');
  });

  it('rejects invalid email format', () => {
    assert.throws(() => normalizeEmail('invalid-email'));
  });
});
