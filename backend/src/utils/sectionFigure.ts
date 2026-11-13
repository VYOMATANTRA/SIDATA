import { z } from 'zod';
import { hasControlCharacters } from './hierarchyAuthoring.js';

/**
 * Section figure (SPEC §2/§7): the single photo, photo group or diagram a Cerita section may
 * carry. Stored as the `metadata` of a `figure` content block. Pure validation only; the
 * transactional write lives in `sectionFigure.service.ts`.
 *
 * Every message is plain Indonesian without field names, because the CMS shows the server
 * sentence for 400 responses.
 */

export const FIGURE_BLOCK_SLUG_PREFIX = 'figure-';
export const MAX_FIGURE_PHOTOS = 12;
export const MAX_FIGURE_BARS = 20;
/** Bar values are plain statistics; anything beyond this magnitude is a typo, not data. */
export const MAX_FIGURE_BAR_VALUE = 1_000_000_000;
/**
 * Cap on the serialized figure (`JSON.stringify(figure).length`), checked after the per-field
 * limits. A full-length group of 12 photos is about 8 400 characters; the rest is headroom for
 * JSON escaping. It keeps the stored `metadata` (echoed in every public content-block payload)
 * bounded the same way the spatial-point metadata is.
 */
export const MAX_FIGURE_JSON_LENGTH = 12_000;

