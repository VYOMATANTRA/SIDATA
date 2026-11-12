import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_CHIPS,
  TEMPLATE_SLOTS,
  VARIANT_CHIPS,
  chipSegment,
  describeBody,
  parseBody,
  readableExcerpt,
  sanitizeText,
  serializeSegments,
  slugifyLabel,
  textSegment,
  uniqueSlug,
  validateSentence,
  type TemplateSlot,
} from '../utils/comparisonTemplateSegments';

/** The contract: chip name shown to the Admin -> the exact slot the API stores. */
const CHIP_TO_SLOT: Array<[string, TemplateSlot]> = [
  ['Nama indikator', 'label'],
  ['Satuan', 'unit'],
  ['Nilai sekarang', 'value_current'],
  ['Nilai sebelumnya', 'value_previous'],
  ['Periode sekarang', 'period_current'],
  ['Periode sebelumnya', 'period_previous'],
  ['Selisih', 'delta'],
  ['Persentase perubahan', 'delta_percent'],
  ['Keterangan perubahan', 'trend'],
];

describe('chip catalogue', () => {
  it('maps every chip name to exactly the backend slot', () => {
    expect(TEMPLATE_CHIPS.map((chip) => [chip.name, chip.slot])).toEqual(CHIP_TO_SLOT);
  });

  it.each(CHIP_TO_SLOT)('serializes the "%s" chip as its own slot only', (_name, slot) => {
    expect(serializeSegments([chipSegment(slot)])).toBe(`{${slot}}`);
  });

  it('never offers the trend chip inside a variant, and offers all the others', () => {
    expect(VARIANT_CHIPS.map((chip) => chip.slot)).not.toContain('trend');
    expect(VARIANT_CHIPS).toHaveLength(TEMPLATE_CHIPS.length - 1);
  });

  it('never shows a brace or slot name in a chip name or help line', () => {
    for (const chip of TEMPLATE_CHIPS) {
      expect(chip.name + chip.help).not.toMatch(/[{}_]/);
    }
  });

  it('matches the exact slot catalogue defined in backend comparisonProse.ts', () => {
    const backendFile = resolve(__dirname, '../../../backend/src/utils/comparisonProse.ts');
    const source = readFileSync(backendFile, 'utf-8');
    const match = source.match(/export const TEMPLATE_SLOTS = \[([\s\S]*?)\] as const;/);
    expect(match).not.toBeNull();
    const slotBlock = match?.[1] ?? '';
    const backendSlots = Array.from(slotBlock.matchAll(/'([^']+)'/g)).map((m) => m[1]);
    expect(TEMPLATE_SLOTS).toEqual(backendSlots);
  });
});

describe('serialize / parse', () => {
  const BODY =
    'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.';

  it('serializes text and chips in order, to the exact stored string', () => {
    const segments = [
      textSegment('Berdasarkan data '),
      chipSegment('period_current'),
      textSegment(', '),
      chipSegment('label'),
      textSegment(' tercatat '),
      chipSegment('value_current'),
      textSegment(' '),
      chipSegment('unit'),
      textSegment(', '),
      chipSegment('trend'),
      textSegment(' dibandingkan '),
      chipSegment('period_previous'),
      textSegment('.'),
    ];

    expect(serializeSegments(segments)).toBe(BODY);
  });

  it('parses a stored body into text and chip segments', () => {
    const segments = parseBody(BODY);

    expect(
      segments.filter((s) => s.kind === 'chip').map((s) => (s as { slot: string }).slot),
    ).toEqual(['period_current', 'label', 'value_current', 'unit', 'trend', 'period_previous']);
    expect(segments.some((s) => s.kind === 'unknown')).toBe(false);
  });

  it.each([
    BODY,
    '',
    'tanpa bagian otomatis',
    '{trend}',
    '{delta}{delta_percent}',
    'naik {delta} {unit} ({delta_percent}%)',
    '  spasi di tepi  ',
    'Penduduk tetap {trend}',
  ])('round-trips body -> segments -> body exactly: %j', (body) => {
    expect(serializeSegments(parseBody(body))).toBe(body);
  });

  it.each([
    'ada {populasi} tak dikenal',
    'kosong {} di sini',
    'kurung buka { menggantung',
    'kurung tutup } menggantung',
    '{{trend}}',
    '{Trend} huruf besar',
    '{ trend } berspasi',
  ])('keeps unknown or legacy braces without crashing and round-trips: %j', (body) => {
    const segments = parseBody(body);

    expect(segments.some((s) => s.kind === 'unknown')).toBe(true);
    expect(serializeSegments(segments)).toBe(body);
    // The raw characters are never part of what is described to a person.
    expect(describeBody(body)).not.toMatch(/[{}]/);
    expect(describeBody(body)).toContain('bagian tidak dikenali');
  });

  it('treats literal text without recognised braces as plain text', () => {
    const segments = parseBody('Penduduk tetap, 100% aman.');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: 'text', text: 'Penduduk tetap, 100% aman.' });
  });

  it('strips braces typed into free text so they cannot start a part', () => {
    expect(sanitizeText('a {trend} b }')).toBe('a trend b ');
  });

  it('describes a body with chip names, never slot names', () => {
    expect(describeBody(BODY)).toBe(
      'Berdasarkan data [Periode sekarang], [Nama indikator] tercatat [Nilai sekarang] [Satuan], [Keterangan perubahan] dibandingkan [Periode sebelumnya].',
    );
  });

  it('makes a cut-off server excerpt readable without any brace', () => {
    expect(readableExcerpt('…lam_current}, penduduk terus {valu…')).not.toMatch(/[{}]/);
    expect(readableExcerpt('data {period_current}, terus meningkat {trend}')).toBe(
      'data [Periode sekarang], terus meningkat [Keterangan perubahan]',
    );
  });
});

