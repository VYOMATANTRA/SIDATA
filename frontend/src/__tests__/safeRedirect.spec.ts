import { describe, it, expect } from 'vitest';
import { safeRedirect } from '../utils/safeRedirect';

describe('safeRedirect', () => {
  it('accepts in-app paths with query and hash', () => {
    expect(safeRedirect('/admin/cerita')).toBe('/admin/cerita');
    expect(safeRedirect('/admin/publikasi?page=2#x')).toBe('/admin/publikasi?page=2#x');
    expect(safeRedirect('/')).toBe('/');
  });

  it.each([
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'admin',
    '',
    '/\t/evil.com',
    '/a\nb',
    '/login',
    '/login?redirect=/admin',
    '/register',
    '/setup-password',
    '/setup-password?x=1',
    '/auth/callback',
    '/auth/callback#frag',
    '/LOGIN',
  ])('rejects %j', (value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });

  it('still accepts paths that merely start with an auth word', () => {
    expect(safeRedirect('/login-help')).toBe('/login-help');
  });

  it.each([
    '/admin/../login',
    '/admin/%2e%2e/login',
    '/admin/..%2flogin',
    '/%6cogin',
    '/log%69n?x=1',
    '/LOGIN/../login',
    '/setup%2Dpassword',
    '/x\u0085y',
    '/\u009f',
    '/%0a/evil',
    '/%E0%A4%A',
    '/admin%3Fx',
  ])('rejects the encoded or normalised auth route %j', (value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });

  it('resolves dot segments and keeps the query and hash', () => {
    expect(safeRedirect('/admin/../admin/cerita?tab=2#x')).toBe('/admin/cerita?tab=2#x');
    expect(safeRedirect('/admin/cerita with space')).toBe('/admin/cerita%20with%20space');
  });

  it('rejects non-strings', () => {
    expect(safeRedirect(undefined)).toBeUndefined();
    expect(safeRedirect(null)).toBeUndefined();
    expect(safeRedirect(['/admin'])).toBeUndefined();
  });
});
