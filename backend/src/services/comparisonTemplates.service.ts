import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';
import { SLUG_REGEX, indicatorCachesInvalidator } from './indicators.service.js';
import { executeLockedTransaction, withChangeResult } from '../utils/lockTransactionCache.js';
import {
  TEMPLATE_SLOTS,
  renderComparison,
  computeTrend,
  validateTemplateStructure,
  type Trend,
  type ComparisonTemplateText,
  type TemplateField,
  type TemplateStructureError,
} from '../utils/comparisonProse.js';
import {
  findTrendKeywords,
  trendWarningAckKey,
  type TrendKeywordMatch,
} from '../utils/trendKeywords.js';

export const TREND_KEYWORD_ACK_REQUIRED = 'TREND_KEYWORD_ACK_REQUIRED';

/** One flagged occurrence, as returned to the admin so they can acknowledge that exact wording. */
export interface TrendWarning extends TrendKeywordMatch {
  /** Send this back in `acknowledgedWarnings` to accept this occurrence of this wording. */
  ackKey: string;
  acknowledged: boolean;
  message: string;
}

export class ComparisonTemplateServiceError extends Error {
  statusCode: number;
  code?: string;
  warnings?: TrendWarning[];

  constructor(
    message: string,
    statusCode: number,
    options: { code?: string; warnings?: TrendWarning[] } = {},
  ) {
    super(message);
    this.name = 'ComparisonTemplateServiceError';
    this.statusCode = statusCode;
    if (options.code !== undefined) this.code = options.code;
    if (options.warnings !== undefined) this.warnings = options.warnings;
  }
}

