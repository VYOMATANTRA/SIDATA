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
import { hasFieldChanged } from '../utils/comparator.js';
import { KeyedLruCache } from '../utils/keyedCache.js';

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
  {
    slug: 'tentang-kelurahan-profil',
    type: 'prose' as const,
    title: 'Profil Kelurahan Manggar',
    body: 'Data, potensi, dan cerita di balik perkembangan Kelurahan Manggar.',
    metadata: {
      rtCount: 100,
      kecamatan: 'Balikpapan Timur',
      kota: 'Kota Balikpapan',
      landscape: 'Pesisir & Dataran',
      lurahName: 'Munir Achmad, S.E.',
      lurahTitle: 'Lurah Kelurahan Manggar',
      batasWilayah: [
        { arah: 'Sebelah Utara', wilayah: 'Kelurahan Karang Joang' },
        { arah: 'Sebelah Timur', wilayah: 'Kelurahan Manggar Baru' },
        { arah: 'Sebelah Selatan', wilayah: 'Selat Makassar' },
        { arah: 'Sebelah Barat', wilayah: 'Kelurahan Sepinggan dan Sepinggan Baru' },
      ],
      sotkMembers: [
        { role: 'Lurah', officialName: 'Munir Achmad, S.E.', duties: null },
        { role: 'Sekretaris Lurah', officialName: 'Munjiah Puspitawaty. M, S.E', duties: null },
        { role: 'Kasi Trantib L-H', officialName: 'Nanang Sri Ruriyanto, S.Sos.', duties: null },
        {
          role: 'Kasi Pemerintahan dan Pelayanan Publik',
          officialName: 'Hasiba, S.A.P',
          duties: null,
        },
        { role: 'Kasi Pemberdayaan Masyarakat', officialName: 'Marthen Solly, S.ST', duties: null },
      ],
    },
  },
  {
    slug: 'publikasi-katalog',
    type: 'prose' as const,
    title: 'Katalog Publikasi Kelurahan Manggar',
    body: 'Koleksi dokumen, publikasi resmi, dan infografis statistik Kelurahan Manggar.',
    // Keep in sync with frontend/src/content/publikasi.ts PUBLICATIONS
    // (asserted by backend/src/__tests__/publikasiCatalog.sync.test.ts).
    metadata: {
      publications: [
        {
          category: 'Prodeskel',
          title: 'Publikasi Prodeskel',
          description: 'Dokumen dan publikasi resmi Kelurahan Manggar dari sistem Prodeskel.',
          isAvailableOnline: false,
          source: 'Profil Kelurahan Manggar 2026.pdf (data formulir Prodeskel 2025)',
        },
        {
          category: 'Infografis',
          title: 'Infografis Kelurahan Manggar',
          description:
            'Ringkasan data kependudukan dan statistik Kelurahan Manggar dalam bentuk visual infografis.',
          isAvailableOnline: false,
          source: 'Data Kependudukan 2026.xlsx',
        },
        {
          category: 'Lingkungan',
          title: 'Booklet Eco Boba',
          description:
            'Dokumentasi pelatihan pengolahan limbah kemasan plastik menjadi bahan isian bantal (cushion filling) dalam program Eco Boba.',
          isAvailableOnline: false,
          source: 'Booklet Pelatihan BSU.pdf',
        },
        {
          category: 'Statistik',
          title: 'Manggar dalam Angka 2026',
          description:
            'Kompilasi data statistik sektoral, demografi, dan geografi Kelurahan Manggar. Dokumen fisik telah tercetak; unduhan versi digital (PDF) belum dirilis ke publik.',
          isAvailableOnline: false,
          source: 'Manggar Dalam Angka 2026.pdf',
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

function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

export function isSafeCtaLink(val: string): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (hasControlCharacters(trimmed)) return false;
  if (trimmed.includes('\\') || /%5c/i.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('/')) {
    try {
      const parsed = new URL(trimmed, 'https://placeholder.invalid');
      return parsed.origin === 'https://placeholder.invalid' && parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafePhotoUrl(val: string): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return true;
  if (trimmed.length > 500) return false;
  if (hasControlCharacters(trimmed)) return false;
  if (trimmed.includes('\\') || /%5c/i.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/')) {
    try {
      const parsed = new URL(trimmed, 'https://placeholder.invalid');
      return parsed.origin === 'https://placeholder.invalid' && parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const heroMetadataSchema = z
  .object({
    badge: z.string().trim().max(100, 'Badge maksimal 100 karakter').optional(),
    ctaText: z.string().trim().max(50, 'Teks CTA maksimal 50 karakter').optional(),
    ctaLink: z
      .string()
      .trim()
      .max(500, 'Link CTA maksimal 500 karakter')
      .refine(
        isSafeCtaLink,
        'Link CTA harus berupa path relatif (dimulai dengan / atau #) atau URL HTTPS yang valid',
      )
      .optional(),
  })
  .passthrough();

export const sambutanLurahMetadataSchema = z
  .object({
    authorName: z.string().trim().max(150, 'Nama author maksimal 150 karakter').optional(),
    authorTitle: z.string().trim().max(150, 'Jabatan author maksimal 150 karakter').optional(),
    photoUrl: z
      .string()
      .trim()
      .max(500, 'URL foto maksimal 500 karakter')
      .refine(
        isSafePhotoUrl,
        'URL foto harus berupa path relatif (dimulai dengan /) atau URL HTTPS yang valid',
      )
      .or(z.literal(''))
      .nullable()
      .optional(),
  })
  .passthrough();

export const highlightMetadataSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            title: z.string().trim().max(100, 'Judul highlight maksimal 100 karakter'),
            desc: z.string().trim().max(500, 'Deskripsi highlight maksimal 500 karakter'),
          })
          .passthrough(),
      )
      .max(10, 'Maksimal 10 item highlight')
      .optional(),
  })
  .passthrough();

const publikasiItemSchema = z
  .object({
    category: z
      .string()
      .trim()
      .min(1, 'Kategori publikasi wajib diisi')
      .max(100, 'Kategori maksimal 100 karakter'),
    title: z
      .string()
      .trim()
      .min(1, 'Judul publikasi wajib diisi')
      .max(255, 'Judul maksimal 255 karakter'),
    description: z
      .string()
      .trim()
      .min(1, 'Deskripsi publikasi wajib diisi')
      .max(1000, 'Deskripsi maksimal 1000 karakter'),
    href: z
      .string()
      .trim()
      .transform((val) => (val === '' ? undefined : val))
      .pipe(
        z
          .string()
          .url('URL publikasi tidak valid')
          .refine((url) => url.startsWith('https://'), {
            message: 'Tautan publikasi wajib menggunakan protokol https://',
          })
          .optional(),
      )
      .optional(),
    source: z.string().trim().max(500, 'Sumber maksimal 500 karakter').optional(),
    isAvailableOnline: z.boolean().default(false),
  })
  .refine(
    (item) => {
      if (item.isAvailableOnline === true && !item.href) return false;
      if (item.href && item.isAvailableOnline === false) return false;
      return true;
    },
    {
      message: 'Status ketersediaan online harus selaras dengan keberadaan tautan href',
      path: ['isAvailableOnline'],
    },
  )
  .strip();

export const publikasiKatalogMetadataSchema = z
  .object({
    publications: z.array(publikasiItemSchema).max(25, 'Maksimal 25 item publikasi').optional(),
  })
  .strip();

const batasWilayahItemSchema = z
  .object({
    arah: z
      .string()
      .trim()
      .min(1, 'Arah batas wilayah wajib diisi')
      .max(100, 'Arah maksimal 100 karakter'),
    wilayah: z
      .string()
      .trim()
      .min(1, 'Nama wilayah batas wajib diisi')
      .max(255, 'Nama wilayah batas maksimal 255 karakter'),
  })
  .passthrough();

const sotkMemberSchema = z
  .object({
    role: z
      .string()
      .trim()
      .min(1, 'Jabatan SOTK wajib diisi')
      .max(100, 'Jabatan SOTK maksimal 100 karakter'),
    officialName: z
      .string()
      .trim()
      .max(150, 'Nama pejabat maksimal 150 karakter')
      .nullable()
      .optional(),
    duties: z
      .string()
      .trim()
      .max(1000, 'Tugas pejabat maksimal 1000 karakter')
      .nullable()
      .optional(),
  })
  .passthrough();

export const tentangProfilMetadataSchema = z
  .object({
    rtCount: z
      .number()
      .int('Jumlah RT harus bilangan bulat')
      .min(1, 'Jumlah RT minimal 1')
      .max(1000, 'Jumlah RT maksimal 1000')
      .optional(),
    kecamatan: z.string().trim().max(100, 'Nama kecamatan maksimal 100 karakter').optional(),
    kota: z.string().trim().max(100, 'Nama kota maksimal 100 karakter').optional(),
    landscape: z.string().trim().max(100, 'Karakteristik wilayah maksimal 100 karakter').optional(),
    lurahName: z.string().trim().max(150, 'Nama lurah maksimal 150 karakter').optional(),
    lurahTitle: z.string().trim().max(150, 'Gelar lurah maksimal 150 karakter').optional(),
    batasWilayah: z.array(batasWilayahItemSchema).max(10, 'Maksimal 10 batas wilayah').optional(),
    sotkMembers: z.array(sotkMemberSchema).max(30, 'Maksimal 30 anggota SOTK').optional(),
  })
  .passthrough();

/**
 * Validates slug-specific metadata and returns the Zod-cleaned value so trimmed
 * URLs and normalised fields are what get stored (not the raw input).
 */
export function validateBlockMetadata(
  slug: string,
  metadata: unknown,
): Record<string, unknown> | null {
  if (metadata === undefined || metadata === null) return null;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new ContentBlockServiceError('Metadata harus berupa objek JSON', 400);
  }

  const result =
    slug === 'landing-hero'
      ? heroMetadataSchema.safeParse(metadata)
      : slug === 'landing-sambutan-lurah'
        ? sambutanLurahMetadataSchema.safeParse(metadata)
        : slug === 'landing-highlights'
          ? highlightMetadataSchema.safeParse(metadata)
          : slug === 'publikasi-katalog'
            ? publikasiKatalogMetadataSchema.safeParse(metadata)
            : slug === 'tentang-kelurahan-profil'
              ? tentangProfilMetadataSchema.safeParse(metadata)
              : null;

  if (!result) {
    return metadata as Record<string, unknown>;
  }

  if (!result.success) {
    const errorMsg = result.error.issues.map((i) => i.message).join(', ');
    throw new ContentBlockServiceError(`Validasi metadata gagal: ${errorMsg}`, 400);
  }

  return result.data as Record<string, unknown>;
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

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const MAX_SLUG_CACHE_ENTRIES = 200;

/**
 * In-memory collection cache for all content blocks.
 */
export const contentBlocksCache = new VersionedTtlCache<ContentBlockDto[]>({
  ttlMs: CACHE_TTL_MS,
  baseClient: prisma,
});

/**
 * Bounded LRU cache of per-slug caches so single-slug reads and edits do not cross-invalidate unrelated slugs.
 */
const slugCacheMap = new KeyedLruCache<string, VersionedTtlCache<ContentBlockDto | null>>(
  MAX_SLUG_CACHE_ENTRIES,
);

export const getSlugCache = (slug: string): VersionedTtlCache<ContentBlockDto | null> => {
  const normalized = slug.trim().toLowerCase();
  return slugCacheMap.getOrCompute(
    normalized,
    () =>
      new VersionedTtlCache<ContentBlockDto | null>({
        ttlMs: CACHE_TTL_MS,
        baseClient: prisma,
      }),
  );
};

export const invalidateContentBlocksCache = (slug?: string): void => {
  if (slug) {
    const normalized = slug.trim().toLowerCase();
    slugCacheMap.get(normalized)?.invalidate();
    contentBlocksCache.invalidate();
  } else {
    contentBlocksCache.invalidate();
    for (const cache of slugCacheMap.values()) {
      cache.invalidate();
    }
    slugCacheMap.clear();
  }
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
  const blocks = await contentBlocksCache.getOrFetch(async (db) => {
    const listVersionAtStart = contentBlocksCache.getVersion();
    const slugVersionsAtStart = new Map<string, number>();

    if (client === prisma) {
      for (const [slug, cache] of slugCacheMap.entries()) {
        slugVersionsAtStart.set(slug, cache.getVersion());
      }
    }

    const rows = await db.contentBlock.findMany({
      orderBy: [{ sectionId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const formatted = rows.map(formatContentBlock);

    // Warm per-slug caches on the cache-miss path only if no concurrent invalidations occurred
    if (client === prisma && contentBlocksCache.getVersion() === listVersionAtStart) {
      for (const b of formatted) {
        const normalizedSlug = b.slug.trim().toLowerCase();
        const slugCache = getSlugCache(normalizedSlug);

        // Skip warming if per-slug cache entry is already newer or equal
        if (slugCache.has(prisma)) {
          const cached = slugCache.get(prisma);
          if (cached) {
            const cachedTime = Date.parse(cached.updatedAt);
            const incomingTime = Date.parse(b.updatedAt);
            if (
              !Number.isNaN(cachedTime) &&
              !Number.isNaN(incomingTime) &&
              cachedTime >= incomingTime
            ) {
              continue;
            }
          }
        }

        const expectedVersion = slugVersionsAtStart.get(normalizedSlug) ?? 0;
        slugCache.set(b, expectedVersion, prisma);
      }
    }

    return formatted;
  }, client);

  return blocks;
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

  const slugCache = getSlugCache(normalizedSlug);
  return slugCache.getOrFetch(async (db) => {
    const row = await db.contentBlock.findUnique({
      where: { slug: normalizedSlug },
    });

    if (!row) {
      return null;
    }

    return formatContentBlock(row);
  }, client);
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

  let sanitizedMetadata: Record<string, unknown> | null | undefined = undefined;
  if (input.metadata === null) {
    sanitizedMetadata = null;
  } else if (input.metadata !== undefined) {
    sanitizedMetadata = validateBlockMetadata(normalizedSlug, input.metadata);
  }

  // Sanitize title: whitespace only or empty string becomes null
  const sanitizedTitle =
    input.title !== undefined
      ? input.title === null || input.title.trim() === ''
        ? null
        : input.title.trim()
      : undefined;

  const lockQuery = Prisma.sql`SELECT id FROM content_blocks WHERE slug = ${normalizedSlug} FOR UPDATE`;
  const targetSlugCache = getSlugCache(normalizedSlug);

  return executeLockedTransaction({
    client,
    lockQuery,
    cache: [contentBlocksCache, targetSlugCache],
    onCommit: (committedBlock, didChange) => {
      if (!didChange) return;
      targetSlugCache.setCommitted(committedBlock);
    },
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
      if (
        sanitizedMetadata !== undefined &&
        hasFieldChanged(existing.metadata, sanitizedMetadata)
      ) {
        changes.metadata = { before: existing.metadata, after: sanitizedMetadata };
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
          ...(sanitizedMetadata !== undefined
            ? {
                metadata:
                  sanitizedMetadata === null
                    ? Prisma.DbNull
                    : (sanitizedMetadata as Prisma.InputJsonValue),
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
