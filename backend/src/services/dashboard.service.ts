import prisma from '../utils/prisma.js';
import { getMapSummary } from './maps.service.js';
import { PUBLIKASI_SLUG } from './publikasiCatalog.service.js';

/** Audit actions that count as a content change. Everything else (auth, users, ops) is excluded. */
export const RECENT_CHANGE_PREFIXES = [
  'indicator.',
  'indicator_table.',
  'content_block.',
  'page.',
  'chapter.',
  'section.',
  'rt_leader.',
  'spatial_point.',
  'spatial_point_rt.',
  'comparison_template.',
] as const;

export const RECENT_CHANGES_LIMIT = 10;
export const STALE_PREVIEW_LIMIT = 5;

export interface RecentChangeDTO {
  action: string;
  targetType: string | null;
  targetLabel: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface DashboardDTO {
  counts: {
    indicators: number;
    indicatorTables: number;
    pages: number;
    publications: number;
    rtLeaders: number;
    spatialPoints: number;
  };
  health: {
    staleIndicators: {
      count: number;
      items: Array<{ id: string; label: string; pageSlug: string | null }>;
    };
    rtLeadersWithoutCoordinates: number;
    rtLeadersWithIntegrityConflicts: number;
  };
  recentChanges: RecentChangeDTO[];
}

/** The part of an email before "@": a staff handle, never the address itself. */
export function actorNameFrom(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  return local ? local : null;
}

export function toRecentChange(row: {
  action: string;
  targetType: string | null;
  targetLabel: string | null;
  actorEmail: string | null;
  createdAt: Date;
}): RecentChangeDTO {
  // Explicit projection: metadata, IP, user agent and the full email never leave the service.
  return {
    action: row.action,
    targetType: row.targetType,
    targetLabel: row.targetLabel,
    actorName: actorNameFrom(row.actorEmail),
    createdAt: row.createdAt.toISOString(),
  };
}

function publicationCount(metadata: unknown): number {
  const items = (metadata as { publications?: unknown } | null)?.publications;
  return Array.isArray(items) ? items.length : 0;
}

export async function getDashboard(): Promise<DashboardDTO> {
  const client = prisma;
  const [indicators, indicatorTables, pages, catalog, stale, staleCount, mapSummary, changes] =
    await Promise.all([
      client.indicator.count(),
      client.indicatorTable.count(),
      client.page.count(),
      client.contentBlock.findFirst({
        where: { slug: PUBLIKASI_SLUG },
        select: { metadata: true },
      }),
      client.indicator.findMany({
        where: { isStale: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: STALE_PREVIEW_LIMIT,
        select: {
          id: true,
          label: true,
          section: { select: { chapter: { select: { page: { select: { slug: true } } } } } },
        },
      }),
      client.indicator.count({ where: { isStale: true } }),
      getMapSummary(),
      client.auditLog.findMany({
        where: {
          AND: [
            { OR: RECENT_CHANGE_PREFIXES.map((p) => ({ action: { startsWith: p } })) },
            // Seed/import rows are written by the `system` actor. The explicit null branch is
            // needed because SQL `NULL <> 'system'` is not true, so a bare `not` drops null roles.
            { OR: [{ actorRole: null }, { actorRole: { not: 'system' } }] },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_CHANGES_LIMIT,
        select: {
          action: true,
          targetType: true,
          targetLabel: true,
          actorEmail: true,
          createdAt: true,
        },
      }),
    ]);

  return {
    counts: {
      indicators,
      indicatorTables,
      pages,
      publications: publicationCount(catalog?.metadata),
      rtLeaders: mapSummary.totalRtLeaders,
      spatialPoints: mapSummary.totalPoints,
    },
    health: {
      staleIndicators: {
        count: staleCount,
        items: stale.map((row) => ({
          id: row.id,
          label: row.label,
          pageSlug: row.section.chapter.page.slug,
        })),
      },
      rtLeadersWithoutCoordinates: mapSummary.rtLeadersWithoutCoordinates,
      rtLeadersWithIntegrityConflicts: mapSummary.rtLeadersWithIntegrityConflicts,
    },
    recentChanges: changes.map(toRecentChange),
  };
}