export interface ComparisonTemplateDto extends ComparisonTemplateText {
  id: string;
  slug: string;
  label: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow extends ComparisonTemplateText {
  id: string;
  slug: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { indicators: number };
}

/** Every read and write returns the row with its usage count, so the DTO is built one way. */
const WITH_USAGE = { _count: { select: { indicators: true } } } as const;

function toDto(row: TemplateRow): ComparisonTemplateDto {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    body: row.body,
    trendNaik: row.trendNaik,
    trendTurun: row.trendTurun,
    trendTetap: row.trendTetap,
    usageCount: row._count.indicators,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const TEXT_FIELDS = ['slug', 'label', 'body', 'trendNaik', 'trendTurun', 'trendTetap'] as const;

const MAX_BODY_LENGTH = 2000;

/**
 * Every flagged occurrence needs its own key, so the cap must admit as many as a maximum-length
 * body can hold. The shortest keyword is 4 characters and two matches need a separator, so a
 * match takes at least 5 characters of body.
 */
const MAX_ACKNOWLEDGED_WARNINGS = Math.ceil(MAX_BODY_LENGTH / 5);

const templateFields = {
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Slug wajib diisi')
    .max(100, 'Slug maksimal 100 karakter')
    .regex(SLUG_REGEX, 'Format slug tidak valid. Gunakan format kebab-case.'),
  label: z.string().trim().min(1, 'Label wajib diisi').max(255, 'Label maksimal 255 karakter'),
  body: z
    .string()
    .trim()
    .min(1, 'Body wajib diisi')
    .max(MAX_BODY_LENGTH, `Body maksimal ${MAX_BODY_LENGTH} karakter`),
  trendNaik: z
    .string()
    .trim()
    .min(1, 'Varian naik wajib diisi')
    .max(500, 'Varian naik maksimal 500 karakter'),
  trendTurun: z
    .string()
    .trim()
    .min(1, 'Varian turun wajib diisi')
    .max(500, 'Varian turun maksimal 500 karakter'),
  trendTetap: z
    .string()
    .trim()
    .min(1, 'Varian tetap wajib diisi')
    .max(500, 'Varian tetap maksimal 500 karakter'),
};

// `ackKey`s the admin was shown by an earlier 422. Not part of the template: never stored,
// and never counted as an edit.
const acknowledgedWarnings = z
  .array(z.string().max(128, 'Kunci peringatan maksimal 128 karakter'))
  .max(
    MAX_ACKNOWLEDGED_WARNINGS,
    `acknowledgedWarnings maksimal ${MAX_ACKNOWLEDGED_WARNINGS} kunci`,
  )
  .optional();

export const createComparisonTemplateSchema = z
  .object({ ...templateFields, acknowledgedWarnings })
  .strict();

export const updateComparisonTemplateSchema = z
  .object({
    slug: templateFields.slug.optional(),
    label: templateFields.label.optional(),
    body: templateFields.body.optional(),
    trendNaik: templateFields.trendNaik.optional(),
    trendTurun: templateFields.trendTurun.optional(),
    trendTetap: templateFields.trendTetap.optional(),
    acknowledgedWarnings,
  })
  .strict()
  .refine((data) => Object.keys(data).some((key) => key !== 'acknowledgedWarnings'), {
    message: 'Setidaknya satu bidang harus disediakan untuk diperbarui',
  });

const FIELD_NAMES: Record<TemplateField, string> = {
  body: 'body',
  trendNaik: 'varian naik',
  trendTurun: 'varian turun',
  trendTetap: 'varian tetap',
};

const SLOT_LIST = TEMPLATE_SLOTS.map((slot) => `{${slot}}`).join(', ');

function describeStructureError(error: TemplateStructureError): string {
  const where = FIELD_NAMES[error.field];
  switch (error.code) {
    case 'TREND_SLOT_MISSING':
      return `Body harus memuat tepat satu {trend}; arah perubahan hanya boleh muncul lewat slot itu.`;
    case 'TREND_SLOT_DUPLICATE':
      return `Body hanya boleh memuat satu {trend}.`;
    case 'TREND_SLOT_IN_VARIANT':
      return `{trend} tidak boleh dipakai di ${where}; slot itu hanya ada di body.`;
    case 'UNKNOWN_PLACEHOLDER':
      return `Placeholder {${error.detail ?? ''}} di ${where} tidak dikenal. Placeholder yang tersedia: ${SLOT_LIST}.`;
    case 'STRAY_BRACE':
      return `Tanda kurung kurawal di ${where} tidak berpasangan atau kosong. Tulis placeholder lengkap, mis. {delta}.`;
  }
}

function assertValidStructure(template: ComparisonTemplateText): void {
  const errors = validateTemplateStructure(template);
  if (errors.length > 0) {
    throw new ComparisonTemplateServiceError(errors.map(describeStructureError).join(' '), 400);
  }
}

function describeWarning(match: TrendKeywordMatch): string {
  return (
    `Kata "${match.phrase}" menyatakan tren atau perbandingan di luar slot {trend}, sehingga ` +
    `kalimat itu tampil sama persis apa pun arah datanya dan bisa menjadi tidak benar saat ` +
    `angkanya berubah. Pindahkan ke slot {trend}, atau akui peringatan ini untuk tetap menyimpan.`
  );
}

/**
 * SPEC §5 warn-on-save. Returns the findings the admin has acknowledged (so the caller can log
 * the override), or throws 422 carrying every finding if any is still unacknowledged. Each
 * `ackKey` is bound to the exact body and occurrence, so an acknowledgment cannot outlive an
 * edit of the wording it was given for.
 */
function requireKeywordAcknowledgment(
  body: string,
  acknowledgedKeys: readonly string[] | undefined,
): TrendKeywordMatch[] {
  const findings = findTrendKeywords(body);
  if (findings.length === 0) return findings;

  const acknowledged = new Set(acknowledgedKeys ?? []);
  const warnings: TrendWarning[] = findings.map((match) => {
    const ackKey = trendWarningAckKey(body, match);
    return {
      ...match,
      ackKey,
      acknowledged: acknowledged.has(ackKey),
      message: describeWarning(match),
    };
  });

  if (warnings.some((warning) => !warning.acknowledged)) {
    throw new ComparisonTemplateServiceError(
      'Body template memuat kata tren di luar slot {trend}. Tinjau setiap peringatan, lalu kirim ulang dengan ackKey-nya di acknowledgedWarnings untuk tetap menyimpan.',
      422,
      { code: TREND_KEYWORD_ACK_REQUIRED, warnings },
    );
  }
  return findings;
}

async function logKeywordOverride(
  findings: readonly TrendKeywordMatch[],
  target: { id: string; slug: string },
  actor: AuditActor,
  reqContext: AuditRequestContext,
  tx: Parameters<typeof buildAuditLog>[1],
): Promise<void> {
  if (findings.length === 0) return;
  await buildAuditLog(
    {
      action: AUDIT_ACTIONS.COMPARISON_TEMPLATE_KEYWORD_WARNING_OVERRIDDEN,
      actor,
      target: { type: 'comparison_template', id: target.id, label: target.slug },
      // The wording that was overridden, not the ackKeys: the keys are bearer-style tokens for
      // one request and add nothing to a trace of what was accepted.
      metadata: {
        slug: target.slug,
        overrides: findings.map(({ phrase, keyword, start, excerpt }) => ({
          phrase,
          keyword,
          start,
          excerpt,
        })),
      },
      context: reqContext,
    },
    tx,
  );
}

function isPrismaKnownError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

const isValidId = (id: unknown): id is string =>
  typeof id === 'string' && id.trim() !== '' && id.length <= 191;

function parsePayload<T>(schema: z.ZodType<T>, rawInput: unknown): T {
  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    throw new ComparisonTemplateServiceError('Payload harus berupa objek JSON.', 400);
  }
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ComparisonTemplateServiceError(
      parsed.error.issues.map((issue) => issue.message).join(', '),
      400,
    );
  }
  return parsed.data;
}

