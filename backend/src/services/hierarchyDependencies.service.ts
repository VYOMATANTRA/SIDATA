import prisma from '../utils/prisma.js';
import { HAS_DEPENDENTS_CODE, HierarchyServiceError } from '../utils/hierarchyAuthoring.js';

/**
 * Deletion safety for the Cerita hierarchy (SPEC §3). A page, chapter or section can only be
 * removed once nothing attached to its sections remains; the DB `ON DELETE RESTRICT` foreign
 * keys are the backstop, this gives the client a stable code and per-type counts instead.
 */

export interface DependencyCounts {
  /** Prose and other content blocks; a section's figure is counted under `figures`. */
  contentBlocks: number;
  /** Section figure blocks (SPEC §3): at most one per section. */
  figures: number;
  indicators: number;
  indicatorTables: number;
}

export type HierarchyScope = { sectionId: string } | { chapterId: string } | { pageId: string };

type CountClient = {
  contentBlock: Pick<typeof prisma.contentBlock, 'count'>;
  indicator: Pick<typeof prisma.indicator, 'count'>;
  indicatorTable: Pick<typeof prisma.indicatorTable, 'count'>;
};

function sectionFilter(scope: HierarchyScope) {
  if ('sectionId' in scope) return { id: scope.sectionId };
  if ('chapterId' in scope) return { chapterId: scope.chapterId };
  return { chapter: { pageId: scope.pageId } };
}

export async function countSectionDependents(
  client: CountClient,
  scope: HierarchyScope,
): Promise<DependencyCounts> {
  const where = { section: sectionFilter(scope) };
  const contentBlocks = await client.contentBlock.count({
    where: { ...where, type: { not: 'figure' } },
  });
  const figures = await client.contentBlock.count({ where: { ...where, type: 'figure' } });
  const indicators = await client.indicator.count({ where });
  const indicatorTables = await client.indicatorTable.count({ where });
  return { contentBlocks, figures, indicators, indicatorTables };
}

export function hasDependents(counts: DependencyCounts): boolean {
  return (
    counts.contentBlocks > 0 ||
    counts.figures > 0 ||
    counts.indicators > 0 ||
    counts.indicatorTables > 0
  );
}

export function dependentsError(label: string, counts: DependencyCounts): HierarchyServiceError {
  return new HierarchyServiceError(
    `${label} tidak dapat dihapus karena masih memiliki data terkait ` +
      `(blok konten: ${counts.contentBlocks}, gambar: ${counts.figures}, indikator: ${counts.indicators}, ` +
      `tabel indikator: ${counts.indicatorTables}). Hapus atau pindahkan data tersebut terlebih dahulu.`,
    409,
    HAS_DEPENDENTS_CODE,
    { dependencies: counts },
  );
}

export async function assertNoDependents(
  client: CountClient,
  scope: HierarchyScope,
  label: string,
): Promise<void> {
  const counts = await countSectionDependents(client, scope);
  if (hasDependents(counts)) {
    throw dependentsError(label, counts);
  }
}
