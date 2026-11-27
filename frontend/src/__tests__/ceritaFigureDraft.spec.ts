import { describe, expect, it } from 'vitest';
import {
  CHART_TYPE_LABELS,
  describeFigure,
  draftFromFigure,
  draftSignature,
  barValueNote,
  barValueProblem,
  emptyDraft,
  figureIds,
  formatBarValue,
  kindForTile,
  parseBarValue,
  photoGroupOf,
  summarizeFigure,
  tileOfFigure,
  validateFigureDraft,
  type ChartTableOption,
  type FigureDraft,
} from '../utils/ceritaFigureDraft';

const ids = figureIds('t');

function photoDraft(
  tile: 'photo' | 'photos-2' | 'gallery',
  rows: Partial<FigureDraft['photos'][number]>[],
): FigureDraft {
  return {
    ...emptyDraft(),
    tile,
    photos: rows.map((row) => ({ mediaId: 'm1', alt: 'Balai', caption: '', credit: '', ...row })),
  };
}

describe('parseBarValue (Indonesian convention: dot = thousands, comma = decimal)', () => {
  it.each([
    ['125', 125],
    ['12,5', 12.5],
    ['0,5', 0.5],
    ['1.234', 1234],
    ['1.234,5', 1234.5],
    ['1.234.567', 1234567],
    ['-3', -3],
    ['-1.234,25', -1234.25],
  ])('reads %s as %d', (text, expected) => {
    expect(parseBarValue(text)).toBe(expected);
  });

  it.each([
    '',
    '  ',
    'abc',
    '12abc',
    '1,2,3',
    'Infinity',
    // A dot that is not a thousands grouping is refused instead of guessed at.
    '12.5',
    '1.23',
    '1234.5',
    '0.5',
    '.5',
    '1.2345',
    ',5',
    '1,',
  ])('refuses "%s"', (text) => {
    expect(parseBarValue(text)).toBeNull();
  });

  it('round-trips with formatBarValue for ordinary and awkward numbers', () => {
    for (const value of [
      0, 5, 12.5, 0.5, 125, 1234, 1234.5, 1000000, -3, -1234.25, 0.125, 99999.99,
    ]) {
      expect(parseBarValue(formatBarValue(value))).toBe(value);
    }
    expect(formatBarValue(1234.5)).toBe('1.234,5');
    expect(formatBarValue(1234)).toBe('1.234');
    expect(formatBarValue(0.5)).toBe('0,5');
  });

  it('shows stored numbers in the same convention the editor types them', () => {
    const draft = draftFromFigure({
      kind: 'diagram',
      title: 'D',
      bars: { items: [{ label: 'A', value: 1234.5 }] },
    });
    expect(draft.bars[0]!.value).toBe('1.234,5');
  });
});

describe('barValueNote (a single dot and three digits is read as thousands)', () => {
  it.each([
    ['12.500', '12.500'],
    ['1.234', '1.234'],
    ['0.500', '500'],
    ['-12.500', '-12.500'],
    [' 3.000 ', '3.000'],
  ])('notes how "%s" is read', (typed, shown) => {
    const note = barValueNote(typed);
    expect(note).toContain(`Dibaca ${shown}.`);
    expect(note).toContain('pakai koma');
    expect(note).toContain('12,5');
  });

  it.each(['', '125', '12,5', '12,500', '1.234,5', '1.234.567', '12.5', '1.23', '1234.567', 'abc'])(
    'has no note for "%s"',
    (typed) => {
      expect(barValueNote(typed)).toBeNull();
    },
  );

  it('does not stop the number from being read the Indonesian way', () => {
    expect(parseBarValue('12.500')).toBe(12500);
  });
});

describe('barValueProblem', () => {
  it('tells the editor to use a comma when a dot decimal was typed', () => {
    const message = barValueProblem('12.5', 'batang 2');
    expect(message).toContain('koma');
    expect(message).toContain('batang 2');
    expect(message).not.toMatch(/undefined|null|NaN/);
  });

  it('gives the general sentence for other mistakes and nothing for a good number', () => {
    expect(barValueProblem('abc', 'batang 1')).toContain('angka yang valid');
    expect(barValueProblem('1.234,5', 'batang 1')).toBeNull();
  });
});

