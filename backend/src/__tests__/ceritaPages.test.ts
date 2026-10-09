import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CERITA_PAGES } from '../../prisma/ceritaPages.js';

// Byte-length bounds are the conservative check for utf8mb4 VARCHAR(n) (n counts characters,
// but a slug that fits in n bytes trivially fits in n characters).
const byteLength = (s: string) => Buffer.byteLength(s, 'utf8');

const EXPECTED_PAGE_SLUGS = [
  'kependudukan',
  'pendidikan',
  'kesehatan',
  'ekonomi-dan-ketertiban',
  'geografis-dan-tata-ruang',
  'pemerintahan-dan-kelembagaan',
  'infrastruktur-dan-perumahan',
  'persampahan-dan-bank-sampah-unit',
];

const EXPECTED_CHAPTER_COUNTS = [6, 4, 10, 4, 3, 6, 2, 3];

const NUMBERED_PAGES = new Set(['pemerintahan-dan-kelembagaan', 'infrastruktur-dan-perumahan']);

const pageBySlug = (slug: string) => {
  const page = CERITA_PAGES.find((p) => p.slug === slug);
  assert.ok(page, `missing page ${slug}`);
  return page;
};

describe('CERITA_PAGES seed data', () => {
  it('has exactly 8 pages', () => {
    assert.equal(CERITA_PAGES.length, 8);
  });

  it('lists the pages in the SPEC §2 order', () => {
    assert.deepStrictEqual(
      CERITA_PAGES.map((p) => p.slug),
      EXPECTED_PAGE_SLUGS,
    );
  });

  it('has the expected chapter count per page', () => {
    assert.deepStrictEqual(
      CERITA_PAGES.map((p) => p.chapters.length),
      EXPECTED_CHAPTER_COUNTS,
    );
  });

  it('has a total of 38 chapters', () => {
    const total = CERITA_PAGES.reduce((n, p) => n + p.chapters.length, 0);
    assert.equal(total, 38);
  });

  it('has unique, non-empty page slugs', () => {
    const slugs = CERITA_PAGES.map((p) => p.slug);
    for (const slug of slugs) {
      assert.equal(typeof slug, 'string');
      assert.ok(slug.length > 0);
      assert.equal(slug, slug.trim());
    }
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it('has non-empty, trimmed page titles of at most 255 characters', () => {
    for (const page of CERITA_PAGES) {
      assert.equal(typeof page.title, 'string');
      assert.ok(page.title.trim().length > 0, `empty title on ${page.slug}`);
      assert.equal(page.title, page.title.trim(), `untrimmed title on ${page.slug}`);
      assert.ok(page.title.length <= 255, `title too long on ${page.slug}`);
    }
  });

  it('has unique page titles', () => {
    const titles = CERITA_PAGES.map((p) => p.title);
    assert.equal(new Set(titles).size, titles.length);
  });

  it('gives every page at least one chapter', () => {
    for (const page of CERITA_PAGES) {
      assert.ok(Array.isArray(page.chapters), `${page.slug}.chapters is not an array`);
      assert.ok(page.chapters.length >= 1, `${page.slug} has no chapters`);
    }
  });

  it('has unique, non-empty chapter slugs within each page', () => {
    for (const page of CERITA_PAGES) {
      const slugs = page.chapters.map((c) => c.slug);
      for (const slug of slugs) {
        assert.equal(typeof slug, 'string');
        assert.ok(slug.length > 0, `empty chapter slug on ${page.slug}`);
      }
      assert.equal(new Set(slugs).size, slugs.length, `duplicate chapter slug on ${page.slug}`);
    }
  });

  it('has non-empty, trimmed chapter titles of at most 255 characters', () => {
    for (const page of CERITA_PAGES) {
      for (const chapter of page.chapters) {
        const where = `${page.slug}/${chapter.slug}`;
        assert.equal(typeof chapter.title, 'string');
        assert.ok(chapter.title.trim().length > 0, `empty title on ${where}`);
        assert.equal(chapter.title, chapter.title.trim(), `untrimmed title on ${where}`);
        assert.ok(chapter.title.length <= 255, `title too long on ${where}`);
      }
    }
  });

  it('keeps chapter number, when present, a non-empty string of at most 16 characters', () => {
    for (const page of CERITA_PAGES) {
      for (const chapter of page.chapters) {
        if (chapter.number === undefined) continue;
        const where = `${page.slug}/${chapter.slug}`;
        assert.equal(typeof chapter.number, 'string', where);
        assert.ok(chapter.number.length > 0, `empty number on ${where}`);
        assert.ok(chapter.number.length <= 16, `number too long on ${where}`);
      }
    }
  });

  it('only has the allowed keys on pages and chapters', () => {
    for (const page of CERITA_PAGES) {
      assert.deepStrictEqual(Object.keys(page).sort(), ['chapters', 'slug', 'title']);
      for (const chapter of page.chapters) {
        const keys = Object.keys(chapter).sort();
        const allowed =
          chapter.number === undefined ? ['slug', 'title'] : ['number', 'slug', 'title'];
        assert.deepStrictEqual(keys, allowed, `${page.slug}/${chapter.slug}`);
      }
    }
  });

  it('numbers Pemerintahan chapters exactly 2.1 through 2.6 in order', () => {
    assert.deepStrictEqual(
      pageBySlug('pemerintahan-dan-kelembagaan').chapters.map((c) => c.number),
      ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6'],
    );
  });

  it('includes Pemerintahan Kelurahan as chapter 2.3 (Ketua RT page link target)', () => {
    const chapter = pageBySlug('pemerintahan-dan-kelembagaan').chapters.find(
      (c) => c.number === '2.3',
    );
    assert.ok(chapter);
    assert.equal(chapter.title, 'Pemerintahan Kelurahan');
  });

  it('numbers Infrastruktur chapters exactly 6.1 and 6.2 in order', () => {
    assert.deepStrictEqual(
      pageBySlug('infrastruktur-dan-perumahan').chapters.map((c) => c.number),
      ['6.1', '6.2'],
    );
  });

  it('gives no chapter number on pages SPEC §2 does not number', () => {
    for (const page of CERITA_PAGES) {
      if (NUMBERED_PAGES.has(page.slug)) continue;
      for (const chapter of page.chapters) {
        assert.equal(chapter.number, undefined, `${page.slug}/${chapter.slug} has a number`);
        assert.equal('number' in chapter, false, `${page.slug}/${chapter.slug} has a number key`);
      }
    }
  });

  it('numbers every chapter on numbered pages', () => {
    for (const slug of NUMBERED_PAGES) {
      for (const chapter of pageBySlug(slug).chapters) {
        assert.equal(typeof chapter.number, 'string', `${slug}/${chapter.slug}`);
      }
    }
  });

  it('keeps chapter numbers unique within each page', () => {
    for (const page of CERITA_PAGES) {
      const numbers = page.chapters.map((c) => c.number).filter((n) => n !== undefined);
      assert.equal(new Set(numbers).size, numbers.length, page.slug);
    }
  });

  it('fits every page slug in VARCHAR(191)', () => {
    for (const page of CERITA_PAGES) {
      assert.ok(byteLength(page.slug) <= 191, page.slug);
    }
  });

  it('fits every chapter slug in VARCHAR(191)', () => {
    for (const page of CERITA_PAGES) {
      for (const chapter of page.chapters) {
        assert.ok(byteLength(chapter.slug) <= 191, `${page.slug}/${chapter.slug}`);
      }
    }
  });

  it('uses ASCII-only slugs (so character and byte length agree)', () => {
    for (const page of CERITA_PAGES) {
      assert.match(page.slug, /^[\x20-\x7e]+$/);
      for (const chapter of page.chapters) {
        assert.match(chapter.slug, /^[\x20-\x7e]+$/);
      }
    }
  });

  it('is exported as a stable array whose index defines page sortOrder (0..7)', () => {
    assert.ok(Array.isArray(CERITA_PAGES));
    assert.deepStrictEqual(
      CERITA_PAGES.map((_, i) => i),
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
  });
});
