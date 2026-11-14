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
  ])('rejects %j', (value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });

  it('rejects non-strings', () => {
    expect(safeRedirect(undefined)).toBeUndefined();
    expect(safeRedirect(null)).toBeUndefined();
    expect(safeRedirect(['/admin'])).toBeUndefined();
  });
});