const CHART_TABLES: ChartTableOption[] = [
  { id: 'tab-umur', sexSplit: true },
  { id: 'tab-suku', sexSplit: false },
];

function chartDraft(overrides: Partial<FigureDraft> = {}): FigureDraft {
  return {
    ...emptyDraft(),
    tile: 'chart',
    grafikSource: 'table',
    chartTableId: 'tab-suku',
    chartType: 'bar',
    chartSeries: 'total',
    chartTitle: 'Penduduk menurut suku',
    ...overrides,
  };
}

describe('tiles and stored kinds (SPEC §8)', () => {
  it('maps each tile onto the stored kind it saves as', () => {
    expect(kindForTile('photo', 'table')).toBe('photo');
    expect(kindForTile('photos-2', 'table')).toBe('photos');
    expect(kindForTile('gallery', 'table')).toBe('photos');
    expect(kindForTile('chart', 'table')).toBe('chart');
    expect(kindForTile('chart', 'upload')).toBe('diagram');
  });

  it('derives the tile from a stored figure: photo count for photos, source for the chart', () => {
    const photo = {
      kind: 'photo' as const,
      photos: [{ mediaId: 'a', alt: 'x' }] as [{ mediaId: string; alt: string }],
    };
    expect(tileOfFigure(photo)).toEqual({ tile: 'photo', grafikSource: 'table' });
    const pair = {
      kind: 'photos' as const,
      photos: [
        { mediaId: 'a', alt: 'x' },
        { mediaId: 'b', alt: 'y' },
      ],
    };
    expect(tileOfFigure(pair)?.tile).toBe('photos-2');
    const gallery = {
      kind: 'photos' as const,
      photos: [...pair.photos, { mediaId: 'c', alt: 'z' }],
    };
    expect(tileOfFigure(gallery)?.tile).toBe('gallery');
    expect(tileOfFigure({ kind: 'diagram', title: 'Grafik' })).toEqual({
      tile: 'chart',
      grafikSource: 'upload',
    });
    expect(tileOfFigure(chartFigure())).toEqual({ tile: 'chart', grafikSource: 'table' });
    expect(tileOfFigure(null)).toBeNull();
  });

  it('shares one photo group between the two photo tiles and keeps "1 gambar" apart', () => {
    expect(photoGroupOf('photo')).toBe('photo');
    expect(photoGroupOf('photos-2')).toBe('photos');
    expect(photoGroupOf('gallery')).toBe('photos');
    expect(photoGroupOf('chart')).toBeNull();
    expect(photoGroupOf(null)).toBeNull();
  });

  it('loads a stored figure into the matching tile with its fields', () => {
    const draft = draftFromFigure(chartFigure());
    expect(draft).toMatchObject({
      tile: 'chart',
      grafikSource: 'table',
      chartTableId: 'tab-umur',
      chartType: 'column',
      chartSeries: 'by_sex',
      chartTitle: 'Penduduk menurut umur',
      chartSource: 'Sumber: BPS',
    });
    expect(draftFromFigure(null).tile).toBeNull();
  });
});

function chartFigure(): Parameters<typeof draftFromFigure>[0] {
  return {
    kind: 'chart',
    tableId: 'tab-umur',
    chartType: 'column',
    series: 'by_sex',
    title: 'Penduduk menurut umur',
    source: 'Sumber: BPS',
  };
}

