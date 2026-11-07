/**
 * The sentence builder's data model (SPEC §5, §8).
 *
 * The API stores a template as one string containing `{slot}` placeholders. The Admin never
 * sees or types those: the UI edits an ordered list of segments (free text, named chips, and a
 * catch-all for anything unrecognised) and this module converts to and from the stored string.
 * The chip names below exist only in the UI; the slot names are the backend's
 * (`backend/src/utils/comparisonProse.ts`), and the two lists must stay identical.
 */

export type TemplateSlot =
  | 'label'
  | 'unit'
  | 'value_current'
  | 'value_previous'
  | 'period_current'
  | 'period_previous'
  | 'delta'
  | 'delta_percent'
  | 'trend';

export interface TemplateChip {
  slot: TemplateSlot;
  /** What the Admin sees. */
  name: string;
  /** One line shown with the chip, in everyday words. */
  help: string;
}

export const TREND_SLOT: TemplateSlot = 'trend';

/** Display order is the order the add buttons appear in. */
export const TEMPLATE_CHIPS: readonly TemplateChip[] = [
  { slot: 'label', name: 'Nama indikator', help: 'Judul angka, misalnya Jumlah Penduduk.' },
  { slot: 'unit', name: 'Satuan', help: 'Satuan angka, misalnya jiwa.' },
  { slot: 'value_current', name: 'Nilai sekarang', help: 'Angka pada periode terbaru.' },
  { slot: 'value_previous', name: 'Nilai sebelumnya', help: 'Angka pada periode pembanding.' },
  { slot: 'period_current', name: 'Periode sekarang', help: 'Misalnya 2026.' },
  { slot: 'period_previous', name: 'Periode sebelumnya', help: 'Misalnya 2025.' },
  { slot: 'delta', name: 'Selisih', help: 'Selisih kedua angka, tanpa tanda plus atau minus.' },
  {
    slot: 'delta_percent',
    name: 'Persentase perubahan',
    help: 'Selisih dalam persen. Tidak tampil bila nilai sebelumnya nol.',
  },
  {
    slot: 'trend',
    name: 'Keterangan perubahan',
    help: 'Diisi otomatis dengan teks "saat nilai naik", "turun", atau "tetap" sesuai angkanya.',
  },
];

const CHIP_BY_SLOT: ReadonlyMap<string, TemplateChip> = new Map(
  TEMPLATE_CHIPS.map((chip) => [chip.slot, chip]),
);

export const TREND_CHIP_NAME = CHIP_BY_SLOT.get(TREND_SLOT)!.name;

/** Chips that may appear in the three variants: everything except the trend chip itself. */
export const VARIANT_CHIPS: readonly TemplateChip[] = TEMPLATE_CHIPS.filter(
  (chip) => chip.slot !== TREND_SLOT,
);

export function chipForSlot(slot: string): TemplateChip | undefined {
  return CHIP_BY_SLOT.get(slot);
}

export type TemplateSegment =
  | { id: number; kind: 'text'; text: string }
  | { id: number; kind: 'chip'; slot: TemplateSlot }
  /** Legacy or hand-written text the builder does not recognise. `raw` is never displayed. */
  | { id: number; kind: 'unknown'; raw: string };

let nextSegmentId = 1;

export function newSegmentId(): number {
  return nextSegmentId++;
}

export function textSegment(text = ''): TemplateSegment {
  return { id: newSegmentId(), kind: 'text', text };
}

export function chipSegment(slot: TemplateSlot): TemplateSegment {
  return { id: newSegmentId(), kind: 'chip', slot };
}

/** A well-formed placeholder: braces with no brace inside (same rule as the backend). */
const PLACEHOLDER = /\{([^{}]*)\}/g;

/**
 * Splits a stored string into segments. Anything that is not literal text or a known slot
 * (an unknown name, `{}`, an unbalanced brace) becomes an `unknown` segment that keeps its raw
 * characters, so parsing never throws and `serializeSegments(parseBody(x)) === x`.
 */
export function parseBody(body: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];

  const pushText = (text: string): void => {
    // Literal text can still hold a lone brace; each one is its own unrecognised part.
    for (const piece of text.split(/([{}])/)) {
      if (piece === '') continue;
      segments.push(
        piece === '{' || piece === '}'
          ? { id: newSegmentId(), kind: 'unknown', raw: piece }
          : textSegment(piece),
      );
    }
  };

  let cursor = 0;
  for (const match of body.matchAll(PLACEHOLDER)) {
    const start = match.index;
    pushText(body.slice(cursor, start));
    const name = match[1] ?? '';
    segments.push(
      CHIP_BY_SLOT.has(name)
        ? chipSegment(name as TemplateSlot)
        : { id: newSegmentId(), kind: 'unknown', raw: match[0] },
    );
    cursor = start + match[0].length;
  }
  pushText(body.slice(cursor));

  return segments;
}