export const listComparisonTemplates = async (
  client: { comparisonTemplate: Pick<typeof prisma.comparisonTemplate, 'findMany'> } = prisma,
): Promise<ComparisonTemplateDto[]> => {
  const rows = await client.comparisonTemplate.findMany({
    orderBy: [{ label: 'asc' }, { id: 'asc' }],
    include: WITH_USAGE,
  });
  return rows.map(toDto);
};

export const getComparisonTemplateById = async (
  id: unknown,
  client: { comparisonTemplate: Pick<typeof prisma.comparisonTemplate, 'findUnique'> } = prisma,
): Promise<ComparisonTemplateDto | null> => {
  if (!isValidId(id)) return null;
  const row = await client.comparisonTemplate.findUnique({
    where: { id: id.trim() },
    include: WITH_USAGE,
  });
  return row ? toDto(row) : null;
};

export const createComparisonTemplate = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<ComparisonTemplateDto> => {
  const { acknowledgedWarnings: acknowledgedKeys, ...input } = parsePayload(
    createComparisonTemplateSchema,
    rawInput,
  );

  // Structure first: a malformed body has no meaningful keyword findings to acknowledge.
  assertValidStructure(input);
  const overridden = requireKeywordAcknowledgment(input.body, acknowledgedKeys);

  try {
    return await executeLockedTransaction({
      client,
      execute: async (tx) => {
        const row = await tx.comparisonTemplate.create({ data: input, include: WITH_USAGE });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.COMPARISON_TEMPLATE_CREATED,
            actor,
            target: { type: 'comparison_template', id: row.id, label: row.slug },
            metadata: { slug: row.slug, label: row.label },
            context: reqContext,
          },
          tx,
        );
        await logKeywordOverride(overridden, row, actor, reqContext, tx);

        return toDto(row);
      },
    });
  } catch (error) {
    if (error instanceof ComparisonTemplateServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new ComparisonTemplateServiceError(
        `Slug '${input.slug}' sudah digunakan template lain.`,
        409,
      );
    }
    throw error;
  }
};

