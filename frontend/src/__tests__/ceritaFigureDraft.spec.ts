import { describe, expect, it } from 'vitest';
import {
  draftFromFigure,
  draftSignature,
  barValueNote,
  barValueProblem,
  emptyDraft,
  formatBarValue,
  figureIds,
  parseBarValue,
  summarizeFigure,
  validateFigureDraft,
  type FigureDraft,
} from '../utils/ceritaFigureDraft';

const ids = figureIds('t');

function photoDraft(
  kind: 'photo' | 'photos',
  rows: Partial<FigureDraft['photos'][number]>[],
): FigureDraft {
  return {
    ...emptyDraft(),
    kind,
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

describe('validateFigureDraft', () => {
  it('asks for a kind first', () => {
    const result = validateFigureDraft(emptyDraft(), ids);
    expect(result.figure).toBeNull();
    expect(result.problems[0]).toMatchObject({ fieldId: ids.kind });
    expect(result.problems[0]!.message).toContain('jenis gambar');
  });

  it('builds a single photo, trimming text and dropping empty caption and credit', () => {
    const result = validateFigureDraft(
      photoDraft('photo', [{ alt: '  Balai kelurahan  ', caption: ' ', credit: 'Tim' }]),
      ids,
    );
    expect(result.problems).toEqual([]);
    expect(result.figure).toEqual({
      kind: 'photo',
      photos: [{ mediaId: 'm1', alt: 'Balai kelurahan', credit: 'Tim' }],
    });
  });

  it('requires alt text and a file for every photo, naming the photo', () => {
    const result = validateFigureDraft(
      photoDraft('photos', [{ alt: '' }, { mediaId: null, alt: 'x' }]),
      ids,
    );
    expect(result.figure).toBeNull();
    expect(result.problems).toEqual([
      { fieldId: ids.photoAlt(0), message: expect.stringContaining('foto 1') as string },
      { fieldId: ids.photoFile(1), message: expect.stringContaining('foto 2') as string },
    ]);
    expect(result.problems[0]!.message).toContain('wajib diisi');
  });

  it('takes only the first photo for "Satu foto"', () => {
    const result = validateFigureDraft(
      photoDraft('photo', [{ mediaId: 'a' }, { mediaId: 'b', alt: '' }]),
      ids,
    );
    expect(result.figure).toMatchObject({ kind: 'photo', photos: [{ mediaId: 'a' }] });
  });

  it('allows 2 to 12 photos for a series and refuses one or 13', () => {
    const one = validateFigureDraft(photoDraft('photos', [{}]), ids);
    expect(one.problems[0]).toMatchObject({ fieldId: ids.addPhoto });
    expect(one.problems[0]!.message).toContain('2 sampai 12');

    const twelve = validateFigureDraft(
      photoDraft(
        'photos',
        Array.from({ length: 12 }, (_, i) => ({ mediaId: `m${i}` })),
      ),
      ids,
    );
    expect(twelve.problems).toEqual([]);
    const thirteen = validateFigureDraft(
      photoDraft(
        'photos',
        Array.from({ length: 13 }, (_, i) => ({ mediaId: `m${i}` })),
      ),
      ids,
    );
    expect(thirteen.figure).toBeNull();
  });

  it('refuses the same file twice, long text and markup', () => {
    const result = validateFigureDraft(
      photoDraft('photos', [
        { mediaId: 'same', caption: 'x'.repeat(201) },
        { mediaId: 'same', alt: '<b>tebal</b>' },
      ]),
      ids,
    );
    const messages = result.problems.map((p) => p.message).join(' | ');
    expect(messages).toContain('maksimal 200 karakter');
    expect(messages).toContain('sama dengan foto lain');
    expect(messages).toContain('tag HTML');
  });

  it('needs a diagram title and either an image or bars', () => {
    const result = validateFigureDraft({ ...emptyDraft(), kind: 'diagram' }, ids);
    expect(result.problems.map((p) => p.fieldId)).toEqual([ids.diagramTitle, ids.diagramImage]);
  });

  it('builds a bars-only diagram with comma decimals and skips blank rows', () => {
    const result = validateFigureDraft(
      {
        ...emptyDraft(),
        kind: 'diagram',
        diagramTitle: ' Penduduk ',
        barUnit: 'jiwa',
        bars: [
          { label: 'RT 1', value: '12,5' },
          { label: '', value: '' },
          { label: 'RT 2', value: '1.030' },
        ],
      },
      ids,
    );
    expect(result.problems).toEqual([]);
    expect(result.figure).toEqual({
      kind: 'diagram',
      title: 'Penduduk',
      bars: {
        unit: 'jiwa',
        items: [
          { label: 'RT 1', value: 12.5 },
          { label: 'RT 2', value: 1030 },
        ],
      },
    });
  });

  it('refuses a bar without a number and a bar without a name', () => {
    const result = validateFigureDraft(
      {
        ...emptyDraft(),
        kind: 'diagram',
        diagramTitle: 'D',
        bars: [
          { label: 'RT 1', value: '' },
          { label: '', value: '5' },
        ],
      },
      ids,
    );
    expect(result.problems).toEqual([
      { fieldId: ids.barValue(0), message: expect.stringContaining('angka yang valid') as string },
      { fieldId: ids.barLabel(1), message: expect.stringContaining('Nama') as string },
    ]);
  });

  it('requires alt text when a diagram has an image', () => {
    const result = validateFigureDraft(
      { ...emptyDraft(), kind: 'diagram', diagramTitle: 'D', diagramImageId: 'img' },
      ids,
    );
    expect(result.problems).toEqual([
      { fieldId: ids.diagramImageAlt, message: expect.stringContaining('wajib diisi') as string },
    ]);
    const ok = validateFigureDraft(
      {
        ...emptyDraft(),
        kind: 'diagram',
        diagramTitle: 'D',
        diagramImageId: 'img',
        diagramImageAlt: 'Diagram batang',
      },
      ids,
    );
    expect(ok.figure).toEqual({
      kind: 'diagram',
      title: 'D',
      image: { mediaId: 'img', alt: 'Diagram batang' },
    });
  });

  it('refuses more than 20 bar rows', () => {
    const result = validateFigureDraft(
      {
        ...emptyDraft(),
        kind: 'diagram',
        diagramTitle: 'D',
        bars: Array.from({ length: 21 }, (_, i) => ({ label: `L${i}`, value: '1' })),
      },
      ids,
    );
    expect(result.problems[0]!.message).toContain('maksimal 20');
  });

  it('never puts a field name or code in a message', () => {
    const result = validateFigureDraft(
      photoDraft('photos', [{ alt: '', mediaId: null }, { alt: '<i>' }]),
      ids,
    );
    expect(result.problems.map((p) => p.message).join(' ')).not.toMatch(
      /mediaId|alt\b|caption|credit|undefined|null/,
    );
  });
});

describe('draftSignature ignores blank rows and kind switches without real edits', () => {
  const none = draftSignature(emptyDraft());

  it('treats a chosen kind with only blank slots as no change from an empty figure', () => {
    expect(draftSignature(photoDraft('photo', [{ mediaId: null, alt: '' }]))).toBe(none);
    expect(
      draftSignature(
        photoDraft('photos', [
          { mediaId: null, alt: '' },
          { mediaId: null, alt: '' },
        ]),
      ),
    ).toBe(none);
    expect(draftSignature({ ...emptyDraft(), kind: 'diagram' })).toBe(none);
  });

  it('does not count a blank trailing photo row or a blank bar row as an edit', () => {
    const stored = photoDraft('photos', [{ mediaId: 'a' }, { mediaId: 'b' }]);
    const withBlank = photoDraft('photos', [
      { mediaId: 'a' },
      { mediaId: 'b' },
      { mediaId: null, alt: '' },
    ]);
    expect(draftSignature(withBlank)).toBe(draftSignature(stored));

    const diagram = { ...emptyDraft(), kind: 'diagram' as const, diagramTitle: 'D' };
    expect(draftSignature({ ...diagram, bars: [{ label: ' ', value: '' }] })).toBe(
      draftSignature(diagram),
    );
  });

  it('ignores the description of a diagram image that is no longer there', () => {
    const withImage = {
      ...emptyDraft(),
      kind: 'diagram' as const,
      diagramTitle: 'D',
      diagramImageId: 'img',
      diagramImageAlt: 'Diagram batang',
    };
    const removed = { ...withImage, diagramImageId: null };
    const removedAndClean = { ...removed, diagramImageAlt: '' };
    expect(draftSignature(removed)).toBe(draftSignature(removedAndClean));
    // The removal itself is still a real change.
    expect(draftSignature(removed)).not.toBe(draftSignature(withImage));
    // And a lone leftover description does not make an otherwise empty diagram look filled in.
    expect(draftSignature({ ...emptyDraft(), kind: 'diagram', diagramImageAlt: 'sisa' })).toBe(
      draftSignature(emptyDraft()),
    );
  });

  it('keeps the same signature when one stored photo is viewed as a series with a blank slot', () => {
    const photo = photoDraft('photo', [{ mediaId: 'a' }]);
    const series = photoDraft('photos', [{ mediaId: 'a' }, { mediaId: null, alt: '' }]);
    expect(draftSignature(series)).toBe(draftSignature(photo));
  });

  it('still notices real edits: a second photo, typed text, or dropping photos', () => {
    const photo = photoDraft('photo', [{ mediaId: 'a' }]);
    expect(draftSignature(photoDraft('photos', [{ mediaId: 'a' }, { mediaId: 'b' }]))).not.toBe(
      draftSignature(photo),
    );
    expect(draftSignature(photoDraft('photo', [{ mediaId: 'a', alt: 'lain' }]))).not.toBe(
      draftSignature(photo),
    );
    const series = photoDraft('photos', [{ mediaId: 'a' }, { mediaId: 'b' }]);
    expect(draftSignature({ ...series, kind: 'photo' })).not.toBe(draftSignature(series));
    expect(draftSignature({ ...emptyDraft(), kind: 'diagram', diagramTitle: 'x' })).not.toBe(none);
  });
});

describe('draft helpers', () => {
  it('round-trips a stored figure and changes signature only when something relevant changes', () => {
    const draft = draftFromFigure({
      kind: 'diagram',
      title: 'D',
      bars: { items: [{ label: 'A', value: 1.5 }] },
    });
    expect(draft.bars).toEqual([{ label: 'A', value: '1,5' }]);

    const before = draftSignature(draft);
    draft.photos = [{ mediaId: 'x', alt: 'kept but unused', caption: '', credit: '' }];
    expect(draftSignature(draft)).toBe(before);
    draft.diagramTitle = 'E';
    expect(draftSignature(draft)).not.toBe(before);
  });

  it('treats the extra photos of "Satu foto" as not part of the draft', () => {
    const one = photoDraft('photo', [{ mediaId: 'a' }]);
    const two = photoDraft('photo', [{ mediaId: 'a' }, { mediaId: 'b' }]);
    expect(draftSignature(one)).toBe(draftSignature(two));
  });
});

describe('summarizeFigure', () => {
  it('names the kind and size of a stored figure in a few plain words', () => {
    expect(summarizeFigure(null, false)).toBe('bagian ini tidak memiliki gambar');
    expect(summarizeFigure(null, true)).toContain('tidak dapat dibaca');
    expect(summarizeFigure({ kind: 'photo', photos: [{ mediaId: 'a', alt: 'x' }] }, true)).toBe(
      'satu foto',
    );
    expect(
      summarizeFigure(
        {
          kind: 'photos',
          photos: [
            { mediaId: 'a', alt: 'x' },
            { mediaId: 'b', alt: 'y' },
            { mediaId: 'c', alt: 'z' },
          ],
        },
        true,
      ),
    ).toBe('3 foto');
    expect(summarizeFigure({ kind: 'diagram', title: 'Penduduk' }, true)).toBe(
      'diagram “Penduduk”',
    );
  });
});
