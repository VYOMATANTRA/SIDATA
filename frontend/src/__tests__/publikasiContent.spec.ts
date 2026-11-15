import { describe, expect, it } from 'vitest';
import {
  formatPageCount,
  formatPublishedAt,
  isDownloadable,
  isValidPublishedAt,
  publicationCoverSrc,
  publicationDownloadHref,
  publicationMetaLine,
  type PublicationItem,
} from '../content/publikasi';

const ID = '11111111-1111-4111-8111-111111111111';
const base: PublicationItem = {
  category: 'A',
  title: 'B',
  description: 'C',
  isAvailableOnline: true,
};

describe('publication download and cover addresses', () => {
  it('prefers an uploaded file and serves it from the public download route', () => {
    expect(publicationDownloadHref({ ...base, documentAssetId: ID.toUpperCase() })).toBe(
      `/api/media/${ID}/download`,
    );
  });

  it('falls back to an https link and refuses anything else', () => {
    expect(publicationDownloadHref({ ...base, href: 'https://example.com/a.pdf' })).toBe(
      'https://example.com/a.pdf',
    );
    expect(publicationDownloadHref({ ...base, href: 'javascript:alert(1)' })).toBeNull();
    expect(publicationDownloadHref({ ...base, href: 'http://example.com/a.pdf' })).toBeNull();
  });

  it('gives nothing for an item that is not available online or has a malformed file id', () => {
    expect(
      publicationDownloadHref({ ...base, isAvailableOnline: false, documentAssetId: ID }),
    ).toBeNull();
    expect(publicationDownloadHref({ ...base, documentAssetId: '../../etc/passwd' })).toBeNull();
    expect(isDownloadable({ ...base, documentAssetId: '../x' })).toBe(false);
  });

  it('builds a thumbnail address only from a well-formed id', () => {
    expect(publicationCoverSrc({ ...base, coverAssetId: ID })).toBe(
      `/api/media/${ID}?variant=thumbnail`,
    );
    expect(publicationCoverSrc({ ...base, coverAssetId: 'x?y' })).toBeNull();
    expect(publicationCoverSrc(base)).toBeNull();
  });
});

describe('publication page count and publication date', () => {
  it('formats a page count only within 1 to 100000 whole pages', () => {
    expect(formatPageCount(12)).toBe('12 Halaman');
    expect(formatPageCount(1)).toBe('1 Halaman');
    expect(formatPageCount(100000)).toBe('100000 Halaman');
    expect(formatPageCount(0)).toBeNull();
    expect(formatPageCount(100001)).toBeNull();
    expect(formatPageCount(2.5)).toBeNull();
    expect(formatPageCount(undefined)).toBeNull();
  });

  it('shows only the month and year, for both accepted formats', () => {
    expect(formatPublishedAt('2026-03')).toBe('Maret 2026');
    expect(formatPublishedAt('2026-03-15')).toBe('Maret 2026');
    expect(formatPublishedAt('2025-12-01')).toBe('Desember 2025');
    expect(formatPublishedAt(' 2026-01 ')).toBe('Januari 2026');
  });

  it('returns null for a date that is not YYYY-MM or YYYY-MM-DD', () => {
    for (const bad of ['2026', '2026-13', '2026-00', '2026-03-32', '03-2026', '']) {
      expect(formatPublishedAt(bad)).toBeNull();
      expect(isValidPublishedAt(bad)).toBe(false);
    }
    expect(isValidPublishedAt('2026-02-28')).toBe(true);
  });

  it('builds the meta line from whichever parts are present', () => {
    expect(
      publicationMetaLine({
        ...base,
        pageCount: 40,
        publishedAt: '2026-11',
      }),
    ).toBe('40 Halaman, Diterbitkan November 2026');
    expect(publicationMetaLine({ ...base, pageCount: 40 })).toBe('40 Halaman');
    expect(publicationMetaLine({ ...base, publishedAt: '2026-11-02' })).toBe(
      'Diterbitkan November 2026',
    );
    expect(publicationMetaLine(base)).toBe('');
  });
});

describe('publishedAt calendar rule (same as the backend)', () => {
  it('accepts a real day and a month, and refuses days the month does not have', () => {
    for (const ok of ['2024-02-29', '2026-02-28', '2026-12-31', '2026-04-30', '2026-11']) {
      expect(isValidPublishedAt(ok)).toBe(true);
    }
    for (const bad of ['2026-02-30', '2025-02-29', '2026-02-31', '2026-04-31', '2026-13', '2026-00-10']) {
      expect(isValidPublishedAt(bad)).toBe(false);
      expect(formatPublishedAt(bad)).toBeNull();
    }
  });
});