export const updateComparisonTemplate = async (
  id: unknown,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<ComparisonTemplateDto> => {
  if (!isValidId(id)) {
    throw new ComparisonTemplateServiceError('ID template tidak valid.', 400);
  }
  const normalizedId = id.trim();
  const { acknowledgedWarnings: acknowledgedKeys, ...input } = parsePayload(
    updateComparisonTemplateSchema,
    rawInput,
  );

  const lockQuery = Prisma.sql`SELECT id FROM comparison_templates WHERE id = ${normalizedId} FOR UPDATE`;

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [indicatorCachesInvalidator],
      execute: async (tx) => {
        const existing = await tx.comparisonTemplate.findUnique({
          where: { id: normalizedId },
          include: WITH_USAGE,
        });
        if (!existing) {
          throw new ComparisonTemplateServiceError('Template tidak ditemukan.', 404);
        }

        // The merged template is what indicators will render, so that is what must be valid.
        if (
          input.body !== undefined ||
          input.trendNaik !== undefined ||
          input.trendTurun !== undefined ||
          input.trendTetap !== undefined
        ) {
          assertValidStructure({
            body: input.body ?? existing.body,
            trendNaik: input.trendNaik ?? existing.trendNaik,
            trendTurun: input.trendTurun ?? existing.trendTurun,
            trendTetap: input.trendTetap ?? existing.trendTetap,
          });
        }

        const changes: Record<string, { before: string; after: string }> = {};
        for (const field of TEXT_FIELDS) {
          const after = input[field];
          if (after !== undefined && after !== existing[field]) {
            changes[field] = { before: existing[field], after };
          }
        }

        if (Object.keys(changes).length === 0) {
          return withChangeResult(toDto(existing), false);
        }

        // Only a changed body is re-checked: a label edit must not re-litigate wording that
        // was already acknowledged (or predates the check).
        const overridden = changes['body']
          ? requireKeywordAcknowledgment(changes['body'].after, acknowledgedKeys)
          : [];

        const updated = await tx.comparisonTemplate.update({
          where: { id: normalizedId },
          data: Object.fromEntries(
            Object.entries(changes).map(([field, change]) => [field, change.after]),
          ),
          include: WITH_USAGE,
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.COMPARISON_TEMPLATE_UPDATED,
            actor,
            target: { type: 'comparison_template', id: existing.id, label: existing.slug },
            metadata: { slug: existing.slug, changes },
            context: reqContext,
          },
          tx,
        );
        await logKeywordOverride(overridden, existing, actor, reqContext, tx);

        return toDto(updated);
      },
    });
  } catch (error) {
    if (error instanceof ComparisonTemplateServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new ComparisonTemplateServiceError('Slug sudah digunakan template lain.', 409);
    }
    if (isPrismaKnownError(error, 'P2025')) {
      throw new ComparisonTemplateServiceError('Template tidak ditemukan.', 404);
    }
    throw error;
  }
};

export const deleteComparisonTemplate = async (
  id: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<ComparisonTemplateDto> => {
  if (!isValidId(id)) {
    throw new ComparisonTemplateServiceError('ID template tidak valid.', 400);
  }
  const normalizedId = id.trim();

  // Attaching a template to an indicator takes this same row lock, so the usage count read
  // below cannot go stale before the delete lands.
  const lockQuery = Prisma.sql`SELECT id FROM comparison_templates WHERE id = ${normalizedId} FOR UPDATE`;

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      // Cheap insurance: no cached indicator should outlive a change to any template row.
      cache: [indicatorCachesInvalidator],
      execute: async (tx) => {
        const existing = await tx.comparisonTemplate.findUnique({
          where: { id: normalizedId },
          include: WITH_USAGE,
        });
        if (!existing) {
          throw new ComparisonTemplateServiceError('Template tidak ditemukan.', 404);
        }
        if (existing._count.indicators > 0) {
          throw new ComparisonTemplateServiceError(
            `Template masih dipakai ${existing._count.indicators} indikator. Lepaskan dari indikator tersebut sebelum menghapusnya.`,
            409,
          );
        }

        await tx.comparisonTemplate.delete({ where: { id: normalizedId } });

        const before = toDto(existing);
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.COMPARISON_TEMPLATE_DELETED,
            actor,
            target: { type: 'comparison_template', id: existing.id, label: existing.slug },
            metadata: { slug: existing.slug, label: existing.label, before },
            context: reqContext,
          },
          tx,
        );

        return before;
      },
    });
  } catch (error) {
    if (error instanceof ComparisonTemplateServiceError) throw error;
    if (isPrismaKnownError(error, 'P2003')) {
      // An attach committed between the usage check and the DELETE; the FK is RESTRICT.
      throw new ComparisonTemplateServiceError(
        'Template masih dipakai indikator. Lepaskan dari indikator tersebut sebelum menghapusnya.',
        409,
      );
    }
    if (isPrismaKnownError(error, 'P2025')) {
      throw new ComparisonTemplateServiceError('Template tidak ditemukan.', 404);
    }
    throw error;
  }
};

// --- Live preview (SPEC §5, §8) --------------------------------------------------------------

