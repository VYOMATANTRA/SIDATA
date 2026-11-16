import { z } from 'zod';
import {
  MAX_FIGURE_BARS,
  MAX_FIGURE_BAR_VALUE,
  MAX_FIGURE_JSON_LENGTH,
  MAX_FIGURE_PHOTOS,
} from './sectionFigure.js';
import { hasControlCharacters, titleSchema } from './hierarchyAuthoring.js';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;
const RESERVED_ROW_KEY_PREFIX = 'tmp:';
const MAX_ROWS_PER_TABLE = 500;
const INT32_MAX = 2_147_483_647;

const kebabSlug = (label: string) =>
  z
    .string({ error: `${label} harus berupa string` })
    .trim()
    .toLowerCase()
    .min(1, `${label} wajib diisi`)
    .max(100, `${label} maksimal 100 karakter`)
    .regex(SLUG_REGEX, `${label} harus berformat kebab-case`);

const cleanText = (label: string, max: number, required: boolean) => {
  const base = z
    .string({ error: `${label} harus berupa teks` })
    .trim()
    .max(max, `${label} maksimal ${max} karakter`)
    .refine((v) => !hasControlCharacters(v), `${label} mengandung karakter kontrol`)
    .refine((v) => !/<[a-z!/]/i.test(v), `${label} tidak boleh mengandung tag HTML`);
  return required ? base.min(1, `${label} wajib diisi`) : base;
};

const optionalCleanText = (label: string, max: number) =>
  cleanText(label, max, false)
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v));

const nonnegInt = (label: string) =>
  z
    .number({ error: `${label} harus berupa angka` })
    .refine(
      (v) => Number.isInteger(v) && v >= 0 && v <= INT32_MAX,
      `${label} harus bilangan bulat 0..${INT32_MAX}`,
    );

const decimalInput = z
  .union([z.number(), z.string()])
  .refine(
    (val) =>
      typeof val === 'number'
        ? Number.isFinite(val) && DECIMAL_RE.test(String(val))
        : DECIMAL_RE.test(val.trim()),
    'Nilai indikator harus berupa angka desimal valid (maks 14 digit bulat, 4 desimal)',
  );

export const importProseBlockSchema = z
  .object({
    title: titleSchema('Judul blok prosa'),
    body: z
      .string({ error: 'Isi blok prosa harus berupa string' })
      .trim()
      .min(1, 'Isi blok prosa wajib diisi')
      .max(50_000, 'Isi blok prosa maksimal 50.000 karakter'),
  })
  .strict();

export const importPhotoFileSchema = z
  .object({
    filePath: z.string().trim().min(1, 'filePath foto wajib diisi'),
    alt: cleanText('Teks alternatif foto', 300, true),
    caption: optionalCleanText('Keterangan foto', 200),
    credit: optionalCleanText('Sumber foto', 120),
  })
  .strict();

const importDiagramBarSchema = z
  .object({
    label: cleanText('Label batang diagram', 80, true),
    value: z
      .number({ error: 'Nilai batang diagram harus angka' })
      .refine(
        (v) => Number.isFinite(v) && Math.abs(v) <= MAX_FIGURE_BAR_VALUE,
        'Nilai batang diagram di luar batas wajar',
      ),
  })
  .strict();

const importDiagramBarsSchema = z
  .object({
    unit: optionalCleanText('Satuan diagram', 20),
    items: z
      .array(importDiagramBarSchema)
      .min(1, 'Diagram batang minimal 1 batang')
      .max(MAX_FIGURE_BARS, `Diagram batang maksimal ${MAX_FIGURE_BARS} batang`)
      .refine(
        (items) => new Set(items.map((i) => i.label.trim().toLowerCase())).size === items.length,
        'Label batang diagram tidak boleh duplikat',
      ),
  })
  .strict();