describe('validateSentence', () => {
  const body = (...parts: Array<string | TemplateSlot>) =>
    parts.map((part) =>
      TEMPLATE_CHIPS.some((c) => c.slot === part)
        ? chipSegment(part as TemplateSlot)
        : textSegment(part),
    );

  it('accepts a main sentence with exactly one trend chip', () => {
    expect(validateSentence('body', body('Data ', 'label', ' ', 'trend'))).toBeUndefined();
  });

  it('asks for the missing trend chip in everyday words, with no syntax', () => {
    const message = validateSentence('body', body('Data ', 'label'))!;

    expect(message).toContain('Keterangan perubahan');
    expect(message).not.toMatch(/[{}]|slot|placeholder/i);
  });

  it('refuses a second trend chip', () => {
    const message = validateSentence('body', body('trend', ' dan ', 'trend'))!;

    expect(message).toContain('hanya boleh dipakai satu kali');
    expect(message).not.toMatch(/[{}]/);
  });

  it('refuses the trend chip inside any variant, and allows the other chips there', () => {
    for (const field of ['trendNaik', 'trendTurun', 'trendTetap'] as const) {
      expect(validateSentence(field, body('naik ', 'trend'))).toContain(
        'tidak bisa dipakai di sini',
      );
      expect(validateSentence(field, body('naik ', 'delta', ' ', 'unit'))).toBeUndefined();
    }
  });

  it('refuses an empty field and an unrecognised part', () => {
    expect(validateSentence('trendTetap', [])).toBe('Saat nilai tetap wajib diisi.');
    expect(validateSentence('trendTetap', body('   '))).toBe('Saat nilai tetap wajib diisi.');

    const withUnknown = parseBody('naik {populasi}');
    expect(validateSentence('trendNaik', withUnknown)).toContain('bagian tidak dikenali');
  });

  it('enforces the length limits without quoting numbers or syntax', () => {
    const message = validateSentence('trendNaik', body('x'.repeat(501)))!;

    expect(message).toContain('terlalu panjang');
  });
});

describe('generated lookup keys', () => {
  it('derives a valid kebab-case key from the name', () => {
    expect(slugifyLabel('Perbandingan Tahunan')).toBe('perbandingan-tahunan');
    expect(slugifyLabel('  Jumlah Penduduk — naik/turun!  ')).toBe('jumlah-penduduk-naik-turun');
    expect(slugifyLabel('Café Écolé')).toBe('cafe-ecole');
  });

  it('falls back when the name has nothing usable', () => {
    expect(slugifyLabel('！！！')).toBe('templat');
    expect(slugifyLabel('')).toBe('templat');
  });

  it('stays inside the 100-character limit with room for a suffix', () => {
    const key = uniqueSlug('a'.repeat(300), ['a'.repeat(92)]);

    expect(key.length).toBeLessThanOrEqual(100);
    expect(key).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('adds a numeric suffix on collision', () => {
    expect(uniqueSlug('Perbandingan tahunan', [])).toBe('perbandingan-tahunan');
    expect(uniqueSlug('Perbandingan tahunan', ['perbandingan-tahunan'])).toBe(
      'perbandingan-tahunan-2',
    );
    expect(
      uniqueSlug('Perbandingan tahunan', ['perbandingan-tahunan', 'perbandingan-tahunan-2']),
    ).toBe('perbandingan-tahunan-3');
  });
});