/** Matches the indicator service's Decimal(18,4) guard, so a preview accepts what a save would. */
const PREVIEW_DECIMAL = /^-?\d{1,14}(\.\d{1,4})?$/;

const previewSampleSchema = z
  .object({
    title: z.string().trim().min(1).max(60).optional(),
    label: z.string().trim().min(1).max(255).optional(),
    unit: z.string().trim().max(32).nullable().optional(),
    valueCurrent: z.string().trim().regex(PREVIEW_DECIMAL, 'Nilai contoh harus berupa angka.'),
    valuePrevious: z.string().trim().regex(PREVIEW_DECIMAL, 'Nilai contoh harus berupa angka.'),
    periodCurrent: z.string().trim().min(1).max(64).optional(),
    periodPrevious: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

// Unlike a save, a preview of a half-written draft is the normal case, so the text fields may be
// empty: that is reported as a problem in the 200 response rather than rejected as a bad request.
export const previewComparisonTemplateSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(MAX_BODY_LENGTH, `Susunan kalimat maksimal ${MAX_BODY_LENGTH} karakter`),
    trendNaik: z.string().trim().max(500, 'Teks saat nilai naik maksimal 500 karakter'),
    trendTurun: z.string().trim().max(500, 'Teks saat nilai turun maksimal 500 karakter'),
    trendTetap: z.string().trim().max(500, 'Teks saat nilai tetap maksimal 500 karakter'),
    samples: z.array(previewSampleSchema).min(1).max(6).optional(),
  })
  .strict();

export interface PreviewProblem {
  field: TemplateField;
  /** Plain Indonesian; never mentions placeholder syntax, slugs or status codes. */
  message: string;
}

export interface PreviewSentence {
  title: string;
  trend: Trend;
  /** Null when no sentence would be shown publicly for this example (see `note`). */
  text: string | null;
  note: string | null;
}

export interface ComparisonTemplatePreview {
  valid: boolean;
  problems: PreviewProblem[];
  previews: PreviewSentence[];
}

interface PreviewSample {
  title: string;
  label: string;
  unit: string | null;
  valueCurrent: string;
  valuePrevious: string;
  periodCurrent: string;
  periodPrevious: string;
}

/** Synthetic examples used when the caller sends none: one per direction plus a zero base. */
export const DEFAULT_PREVIEW_SAMPLES: readonly PreviewSample[] = [
  {
    title: 'Contoh saat nilai naik',
    label: 'Jumlah Penduduk',
    unit: 'jiwa',
    valueCurrent: '12480',
    valuePrevious: '12360',
    periodCurrent: '2026',
    periodPrevious: '2025',
  },
  {
    title: 'Contoh saat nilai turun',
    label: 'Jumlah Penduduk',
    unit: 'jiwa',
    valueCurrent: '12240',
    valuePrevious: '12360',
    periodCurrent: '2026',
    periodPrevious: '2025',
  },
  {
    title: 'Contoh saat nilai tetap',
    label: 'Jumlah Penduduk',
    unit: 'jiwa',
    valueCurrent: '12360',
    valuePrevious: '12360',
    periodCurrent: '2026',
    periodPrevious: '2025',
  },
  {
    title: 'Contoh saat nilai sebelumnya nol',
    label: 'Jumlah Penduduk',
    unit: 'jiwa',
    valueCurrent: '120',
    valuePrevious: '0',
    periodCurrent: '2026',
    periodPrevious: '2025',
  },
];

const FRIENDLY_FIELD_NAMES: Record<TemplateField, string> = {
  body: 'susunan kalimat',
  trendNaik: 'teks saat nilai naik',
  trendTurun: 'teks saat nilai turun',
  trendTetap: 'teks saat nilai tetap',
};

/**
 * Preview-time wording for the structure rules. The editor UI builds sentences from named parts,
 * so these never quote placeholder syntax; the save path keeps `describeStructureError` for API
 * callers who do type it.
 */