export function serializeSegments(segments: readonly TemplateSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      if (segment.kind === 'chip') return `{${segment.slot}}`;
      return segment.raw;
    })
    .join('');
}

/**
 * Free text may not carry braces: they would be read back as the start of a part. They are
 * dropped as the text is typed, so what the Admin sees is exactly what is saved.
 */
export function sanitizeText(text: string): string {
  return text.replace(/[{}]/g, '');
}

export function trendChipCount(segments: readonly TemplateSegment[]): number {
  return segments.filter((s) => s.kind === 'chip' && s.slot === TREND_SLOT).length;
}

export function hasUnknownSegments(segments: readonly TemplateSegment[]): boolean {
  return segments.some((s) => s.kind === 'unknown');
}

export type SentenceField = 'body' | 'trendNaik' | 'trendTurun' | 'trendTetap';

export const SENTENCE_FIELD_LIMITS: Record<SentenceField, number> = {
  body: 2000,
  trendNaik: 500,
  trendTurun: 500,
  trendTetap: 500,
};

export const SENTENCE_FIELD_NAMES: Record<SentenceField, string> = {
  body: 'Susunan kalimat',
  trendNaik: 'Saat nilai naik',
  trendTurun: 'Saat nilai turun',
  trendTetap: 'Saat nilai tetap',
};

/**
 * Corrections for one sentence field, in everyday language. Returns undefined when it is fine.
 * Mirrors the backend rules so the Admin hears about a problem before saving, beside the field.
 */
export function validateSentence(
  field: SentenceField,
  segments: readonly TemplateSegment[],
): string | undefined {
  const name = SENTENCE_FIELD_NAMES[field];
  const serialized = serializeSegments(segments).trim();

  if (serialized === '') return `${name} wajib diisi.`;
  if (hasUnknownSegments(segments)) {
    return `${name} memuat bagian tidak dikenali. Hapus bagian tersebut sebelum menyimpan.`;
  }

  const trendCount = trendChipCount(segments);
  if (field === 'body') {
    if (trendCount === 0) {
      return `Tambahkan bagian "${TREND_CHIP_NAME}" ke susunan kalimat. Bagian ini terisi otomatis dengan kata naik, turun, atau tetap sesuai angkanya.`;
    }
    if (trendCount > 1) {
      return `Bagian "${TREND_CHIP_NAME}" hanya boleh dipakai satu kali. Hapus salah satunya.`;
    }
  } else if (trendCount > 0) {
    return `Bagian "${TREND_CHIP_NAME}" tidak bisa dipakai di sini, karena isi kolom ini yang akan dipakai untuk mengisinya.`;
  }

  if (serialized.length > SENTENCE_FIELD_LIMITS[field]) {
    return `${name} terlalu panjang. Persingkat teksnya.`;
  }
  return undefined;
}

/**
 * Turns a stored string into a human-readable line with chips shown as `[Nama chip]`. Used to
 * describe a template to an Editor and to make a flagged excerpt readable without braces.
 */
export function describeBody(body: string): string {
  return parseBody(body)
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      if (segment.kind === 'chip') return `[${CHIP_BY_SLOT.get(segment.slot)!.name}]`;
      return '[bagian tidak dikenali]';
    })
    .join('');
}

/**
 * Makes a server-supplied excerpt readable: complete placeholders become `[Nama chip]` and the
 * fragments left by the excerpt's cut-off at either edge are dropped, so no brace is ever shown.
 */
export function readableExcerpt(excerpt: string): string {
  const trimmed = excerpt.replace(/^(…)?[^{}]*\}/, '$1').replace(/\{[^{}]*(…)?$/, '$1');
  return describeBody(trimmed).replace(/[{}]/g, '');
}

const SLUG_MAX = 100;

/**
 * Derives a lookup key from the template name. The Admin never sees it: it only has to be
 * unique and valid kebab-case. Accents fold to ASCII; an unusable name falls back to "templat".
 */
export function slugifyLabel(label: string): string {
  const base = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX - 8)
    .replace(/-+$/g, '');
  return base === '' ? 'templat' : base;
}

/** First free key for `label` given the keys already taken: `base`, `base-2`, `base-3`, ... */
export function uniqueSlug(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugifyLabel(label);
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
