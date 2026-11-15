import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateBlockMetadata } from '../services/contentBlocks.service.js';

describe('content block metadata schema stripping', () => {
  it('drops unknown sambutan and highlight keys, including nested item keys', () => {
    const sambutan = validateBlockMetadata('landing-sambutan-lurah', {
      authorName: 'Nama',
      unexpected: 'should not persist',
    });
    assert.deepEqual(sambutan, { authorName: 'Nama' });

    const highlight = validateBlockMetadata('landing-highlights', {
      items: [{ title: 'Judul', desc: 'Deskripsi', injected: 'x' }],
      extra: true,
    });
    assert.deepEqual(highlight, { items: [{ title: 'Judul', desc: 'Deskripsi' }] });
  });

  it('drops unknown boundary, SOTK, and profile keys at both levels', () => {
    const profil = validateBlockMetadata('tentang-kelurahan-profil', {
      rtCount: 100,
      lurahName: 'Munir',
      batasWilayah: [{ arah: 'Utara', wilayah: 'Karang Joang', injected: 'x' }],
      sotkMembers: [{ role: 'Lurah', officialName: 'Munir', duties: null, injected: 'x' }],
      unexpected: 'should not persist',
    });
    assert.deepEqual(profil, {
      rtCount: 100,
      lurahName: 'Munir',
      batasWilayah: [{ arah: 'Utara', wilayah: 'Karang Joang' }],
      sotkMembers: [{ role: 'Lurah', officialName: 'Munir', duties: null }],
    });
  });

  it('validates publication metadata with optional fileType and fileSizeBytes', () => {
    const validated = validateBlockMetadata('publikasi-katalog', {
      publications: [
        {
          category: 'Statistik',
          title: 'Judul',
          description: 'Deskripsi',
          href: 'https://example.com/file.pdf',
          isAvailableOnline: true,
          fileType: 'PDF',
          fileSizeBytes: 1024,
          unknownKey: 'drop-me',
        },
      ],
    });

    assert.deepEqual(validated, {
      publications: [
        {
          category: 'Statistik',
          title: 'Judul',
          description: 'Deskripsi',
          href: 'https://example.com/file.pdf',
          isAvailableOnline: true,
          fileType: 'PDF',
          fileSizeBytes: 1024,
        },
      ],
    });
  });

  it('rejects invalid fileSizeBytes (negative, fractional, or non-integer)', () => {
    assert.throws(() => {
      validateBlockMetadata('publikasi-katalog', {
        publications: [
          {
            category: 'Statistik',
            title: 'Judul',
            description: 'Deskripsi',
            fileSizeBytes: -10,
          },
        ],
      });
    });

    assert.throws(() => {
      validateBlockMetadata('publikasi-katalog', {
        publications: [
          {
            category: 'Statistik',
            title: 'Judul',
            description: 'Deskripsi',
            fileSizeBytes: 10.5,
          },
        ],
      });
    });
  });
  it('accepts pageCount and publishedAt and rejects invalid values', () => {
    const base = { category: 'Statistik', title: 'Judul', description: 'Deskripsi' };
    const ok = validateBlockMetadata('publikasi-katalog', {
      publications: [
        { ...base, pageCount: 120, publishedAt: '2026-08' },
        { ...base, pageCount: 1, publishedAt: '2026-08-21' },
      ],
    });
    assert.deepEqual(ok, {
      publications: [
        { ...base, pageCount: 120, publishedAt: '2026-08', isAvailableOnline: false },
        { ...base, pageCount: 1, publishedAt: '2026-08-21', isAvailableOnline: false },
      ],
    });

    for (const bad of [
      { pageCount: 0 },
      { pageCount: 1.5 },
      { publishedAt: '2026-13' },
      { publishedAt: 'Agustus 2026' },
    ]) {
      assert.throws(() =>
        validateBlockMetadata('publikasi-katalog', { publications: [{ ...base, ...bad }] }),
      );
    }
  });

  it('accepts only real calendar dates for publishedAt', () => {
    const base = { category: 'Statistik', title: 'Judul', description: 'Deskripsi' };
    const accepted = ['2024-02-29', '2026-02-28', '2026-12-31', '2026-04-30', '2026-11'];
    for (const publishedAt of accepted) {
      assert.doesNotThrow(() =>
        validateBlockMetadata('publikasi-katalog', { publications: [{ ...base, publishedAt }] }),
      );
    }
    const refused = [
      '2026-02-30',
      '2025-02-29',
      '2026-02-31',
      '2026-04-31',
      '2026-13',
      '2026-00-10',
    ];
    for (const publishedAt of refused) {
      assert.throws(
        () =>
          validateBlockMetadata('publikasi-katalog', { publications: [{ ...base, publishedAt }] }),
        `${publishedAt} must be refused`,
      );
    }
  });
});