function describeStructureProblem(error: TemplateStructureError): PreviewProblem {
  const where = FRIENDLY_FIELD_NAMES[error.field];
  switch (error.code) {
    case 'TREND_SLOT_MISSING':
      return {
        field: error.field,
        message:
          'Susunan kalimat perlu memuat satu bagian "Keterangan perubahan" agar kata naik, turun, atau tetap terisi otomatis.',
      };
    case 'TREND_SLOT_DUPLICATE':
      return {
        field: error.field,
        message: 'Bagian "Keterangan perubahan" hanya boleh dipakai satu kali dalam kalimat.',
      };
    case 'TREND_SLOT_IN_VARIANT':
      return {
        field: error.field,
        message: `Bagian "Keterangan perubahan" tidak bisa dipakai di ${where}, karena bagian itu sendiri yang mengisinya.`,
      };
    case 'UNKNOWN_PLACEHOLDER':
    case 'STRAY_BRACE':
      return {
        field: error.field,
        message: `Ada bagian tidak dikenali di ${where}. Hapus bagian tersebut.`,
      };
  }
}

const EMPTY_FIELD_PROBLEMS: Record<TemplateField, string> = {
  body: 'Susunan kalimat belum diisi.',
  trendNaik: 'Teks saat nilai naik belum diisi.',
  trendTurun: 'Teks saat nilai turun belum diisi.',
  trendTetap: 'Teks saat nilai tetap belum diisi.',
};

const ZERO_BASE_NOTE =
  'Kalimat ini tidak ditampilkan untuk contoh ini: ia memuat persentase perubahan, padahal nilai sebelumnya nol sehingga persentasenya tidak bisa dihitung.';

/**
 * Renders what the public Cerita page would show for a draft template, through the same
 * `renderComparison` the indicator read path uses (exact decimals, id-ID numbers, no percentage
 * of a zero base). Pure: touches no database and writes no audit row.
 */
export const previewComparisonTemplate = (rawInput: unknown): ComparisonTemplatePreview => {
  const input = parsePayload(previewComparisonTemplateSchema, rawInput);
  const template: ComparisonTemplateText = {
    body: input.body,
    trendNaik: input.trendNaik,
    trendTurun: input.trendTurun,
    trendTetap: input.trendTetap,
  };

  const problems: PreviewProblem[] = [];
  for (const field of ['body', 'trendNaik', 'trendTurun', 'trendTetap'] as const) {
    if (template[field] === '') problems.push({ field, message: EMPTY_FIELD_PROBLEMS[field] });
  }
  // An empty field has nothing to validate beyond its own "belum diisi".
  problems.push(
    ...validateTemplateStructure(template)
      .filter((error) => template[error.field] !== '')
      .map(describeStructureProblem),
  );

  if (problems.length > 0) return { valid: false, problems, previews: [] };

  const samples: PreviewSample[] = input.samples?.map((sample, index) => ({
    title: sample.title ?? `Contoh ${index + 1}`,
    label: sample.label ?? 'Jumlah Penduduk',
    unit: sample.unit === undefined ? 'jiwa' : sample.unit,
    valueCurrent: sample.valueCurrent,
    valuePrevious: sample.valuePrevious,
    periodCurrent: sample.periodCurrent ?? '2026',
    periodPrevious: sample.periodPrevious ?? '2025',
  })) ?? [...DEFAULT_PREVIEW_SAMPLES];

  const previews = samples.map((sample): PreviewSentence => {
    const rendered = renderComparison(
      {
        label: sample.label,
        unit: sample.unit,
        valueCurrent: sample.valueCurrent,
        valuePrevious: sample.valuePrevious,
        periodCurrent: sample.periodCurrent,
        periodPrevious: sample.periodPrevious,
        isComputedComparison: true,
      },
      template,
    );
    return {
      title: sample.title,
      trend: rendered?.trend ?? computeTrend(sample.valueCurrent, sample.valuePrevious),
      text: rendered?.text ?? null,
      note: rendered ? null : ZERO_BASE_NOTE,
    };
  });

  return { valid: true, problems: [], previews };
};

/**
 * Starter templates for a fresh install (seeded idempotently by prisma/seed.ts). They are
 * ordinary rows afterwards: an admin can edit or delete them like any template.
 */
export const DEFAULT_COMPARISON_TEMPLATES: ReadonlyArray<
  ComparisonTemplateText & { slug: string; label: string }
> = [
  {
    slug: 'perbandingan-tahunan',
    label: 'Perbandingan tahunan',
    body: 'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.',
    trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
    trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
    trendTetap: 'tidak berubah',
  },
];
