import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_FIGURE_JSON_LENGTH,
  figureAuditSummary,
  figureMediaIds,
  figureSlugForSection,
  mediaIdsOfStoredFigure,
  putFigureBodySchema,
  sectionFigureSchema,
} from '../utils/sectionFigure.js';

const ID = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const photo = (n: number, extra: Record<string, unknown> = {}) => ({
  mediaId: ID(n),
  alt: `Foto contoh ${n}`,
  ...extra,
});
const photos = (count: number) => Array.from({ length: count }, (_, i) => photo(i + 1));

const message = (input: unknown): string => {
  const parsed = sectionFigureSchema.safeParse(input);
  assert.equal(parsed.success, false, 'expected the figure to be rejected');
  return parsed.error!.issues.map((i) => i.message).join(', ');
};

describe('sectionFigureSchema', () => {
  describe('photo', () => {
    it('accepts exactly one photo and trims text', () => {
      const out = sectionFigureSchema.parse({
        kind: 'photo',
        photos: [photo(1, { caption: '  Balai warga  ', credit: ' Tim Lapangan ' })],
      });
      assert.deepEqual(out.kind === 'photo' && out.photos[0], {
        mediaId: ID(1),
        alt: 'Foto contoh 1',
        caption: 'Balai warga',
        credit: 'Tim Lapangan',
      });
    });

    it('rejects zero or two photos', () => {
      assert.match(message({ kind: 'photo', photos: [] }), /tepat 1 foto/);
      assert.match(message({ kind: 'photo', photos: photos(2) }), /tepat 1 foto/);
    });

    it('lowercases the media id', () => {
      const out = sectionFigureSchema.parse({
        kind: 'photo',
        photos: [{ mediaId: ID(1).replace('1111', 'ABCD'), alt: 'Foto' }],
      });
      assert.equal(out.kind === 'photo' && out.photos[0]!.mediaId.includes('abcd'), true);
    });

    it('rejects a media id that is not a uuid', () => {
      assert.match(
        message({ kind: 'photo', photos: [{ mediaId: 'abc', alt: 'x' }] }),
        /Foto tidak valid/,
      );
      assert.match(message({ kind: 'photo', photos: [{ alt: 'x' }] }), /Foto belum dipilih/);
    });
  });

  describe('photos', () => {
    it('accepts 2 to 12 photos', () => {
      for (const n of [2, 3, 12]) {
        assert.equal(
          sectionFigureSchema.safeParse({ kind: 'photos', photos: photos(n) }).success,
          true,
          String(n),
        );
      }
    });

    it('rejects 1 and 13 photos', () => {
      assert.match(message({ kind: 'photos', photos: photos(1) }), /minimal berisi 2 foto/);
      assert.match(message({ kind: 'photos', photos: photos(13) }), /maksimal berisi 12 foto/);
    });

    it('rejects a duplicate media id inside one figure, case-insensitively', () => {
      const dup = [photo(1), { mediaId: ID(1).toUpperCase(), alt: 'Lagi' }];
      assert.match(
        message({ kind: 'photos', photos: dup }),
        /tidak boleh dipakai lebih dari sekali/,
      );
    });
  });

  describe('photo fields', () => {
    const one = (p: Record<string, unknown>) => ({ kind: 'photo', photos: [p] });

    it('requires alt text, and refuses a blank one', () => {
      assert.match(message(one({ mediaId: ID(1) })), /Teks alternatif foto/);
      assert.match(
        message(one({ mediaId: ID(1), alt: '   ' })),
        /Teks alternatif foto wajib diisi/,
      );
    });

    it('enforces the length limits (alt 300, caption 200, credit 120)', () => {
      assert.equal(
        sectionFigureSchema.safeParse(one(photo(1, { alt: 'a'.repeat(300) }))).success,
        true,
      );
      assert.match(message(one(photo(1, { alt: 'a'.repeat(301) }))), /maksimal 300/);
      assert.equal(
        sectionFigureSchema.safeParse(one(photo(1, { caption: 'c'.repeat(200) }))).success,
        true,
      );
      assert.match(
        message(one(photo(1, { caption: 'c'.repeat(201) }))),
        /Keterangan foto maksimal 200/,
      );
      assert.equal(
        sectionFigureSchema.safeParse(one(photo(1, { credit: 'k'.repeat(120) }))).success,
        true,
      );
      assert.match(message(one(photo(1, { credit: 'k'.repeat(121) }))), /Sumber foto maksimal 120/);
    });

    it('drops blank caption and credit instead of storing empty strings', () => {
      const out = sectionFigureSchema.parse(one(photo(1, { caption: '  ', credit: '' })));
      const stored = JSON.parse(JSON.stringify(out)) as { photos: Array<Record<string, unknown>> };
      assert.deepEqual(Object.keys(stored.photos[0]!).sort(), ['alt', 'mediaId']);
    });

    it('rejects HTML tags and control or bidi characters in every text field', () => {
      for (const field of ['alt', 'caption', 'credit'] as const) {
        assert.match(message(one(photo(1, { [field]: '<b>tebal</b>' }))), /tag HTML/, field);
        assert.match(
          message(one(photo(1, { [field]: 'a\u0000b' }))),
          /karakter yang tidak valid/,
          field,
        );
        assert.match(
          message(one(photo(1, { [field]: 'a‮b' }))),
          /karakter yang tidak valid/,
          field,
        );
        assert.match(
          message(one(photo(1, { [field]: 'a\nb' }))),
          /karakter yang tidak valid/,
          field,
        );
      }
    });

    it('rejects unknown keys on the photo and on the figure', () => {
      assert.match(message(one(photo(1, { url: '/x.jpg' }))), /tidak dikenal/);
      assert.match(message({ kind: 'photo', photos: [photo(1)], extra: 1 }), /tidak dikenal/);
    });
  });

  describe('diagram', () => {
    const bars = (n: number) => ({
      items: Array.from({ length: n }, (_, i) => ({ label: `Kelompok ${i + 1}`, value: i })),
    });

    it('accepts bars only, image only, or both', () => {
      const base = { kind: 'diagram', title: 'Penduduk menurut usia', source: 'Data contoh' };
      assert.equal(
        sectionFigureSchema.safeParse({ ...base, bars: { unit: 'jiwa', ...bars(3) } }).success,
        true,
      );
      assert.equal(
        sectionFigureSchema.safeParse({ ...base, image: { mediaId: ID(1), alt: 'Grafik' } })
          .success,
        true,
      );
      assert.equal(
        sectionFigureSchema.safeParse({
          ...base,
          image: { mediaId: ID(1), alt: 'Grafik' },
          bars: bars(1),
        }).success,
        true,
      );
    });

    it('needs an image or bars', () => {
      assert.match(message({ kind: 'diagram', title: 'Judul' }), /gambar atau diagram batang/);
    });

    it('requires a title of 1 to 120 characters and a source of at most 200', () => {
      assert.match(message({ kind: 'diagram', bars: bars(1) }), /Judul diagram/);
      assert.match(
        message({ kind: 'diagram', title: ' ', bars: bars(1) }),
        /Judul diagram wajib diisi/,
      );
      assert.match(
        message({ kind: 'diagram', title: 'j'.repeat(121), bars: bars(1) }),
        /maksimal 120/,
      );
      assert.equal(
        sectionFigureSchema.safeParse({ kind: 'diagram', title: 'j'.repeat(120), bars: bars(1) })
          .success,
        true,
      );
      assert.match(
        message({ kind: 'diagram', title: 'J', source: 's'.repeat(201), bars: bars(1) }),
        /Sumber diagram maksimal 200/,
      );
    });

    it('limits bars to 1..20 items, label 80, unit 20', () => {
      assert.match(
        message({ kind: 'diagram', title: 'J', bars: bars(0) }),
        /minimal memiliki 1 batang/,
      );
      assert.match(message({ kind: 'diagram', title: 'J', bars: bars(21) }), /maksimal 20 batang/);
      assert.equal(
        sectionFigureSchema.safeParse({ kind: 'diagram', title: 'J', bars: bars(20) }).success,
        true,
      );
      assert.match(
        message({
          kind: 'diagram',
          title: 'J',
          bars: { items: [{ label: 'l'.repeat(81), value: 1 }] },
        }),
        /Label batang diagram maksimal 80/,
      );
      assert.match(
        message({ kind: 'diagram', title: 'J', bars: { unit: 'u'.repeat(21), ...bars(1) } }),
        /Satuan diagram maksimal 20/,
      );
    });

    it('requires every bar value to be a finite number', () => {
      for (const value of ['12', null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.match(
          message({ kind: 'diagram', title: 'J', bars: { items: [{ label: 'A', value }] } }),
          /harus berupa angka/,
          String(value),
        );
      }
      assert.equal(
        sectionFigureSchema.safeParse({
          kind: 'diagram',
          title: 'J',
          bars: {
            items: [
              { label: 'A', value: -2.5 },
              { label: 'B', value: 0 },
            ],
          },
        }).success,
        true,
      );
    });

    it('requires alt text on the diagram image', () => {
      assert.match(
        message({ kind: 'diagram', title: 'J', image: { mediaId: ID(1) } }),
        /Teks alternatif gambar diagram/,
      );
    });

    it('rejects HTML and control characters in title, source, labels and unit', () => {
      assert.match(message({ kind: 'diagram', title: '<i>x</i>', bars: bars(1) }), /tag HTML/);
      assert.match(
        message({ kind: 'diagram', title: 'J', source: 'a\u0007', bars: bars(1) }),
        /tidak valid/,
      );
      assert.match(
        message({
          kind: 'diagram',
          title: 'J',
          bars: { items: [{ label: '<script>', value: 1 }] },
        }),
        /tag HTML/,
      );
      assert.match(
        message({ kind: 'diagram', title: 'J', bars: { unit: 'a​b', ...bars(1) } }),
        /tidak valid/,
      );
    });

    it('rejects unknown keys inside bars, items and image', () => {
      assert.match(
        message({ kind: 'diagram', title: 'J', bars: { ...bars(1), extra: 1 } }),
        /tidak dikenal/,
      );
      assert.match(
        message({
          kind: 'diagram',
          title: 'J',
          bars: { items: [{ label: 'A', value: 1, color: 'red' }] },
        }),
        /tidak dikenal/,
      );
      assert.match(
        message({ kind: 'diagram', title: 'J', image: { mediaId: ID(1), alt: 'A', url: 'x' } }),
        /tidak dikenal/,
      );
    });
  });

  describe('extra limits', () => {
    const diagramWith = (items: Array<{ label: string; value: number }>) => ({
      kind: 'diagram',
      title: 'J',
      bars: { items },
    });

    it('bar values must stay within +/- 1 000 000 000', () => {
      for (const value of [1e9, -1e9, 0, 123.45]) {
        assert.equal(
          sectionFigureSchema.safeParse(diagramWith([{ label: 'A', value }])).success,
          true,
          String(value),
        );
      }
      for (const value of [1e9 + 1, -1e9 - 1, 1e308, -1e308]) {
        assert.match(
          message(diagramWith([{ label: 'A', value }])),
          /Nilai batang diagram tidak wajar/,
          String(value),
        );
      }
    });

    it('rejects duplicate bar labels, ignoring case and surrounding spaces', () => {
      assert.match(
        message(
          diagramWith([
            { label: 'Laki-laki', value: 1 },
            { label: '  laki-LAKI ', value: 2 },
          ]),
        ),
        /Label batang diagram tidak boleh sama/,
      );
      assert.equal(
        sectionFigureSchema.safeParse(
          diagramWith([
            { label: 'Laki-laki', value: 1 },
            { label: 'Perempuan', value: 2 },
          ]),
        ).success,
        true,
      );
    });

    it('caps the serialized figure length', () => {
      assert.equal(MAX_FIGURE_JSON_LENGTH, 12_000);
      // Full-length plain text in all 12 photos still fits...
      const plain = Array.from({ length: 12 }, (_, i) => ({
        mediaId: ID(i + 1),
        alt: 'a'.repeat(300),
        caption: 'c'.repeat(200),
        credit: 'k'.repeat(120),
      }));
      assert.equal(sectionFigureSchema.safeParse({ kind: 'photos', photos: plain }).success, true);
      // ...but text that JSON escapes (every quote doubles) does not.
      const escaped = plain.map((p) => ({
        ...p,
        alt: '"'.repeat(300),
        caption: '"'.repeat(200),
        credit: '"'.repeat(120),
      }));
      assert.match(message({ kind: 'photos', photos: escaped }), /Gambar terlalu besar/);
    });
  });

  it('rejects an unknown or missing kind and non-object input', () => {
    assert.match(message({ kind: 'video', photos: [] }), /Jenis gambar tidak dikenal/);
    assert.match(message({ photos: photos(1) }), /Jenis gambar tidak dikenal/);
    assert.equal(sectionFigureSchema.safeParse('photo').success, false);
    assert.equal(sectionFigureSchema.safeParse(null).success, false);
  });

  it('never carries a prototype key into the parsed figure', () => {
    const polluted = JSON.parse(
      '{"kind":"photo","photos":[{"mediaId":"' +
        ID(1) +
        '","alt":"A"}],"__proto__":{"polluted":true}}',
    );
    const parsed = sectionFigureSchema.safeParse(polluted);
    if (parsed.success) {
      assert.equal(Object.prototype.hasOwnProperty.call(parsed.data, '__proto__'), false);
      assert.equal(JSON.stringify(parsed.data).includes('polluted'), false);
    }
    assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
  });
});

describe('putFigureBodySchema', () => {
  it('requires an ISO expectedUpdatedAt and rejects extra keys', () => {
    assert.equal(
      putFigureBodySchema.safeParse({ expectedUpdatedAt: '2026-10-01T00:00:00.000Z', figure: {} })
        .success,
      true,
    );
    assert.equal(putFigureBodySchema.safeParse({ figure: {} }).success, false);
    assert.equal(
      putFigureBodySchema.safeParse({ expectedUpdatedAt: 'yesterday', figure: {} }).success,
      false,
    );
    assert.equal(
      putFigureBodySchema.safeParse({
        expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
        figure: {},
        x: 1,
      }).success,
      false,
    );
  });
});

describe('figure helpers', () => {
  it('derives a deterministic slug per section', () => {
    assert.equal(figureSlugForSection('abc'), 'figure-abc');
  });

  it('lists media ids per kind', () => {
    const group = sectionFigureSchema.parse({ kind: 'photos', photos: photos(3) });
    assert.deepEqual(figureMediaIds(group), [ID(1), ID(2), ID(3)]);
    const diagram = sectionFigureSchema.parse({
      kind: 'diagram',
      title: 'J',
      image: { mediaId: ID(4), alt: 'A' },
    });
    assert.deepEqual(figureMediaIds(diagram), [ID(4)]);
    const barsOnly = sectionFigureSchema.parse({
      kind: 'diagram',
      title: 'J',
      bars: { items: [{ label: 'A', value: 1 }] },
    });
    assert.deepEqual(figureMediaIds(barsOnly), []);
  });

  it('audit summary carries kind and count only', () => {
    const group = sectionFigureSchema.parse({
      kind: 'photos',
      photos: [photo(1, { caption: 'rahasia' }), photo(2)],
    });
    assert.deepEqual(figureAuditSummary(group), { kind: 'photos', photoCount: 2 });
    assert.equal(JSON.stringify(figureAuditSummary(group)).includes('rahasia'), false);
  });

  it('releases media of a stored figure even when it no longer validates', () => {
    assert.deepEqual(mediaIdsOfStoredFigure({ kind: 'photo', photos: [{ mediaId: ID(1) }] }), [
      ID(1),
    ]);
    assert.deepEqual(mediaIdsOfStoredFigure(null), []);
    assert.deepEqual(mediaIdsOfStoredFigure({ kind: 'diagram', image: { mediaId: ID(2) } }), [
      ID(2),
    ]);
    assert.deepEqual(mediaIdsOfStoredFigure({ photos: [{ mediaId: 'not-a-uuid' }] }), []);
  });
});
