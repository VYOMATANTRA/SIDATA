import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  isSexSplitKind,
  useIndicatorTablesStore,
  type IndicatorTable,
  type IndicatorTableDetail,
} from '../stores/indicatorTables.store';

const CREATED = '2026-01-01T00:00:00.000Z';

function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

function makeTable(overrides: Partial<IndicatorTable> = {}): IndicatorTable {
  return {
    id: 'tbl-1',
    sectionId: 'sec-1',
    slug: 'piramida-usia',
    title: 'Piramida Usia',
    kind: 'age_pyramid',
    period: 'Juni 2024',
    source: 'Prodeskel',
    sortOrder: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

function makeDetail(): IndicatorTableDetail {
  return {
    ...makeTable(),
    rows: [
      {
        id: 'row-1',
        tableId: 'tbl-1',
        rowKey: '0-4',
        label: '0-4 tahun',
        male: 100,
        female: 90,
        total: 190,
        sortOrder: 0,
        createdAt: CREATED,
        updatedAt: CREATED,
      },
    ],
    totals: { rowCount: 1, male: 100, female: 90, total: 190 },
  };
}

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

describe('indicator tables store (CMS list and edits)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('exposes the shape of each fixed kind', () => {
    expect(isSexSplitKind('age_pyramid')).toBe(true);
    expect(isSexSplitKind('religion_by_sex')).toBe(true);
    expect(isSexSplitKind('ethnicity')).toBe(false);
    expect(isSexSplitKind('occupation')).toBe(false);
  });

  it('loads the table list', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () =>
      json({ tables: [makeTable()], total: 1 }),
    ) as typeof fetch;

    const store = useIndicatorTablesStore();
    await store.fetchTables();

    expect(store.tables).toHaveLength(1);
    expect(store.isLoaded).toBe(true);
  });

  it('fetches rows on demand and caches the detail by id', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/indicator-tables/tbl-1') return json({ table: makeDetail() });
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const store = useIndicatorTablesStore();
    const detail = await store.fetchTableDetail('tbl-1');

    expect(detail.rows).toHaveLength(1);
    expect(store.detailById('tbl-1')?.title).toBe('Piramida Usia');
    expect(store.detailById('missing')).toBeNull();
  });

  it('patches the table header and keeps the list in sync', async () => {
    let captured: RequestInit | undefined;

    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
      if (url === '/api/indicator-tables?pageSize=200') {
        return json({ tables: [makeTable()], total: 1 });
      }
      if (url === '/api/indicator-tables/tbl-1') {
        captured = init;
        return json({ table: { ...makeDetail(), title: 'Piramida Penduduk' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const store = useIndicatorTablesStore();
    await store.fetchTables();

    await store.updateTable('tbl-1', { title: 'Piramida Penduduk' });

    expect(store.tables[0]?.title).toBe('Piramida Penduduk');
    expect(captured?.method).toBe('PATCH');
    expect(new Headers(captured?.headers).get('x-csrf-token')).toBe('csrf-1');
    expect(JSON.parse(String(captured?.body))).toEqual({ title: 'Piramida Penduduk' });
  });

  it('saves the header and every changed row in one batch PATCH', async () => {
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
      if (url === '/api/indicator-tables?pageSize=200') {
        return json({ tables: [makeTable()], total: 1 });
      }
      if (url === '/api/indicator-tables/tbl-1') {
        capturedInit = init;
        return json({ table: { ...makeDetail(), title: 'Piramida Penduduk' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const store = useIndicatorTablesStore();
    await store.fetchTables();

    await store.saveTableDetail('tbl-1', {
      table: { title: 'Piramida Penduduk' },
      rows: [
        { rowId: 'row-1', patch: { male: 130 } },
        { rowId: 'row-2', patch: { female: 75 } },
      ],
    });

    expect(capturedInit?.method).toBe('PATCH');
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      title: 'Piramida Penduduk',
      rows: [
        { id: 'row-1', male: 130 },
        { id: 'row-2', female: 75 },
      ],
    });
    expect(store.tables[0]?.title).toBe('Piramida Penduduk');
  });

  it('surfaces a per-kind shape rejection from the batch save', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
      return json(
        { error: 'Tabel dengan pembagian jenis kelamin tidak menyimpan nilai total' },
        false,
        400,
      );
    }) as typeof fetch;

    const store = useIndicatorTablesStore();

    await expect(
      store.saveTableDetail('tbl-1', {
        table: {},
        rows: [{ rowId: 'row-1', patch: { total: 190 } }],
      }),
    ).rejects.toThrow('Tabel dengan pembagian jenis kelamin tidak menyimpan nilai total');
  });
});

describe('indicator tables store (public per-section reads)', () => {
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
