import { describe, it, expect } from 'vitest';
import {
  figuresBySectionId,
  mediaPublicUrl,
  storedFigureToArticleFigure,
} from '../utils/ceritaStoredFigure';

// Synthetic ids only.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('mediaPublicUrl', () => {
  it('builds the public photo path from a uuid, lower-cased', () => {
    expect(mediaPublicUrl(A.toUpperCase())).toBe(`/api/media/${A}`);
  });

  it.each([undefined, null, 5, '', 'abc', '../x', `${A}/../x`, `${A}?x=1`, 'javascript:alert(1)'])(
    'refuses %j',
    (value) => {
      expect(mediaPublicUrl(value)).toBeNull();
    },
  );
});

describe('storedFigureToArticleFigure', () => {
  it('maps a single photo with caption and credit', () => {
    expect(
      storedFigureToArticleFigure({
        kind: 'photo',
        photos: [{ mediaId: A, alt: ' Gedung sekolah ', caption: 'SDN Contoh', credit: 'Tim' }],
      }),
    ).toEqual({
      kind: 'photo',
      photo: {
        id: `/api/media/${A}`,
        src: `/api/media/${A}`,
        alt: 'Gedung sekolah',
        caption: 'SDN Contoh',
        credit: 'Tim',
      },
    });
  });

  it('omits blank or missing caption and credit instead of storing empty strings', () => {
    const figure = storedFigureToArticleFigure({
      kind: 'photo',
      photos: [{ mediaId: A, alt: 'Foto', caption: '   ', credit: 3 }],
    });
    expect(figure).toEqual({
      kind: 'photo',
      photo: { id: `/api/media/${A}`, src: `/api/media/${A}`, alt: 'Foto' },
    });
  });

  it('maps a photo group in stored order', () => {
    const figure = storedFigureToArticleFigure({
      kind: 'photos',
      photos: [
        { mediaId: A, alt: 'Satu' },
        { mediaId: B, alt: 'Dua' },
        { mediaId: C, alt: 'Tiga' },
      ],
    });
    expect(figure?.kind).toBe('photos');
    expect(figure?.kind === 'photos' && figure.photos.map((p) => p.alt)).toEqual([
      'Satu',
      'Dua',
      'Tiga',
    ]);
  });

  it('leaves out unusable photos (no alt, bad id, duplicate, not an object) and keeps the rest', () => {
    const figure = storedFigureToArticleFigure({
      kind: 'photos',
      photos: [
        { mediaId: A, alt: 'Satu' },
        { mediaId: B, alt: '  ' },
        { mediaId: 'bukan-id', alt: 'Dua' },
        { mediaId: A, alt: 'Ganda' },
        'teks',
        null,
        { mediaId: C, alt: 'Tiga' },
      ],
    });
    expect(figure?.kind === 'photos' && figure.photos.map((p) => p.alt)).toEqual(['Satu', 'Tiga']);
  });

  it('caps a photo group at twelve', () => {
    const photos = Array.from({ length: 15 }, (_, i) => ({
      mediaId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      alt: `Foto ${i}`,
    }));
    const figure = storedFigureToArticleFigure({ kind: 'photos', photos });
    expect(figure?.kind === 'photos' && figure.photos).toHaveLength(12);
  });

  it('takes the first usable photo for kind photo', () => {
    const figure = storedFigureToArticleFigure({
      kind: 'photo',
      photos: [
        { mediaId: 'x', alt: 'Rusak' },
        { mediaId: B, alt: 'Dua' },
      ],
    });
    expect(figure?.kind === 'photo' && figure.photo.alt).toBe('Dua');
  });

  it('maps a diagram with a picture and bars', () => {
    const figure = storedFigureToArticleFigure({
      kind: 'diagram',
      title: ' Diagram Contoh ',
      source: 'Sumber Contoh',
      image: { mediaId: A, alt: 'Grafik batang' },
      bars: {
        unit: 'orang',
        items: [
          { label: 'A', value: 5 },
          { label: 'B', value: -2.5 },
        ],
      },
    });
    expect(figure).toEqual({
      kind: 'diagram',
      title: 'Diagram Contoh',
      src: `/api/media/${A}`,
      alt: 'Grafik batang',
      bars: {
        unit: 'orang',
        items: [
          { id: 'bar-0', label: 'A', value: 5 },
          { id: 'bar-1', label: 'B', value: -2.5 },
        ],
      },
      source: 'Sumber Contoh',
    });
  });

  it('maps a bars-only diagram and a picture-only diagram', () => {
    const bars = storedFigureToArticleFigure({
      kind: 'diagram',
      title: 'Batang',
      bars: { items: [{ label: 'A', value: 0 }] },
    });
    expect(bars).toEqual({
      kind: 'diagram',
      title: 'Batang',
      bars: { items: [{ id: 'bar-0', label: 'A', value: 0 }] },
    });
    const picture = storedFigureToArticleFigure({
      kind: 'diagram',
      title: 'Gambar',
      image: { mediaId: A, alt: 'Alt' },
    });
    expect(picture).toEqual({
      kind: 'diagram',
      title: 'Gambar',
      src: `/api/media/${A}`,
      alt: 'Alt',
    });
  });

  it('drops bad bars (no label, non-finite or non-number value) and an empty bar list', () => {
    const figure = storedFigureToArticleFigure({
      kind: 'diagram',
      title: 'Batang',
      bars: {
        items: [
          { label: '', value: 1 },
          { label: 'A', value: Infinity },
          { label: 'B', value: '3' },
          { label: 'C', value: NaN },
          { label: 'D', value: 4 },
        ],
      },
    });
    expect(figure?.kind === 'diagram' && figure.bars?.items).toEqual([
      { id: 'bar-0', label: 'D', value: 4 },
    ]);
    expect(
      storedFigureToArticleFigure({
        kind: 'diagram',
        title: 'Batang',
        bars: { items: [{ label: 'A', value: 'x' }] },
      }),
    ).toBeNull();
  });

  it('keeps the bars when the picture has no alt text or a bad id', () => {
    const figure = storedFigureToArticleFigure({
      kind: 'diagram',
      title: 'Campur',
      image: { mediaId: A, alt: '' },
      bars: { items: [{ label: 'A', value: 1 }] },
    });
    expect(figure?.kind === 'diagram' && figure.src).toBeUndefined();
    expect(figure?.kind === 'diagram' && figure.bars?.items).toHaveLength(1);
  });

  it('caps bars at twenty', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ label: `L${i}`, value: i }));
    const figure = storedFigureToArticleFigure({ kind: 'diagram', title: 'T', bars: { items } });
    expect(figure?.kind === 'diagram' && figure.bars?.items).toHaveLength(20);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'foto'],
    ['an array', []],
    ['an empty object', {}],
    ['an unknown kind', { kind: 'video', photos: [{ mediaId: A, alt: 'x' }] }],
    ['photo without photos', { kind: 'photo' }],
    ['photo with a non-array', { kind: 'photo', photos: 'x' }],
    [
      'photo with an unsafe id',
      { kind: 'photo', photos: [{ mediaId: '//evil.test/x', alt: 'x' }] },
    ],
    ['photos with none usable', { kind: 'photos', photos: [{ mediaId: A }] }],
    ['diagram without title', { kind: 'diagram', bars: { items: [{ label: 'A', value: 1 }] } }],
    [
      'diagram with blank title',
      { kind: 'diagram', title: '  ', bars: { items: [{ label: 'A', value: 1 }] } },
    ],
    ['diagram without picture or bars', { kind: 'diagram', title: 'Kosong' }],
    ['diagram with bars not an object', { kind: 'diagram', title: 'T', bars: 'x' }],
  ])('yields no figure for %s', (_label, metadata) => {
    expect(storedFigureToArticleFigure(metadata)).toBeNull();
  });
});