export const importFigureSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('photo'),
        photos: z.array(importPhotoFileSchema).length(1, 'Figure photo harus berisi tepat 1 foto'),
      })
      .strict(),
    z
      .object({
        kind: z.literal('photos'),
        photos: z
          .array(importPhotoFileSchema)
          .min(2, 'Figure photos minimal 2 foto')
          .max(MAX_FIGURE_PHOTOS, `Figure photos maksimal ${MAX_FIGURE_PHOTOS} foto`),
      })
      .strict(),
    z
      .object({
        kind: z.literal('diagram'),
        title: cleanText('Judul diagram', 120, true),
        source: optionalCleanText('Sumber diagram', 200),
        image: z
          .object({
            filePath: z.string().trim().min(1, 'filePath gambar diagram wajib diisi'),
            alt: cleanText('Teks alternatif gambar diagram', 300, true),
          })
          .strict()
          .optional(),
        bars: importDiagramBarsSchema.optional(),
      })
      .strict()
      .refine((f) => f.image !== undefined || f.bars !== undefined, {
        message: 'Diagram harus berisi image atau bars',
      }),
  ])
  .superRefine((fig, ctx) => {
    if (fig.kind === 'diagram' && fig.image === undefined && fig.bars !== undefined) {
      const serialized = JSON.stringify(fig);
      if (serialized.length > MAX_FIGURE_JSON_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          message: `Ukuran JSON figure melebihi ${MAX_FIGURE_JSON_LENGTH} karakter`,
        });
      }
    }
  });

export const importIndicatorSchema = z
  .object({
    slug: kebabSlug('Slug indikator'),
    label: z.string().trim().min(1, 'Label indikator wajib diisi').max(500),
    unit: z.string().trim().max(32).nullable().optional(),
    valueCurrent: decimalInput,
    valuePrevious: decimalInput.nullable().optional(),
    periodCurrent: z.string().trim().min(1, 'periodCurrent wajib diisi').max(64),
    periodPrevious: z.string().trim().max(64).nullable().optional(),
    isComputedComparison: z.boolean().optional(),
    isStale: z.boolean().optional(),
    comparisonTemplateSlug: z.string().trim().min(1).max(100).nullable().optional(),
    source: z.string().trim().max(2000).nullable().optional(),
    hedgeNote: z.string().trim().max(2000).nullable().optional(),
    sortOrder: nonnegInt('sortOrder indikator').optional(),
  })
  .strict()
  .superRefine((ind, ctx) => {
    const hasPrevVal = ind.valuePrevious !== undefined && ind.valuePrevious !== null;
    const hasPrevPeriod =
      ind.periodPrevious !== undefined &&
      ind.periodPrevious !== null &&
      ind.periodPrevious.trim() !== '';

    if (hasPrevVal !== hasPrevPeriod) {
      ctx.addIssue({
        code: 'custom',
        message: `Indikator "${ind.slug}": valuePrevious dan periodPrevious harus diisi berpasangan`,
      });
    }

    if (ind.isComputedComparison && (!hasPrevVal || !hasPrevPeriod)) {
      ctx.addIssue({
        code: 'custom',
        message: `Indikator "${ind.slug}": isComputedComparison=true memerlukan valuePrevious dan periodPrevious`,
      });
    }

    if (ind.comparisonTemplateSlug && !ind.isComputedComparison) {
      ctx.addIssue({
        code: 'custom',
        message: `Indikator "${ind.slug}": comparisonTemplateSlug memerlukan isComputedComparison=true`,
      });
    }
  });

const INDICATOR_TABLE_KINDS = [
  'age_pyramid',
  'ethnicity',
  'religion_by_sex',
  'occupation',
] as const;
const SEX_SPLIT_KINDS = new Set<string>(['age_pyramid', 'religion_by_sex']);

export const importTableRowSchema = z
  .object({
    rowKey: z
      .string()
      .trim()
      .min(1, 'rowKey wajib diisi')
      .max(64)
      .refine((v) => !v.startsWith(RESERVED_ROW_KEY_PREFIX), 'rowKey tidak boleh diawali tmp:'),
    label: z.string().trim().min(1, 'Label baris wajib diisi').max(255),
    male: nonnegInt('male').nullable().optional(),
    female: nonnegInt('female').nullable().optional(),
    total: nonnegInt('total').nullable().optional(),
    sortOrder: nonnegInt('sortOrder baris').optional(),
  })
  .strict();

