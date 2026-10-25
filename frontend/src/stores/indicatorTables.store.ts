import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiRequestJson } from '../utils/apiClient';

/**
 * The four fixed-shape matrix tables (SPEC §7): normalized rows, one row per logical group.
 * Sex-split kinds store `male`/`female` and derive `total` on read; single-value kinds store
 * `total`. The CMS form must follow the same split or the service answers 400.
 */

export const INDICATOR_TABLES_PAGE_SIZE = 200;

export const INDICATOR_TABLE_KINDS = [
  'age_pyramid',
  'ethnicity',
  'religion_by_sex',
  'occupation',
] as const;

export type IndicatorTableKind = (typeof INDICATOR_TABLE_KINDS)[number];

export interface IndicatorTableKindMeta {
  label: string;
  description: string;
  /** Sex-split rows carry male/female; the rest carry a single total. */
  sexSplit: boolean;
}

export const INDICATOR_TABLE_KIND_META: Record<IndicatorTableKind, IndicatorTableKindMeta> = {
  age_pyramid: {
    label: 'Piramida Usia',
    description: 'Jumlah penduduk per kelompok umur, dipisah menurut jenis kelamin.',
    sexSplit: true,
  },
  ethnicity: {
    label: 'Suku/Etnis',
    description: 'Jumlah penduduk per kelompok suku/etnis (17 kelompok).',
    sexSplit: false,
  },
  religion_by_sex: {
    label: 'Agama menurut Jenis Kelamin',
    description: 'Jumlah penduduk per agama, dipisah menurut jenis kelamin.',
    sexSplit: true,
  },
  occupation: {
    label: 'Mata Pencaharian',
    description: 'Jumlah penduduk per jenis mata pencaharian.',
    sexSplit: false,
  },
};

export function isSexSplitKind(kind: IndicatorTableKind): boolean {
  return INDICATOR_TABLE_KIND_META[kind]?.sexSplit ?? false;
}

export interface IndicatorTable {
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
}

export interface IndicatorTableRow {
  id: string;
  tableId: string;
  rowKey: string;
  label: string;
  male: number | null;
  female: number | null;
  /** Derived (`male + female`) for sex-split kinds; stored for single-value kinds. */
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

export interface IndicatorTableDetail extends IndicatorTable {
  rows: IndicatorTableRow[];
  totals: IndicatorTableTotals;
}

/** Table-level fields the CMS may change; `kind` is immutable once rows exist. */
export interface IndicatorTablePatch {
  title?: string;
  period?: string;
  source?: string | null;
}

export interface IndicatorTableRowPatch {
  label?: string;
  male?: number | null;
  female?: number | null;
  total?: number | null;
}

/** What the table form submits: one atomic request carrying the header and every changed row. */
export interface IndicatorTableSavePayload {
  table: IndicatorTablePatch;
  rows: Array<{ rowId: string; patch: IndicatorTableRowPatch }>;
}

export const useIndicatorTablesStore = defineStore('indicatorTables', () => {
  const tables = ref<IndicatorTable[]>([]);
  const details = ref<Record<string, IndicatorTableDetail>>({});
  const total = ref(0);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

  function detailById(id: string): IndicatorTableDetail | null {
    return details.value[id] ?? null;
  }

  function replaceTable(updated: IndicatorTable): void {
    const index = tables.value.findIndex((item) => item.id === updated.id);
    if (index === -1) {
      tables.value = [...tables.value, updated];
      total.value += 1;
      return;
    }
    const next = [...tables.value];
    next[index] = updated;
    tables.value = next;
  }

  async function fetchTables(force = false): Promise<void> {
    if (isLoaded.value && !force) return;
    if (inFlight) return inFlight;

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const data = await apiRequestJson<{ tables?: IndicatorTable[]; total?: number }>(
          `/api/indicator-tables?pageSize=${INDICATOR_TABLES_PAGE_SIZE}`,
        );
        tables.value = Array.isArray(data.tables) ? data.tables : [];
        total.value = typeof data.total === 'number' ? data.total : tables.value.length;
        isLoaded.value = true;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Gagal memuat daftar tabel indikator.';
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  /**
   * Always fetched fresh when a table is opened for editing: the list payload carries no rows,
   * and a row edited moments ago must not come back from a stale cache.
   */
  async function fetchTableDetail(idOrSlug: string): Promise<IndicatorTableDetail> {
    const data = await apiRequestJson<{ table: IndicatorTableDetail }>(
      `/api/indicator-tables/${encodeURIComponent(idOrSlug)}`,
    );
    details.value = { ...details.value, [data.table.id]: data.table };
    return data.table;
  }

  /**
   * Saves the table header and every changed row in one PATCH. The backend applies the whole
   * batch in a single transaction (mirroring the nested `rows` POST), so a 409 on one row leaves
   * the table exactly as it was — there is no partial write to reconcile with a refetch.
   */
  async function saveTableDetail(
    id: string,
    payload: IndicatorTableSavePayload,
  ): Promise<IndicatorTableDetail> {
    const body: Record<string, unknown> = { ...payload.table };
    if (payload.rows.length > 0) {
      body.rows = payload.rows.map(({ rowId, patch }) => ({ id: rowId, ...patch }));
    }

    const data = await apiRequestJson<{ table: IndicatorTableDetail }>(
      `/api/indicator-tables/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    details.value = { ...details.value, [data.table.id]: data.table };
    replaceTable(data.table);
    return data.table;
  }

  async function updateTable(
    id: string,
    patch: IndicatorTablePatch,
  ): Promise<IndicatorTableDetail> {
    return saveTableDetail(id, { table: patch, rows: [] });
  }

  async function updateTableRow(
    rowId: string,
    patch: IndicatorTableRowPatch,
  ): Promise<IndicatorTableRow> {
    const data = await apiRequestJson<{ row: IndicatorTableRow }>(
      `/api/indicator-tables/rows/${encodeURIComponent(rowId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return data.row;
  }

  return {
    tables,
    details,
    total,
    isLoading,
    isLoaded,
    error,
    detailById,
    fetchTables,
    fetchTableDetail,
    saveTableDetail,
    updateTable,
    updateTableRow,
    replaceTable,
  };
});
