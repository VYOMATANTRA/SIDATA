import prisma from '../utils/prisma.js';

/**
 * Chart figures (SPEC §2) reference an indicator table by id inside the figure block's
 * `metadata`. These helpers answer the two questions the rest of the backend asks about that
 * reference: does the table sit on the section's page, and is a table still used by a chart.
 */

type RefClient = {
  section: Pick<typeof prisma.section, 'findUnique'>;
  indicatorTable: Pick<typeof prisma.indicatorTable, 'findUnique'>;
  contentBlock: Pick<typeof prisma.contentBlock, 'count'>;
  $queryRaw: typeof prisma.$queryRaw;
};

/** Page a section belongs to, or null when the section does not exist. */
export async function pageIdOfSection(
  tx: Pick<RefClient, 'section'>,
  sectionId: string,
): Promise<string | null> {
  const row = await tx.section.findUnique({
    where: { id: sectionId },
    select: { chapter: { select: { pageId: true } } },
  });
  return row?.chapter.pageId ?? null;
}

/** Number of section figures that draw a chart from this table. */
export async function countChartsUsingTable(
  tx: Pick<RefClient, 'contentBlock'>,
  tableId: string,
): Promise<number> {
  return tx.contentBlock.count({
    where: {
      type: 'figure',
      metadata: { path: '$.tableId', equals: tableId },
    },
  });
}

export type ChartTableCheck = 'ok' | 'missing' | 'other-page';

/**
 * Checks that the table exists on the same page as the section. The caller has already locked the
 * table row (`lockSectionAndFigure`), so a concurrent delete or move waits for this save.
 */
export async function checkChartTable(
  tx: RefClient,
  tableId: string,
  sectionPageId: string | null,
): Promise<ChartTableCheck> {
  const table = await tx.indicatorTable.findUnique({
    where: { id: tableId },
    select: { sectionId: true },
  });
  if (!table) return 'missing';
  const tablePageId = await pageIdOfSection(tx, table.sectionId);
  return tablePageId !== null && tablePageId === sectionPageId ? 'ok' : 'other-page';
}
