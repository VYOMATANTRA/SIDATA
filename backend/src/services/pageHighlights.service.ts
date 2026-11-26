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
  HierarchyServiceError,
  assertFresh,
  assertPlainObject,
  expectedUpdatedAtSchema,
  idParamSchema,
  parseOrThrow,
} from '../utils/hierarchyAuthoring.js';
import { executeLockedTransaction } from '../utils/lockTransactionCache.js';
import { isValidPageSlug } from './pages.service.js';

/** A topic's landing card never shows more than this many figures (SPEC §8). */
export const MAX_PAGE_HIGHLIGHTS = 4;

export interface PageHighlightsDTO {
  /** Indicator ids in display order, at most {@link MAX_PAGE_HIGHLIGHTS}. */
  indicatorIds: string[];
  /** True when the editor chose none and the ids are the first figures in content order. */
  isFallback: boolean;
}

export interface PageHighlightsAdminDTO extends PageHighlightsDTO {
  pageUpdatedAt: string;
}

const setHighlightsSchema = z
  .object({
    indicatorIds: z
      .array(idParamSchema, { error: 'Daftar statistik unggulan harus berupa array' })
      .max(MAX_PAGE_HIGHLIGHTS, `Maksimal ${MAX_PAGE_HIGHLIGHTS} statistik unggulan per topik.`),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((d) => new Set(d.indicatorIds).size === d.indicatorIds.length, {
    message: 'Statistik yang sama tidak boleh dipilih dua kali.',
  });

/**
 * Chosen highlights are only honoured while the indicator still sits under the page (a section
 * can be moved to another topic). With none valid left, the first figures in content order
 * (chapter, section, indicator) stand in so a landing card is never blank.
 */
async function resolveHighlights(
  client: Pick<typeof prisma, 'pageHighlight' | 'indicator'>,
  pageIds: string[],
): Promise<Map<string, PageHighlightsDTO>> {
  const result = new Map<string, PageHighlightsDTO>();
  const rows = await client.pageHighlight.findMany({
    where: { pageId: { in: pageIds } },
    orderBy: { position: 'asc' },
    select: {
      pageId: true,
      indicatorId: true,
      indicator: { select: { section: { select: { chapter: { select: { pageId: true } } } } } },
    },
  });
  for (const row of rows) {
    if (row.indicator.section.chapter.pageId !== row.pageId) continue;
    const entry = result.get(row.pageId) ?? { indicatorIds: [], isFallback: false };
    entry.indicatorIds.push(row.indicatorId);
    result.set(row.pageId, entry);
  }

  // Only pages without a valid chosen row need the automatic four; each is a small bounded query.
  const needFallback = pageIds.filter((id) => !result.has(id));
  await Promise.all(
    needFallback.map(async (pageId) => {
      const first = await client.indicator.findMany({
        where: { section: { chapter: { pageId } } },
        orderBy: [
          { section: { chapter: { sortOrder: 'asc' } } },
          { section: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
        take: MAX_PAGE_HIGHLIGHTS,
        select: { id: true },
      });
      result.set(pageId, { indicatorIds: first.map((i) => i.id), isFallback: true });
    }),
  );
  return result;
}

/** Public: highlights for every page, keyed by page slug. */
export async function getAllPageHighlights(
  client = prisma,
): Promise<Record<string, PageHighlightsDTO>> {
  const pages = await client.page.findMany({ select: { id: true, slug: true } });
  const resolved = await resolveHighlights(
    client,
    pages.map((p) => p.id),
  );
  const out: Record<string, PageHighlightsDTO> = {};
  for (const page of pages) {
    out[page.slug] = resolved.get(page.id) ?? { indicatorIds: [], isFallback: true };
  }
  return out;
}

/** Editor: one page's highlights plus the `updatedAt` its next save must echo back. */
export async function getPageHighlights(
  rawSlug: string,
  client = prisma,
): Promise<PageHighlightsAdminDTO> {
  if (!isValidPageSlug(rawSlug)) {
    throw new HierarchyServiceError('Slug halaman tidak valid', 400);
  }
  const page = await client.page.findUnique({
    where: { slug: rawSlug.trim().toLowerCase() },
    select: { id: true, updatedAt: true },
  });
  if (!page) throw new HierarchyServiceError('Halaman tidak ditemukan', 404);
  const resolved = await resolveHighlights(client, [page.id]);
  return {
    ...(resolved.get(page.id) ?? { indicatorIds: [], isFallback: true }),
    pageUpdatedAt: page.updatedAt.toISOString(),
  };
}

/** Replaces a page's highlights (an empty list restores the fallback). */
export async function setPageHighlights(
  rawSlug: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<PageHighlightsAdminDTO> {
  if (!isValidPageSlug(rawSlug)) {
    throw new HierarchyServiceError('Slug halaman tidak valid', 400);
  }
  assertPlainObject(rawInput, 'Payload statistik unggulan harus berupa objek JSON');
  const input = parseOrThrow(setHighlightsSchema, rawInput);
  const slug = rawSlug.trim().toLowerCase();

  await executeLockedTransaction({
    client,
    lockQuery: Prisma.sql`SELECT id FROM pages WHERE slug = ${slug} FOR UPDATE`,
    execute: async (tx) => {
      const page = await tx.page.findUnique({ where: { slug } });
      if (!page) throw new HierarchyServiceError('Halaman tidak ditemukan', 404);
      assertFresh(page.updatedAt, input.expectedUpdatedAt, 'Halaman');

      if (input.indicatorIds.length > 0) {
        const owned = await tx.indicator.count({
          where: {
            id: { in: input.indicatorIds },
            section: { chapter: { pageId: page.id } },
          },
        });
        if (owned !== input.indicatorIds.length) {
          throw new HierarchyServiceError('Statistik tidak termasuk dalam topik ini.', 400);
        }
      }

      // An indicator can sit on one page only. Also clear any stale row left on its former
      // topic (its section was moved), or the unique indicator index would fail this save.
      await tx.pageHighlight.deleteMany({
        where: { OR: [{ pageId: page.id }, { indicatorId: { in: input.indicatorIds } }] },
      });
      if (input.indicatorIds.length > 0) {
        await tx.pageHighlight.createMany({
          data: input.indicatorIds.map((indicatorId, i) => ({
            pageId: page.id,
            indicatorId,
            position: i + 1,
          })),
        });
      }
      // Bumps the page's updatedAt so a stale second editor is told to reload.
      await tx.page.update({ where: { id: page.id }, data: { updatedAt: new Date() } });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.PAGE_HIGHLIGHTS_UPDATED,
          actor,
          target: { type: 'page', id: page.id, label: page.title },
          metadata: { slug: page.slug, count: input.indicatorIds.length },
          context: reqContext,
        },
        tx,
      );
    },
  });

  return getPageHighlights(slug, client);
}
