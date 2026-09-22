import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';
import {
  VersionedTtlCache,
  executeLockedTransaction,
  withChangeResult,
} from '../utils/lockTransactionCache.js';

export class ContentBlockServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ContentBlockServiceError';
    this.statusCode = statusCode;
  }
}

export interface ContentBlockDto {
  id: string;
  sectionId: string | null;
  type: string;
  slug: string;
  title: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  sortOrder: number | null;
  updatedAt: string;
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DEFAULT_CONTENT_BLOCKS = [
  {
    slug: 'landing-hero',
    type: 'hero' as const,
    title: 'Portal Data Terpadu Kelurahan Manggar',
    body: 'Pusat integrasi data kependudukan, potensi wilayah, layanan publik, dan pemetaan geospasial Kelurahan Manggar, Balikpapan Timur.',
    metadata: {
      ctaText: 'Jelajahi Potensi',
      ctaLink: '#potensi',
      badge: 'Data Akurat & Terbuka',
    },
  },
  {
    slug: 'landing-sambutan-lurah',
    type: 'sambutan_lurah' as const,
    title: 'Sambutan Lurah Manggar',
    body: 'Selamat datang di Sistem Informasi Data Terpadu (SIDATA) Kelurahan Manggar. Portal ini kami hadirkan sebagai sarana transparansi informasi dan keterpaduan data statistik serta spasial guna mendukung perencanaan wilayah dan pelayanan masyarakat yang lebih efektif.',
    metadata: {
      authorName: 'Lurah Manggar',
      authorTitle: 'Kepala Kelurahan Manggar',
      photoUrl: '',
    },
  },
  {
    slug: 'landing-highlights',
    type: 'highlight' as const,
    title: 'Potensi Unggulan Wilayah',
    body: 'Kelurahan Manggar memiliki potensi strategis dalam pengelolaan persampahan mandiri berbasis masyarakat melalui jaringan Bank Sampah, sektor perikanan pesisir, serta pariwisata pantai.',
    metadata: {
      items: [
        {
          title: 'Bank Sampah Mandiri',
          desc: 'Jaringan unit pengolahan dan pemilahan sampah warga terdistribusi di kawasan RT.',
        },
        {
          title: 'Sektor Pesisir & Kelautan',
          desc: 'Sentra ekonomi nelayan tangkap, budidaya pesisir, dan destinasi wisata bahari.',
        },
        {
          title: 'Partisipasi Warga 100 RT',
          desc: 'Keterpaduan koordinasi 100 Ketua RT dalam penyampaian data dan pelayanan warga.',
        },
      ],
    },
  },
];

function hasPrototypePollution(val: unknown, depth = 0): boolean {
  if (depth > 10) return true;
  if (!val || typeof val !== 'object') return false;

  if (Object.prototype.hasOwnProperty.call(val, '__proto__')) return true;

  const proto = Object.getPrototypeOf(val);
  if (Array.isArray(val)) {
    if (proto !== Array.prototype && proto !== null) return true;
    for (const item of val) {
      if (hasPrototypePollution(item, depth + 1)) return true;
    }
    return false;
  }

  if (proto !== Object.prototype && proto !== null) {
    return true;
  }

  const keys = Object.getOwnPropertyNames(val);
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (hasPrototypePollution((val as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const res: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    res[key] = canonicalizeJson((obj as Record<string, unknown>)[key]);
  }
  return res;
}

function stableJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  return JSON.stringify(canonicalizeJson(obj));
}

/**
 * Evaluates semantic inequality for audit log diffs.
 * Uses canonicalized JSON stringification to apply uniform comparison semantics across both
 * scalar fields (string, number, boolean, null) and nested JSON structures without false-positive
 * diffs caused by object key reordering.
 */
function hasFieldChanged(before: unknown, after: unknown): boolean {
  return stableJsonStringify(before) !== stableJsonStringify(after);
}

export const updateContentBlockSchema = z
  .object({
    title: z.string().trim().max(255, 'Judul maksimal 255 karakter').nullable().optional(),
    body: z
      .string()
      .trim()
      .min(1, 'Isi konten wajib diisi dan tidak boleh hanya berupa spasi')
      .max(50000, 'Isi konten maksimal 50.000 karakter')
      .optional(),
    metadata: z
      .unknown()
      .superRefine((val, ctx) => {
        if (val === null || val === undefined) return;
        if (typeof val !== 'object' || Array.isArray(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Metadata harus berupa objek JSON',
          });
          return;
        }
        if (hasPrototypePollution(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Metadata memuat properti yang tidak diizinkan',
          });
        }
      })
      .transform((val) => (val === undefined ? undefined : (val as Record<string, unknown> | null)))
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.title !== undefined || data.body !== undefined || data.metadata !== undefined,
    {
      message:
        'Setidaknya salah satu bidang (title, body, metadata) harus disediakan untuk diperbarui',
    },
  );

export type UpdateContentBlockInput = z.infer<typeof updateContentBlockSchema>;

interface CachedContentBlocks {
  blocks: ContentBlockDto[];
  bySlug: Map<string, ContentBlockDto>;
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute
export const contentBlocksCache = new VersionedTtlCache<CachedContentBlocks>({
  ttlMs: CACHE_TTL_MS,
  baseClient: prisma,
});

export const invalidateContentBlocksCache = (): void => {
  contentBlocksCache.invalidate();
};

function formatContentBlock(block: {
  id: string;
  sectionId: string | null;
  type: string;
  slug: string;
  title: string | null;
  body: string;
  metadata: unknown;
  sortOrder: number | null;
  updatedAt: Date;
}): ContentBlockDto {
  return {
    id: block.id,
    sectionId: block.sectionId,
    type: block.type,
    slug: block.slug,
    title: block.title,
    body: block.body,
    metadata:
      block.metadata && typeof block.metadata === 'object' && !Array.isArray(block.metadata)
        ? (block.metadata as Record<string, unknown>)
        : null,
    sortOrder: block.sortOrder,
    updatedAt: block.updatedAt.toISOString(),
  };
}

export const getAllContentBlocks = async (
  client: { contentBlock: Pick<typeof prisma.contentBlock, 'findMany'> } = prisma,
): Promise<ContentBlockDto[]> => {
  const cachedData = await contentBlocksCache.getOrFetch(async (db) => {
    const rows = await db.contentBlock.findMany({
      orderBy: [{ sectionId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const blocks = rows.map(formatContentBlock);
    const bySlug = new Map<string, ContentBlockDto>(blocks.map((b) => [b.slug, b]));

    return { blocks, bySlug };
  }, client);

  return structuredClone(cachedData.blocks);
};

export const getContentBlockBySlug = async (
  slug: string,
  client: { contentBlock: Pick<typeof prisma.contentBlock, 'findUnique'> } = prisma,
): Promise<ContentBlockDto | null> => {
  if (!slug || typeof slug !== 'string') {
    return null;
  }

  const normalizedSlug = slug.trim().toLowerCase();
  if (!SLUG_REGEX.test(normalizedSlug) || normalizedSlug.length > 100) {
    return null;
  }

  const cached = contentBlocksCache.get(client);
  if (cached) {
    const found = cached.bySlug.get(normalizedSlug);
    if (found) return structuredClone(found);
  }

  const row = await client.contentBlock.findUnique({
    where: { slug: normalizedSlug },
  });

  if (!row) {
    return null;
  }

  return structuredClone(formatContentBlock(row));
};

export const updateContentBlock = async (
  slug: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<ContentBlockDto> => {
  if (!slug || typeof slug !== 'string') {
    throw new ContentBlockServiceError('Slug konten tidak valid', 400);
  }

  const normalizedSlug = slug.trim().toLowerCase();
  if (!SLUG_REGEX.test(normalizedSlug) || normalizedSlug.length > 100) {
    throw new ContentBlockServiceError(
      'Format slug tidak valid. Gunakan format kebab-case (maksimal 100 karakter).',
      400,
    );
  }

  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    throw new ContentBlockServiceError('Payload pembaruan harus berupa objek JSON.', 400);
  }

  const parsed = updateContentBlockSchema.safeParse(rawInput);

  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ContentBlockServiceError(errorMsg, 400);
  }

  const input = parsed.data;

  // Sanitize title: whitespace only or empty string becomes null
  const sanitizedTitle =
    input.title !== undefined
      ? input.title === null || input.title.trim() === ''
        ? null
        : input.title.trim()
      : undefined;

  const lockQuery = Prisma.sql`SELECT id FROM content_blocks WHERE slug = ${normalizedSlug} FOR UPDATE`;

  return executeLockedTransaction({
    client,
    lockQuery,
    cache: contentBlocksCache,
    execute: async (tx) => {
      // Acquire row-level lock on the target slug to eliminate TOCTOU race conditions and serialize concurrent updates
      const existing = await tx.contentBlock.findUnique({
        where: { slug: normalizedSlug },
      });

      if (!existing) {
        throw new ContentBlockServiceError(
          `Blok konten dengan slug '${normalizedSlug}' tidak ditemukan`,
          404,
        );
      }

      const changes: Record<string, { before: unknown; after: unknown }> = {};

      // Route all field comparisons through the canonicalization helper (hasFieldChanged).
      // This applies uniform equality semantics across scalar fields (title, body) and nested JSON
      // fields (metadata), preventing false-positive audit diffs from JSON object key reordering.
      if (sanitizedTitle !== undefined && hasFieldChanged(existing.title, sanitizedTitle)) {
        changes.title = { before: existing.title, after: sanitizedTitle };
      }
      if (input.body !== undefined && hasFieldChanged(existing.body, input.body)) {
        changes.body = { before: existing.body, after: input.body };
      }
      if (input.metadata !== undefined && hasFieldChanged(existing.metadata, input.metadata)) {
        changes.metadata = { before: existing.metadata, after: input.metadata };
      }

      // If nothing changed, return early
      if (Object.keys(changes).length === 0) {
        return withChangeResult(formatContentBlock(existing), false);
      }

      const actorId = actor?.id?.trim() ? actor.id.trim() : null;

      const updatedRow = await tx.contentBlock.update({
        where: { slug: normalizedSlug },
        data: {
          ...(sanitizedTitle !== undefined ? { title: sanitizedTitle } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.metadata !== undefined
            ? {
                metadata:
                  input.metadata === null
                    ? Prisma.DbNull
                    : (input.metadata as Prisma.InputJsonValue),
              }
            : {}),
          updatedById: actorId,
        },
      });

      const auditOp = buildAuditLog(
        {
          action: AUDIT_ACTIONS.CONTENT_BLOCK_UPDATED,
          actor,
          target: {
            type: 'content_block',
            id: existing.id,
            label: existing.slug,
          },
          metadata: {
            slug: existing.slug,
            type: existing.type,
            changes,
          },
          context: reqContext,
        },
        tx,
      );

      await auditOp;

      return formatContentBlock(updatedRow);
    },
  });
};