describe('validateFigureDraft', () => {
  it('asks for a tile first', () => {
    const result = validateFigureDraft(emptyDraft(), ids);
    expect(result.figure).toBeNull();
    expect(result.problems[0]).toMatchObject({ fieldId: ids.kind });
  });

  it('builds one photo, trimming text and dropping empty caption and credit', () => {
    const draft = photoDraft('photo', [
      { mediaId: 'a', alt: '  Balai kelurahan  ', caption: '  ', credit: '' },
    ]);
    expect(validateFigureDraft(draft, ids).figure).toEqual({
      kind: 'photo',
      photos: [{ mediaId: 'a', alt: 'Balai kelurahan' }],
    });
  });

  it('requires alt text and a file for every photo, naming the photo as plain text', () => {
    const result = validateFigureDraft(photoDraft('photo', [{ mediaId: null, alt: '' }]), ids);
    expect(result.figure).toBeNull();
    expect(result.problems).toEqual(
      expect.arrayContaining([
        { fieldId: ids.photoFile(0), message: 'Pilih berkas untuk foto.' },
        expect.objectContaining({ fieldId: ids.photoAlt(0) }),
      ]),
    );
    expect(result.problems.find((p) => p.fieldId === ids.photoAlt(0))?.message).toContain(
      'Teks alternatif untuk foto wajib diisi',
    );
  });

  it('keeps only the first photo for "1 gambar", even if more rows are in the draft', () => {
    const draft = photoDraft('photo', [
      { mediaId: 'a', alt: 'Pertama' },
      { mediaId: 'b', alt: 'Kedua' },
    ]);
    expect(validateFigureDraft(draft, ids).figure).toEqual({
      kind: 'photo',
      photos: [{ mediaId: 'a', alt: 'Pertama' }],
    });
  });

  it('builds "2 gambar" with exactly two photos and labels them as gambar 1 and 2', () => {
    const ok = photoDraft('photos-2', [
      { mediaId: 'a', alt: 'Depan' },
      { mediaId: 'b', alt: 'Belakang', credit: 'Dinas' },
    ]);
    expect(validateFigureDraft(ok, ids).figure).toEqual({
      kind: 'photos',
      photos: [
        { mediaId: 'a', alt: 'Depan' },
        { mediaId: 'b', alt: 'Belakang', credit: 'Dinas' },
      ],
    });
    const short = validateFigureDraft(photoDraft('photos-2', [{ mediaId: 'a', alt: 'x' }]), ids);
    expect(short.figure).toBeNull();
    const blank = validateFigureDraft(
      photoDraft('photos-2', [
        { mediaId: 'a', alt: 'x' },
        { mediaId: 'b', alt: '' },
      ]),
      ids,
    );
    expect(blank.problems).toEqual([
      expect.objectContaining({
        fieldId: ids.photoAlt(1),
        message: expect.stringContaining('gambar 2'),
      }),
    ]);
  });

  it('allows a gallery of 3 to 12 photos, in order, and refuses 2 or 13', () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ mediaId: `m${i}`, alt: `Foto ${i}` }));
    const three = validateFigureDraft(photoDraft('gallery', rows(3)), ids);
    expect(three.figure).toMatchObject({
      kind: 'photos',
      photos: [{ mediaId: 'm0' }, { mediaId: 'm1' }, { mediaId: 'm2' }],
    });
    expect(validateFigureDraft(photoDraft('gallery', rows(12)), ids).figure).not.toBeNull();

    const two = validateFigureDraft(photoDraft('gallery', rows(2)), ids);
    expect(two.figure).toBeNull();
    expect(two.problems[0]).toEqual({
      fieldId: ids.addPhoto,
      message: 'Galeri membutuhkan 3 sampai 12 foto.',
    });
    expect(validateFigureDraft(photoDraft('gallery', rows(13)), ids).figure).toBeNull();
  });

  it('refuses the same file twice, long text and markup, naming the photo', () => {
    const dup = validateFigureDraft(
      photoDraft('gallery', [
        { mediaId: 'a', alt: 'x' },
        { mediaId: 'a', alt: 'y' },
        { mediaId: 'c', alt: 'z' },
      ]),
      ids,
    );
    expect(dup.problems.some((p) => p.message.includes('sama dengan foto lain'))).toBe(true);

    const long = validateFigureDraft(
      photoDraft('photo', [{ mediaId: 'a', alt: 'x'.repeat(301) }]),
      ids,
    );
    expect(long.problems[0]?.message).toContain('maksimal 300 karakter');

    const markup = validateFigureDraft(
      photoDraft('photo', [{ mediaId: 'a', alt: '<b>x</b>' }]),
      ids,
    );
    expect(markup.problems[0]?.message).toContain('tag HTML');
  });

  it('shares one credit across a gallery and omits it when blank', () => {
    const rows = [
      { mediaId: 'a', alt: 'A' },
      { mediaId: 'b', alt: 'B' },
      { mediaId: 'c', alt: 'C', credit: 'Foto sendiri' },
    ];
    expect(
      validateFigureDraft({ ...photoDraft('gallery', rows), sharedCredit: '  Tim  ' }, ids).figure,
    ).toMatchObject({ kind: 'photos', credit: 'Tim' });
    expect(
      validateFigureDraft({ ...photoDraft('gallery', rows), sharedCredit: '   ' }, ids).figure,
    ).not.toHaveProperty('credit');
    const long = validateFigureDraft(
      { ...photoDraft('gallery', rows), sharedCredit: 'x'.repeat(121) },
      ids,
    );
    expect(long.problems).toEqual([
      expect.objectContaining({
        fieldId: ids.sharedCredit,
        message: expect.stringContaining('120'),
      }),
    ]);
  });

  it('never sends a shared credit for "1 gambar"', () => {
    const draft = { ...photoDraft('photo', [{ mediaId: 'a', alt: 'x' }]), sharedCredit: 'Tim' };
    expect(validateFigureDraft(draft, ids).figure).not.toHaveProperty('credit');
  });
});