export const figureSlugForSection = (sectionId: string): string =>
  `${FIGURE_BLOCK_SLUG_PREFIX}${sectionId}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for the slug a section's figure block owns (`figure-<uuid>`); prose blocks never take it. */
export const isFigureBlockSlug = (slug: string): boolean =>
  slug.startsWith(FIGURE_BLOCK_SLUG_PREFIX) &&
  UUID_PATTERN.test(slug.slice(FIGURE_BLOCK_SLUG_PREFIX.length));

/** Trimmed text with no HTML tags and no control or bidi characters. */
const text = (label: string, max: number, opts: { required: boolean }) => {
  const base = z
    .string({ error: `${label} harus berupa teks` })
    .trim()
    .max(max, `${label} maksimal ${max} karakter`)
    .refine((v) => !hasControlCharacters(v), `${label} mengandung karakter yang tidak valid`)
    .refine((v) => !/<[a-z!/]/i.test(v), `${label} tidak boleh mengandung tag HTML`);
  return opts.required ? base.min(1, `${label} wajib diisi`) : base;
};

/** An optional text field: a blank value means "not set" and is dropped from the stored figure. */
const optionalText = (label: string, max: number) =>
  text(label, max, { required: false })
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v));

const mediaIdSchema = z
  .string({ error: 'Foto belum dipilih' })
  .trim()
  .refine((v) => UUID_PATTERN.test(v), 'Foto tidak valid. Pilih atau unggah ulang fotonya')
  .transform((v) => v.toLowerCase());

const photoSchema = z.strictObject(
  {
    mediaId: mediaIdSchema,
    alt: text('Teks alternatif foto', 300, { required: true }),
    caption: optionalText('Keterangan foto', 200),
    credit: optionalText('Sumber foto', 120),
  },
  { error: 'Foto memuat isian yang tidak dikenal' },
);

const barSchema = z.strictObject(
  {
    label: text('Label batang diagram', 80, { required: true }),
    value: z
      .number({ error: 'Nilai batang diagram harus berupa angka' })
      .refine((v) => Number.isFinite(v), 'Nilai batang diagram harus berupa angka')
      .refine((v) => Math.abs(v) <= MAX_FIGURE_BAR_VALUE, 'Nilai batang diagram tidak wajar'),
  },
  { error: 'Batang diagram memuat isian yang tidak dikenal' },
);

const barsSchema = z.strictObject(
  {
    unit: optionalText('Satuan diagram', 20),
    items: z
      .array(barSchema, { error: 'Daftar batang diagram harus berupa daftar' })
      .min(1, 'Diagram batang minimal memiliki 1 batang')
      .max(MAX_FIGURE_BARS, `Diagram batang maksimal ${MAX_FIGURE_BARS} batang`)
      .refine(
        (items) => new Set(items.map((i) => i.label.trim().toLowerCase())).size === items.length,
        'Label batang diagram tidak boleh sama',
      ),
  },
  { error: 'Diagram batang memuat isian yang tidak dikenal' },
);

const diagramImageSchema = z.strictObject(
  {
    mediaId: mediaIdSchema,
    alt: text('Teks alternatif gambar diagram', 300, { required: true }),
  },
  { error: 'Gambar diagram memuat isian yang tidak dikenal' },
);

const singlePhotoFigure = z.strictObject(
  {
    kind: z.literal('photo'),
    photos: z
      .array(photoSchema, { error: 'Daftar foto harus berupa daftar' })
      .length(1, 'Gambar satu foto harus berisi tepat 1 foto'),
  },
  { error: 'Gambar memuat isian yang tidak dikenal' },
);

const photoGroupFigure = z.strictObject(
  {
    kind: z.literal('photos'),
    photos: z
      .array(photoSchema, { error: 'Daftar foto harus berupa daftar' })
      .min(2, 'Kelompok foto minimal berisi 2 foto')
      .max(MAX_FIGURE_PHOTOS, `Kelompok foto maksimal berisi ${MAX_FIGURE_PHOTOS} foto`),
  },
  { error: 'Gambar memuat isian yang tidak dikenal' },
);

const diagramFigure = z
  .strictObject(
    {
      kind: z.literal('diagram'),
      title: text('Judul diagram', 120, { required: true }),
      source: optionalText('Sumber diagram', 200),
      image: diagramImageSchema.optional(),
      bars: barsSchema.optional(),
    },
    { error: 'Gambar memuat isian yang tidak dikenal' },
  )
  .refine((f) => f.image !== undefined || f.bars !== undefined, {
    message: 'Diagram harus berisi gambar atau diagram batang',
  });

export const sectionFigureSchema = z
  .discriminatedUnion('kind', [singlePhotoFigure, photoGroupFigure, diagramFigure], {
    error: 'Jenis gambar tidak dikenal. Pilih foto, kelompok foto, atau diagram',
  })
  .superRefine((figure, ctx) => {
    const ids = figureMediaIds(figure, { dedupe: false });
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Foto yang sama tidak boleh dipakai lebih dari sekali dalam satu gambar',
      });
    }
    if (JSON.stringify(figure).length > MAX_FIGURE_JSON_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: 'Gambar terlalu besar. Kurangi isi teks atau jumlah foto',
      });
    }
  });

export type SectionFigure = z.output<typeof sectionFigureSchema>;

/** Body of `PUT /api/sections/:id/figure`. */
export const putFigureBodySchema = z
  .object({
    expectedUpdatedAt: z
      .string({ error: 'expectedUpdatedAt wajib diisi (string ISO 8601)' })
      .datetime({
        offset: true,
        error: 'expectedUpdatedAt harus berupa tanggal ISO 8601 yang valid',
      }),
    figure: z.unknown(),
  })
  .strict();

/** Every media asset a figure references, in document order. */
export function figureMediaIds(
  figure: SectionFigure,
  options: { dedupe?: boolean } = {},
): string[] {
  const ids =
    figure.kind === 'diagram'
      ? figure.image
        ? [figure.image.mediaId]
        : []
      : figure.photos.map((p) => p.mediaId);
  return options.dedupe === false ? ids : [...new Set(ids)];
}

/** Media ids of a stored figure (`metadata` JSON) without re-validating it; tolerant of junk. */
export function mediaIdsOfStoredFigure(metadata: unknown): string[] {
  const parsed = sectionFigureSchema.safeParse(metadata);
  if (parsed.success) return figureMediaIds(parsed.data);
  // A row that no longer validates (hand-edited, older shape) must still release its media.
  const found = new Set<string>();
  const m = metadata as {
    photos?: Array<{ mediaId?: unknown }>;
    image?: { mediaId?: unknown };
  } | null;
  const candidates = [...(Array.isArray(m?.photos) ? m.photos : []), m?.image];
  for (const c of candidates) {
    const id = c && typeof c === 'object' ? (c as { mediaId?: unknown }).mediaId : undefined;
    if (typeof id === 'string' && UUID_PATTERN.test(id)) found.add(id.toLowerCase());
  }
  return [...found];
}

/** Audit-safe summary: kind and photo count only, never captions or alt text. */
export function figureAuditSummary(figure: SectionFigure): { kind: string; photoCount: number } {
  return {
    kind: figure.kind,
    photoCount: figure.kind === 'diagram' ? (figure.image ? 1 : 0) : figure.photos.length,
  };
}