export const importIndicatorTableSchema = z
  .object({
    slug: kebabSlug('Slug tabel indikator'),
    title: z.string().trim().min(1, 'Judul tabel wajib diisi').max(255),
    kind: z.enum(INDICATOR_TABLE_KINDS),
    period: z.string().trim().min(1, 'Periode tabel wajib diisi').max(64),
    source: z.string().trim().max(2000).nullable().optional(),
    sortOrder: nonnegInt('sortOrder tabel').optional(),
    rows: z.array(importTableRowSchema).max(MAX_ROWS_PER_TABLE),
  })
  .strict()
  .superRefine((table, ctx) => {
    const sexSplit = SEX_SPLIT_KINDS.has(table.kind);
    const seenKeys = new Set<string>();

    for (const [idx, row] of table.rows.entries()) {
      if (seenKeys.has(row.rowKey)) {
        ctx.addIssue({
          code: 'custom',
          message: `Tabel "${table.slug}" baris ${idx + 1}: rowKey "${row.rowKey}" duplikat`,
        });
      }
      seenKeys.add(row.rowKey);

      if (sexSplit && row.total !== undefined && row.total !== null) {
        ctx.addIssue({
          code: 'custom',
          message: `Tabel "${table.slug}" (${table.kind}) baris "${row.rowKey}": tidak boleh mengisi total secara langsung`,
        });
      }

      if (!sexSplit) {
        if (
          (row.male !== undefined && row.male !== null) ||
          (row.female !== undefined && row.female !== null)
        ) {
          ctx.addIssue({
            code: 'custom',
            message: `Tabel "${table.slug}" (${table.kind}) baris "${row.rowKey}": tidak boleh mengisi male/female`,
          });
        }
      }
    }
  });

export const importSectionSchema = z
  .object({
    title: titleSchema('Judul bagian'),
    slug: kebabSlug('Slug bagian').optional(),
    proseBlocks: z.array(importProseBlockSchema).optional(),
    figure: importFigureSchema.optional(),
    indicators: z.array(importIndicatorSchema).optional(),
    tables: z.array(importIndicatorTableSchema).optional(),
  })
  .strict();

export const importChapterSchema = z
  .object({
    slug: kebabSlug('Slug bab'),
    title: titleSchema('Judul bab'),
    sections: z.array(importSectionSchema),
  })
  .strict();

export const importPageSchema = z
  .object({
    slug: kebabSlug('Slug halaman'),
    title: titleSchema('Judul halaman').optional(),
    coverPhoto: z
      .object({
        filePath: z.string().trim().min(1, 'filePath coverPhoto wajib diisi'),
      })
      .strict()
      .optional(),
    chapters: z.array(importChapterSchema),
  })
  .strict();

