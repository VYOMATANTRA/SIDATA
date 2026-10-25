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

describe('indicator tables store', () => {
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

  it('patches a single row through the row endpoint', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
      capturedUrl = url;
      capturedInit = init;
      return json({
        row: {
          id: 'row-1',
          tableId: 'tbl-1',
          rowKey: '0-4',
          label: '0-4 tahun',
          male: 120,
          female: 90,
          total: 210,
          sortOrder: 0,
          createdAt: CREATED,
          updatedAt: CREATED,
        },
      });
    }) as typeof fetch;

    const store = useIndicatorTablesStore();
    const row = await store.updateTableRow('row-1', { male: 120 });

    expect(row.male).toBe(120);
    expect(capturedUrl).toBe('/api/indicator-tables/rows/row-1');
    expect(JSON.parse(String(capturedInit?.body))).toEqual({ male: 120 });
  });

  it('surfaces a per-kind shape rejection', async () => {
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

    await expect(store.updateTableRow('row-1', { total: 190 })).rejects.toThrow(
      'Tabel dengan pembagian jenis kelamin tidak menyimpan nilai total',
    );
  });
});