describe('chart from a table of the Data menu', () => {
  it('builds the chart payload with the chosen type and series, and omits a blank source', () => {
    const result = validateFigureDraft(
      chartDraft({
        chartTableId: 'tab-umur',
        chartType: 'column',
        chartSeries: 'by_sex',
        chartSource: '  ',
      }),
      ids,
      CHART_TABLES,
    );
    expect(result.problems).toEqual([]);
    expect(result.figure).toEqual({
      kind: 'chart',
      tableId: 'tab-umur',
      chartType: 'column',
      series: 'by_sex',
      title: 'Penduduk menurut suku',
    });
  });

  it('trims the title and keeps a source when one is typed', () => {
    const result = validateFigureDraft(
      chartDraft({ chartTitle: '  Judul  ', chartSource: ' Berdasarkan data Juni 2024 ' }),
      ids,
      CHART_TABLES,
    );
    expect(result.figure).toMatchObject({ title: 'Judul', source: 'Berdasarkan data Juni 2024' });
  });

  it('requires a table and a title', () => {
    const result = validateFigureDraft(
      chartDraft({ chartTableId: '', chartTitle: '' }),
      ids,
      CHART_TABLES,
    );
    expect(result.figure).toBeNull();
    expect(result.problems).toEqual([
      { fieldId: ids.chartTable, message: 'Pilih tabel data untuk grafik.' },
      { fieldId: ids.chartTitle, message: 'Judul grafik wajib diisi.' },
    ]);
  });

  it('refuses a table that is not on this page, but does not guess while the list is loading', () => {
    const draft = chartDraft({ chartTableId: 'tab-lain' });
    expect(validateFigureDraft(draft, ids, CHART_TABLES).problems[0]).toEqual({
      fieldId: ids.chartTable,
      message: 'Tabel data ini tidak ditemukan di halaman ini. Pilih tabel lain.',
    });
    expect(validateFigureDraft(draft, ids, null).problems).toEqual([]);
  });

  it('allows "by_sex" only for a table split by sex, and says so in plain words', () => {
    const ok = validateFigureDraft(
      chartDraft({ chartTableId: 'tab-umur', chartSeries: 'by_sex' }),
      ids,
      CHART_TABLES,
    );
    expect(ok.figure).toMatchObject({ series: 'by_sex' });

    const refused = validateFigureDraft(
      chartDraft({ chartTableId: 'tab-suku', chartSeries: 'by_sex' }),
      ids,
      CHART_TABLES,
    );
    expect(refused.figure).toBeNull();
    expect(refused.problems).toEqual([
      { fieldId: ids.chartSeries('by_sex'), message: 'Tabel ini hanya memuat jumlah total.' },
    ]);
  });

  it('limits the title to 120 characters and the source to 200, and refuses markup', () => {
    expect(
      validateFigureDraft(chartDraft({ chartTitle: 'x'.repeat(121) }), ids, CHART_TABLES)
        .problems[0],
    ).toEqual({ fieldId: ids.chartTitle, message: 'Judul grafik maksimal 120 karakter.' });
    expect(
      validateFigureDraft(chartDraft({ chartSource: 'y'.repeat(201) }), ids, CHART_TABLES)
        .problems[0],
    ).toEqual({ fieldId: ids.chartSource, message: 'Sumber data maksimal 200 karakter.' });
    expect(
      validateFigureDraft(chartDraft({ chartTitle: '<i>x</i>' }), ids, CHART_TABLES).problems[0]
        ?.message,
    ).toContain('tag HTML');
  });

  it('uploads a chart picture through the diagram path under "Unggah gambar grafik"', () => {
    const draft: FigureDraft = {
      ...emptyDraft(),
      tile: 'chart',
      grafikSource: 'upload',
      diagramTitle: 'Piramida',
      diagramImageId: 'img',
      diagramImageAlt: 'Piramida penduduk',
    };
    expect(validateFigureDraft(draft, ids).figure).toEqual({
      kind: 'diagram',
      title: 'Piramida',
      image: { mediaId: 'img', alt: 'Piramida penduduk' },
    });
    expect(validateFigureDraft({ ...draft, diagramTitle: '' }, ids).problems[0]).toEqual({
      fieldId: ids.diagramTitle,
      message: 'Judul grafik wajib diisi.',
    });
  });

  it('refuses an uploaded chart with neither a picture nor bars, and a bar with no number', () => {
    const empty = validateFigureDraft(
      { ...emptyDraft(), tile: 'chart', grafikSource: 'upload', diagramTitle: 'T' },
      ids,
    );
    expect(empty.figure).toBeNull();
    expect(empty.problems[0]?.message).toContain('gambar atau data batang');

    const badBar = validateFigureDraft(
      {
        ...emptyDraft(),
        tile: 'chart',
        grafikSource: 'upload',
        diagramTitle: 'T',
        bars: [{ label: 'Laki-laki', value: '12.5' }],
      },
      ids,
    );
    expect(badBar.problems[0]).toMatchObject({ fieldId: ids.barValue(0) });
    expect(badBar.problems[0]?.message).toContain('koma');
  });
});