export const importStandaloneBlockSchema = z
  .object({
    slug: kebabSlug('Slug blok konten'),
    title: z.string().trim().min(1).max(255).optional(),
    body: z.string().trim().min(1).max(50_000).optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export const contentImportManifestSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1).optional(),
    standaloneBlocks: z.array(importStandaloneBlockSchema).optional(),
    pages: z.array(importPageSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const pageSlugs = new Set<string>();
    const indicatorSlugs = new Set<string>();
    const tableSlugs = new Set<string>();

    for (const page of manifest.pages) {
      if (pageSlugs.has(page.slug)) {
        ctx.addIssue({ code: 'custom', message: `Duplikat slug halaman: "${page.slug}"` });
      }
      pageSlugs.add(page.slug);

      const chapterSlugs = new Set<string>();
      for (const chapter of page.chapters) {
        if (chapterSlugs.has(chapter.slug)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplikat slug bab "${chapter.slug}" pada halaman "${page.slug}"`,
          });
        }
        chapterSlugs.add(chapter.slug);

        for (const section of chapter.sections) {
          for (const ind of section.indicators ?? []) {
            if (indicatorSlugs.has(ind.slug)) {
              ctx.addIssue({
                code: 'custom',
                message: `Duplikat slug indikator: "${ind.slug}"`,
              });
            }
            indicatorSlugs.add(ind.slug);
          }

          for (const tbl of section.tables ?? []) {
            if (tableSlugs.has(tbl.slug)) {
              ctx.addIssue({
                code: 'custom',
                message: `Duplikat slug tabel: "${tbl.slug}"`,
              });
            }
            tableSlugs.add(tbl.slug);
          }
        }
      }
    }
  });

export type ContentImportManifest = z.infer<typeof contentImportManifestSchema>;
export type ImportPage = z.infer<typeof importPageSchema>;
export type ImportChapter = z.infer<typeof importChapterSchema>;
export type ImportSection = z.infer<typeof importSectionSchema>;
export type ImportIndicator = z.infer<typeof importIndicatorSchema>;
export type ImportIndicatorTable = z.infer<typeof importIndicatorTableSchema>;
export type ImportFigure = z.infer<typeof importFigureSchema>;

const MARKDOWN_LIST_MARKER_RE = /^[ \t]*[-*+][ \t]+/gm;

/** Removes leftover Markdown syntax so plain-text renderers never show raw formatting markers. */
export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^[ \t]*```[^\n]*\n?/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(MARKDOWN_LIST_MARKER_RE, '• ')
    .replace(/!?\[([^\]\n]+)\]\((?:https?:\/\/|\/|mailto:)[^)\s]+\)/g, '$1')
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(/\*\*\*([^\n]+?)\*\*\*/g, '$1')
    .replace(/\*\*([^\n]+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\s)([^\n*]+?)(?<!\s)\*(?!\*)/g, '$1')
    .replace(/(?<![\w])___([^\n_]+?)___(?![\w])/g, '$1')
    .replace(/(?<![\w])__([^\n_]+?)__(?![\w])/g, '$1')
    .replace(/(?<![\w])_(?!\s)([^\n_]+?)(?<!\s)_(?![\w])/g, '$1')
    .trim();
}

function stripOpt(val: string | undefined): string | undefined {
  return val === undefined ? undefined : stripMarkdownFormatting(val);
}

function stripNullable(val: string | null | undefined): string | null | undefined {
  if (val === undefined || val === null) return val;
  return stripMarkdownFormatting(val);
}

function sanitizeManifestText(manifest: ContentImportManifest): ContentImportManifest {
  return {
    ...manifest,
    ...(manifest.standaloneBlocks
      ? {
          standaloneBlocks: manifest.standaloneBlocks.map((sb) => ({
            ...sb,
            ...(sb.title !== undefined ? { title: stripMarkdownFormatting(sb.title) } : {}),
            ...(sb.body !== undefined ? { body: stripMarkdownFormatting(sb.body) } : {}),
          })),
        }
      : {}),
    pages: manifest.pages.map((page) => ({
      ...page,
      ...(page.title !== undefined ? { title: stripMarkdownFormatting(page.title) } : {}),
      chapters: page.chapters.map((chapter) => ({
        ...chapter,
        title: stripMarkdownFormatting(chapter.title),
        sections: chapter.sections.map((section) => ({
          ...section,
          title: stripMarkdownFormatting(section.title),
          ...(section.proseBlocks
            ? {
                proseBlocks: section.proseBlocks.map((pb) => ({
                  title: stripMarkdownFormatting(pb.title),
                  body: stripMarkdownFormatting(pb.body),
                })),
              }
            : {}),
          ...(section.figure
            ? {
                figure:
                  section.figure.kind === 'diagram'
                    ? {
                        ...section.figure,
                        title: stripMarkdownFormatting(section.figure.title),
                        source: stripOpt(section.figure.source),
                        ...(section.figure.image
                          ? {
                              image: {
                                ...section.figure.image,
                                alt: stripMarkdownFormatting(section.figure.image.alt),
                              },
                            }
                          : {}),
                        ...(section.figure.bars
                          ? {
                              bars: {
                                ...section.figure.bars,
                                unit: stripOpt(section.figure.bars.unit),
                                items: section.figure.bars.items.map((item) => ({
                                  ...item,
                                  label: stripMarkdownFormatting(item.label),
                                })),
                              },
                            }
                          : {}),
                      }
                    : {
                        ...section.figure,
                        photos: section.figure.photos.map((photo) => ({
                          ...photo,
                          alt: stripMarkdownFormatting(photo.alt),
                          caption: stripOpt(photo.caption),
                          credit: stripOpt(photo.credit),
                        })),
                      },
              }
            : {}),
          ...(section.indicators
            ? {
                indicators: section.indicators.map((ind) => ({
                  ...ind,
                  label: stripMarkdownFormatting(ind.label),
                  ...(ind.unit !== undefined ? { unit: stripNullable(ind.unit) } : {}),
                  ...(ind.source !== undefined ? { source: stripNullable(ind.source) } : {}),
                  ...(ind.hedgeNote !== undefined
                    ? { hedgeNote: stripNullable(ind.hedgeNote) }
                    : {}),
                })),
              }
            : {}),
          ...(section.tables
            ? {
                tables: section.tables.map((tbl) => ({
                  ...tbl,
                  title: stripMarkdownFormatting(tbl.title),
                  ...(tbl.source !== undefined ? { source: stripNullable(tbl.source) } : {}),
                  rows: tbl.rows.map((row) => ({
                    ...row,
                    label: stripMarkdownFormatting(row.label),
                  })),
                })),
              }
            : {}),
        })),
      })),
    })),
  };
}

export function parseContentImportManifest(raw: unknown): ContentImportManifest {
  const parsed = contentImportManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => i.message).join('\n- ');
    throw new Error(`Manifest impor tidak valid:\n- ${details}`);
  }
  return sanitizeManifestText(parsed.data);
}

