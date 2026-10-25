import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIndicatorTablesStore, isSexSplitKind } from '../stores/indicatorTables.store';

const tableSummary = {
  id: 'tbl-1',
  sectionId: 'sec-1',
  slug: 'piramida-usia',
  title: 'Piramida Usia',
  kind: 'age_pyramid',
  period: 'Juni 2024',
  source: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tableDetail = {
  ...tableSummary,
  rows: [
    {
      id: 'row-1',
      tableId: 'tbl-1',
      rowKey: '0-4',
      label: '0–4 Tahun',
      male: 120,
      female: 110,
      total: 230,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  totals: { rowCount: 1, male: 120, female: 110, total: 230 },
};

describe('isSexSplitKind', () => {
  it('is true for age_pyramid and religion_by_sex', () => {
    expect(isSexSplitKind('age_pyramid')).toBe(true);
    expect(isSexSplitKind('religion_by_sex')).toBe(true);
  });

  it('is false for ethnicity and occupation', () => {
    expect(isSexSplitKind('ethnicity')).toBe(false);
    expect(isSexSplitKind('occupation')).toBe(false);
  });
});

describe('indicatorTables store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('fetches the table list for a section, then each table detail', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/indicator-tables?')) {
        return { ok: true, json: async () => ({ tables: [tableSummary] }) } as Response;
      }
      return { ok: true, json: async () => ({ table: tableDetail }) } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = useIndicatorTablesStore();
    const result = await store.fetchBySectionId('sec-1');

    expect(result).toEqual([tableDetail]);
    expect(store.bySectionId['sec-1']).toEqual([tableDetail]);
    expect(fetchMock).toHaveBeenCalledWith('/api/indicator-tables?sectionId=sec-1&pageSize=200');
    expect(fetchMock).toHaveBeenCalledWith('/api/indicator-tables/tbl-1');
  });

  it('does not refetch an already-cached sectionId', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/indicator-tables?')) {
        return { ok: true, json: async () => ({ tables: [tableSummary] }) } as Response;
      }
      return { ok: true, json: async () => ({ table: tableDetail }) } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = useIndicatorTablesStore();
    await store.fetchBySectionId('sec-1');
    await store.fetchBySectionId('sec-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('records the error against that sectionId, not globally, when the list request fails', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useIndicatorTablesStore();
    const result = await store.fetchBySectionId('sec-1');

    expect(result).toEqual([]);
    expect(store.errorsBySectionId['sec-1']).toContain('500');
    // A failed fetch must never be written into bySectionId as [] — that would be
    // indistinguishable from a section that genuinely has no matrix tables.
    expect(store.bySectionId['sec-1']).toBeUndefined();
  });

  it('keeps one section error from clobbering a sibling section in-flight at the same time', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('sectionId=sec-fail')) {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
      }
      if (url.includes('/api/indicator-tables?')) {
        return { ok: true, json: async () => ({ tables: [tableSummary] }) } as Response;
      }
      return { ok: true, json: async () => ({ table: tableDetail }) } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = useIndicatorTablesStore();
    await Promise.all([
      store.fetchBySectionId('sec-fail'),
      store.fetchBySectionId('sec-ok'),
    ]);

    expect(store.errorsBySectionId['sec-fail']).toContain('500');
    expect(store.errorsBySectionId['sec-ok']).toBeNull();
    expect(store.bySectionId['sec-ok']).toEqual([tableDetail]);
    expect(store.loadingBySectionId['sec-fail']).toBe(false);
    expect(store.loadingBySectionId['sec-ok']).toBe(false);
  });
});
