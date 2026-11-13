import { describe, expect, it } from 'vitest';
import {
  isDownloadable,
  publicationCoverSrc,
  publicationDownloadHref,
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