/** Formats indicator input to canonical request fields accepted by POST/PATCH /api/indicators. */
export function buildIndicatorRequestBody(
  input: ImportIndicator,
  sectionId: string,
  templateIdBySlug: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const comparisonTemplateId =
    input.comparisonTemplateSlug !== undefined && input.comparisonTemplateSlug !== null
      ? templateIdBySlug.get(input.comparisonTemplateSlug)
      : undefined;

  if (
    input.comparisonTemplateSlug !== undefined &&
    input.comparisonTemplateSlug !== null &&
    !comparisonTemplateId
  ) {
    throw new Error(
      `Template perbandingan "${input.comparisonTemplateSlug}" untuk indikator "${input.slug}" tidak ditemukan di server.`,
    );
  }

  return {
    sectionId,
    slug: input.slug,
    label: input.label,
    unit: input.unit ?? null,
    valueCurrent:
      typeof input.valueCurrent === 'number' ? input.valueCurrent : input.valueCurrent.trim(),
    valuePrevious:
      input.valuePrevious === undefined || input.valuePrevious === null
        ? null
        : typeof input.valuePrevious === 'number'
          ? input.valuePrevious
          : input.valuePrevious.trim(),
    periodCurrent: input.periodCurrent,
    periodPrevious: input.periodPrevious ?? null,
    isComputedComparison: input.isComputedComparison ?? false,
    isStale: input.isStale ?? false,
    ...(comparisonTemplateId !== undefined
      ? { comparisonTemplateId }
      : input.comparisonTemplateSlug === null
        ? { comparisonTemplateId: null }
        : {}),
    source: input.source ?? null,
    hedgeNote: input.hedgeNote ?? null,
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  };
}

/** Extracts `name=value` cookie pairs from `Set-Cookie` headers into a map. */
export function extractCookiesFromHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const rawCookie of setCookies) {
    const firstPart = rawCookie.split(';')[0]?.trim();
    if (!firstPart) continue;
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = firstPart.slice(0, eqIndex).trim();
    const value = firstPart.slice(eqIndex + 1).trim();
    if (name) {
      result[name] = value;
    }
  }
  return result;
}

export function formatCookieHeader(cookies: ReadonlyMap<string, string>): string {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/** Computes wait milliseconds for 429 responses using Retry-After or draft-7 RateLimit-Reset. */
export function computeRateLimitDelayMs(headers: Headers, fallbackMs = 15_000): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000) + 500;
    }
    const targetMs = Date.parse(retryAfter);
    if (Number.isFinite(targetMs)) {
      return Math.max(1_000, targetMs - Date.now() + 500);
    }
  }

  const rateLimitReset = headers.get('ratelimit-reset');
  if (rateLimitReset) {
    const seconds = Number(rateLimitReset);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000) + 500;
    }
  }

  return fallbackMs;
}
