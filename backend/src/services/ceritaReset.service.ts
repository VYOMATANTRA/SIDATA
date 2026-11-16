import prisma from '../utils/prisma.js';
import { CERITA_PAGES } from '../../prisma/ceritaPages.js';
import { mediaIdsOfStoredFigure } from '../utils/sectionFigure.js';
import { AUDIT_ACTIONS, buildAuditLog } from './audit.service.js';
import { invalidateContentBlocksCache } from './contentBlocks.service.js';
import { invalidateHierarchyDependentCaches } from './hierarchyCaches.js';
import { detachMedia, type MediaTransactionClient } from './media.service.js';

export interface CeritaResetResult {
  dryRun: boolean;
  deletedIndicators: number;
  deletedIndicatorTableRows: number;
  deletedIndicatorTables: number;
  deletedSectionContentBlocks: number;
  detachedFigureAssets: number;
  deletedSections: number;
  deletedExtraChapters: number;
  deletedExtraPages: number;
  detachedCoverAssets: number;
  resetPageHeaders: number;
  ensuredPages: number;
  ensuredChapters: number;
}

export interface CeritaResetTx {
  indicator: {
    count(): Promise<number>;
    deleteMany(): Promise<{ count: number }>;
  };
  indicatorTableRow: {
    count(): Promise<number>;
    deleteMany(): Promise<{ count: number }>;
  };
  indicatorTable: {
    count(): Promise<number>;
    deleteMany(): Promise<{ count: number }>;
  };
  contentBlock: {
    findMany(args: {
      where: { sectionId: { not: null } };
      select: { id: true; type: true; metadata: true };
    }): Promise<Array<{ id: string; type: string; metadata: unknown }>>;
    deleteMany(args: { where: { sectionId: { not: null } } }): Promise<{ count: number }>;
  };
  section: {
    count(): Promise<number>;
    deleteMany(): Promise<{ count: number }>;
  };
  chapter: {
    findMany(args: {
      select: { id: true; pageId: true; slug: true };
    }): Promise<Array<{ id: string; pageId: string; slug: string }>>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
    upsert(args: {
      where: { pageId_slug: { pageId: string; slug: string } };
      update: Record<string, never>;
      create: {
        pageId: string;
        slug: string;
        number: string | null;
        title: string;
        sortOrder: number;
      };
    }): Promise<unknown>;
  };
  page: {
    findMany(args: {
      select: {
        id: true;
        slug: true;
        coverAssetId: true;
        headline: true;
        bylineAuthor: true;
        bylineAffiliation: true;
      };
    }): Promise<
      Array<{
        id: string;
        slug: string;
        coverAssetId: string | null;
        headline: string | null;
        bylineAuthor: string | null;
        bylineAffiliation: string | null;
      }>
    >;
    updateMany(args: {
      where: { id: { in: string[] } };
      data: {
        coverAssetId: null;
        headline: null;
        bylineAuthor: null;
        bylineAffiliation: null;
      };
    }): Promise<{ count: number }>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
    upsert(args: {
      where: { slug: string };
      update: Record<string, never>;
      create: { slug: string; title: string; sortOrder: number };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  auditLog: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export type CeritaResetTransactionRunner = (
  callback: (tx: CeritaResetTx) => Promise<CeritaResetResult>,
) => Promise<CeritaResetResult>;

export interface CeritaResetOptions {
  force?: boolean;
  dryRun?: boolean;
  resetCovers?: boolean;
  nodeEnv?: string;
  now?: () => Date;
  detachMediaFn?: typeof detachMedia;
  transaction?: CeritaResetTransactionRunner;
}

const asMediaTx = (tx: unknown): MediaTransactionClient => tx as MediaTransactionClient;

/**
 * Resets all Cerita section content (indicators, matrix tables, prose/figure blocks, sections,
 * and non-canonical chapters/pages) back to the empty canonical `CERITA_PAGES` skeleton while
 * keeping user/admin accounts, roles, system settings, comparison templates, RT data, and
 * standalone landing/catalog content blocks intact.
 */
export async function resetCeritaContent(
  options: CeritaResetOptions = {},
): Promise<CeritaResetResult> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === 'production' && !options.force && !options.dryRun) {
    throw new Error('Menolak membersihkan konten Cerita di production tanpa flag --force.');
  }

  const transact =
    options.transaction ??
    ((callback) => prisma.$transaction((tx) => callback(tx as unknown as CeritaResetTx)));
  const result = await transact((tx) => runCeritaResetTx(tx, options));

  if (!result.dryRun) {
    invalidateHierarchyDependentCaches();
    invalidateContentBlocksCache();
  }

  return result;
}

/** Executes the Cerita reset inside an injected transaction client (or reads counts in dry-run). */
export async function runCeritaResetTx(
  tx: CeritaResetTx,
  options: Pick<CeritaResetOptions, 'dryRun' | 'resetCovers' | 'now' | 'detachMediaFn'> = {},
): Promise<CeritaResetResult> {
  const dryRun = options.dryRun === true;
  const resetCovers = options.resetCovers === true;
  const now = (options.now ?? (() => new Date()))();
  const runDetach = options.detachMediaFn ?? detachMedia;

  const sectionBlocks = await tx.contentBlock.findMany({
    where: { sectionId: { not: null } },
    select: { id: true, type: true, metadata: true },
  });
  const figureAttachments = sectionBlocks
    .filter((block) => block.type === 'figure')
    .map((block) => ({ id: block.id, mediaIds: mediaIdsOfStoredFigure(block.metadata) }))
    .filter((item) => item.mediaIds.length > 0);
  const detachedFigureAssets = new Set(figureAttachments.flatMap((item) => item.mediaIds)).size;

  const existingPages = await tx.page.findMany({
    select: {
      id: true,
      slug: true,
      coverAssetId: true,
      headline: true,
      bylineAuthor: true,
      bylineAffiliation: true,
    },
  });
  const existingChapters = await tx.chapter.findMany({
    select: { id: true, pageId: true, slug: true },
  });

  const canonicalPageBySlug = new Map(CERITA_PAGES.map((p) => [p.slug, p]));
  const pageById = new Map(existingPages.map((p) => [p.id, p]));

  const extraPageIds = existingPages
    .filter((p) => !canonicalPageBySlug.has(p.slug))
    .map((p) => p.id);
  const extraChapterIds = existingChapters
    .filter((ch) => {
      const parentPage = pageById.get(ch.pageId);
      const spec = parentPage ? canonicalPageBySlug.get(parentPage.slug) : undefined;
      return !spec || !spec.chapters.some((c) => c.slug === ch.slug);
    })
    .map((ch) => ch.id);

  const allCoverPages = resetCovers ? existingPages.filter((p) => p.coverAssetId !== null) : [];
  const headerResetPageIds = resetCovers
    ? existingPages
        .filter(
          (p) =>
            canonicalPageBySlug.has(p.slug) &&
            (p.coverAssetId !== null ||
              p.headline !== null ||
              p.bylineAuthor !== null ||
              p.bylineAffiliation !== null),
        )
        .map((p) => p.id)
    : [];
  const detachedCoverAssets = new Set(allCoverPages.map((p) => p.coverAssetId!)).size;

  if (dryRun) {
    return {
      dryRun: true,
      deletedIndicators: await tx.indicator.count(),
      deletedIndicatorTableRows: await tx.indicatorTableRow.count(),
      deletedIndicatorTables: await tx.indicatorTable.count(),
      deletedSectionContentBlocks: sectionBlocks.length,
      detachedFigureAssets,
      deletedSections: await tx.section.count(),
      deletedExtraChapters: extraChapterIds.length,
      deletedExtraPages: extraPageIds.length,
      detachedCoverAssets,
      resetPageHeaders: headerResetPageIds.length,
      ensuredPages: CERITA_PAGES.length,
      ensuredChapters: CERITA_PAGES.reduce((n, p) => n + p.chapters.length, 0),
    };
  }

  for (const fig of figureAttachments) {
    await runDetach(
      asMediaTx(tx),
      fig.mediaIds,
      { purpose: 'cerita', reference: { type: 'content_block', id: fig.id, slot: 'figure' } },
      now,
      { lenient: true },
    );
  }

  for (const page of allCoverPages) {
    await runDetach(
      asMediaTx(tx),
      [page.coverAssetId!],
      { purpose: 'cerita-cover', reference: { type: 'page', id: page.id, slot: 'cover' } },
      now,
      { lenient: true },
    );
  }

  // Delete dependents in FK order (`Restrict` on sections) before clearing sections.
  const deletedIndicators = (await tx.indicator.deleteMany()).count;
  const deletedIndicatorTableRows = (await tx.indicatorTableRow.deleteMany()).count;
  const deletedIndicatorTables = (await tx.indicatorTable.deleteMany()).count;
  const deletedSectionContentBlocks = (
    await tx.contentBlock.deleteMany({ where: { sectionId: { not: null } } })
  ).count;
  const deletedSections = (await tx.section.deleteMany()).count;

  const deletedExtraChapters =
    extraChapterIds.length > 0
      ? (await tx.chapter.deleteMany({ where: { id: { in: extraChapterIds } } })).count
      : 0;
  const deletedExtraPages =
    extraPageIds.length > 0
      ? (await tx.page.deleteMany({ where: { id: { in: extraPageIds } } })).count
      : 0;

  const resetPageHeaders =
    headerResetPageIds.length > 0
      ? (
          await tx.page.updateMany({
            where: { id: { in: headerResetPageIds } },
            data: {
              coverAssetId: null,
              headline: null,
              bylineAuthor: null,
              bylineAffiliation: null,
            },
          })
        ).count
      : 0;

  // Re-ensure the 8 canonical pages and 38 canonical chapters match `seed.ts`.
  let ensuredChapters = 0;
  for (const [pageIndex, pageSpec] of CERITA_PAGES.entries()) {
    const page = await tx.page.upsert({
      where: { slug: pageSpec.slug },
      update: {},
      create: { slug: pageSpec.slug, title: pageSpec.title, sortOrder: pageIndex },
      select: { id: true },
    });
    for (const [chapterIndex, chapterSpec] of pageSpec.chapters.entries()) {
      await tx.chapter.upsert({
        where: { pageId_slug: { pageId: page.id, slug: chapterSpec.slug } },
        update: {},
        create: {
          pageId: page.id,
          slug: chapterSpec.slug,
          number: chapterSpec.number ?? null,
          title: chapterSpec.title,
          sortOrder: chapterIndex,
        },
      });
      ensuredChapters++;
    }
  }

  const summary: CeritaResetResult = {
    dryRun: false,
    deletedIndicators,
    deletedIndicatorTableRows,
    deletedIndicatorTables,
    deletedSectionContentBlocks,
    detachedFigureAssets,
    deletedSections,
    deletedExtraChapters,
    deletedExtraPages,
    detachedCoverAssets,
    resetPageHeaders,
    ensuredPages: CERITA_PAGES.length,
    ensuredChapters,
  };

  await buildAuditLog(
    {
      action: AUDIT_ACTIONS.MAINTENANCE_CERITA_RESET,
      actor: { email: 'system@sidata.internal', role: 'system' },
      target: { type: 'cerita_content', label: 'cerita_reset' },
      metadata: { source: 'reset-cerita-content', ...summary },
    },
    tx as unknown as Parameters<typeof buildAuditLog>[1],
  );

  return summary;
}