describe('figuresBySectionId', () => {
  const photo = { kind: 'photo', photos: [{ mediaId: A, alt: 'Foto' }] };

  it('keys figures by section and ignores other block types, unsectioned and unparsable blocks', () => {
    const result = figuresBySectionId([
      { id: 'f1', type: 'figure', sectionId: 'sec-1', metadata: photo },
      { id: 'f2', type: 'figure', sectionId: null, metadata: photo },
      { id: 'f3', type: 'figure', sectionId: 'sec-3', metadata: { kind: 'nope' } },
      { id: 'p1', type: 'prose', sectionId: 'sec-4', metadata: photo },
    ]);
    expect(Object.keys(result)).toEqual(['sec-1']);
    expect(result['sec-1']?.kind).toBe('photo');
  });

  it('is stable when a section somehow has two figures: the lowest id wins', () => {
    const other = { kind: 'photo', photos: [{ mediaId: B, alt: 'Lain' }] };
    const result = figuresBySectionId([
      { id: 'b', type: 'figure', sectionId: 'sec-1', metadata: other },
      { id: 'a', type: 'figure', sectionId: 'sec-1', metadata: photo },
    ]);
    expect(result['sec-1']?.kind === 'photo' && result['sec-1'].photo.alt).toBe('Foto');
  });

  it('does not mutate its input order', () => {
    const blocks = [
      { id: 'b', type: 'figure', sectionId: 's', metadata: photo },
      { id: 'a', type: 'figure', sectionId: 't', metadata: photo },
    ];
    figuresBySectionId(blocks);
    expect(blocks.map((b) => b.id)).toEqual(['b', 'a']);
  });
});
