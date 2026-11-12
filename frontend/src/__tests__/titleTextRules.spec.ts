import { describe, expect, it } from 'vitest';
import { hasHtmlTag, hasUnsafeCharacters } from '../utils/titleTextRules';

describe('titleTextRules', () => {
  it('spots the start of an HTML tag but not a plain less-than sign', () => {
    expect(hasHtmlTag('<b>tebal</b>')).toBe(true);
    expect(hasHtmlTag('a </div>')).toBe(true);
    expect(hasHtmlTag('usia < 17 tahun')).toBe(false);
  });

  it('spots control and direction-changing characters', () => {
    expect(hasUnsafeCharacters('a\u0000b')).toBe(true);
    expect(hasUnsafeCharacters('a\u007fb')).toBe(true);
    expect(hasUnsafeCharacters('a‮b')).toBe(true);
    expect(hasUnsafeCharacters('a⁧b')).toBe(true);
    expect(hasUnsafeCharacters('Kelurahan Manggar – 2025 é')).toBe(false);
  });

  it('treats line breaks as unsafe in a title but allows them when asked', () => {
    expect(hasUnsafeCharacters('a\nb')).toBe(true);
    expect(hasUnsafeCharacters('a\nb', true)).toBe(false);
  });
});