describe('draftSignature', () => {
  const none = draftSignature(emptyDraft());

  it('treats a chosen tile with only blank slots as no change from an empty figure', () => {
    expect(draftSignature({ ...emptyDraft(), tile: 'chart' })).toBe(none);
    expect(draftSignature({ ...emptyDraft(), tile: 'photo' })).toBe(none);
    expect(draftSignature({ ...emptyDraft(), tile: 'gallery', photos: [emptyPhotoRow()] })).toBe(
      none,
    );
  });

  it('counts a chart table, a type, a series or text as an edit', () => {
    const base = draftSignature(chartDraft({ chartTableId: '', chartTitle: '' }));
    expect(base).toBe(none);
    const picked = draftSignature(chartDraft());
    expect(picked).not.toBe(none);
    expect(draftSignature(chartDraft({ chartType: 'column' }))).not.toBe(picked);
    expect(
      draftSignature(chartDraft({ chartSeries: 'by_sex', chartTableId: 'tab-umur' })),
    ).not.toBe(picked);
    expect(draftSignature(chartDraft({ chartSource: 'Sumber' }))).not.toBe(picked);
  });

  it('does not count switching between "2 gambar" and "Galeri" with the same photos as an edit', () => {
    const rows = [
      { mediaId: 'a', alt: 'A' },
      { mediaId: 'b', alt: 'B' },
    ];
    expect(draftSignature(photoDraft('gallery', rows))).toBe(
      draftSignature(photoDraft('photos-2', rows)),
    );
    expect(draftSignature(photoDraft('photo', [rows[0]!]))).not.toBe(
      draftSignature(photoDraft('photos-2', rows)),
    );
  });

  it('ignores the description of a diagram image that is no longer there', () => {
    const diagram = {
      ...emptyDraft(),
      tile: 'chart' as const,
      grafikSource: 'upload' as const,
      diagramTitle: 'D',
    };
    expect(draftSignature({ ...diagram, diagramImageAlt: 'sisa' })).toBe(draftSignature(diagram));
  });

  it('ignores parts of a kind that is not chosen', () => {
    const series = photoDraft('gallery', [
      { mediaId: 'a', alt: 'A' },
      { mediaId: 'b', alt: 'B' },
      { mediaId: 'c', alt: 'C' },
    ]);
    expect(draftSignature({ ...series, sharedCredit: 'Tim' })).not.toBe(draftSignature(series));
    expect(draftSignature({ ...series, tile: 'chart', chartTitle: '' })).toBe(none);
  });
});

