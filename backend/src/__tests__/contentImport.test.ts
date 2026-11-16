import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildIndicatorRequestBody,
  computeRateLimitDelayMs,
  extractCookiesFromHeaders,
  formatCookieHeader,
  parseContentImportManifest,
  stripMarkdownFormatting,
} from '../utils/contentImport.js';

describe('parseContentImportManifest', () => {
  it('parses the committed example manifest cleanly', () => {
    const examplePath = path.resolve('scripts/content-import.example.json');
    const raw = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    const manifest = parseContentImportManifest(raw);
    assert.equal(manifest.version, 1);
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.pages[0]?.chapters.length, 2);
  });

  it('rejects unpaired valuePrevious and periodPrevious on indicators', () => {
    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'jumlah-penduduk',
                  title: 'Jumlah Penduduk',
                  sections: [
                    {
                      title: 'Bagian 1',
                      indicators: [
                        {
                          slug: 'ind-a',
                          label: 'Indikator A',
                          valueCurrent: 100,
                          valuePrevious: 90,
                          periodCurrent: '2025',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /valuePrevious dan periodPrevious harus diisi berpasangan/,
    );
  });

  it('rejects isComputedComparison without previous period/value or comparisonTemplateSlug without flag', () => {
    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'jumlah-penduduk',
                  title: 'Jumlah Penduduk',
                  sections: [
                    {
                      title: 'Bagian 1',
                      indicators: [
                        {
                          slug: 'ind-a',
                          label: 'Indikator A',
                          valueCurrent: 100,
                          periodCurrent: '2025',
                          isComputedComparison: true,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /isComputedComparison=true memerlukan valuePrevious dan periodPrevious/,
    );

    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'jumlah-penduduk',
                  title: 'Jumlah Penduduk',
                  sections: [
                    {
                      title: 'Bagian 1',
                      indicators: [
                        {
                          slug: 'ind-b',
                          label: 'Indikator B',
                          valueCurrent: 100,
                          periodCurrent: '2025',
                          comparisonTemplateSlug: 'perbandingan-tahunan',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /comparisonTemplateSlug memerlukan isComputedComparison=true/,
    );
  });

  it('enforces sex-split vs total-only rules and rowKey constraints on tables', () => {
    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'piramida-usia',
                  title: 'Piramida Usia',
                  sections: [
                    {
                      title: 'Piramida',
                      tables: [
                        {
                          slug: 'tbl-piramida',
                          title: 'Tabel Piramida',
                          kind: 'age_pyramid',
                          period: '2025',
                          rows: [{ rowKey: '0-4', label: '0-4', male: 10, female: 10, total: 20 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /tidak boleh mengisi total secara langsung/,
    );

    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'mata-pencaharian',
                  title: 'Mata Pencaharian',
                  sections: [
                    {
                      title: 'Pekerjaan',
                      tables: [
                        {
                          slug: 'tbl-pekerjaan',
                          title: 'Tabel Pekerjaan',
                          kind: 'occupation',
                          period: '2025',
                          rows: [{ rowKey: 'jasa', label: 'Jasa', male: 10 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /tidak boleh mengisi male\/female/,
    );

    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'mata-pencaharian',
                  title: 'Mata Pencaharian',
                  sections: [
                    {
                      title: 'Pekerjaan',
                      tables: [
                        {
                          slug: 'tbl-pekerjaan',
                          title: 'Tabel Pekerjaan',
                          kind: 'occupation',
                          period: '2025',
                          rows: [{ rowKey: 'tmp:1', label: 'Jasa', total: 10 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /rowKey tidak boleh diawali tmp:/,
    );
  });

  it('rejects duplicate global indicator or table slugs and invalid diagrams', () => {
    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'jumlah-penduduk',
                  title: 'Jumlah Penduduk',
                  sections: [
                    {
                      title: 'Bagian 1',
                      indicators: [
                        { slug: 'dup-slug', label: 'A', valueCurrent: 1, periodCurrent: '2025' },
                        { slug: 'dup-slug', label: 'B', valueCurrent: 2, periodCurrent: '2025' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /Duplikat slug indikator: "dup-slug"/,
    );

    assert.throws(
      () =>
        parseContentImportManifest({
          pages: [
            {
              slug: 'kependudukan',
              chapters: [
                {
                  slug: 'jumlah-penduduk',
                  title: 'Jumlah Penduduk',
                  sections: [
                    {
                      title: 'Bagian 1',
                      figure: {
                        kind: 'diagram',
                        title: 'Diagram Kosong',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /Diagram harus berisi image atau bars/,
    );
  });
});

describe('buildIndicatorRequestBody', () => {
  it('resolves comparisonTemplateSlug and formats request fields', () => {
    const templates = new Map([['perbandingan-tahunan', 'tpl-uuid-1']]);
    const body = buildIndicatorRequestBody(
      {
        slug: 'jumlah-penduduk',
        label: 'Jumlah Penduduk',
        unit: 'jiwa',
        valueCurrent: 53098,
        valuePrevious: 52386,
        periodCurrent: '2025',
        periodPrevious: '2024',
        isComputedComparison: true,
        isStale: false,
        comparisonTemplateSlug: 'perbandingan-tahunan',
        source: 'MDA 2026',
        hedgeNote: null,
        sortOrder: 0,
      },
      'sec-uuid-1',
      templates,
    );

    assert.deepEqual(body, {
      sectionId: 'sec-uuid-1',
      slug: 'jumlah-penduduk',
      label: 'Jumlah Penduduk',
      unit: 'jiwa',
      valueCurrent: 53098,
      valuePrevious: 52386,
      periodCurrent: '2025',
      periodPrevious: '2024',
      isComputedComparison: true,
      isStale: false,
      comparisonTemplateId: 'tpl-uuid-1',
      source: 'MDA 2026',
      hedgeNote: null,
      sortOrder: 0,
    });
  });

  it('throws when comparisonTemplateSlug does not exist on the server', () => {
    assert.throws(
      () =>
        buildIndicatorRequestBody(
          {
            slug: 'jumlah-penduduk',
            label: 'Jumlah Penduduk',
            valueCurrent: 53098,
            valuePrevious: 52386,
            periodCurrent: '2025',
            periodPrevious: '2024',
            isComputedComparison: true,
            comparisonTemplateSlug: 'tidak-ada',
          },
          'sec-uuid-1',
          new Map(),
        ),
      /tidak ditemukan di server/,
    );
  });
});

describe('cookie & rate-limit helpers', () => {
  it('extracts and formats cookies including values containing equals signs', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'csrf_token=abc=123==; Path=/; HttpOnly');
    headers.append('set-cookie', 'refresh_token=xyz; Path=/api/auth; SameSite=Lax');

    const extracted = extractCookiesFromHeaders(headers);
    assert.deepEqual(extracted, {
      csrf_token: 'abc=123==',
      refresh_token: 'xyz',
    });

    const jar = new Map(Object.entries(extracted));
    assert.equal(formatCookieHeader(jar), 'csrf_token=abc=123==; refresh_token=xyz');
  });

  it('computes rate-limit wait time from Retry-After or RateLimit-Reset headers', () => {
    const h1 = new Headers({ 'retry-after': '12' });
    assert.equal(computeRateLimitDelayMs(h1), 12_500);

    const h2 = new Headers({ 'ratelimit-reset': '5' });
    assert.equal(computeRateLimitDelayMs(h2), 5_500);

    const h3 = new Headers();
    assert.equal(computeRateLimitDelayMs(h3, 9_000), 9_000);
  });
});

describe('stripMarkdownFormatting', () => {
  it('removes inline bold, italic, code, headings, links, and list markers while preserving snake_case & math', () => {
    const input = [
      '## Ringkasan *Program* **Eco Boba**',
      '',
      '> Kutipan dari [Publikasi](/publikasi) dengan `religion_by_sex` dan `_miring_`.',
      '- **Item A**: 2 * 3 = 6',
      '* __Item B__: nilai 100%',
    ].join('\n');

    assert.equal(
      stripMarkdownFormatting(input),
      [
        'Ringkasan Program Eco Boba',
        '',
        'Kutipan dari Publikasi dengan religion_by_sex dan miring.',
        '• Item A: 2 * 3 = 6',
        '• Item B: nilai 100%',
      ].join('\n'),
    );
  });

  it('strips Markdown automatically during parseContentImportManifest', () => {
    const manifest = parseContentImportManifest({
      pages: [
        {
          slug: 'kependudukan',
          chapters: [
            {
              slug: 'jumlah-penduduk',
              title: '**Jumlah Penduduk**',
              sections: [
                {
                  title: '*Profil* Utama',
                  proseBlocks: [
                    {
                      title: 'Ringkasan **Data**',
                      body: 'Tercatat **53.098 jiwa** (*Tabel 3.3.1*) dengan `kode_wilayah`:\n- **Laki-laki**: 27.310',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const sec = manifest.pages[0]?.chapters[0]?.sections[0];
    assert.equal(manifest.pages[0]?.chapters[0]?.title, 'Jumlah Penduduk');
    assert.equal(sec?.title, 'Profil Utama');
    assert.equal(sec?.proseBlocks?.[0]?.title, 'Ringkasan Data');
    assert.equal(
      sec?.proseBlocks?.[0]?.body,
      'Tercatat 53.098 jiwa (Tabel 3.3.1) dengan kode_wilayah:\n• Laki-laki: 27.310',
    );
  });
});
