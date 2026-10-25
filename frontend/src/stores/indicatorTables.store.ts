import { defineStore } from 'pinia';
import { ref } from 'vue';

export const INDICATOR_TABLE_KINDS = [
  'age_pyramid',
  'ethnicity',
  'religion_by_sex',
  'occupation',
] as const;

export type IndicatorTableKind = (typeof INDICATOR_TABLE_KINDS)[number];

const SEX_SPLIT_KINDS: ReadonlySet<IndicatorTableKind> = new Set(['age_pyramid', 'religion_by_sex']);

export function isSexSplitKind(kind: IndicatorTableKind): boolean {
  return SEX_SPLIT_KINDS.has(kind);
}

export interface IndicatorTableRowDto {
  id: string;
  tableId: string;
  rowKey: string;
  label: string;
  male: number | null;
  female: number | null;
  total: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorTableTotals {
  rowCount: number;
  male: number | null;
  female: number | null;
  total: number | null;
}

export interface IndicatorTableDetailDto {
  id: string;
  sectionId: string;
  slug: string;
  title: string;
  kind: IndicatorTableKind;
  period: string;
  source: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  rows: IndicatorTableRowDto[];
  totals: IndicatorTableTotals;
}

export const useIndicatorTablesStore = defineStore('indicatorTables', () => {
  const bySectionId = ref<Record<string, IndicatorTableDetailDto[]>>({});
  // Keyed per sectionId so one section's failure can't be masked by, or clobber,
  // the loading/error state of a sibling section's concurrent request.
  const loadingBySectionId = ref<Record<string, boolean>>({});
  const errorsBySectionId = ref<Record<string, string | null>>({});

  const inFlight: Record<string, Promise<IndicatorTableDetailDto[]> | undefined> = {};

  async function fetchBySectionId(
    sectionId: string,
    force = false,
  ): Promise<IndicatorTableDetailDto[]> {
    if (!force && bySectionId.value[sectionId]) {
      return bySectionId.value[sectionId]!;
    }
    if (inFlight[sectionId]) {
      return inFlight[sectionId]!;
    }

    loadingBySectionId.value = { ...loadingBySectionId.value, [sectionId]: true };
    errorsBySectionId.value = { ...errorsBySectionId.value, [sectionId]: null };

    const task = (async () => {
      try {
        const params = new URLSearchParams({ sectionId, pageSize: '200' });
        const listResponse = await fetch(`/api/indicator-tables?${params.toString()}`);
        if (!listResponse.ok) {
          throw new Error(`Gagal memuat tabel matriks (status ${listResponse.status})`);
        }
        const listData = (await listResponse.json()) as {
          tables: Array<{ id: string }>;
        };
        const summaries = Array.isArray(listData.tables) ? listData.tables : [];

        const detailResults = await Promise.all(
          summaries.map(async (summary) => {
            const detailResponse = await fetch(
              `/api/indicator-tables/${encodeURIComponent(summary.id)}`,
            );
            if (!detailResponse.ok) {
              throw new Error(`Gagal memuat detail tabel matriks (status ${detailResponse.status})`);
            }
            const detailData = (await detailResponse.json()) as { table: IndicatorTableDetailDto };
            return detailData.table;
          }),
        );

        bySectionId.value = { ...bySectionId.value, [sectionId]: detailResults };
        return detailResults;
      } catch (err) {
        // See indicators.store.ts: on failure we intentionally leave bySectionId[sectionId]
        // unset rather than [] — an empty array must only ever mean "no matrix tables here",
        // never "the fetch failed". The error lives in errorsBySectionId instead.
        errorsBySectionId.value = {
          ...errorsBySectionId.value,
          [sectionId]: err instanceof Error ? err.message : 'Terjadi kesalahan jaringan',
        };
        return [];
      } finally {
        loadingBySectionId.value = { ...loadingBySectionId.value, [sectionId]: false };
        delete inFlight[sectionId];
      }
    })();

    inFlight[sectionId] = task;
    return task;
  }

  return {
    bySectionId,
    loadingBySectionId,
    errorsBySectionId,
    fetchBySectionId,
  };
});