function emptyPhotoRow() {
  return { mediaId: null, alt: '', caption: '', credit: '' };
}

describe('summarizeFigure and describeFigure', () => {
  it('names the kind and size of a stored figure in a few plain words', () => {
    expect(summarizeFigure({ kind: 'photo', photos: [{ mediaId: 'a', alt: 'x' }] }, true)).toBe(
      'satu foto',
    );
    expect(summarizeFigure(null, false)).toBe('bagian ini tidak memiliki gambar');
    expect(summarizeFigure(chartFigure(), true)).toBe('grafik “Penduduk menurut umur”');
    expect(summarizeFigure({ kind: 'diagram', title: 'Penduduk' }, true)).toBe(
      'grafik unggahan “Penduduk”',
    );
  });

  it('describes a stored chart as a grafik in the stored note', () => {
    expect(describeFigure(chartFigure())).toBe('Tersimpan: grafik “Penduduk menurut umur”.');
  });
});

describe('shared credit of a photo group (draft load)', () => {
  it('loads a stored shared credit into the draft', () => {
    expect(
      draftFromFigure({
        kind: 'photos',
        credit: 'Tim',
        photos: [
          { mediaId: 'a', alt: 'A' },
          { mediaId: 'b', alt: 'B' },
        ],
      }).sharedCredit,
    ).toBe('Tim');
  });
});

describe('chart types of the Grafik tile (SPEC §2, §8)', () => {
  it('labels the six chart types in plain Indonesian', () => {
    expect(Object.values(CHART_TYPE_LABELS)).toEqual([
      'Batang',
      'Kolom',
      'Piramida',
      'Donat',
      'Bertumpuk',
      'Persentase',
    ]);
  });

  it('builds a donut of the total, which is allowed without a sex split', () => {
    const result = validateFigureDraft(
      chartDraft({ chartTableId: 'tab-suku', chartType: 'donut', chartSeries: 'total' }),
      ids,
      CHART_TABLES,
    );
    expect(result.problems).toEqual([]);
    expect(result.figure).toMatchObject({ chartType: 'donut', series: 'total' });
  });

  it.each(['pyramid', 'stacked', 'percent'] as const)(
    'refuses %s with the total, and points at the data choice',
    (chartType) => {
      const result = validateFigureDraft(
        chartDraft({ chartTableId: 'tab-umur', chartType, chartSeries: 'total' }),
        ids,
        CHART_TABLES,
      );
      expect(result.figure).toBeNull();
      expect(result.problems).toEqual([
        {
          fieldId: ids.chartSeries('by_sex'),
          message:
            'Jenis grafik ini hanya bisa menurut jenis kelamin. Pilih Menurut jenis kelamin.',
        },
      ]);
    },
  );

  it('builds a sex-only chart with by_sex on a table split by sex', () => {
    const result = validateFigureDraft(
      chartDraft({ chartTableId: 'tab-umur', chartType: 'pyramid', chartSeries: 'by_sex' }),
      ids,
      CHART_TABLES,
    );
    expect(result.problems).toEqual([]);
    expect(result.figure).toMatchObject({ chartType: 'pyramid', series: 'by_sex' });
  });

  it('refuses a sex-only type on a total-only table', () => {
    const result = validateFigureDraft(
      chartDraft({ chartTableId: 'tab-suku', chartType: 'stacked', chartSeries: 'by_sex' }),
      ids,
      CHART_TABLES,
    );
    expect(result.problems).toEqual([
      { fieldId: ids.chartSeries('by_sex'), message: 'Tabel ini hanya memuat jumlah total.' },
    ]);
  });

  it('reads a stored sex-only chart back into the draft', () => {
    const draft = draftFromFigure({
      kind: 'chart',
      tableId: 'tab-umur',
      chartType: 'percent',
      series: 'by_sex',
      title: 'Persentase menurut umur',
    });
    expect(draft).toMatchObject({ tile: 'chart', chartType: 'percent', chartSeries: 'by_sex' });
  });
});
