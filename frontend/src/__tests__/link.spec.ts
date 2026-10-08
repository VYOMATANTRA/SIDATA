import { describe, it, expect } from 'vitest';
import { isExternalLink, computeLinkRel } from '../utils/link';

describe('utils/link.ts', () => {
  describe('isExternalLink', () => {
    it('returns true when target is _blank regardless of href', () => {
      expect(isExternalLink('/internal-path', '_blank')).toBe(true);
      expect(isExternalLink(undefined, '_blank')).toBe(true);
    });

    it('returns true for http and https URLs', () => {
      expect(isExternalLink('http://example.com')).toBe(true);
      expect(isExternalLink('https://example.com')).toBe(true);
      expect(isExternalLink('  https://example.com  ')).toBe(true);
    });

    it('returns true for protocol-relative URLs (//)', () => {
      expect(isExternalLink('//example.com/asset')).toBe(true);
    });

    it('returns false for internal or relative paths and falsy values', () => {
      expect(isExternalLink('/dashboard')).toBe(false);
      expect(isExternalLink('#section')).toBe(false);
      expect(isExternalLink('relative/path')).toBe(false);
      expect(isExternalLink('')).toBe(false);
      expect(isExternalLink(undefined)).toBe(false);
    });
  });

  describe('computeLinkRel', () => {
    it('returns explicit rel prop if provided', () => {
      expect(computeLinkRel('https://example.com', undefined, 'custom-rel')).toBe('custom-rel');
    });

    it('returns "noopener noreferrer" for external links without explicit rel', () => {
      expect(computeLinkRel('https://example.com')).toBe('noopener noreferrer');
      expect(computeLinkRel('//cdn.example.com')).toBe('noopener noreferrer');
      expect(computeLinkRel('/local', '_blank')).toBe('noopener noreferrer');
    });

    it('returns undefined for internal links without explicit rel', () => {
      expect(computeLinkRel('/internal')).toBeUndefined();
      expect(computeLinkRel('#anchor')).toBeUndefined();
    });
  });
});
