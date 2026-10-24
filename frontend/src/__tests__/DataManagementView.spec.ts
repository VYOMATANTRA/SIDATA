import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DataManagementView from '../views/DataManagementView.vue';
import type { Indicator } from '../stores/indicators.store';
import type { IndicatorTable } from '../stores/indicatorTables.store';

const CREATED = '2026-01-01T00:00:00.000Z';

function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

const indicator: Indicator = {
  id: 'ind-1',
  sectionId: 'sec-1',
  slug: 'total-penduduk',
  label: 'Total Penduduk',
  unit: 'jiwa',
  valueCurrent: '53098',
  valuePrevious: '52386',
  periodCurrent: '2026',
  periodPrevious: '2025',
  isComputedComparison: true,
  isStale: true,
  source: 'Prodeskel',
  hedgeNote: 'Data Potensi Juni 2024.',
  sortOrder: 0,
  comparisonTemplateId: null,
  comparison: null,
  createdAt: CREATED,
  updatedAt: CREATED,
};

const table: IndicatorTable = {
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
};

function installFetchMock() {
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/pages') {
      return json({
        pages: [
          { id: 'p1', slug: 'kependudukan', title: 'Kependudukan', sortOrder: 0, chapterCount: 1 },
        ],
      });
    }

    if (url === '/api/pages/kependudukan') {
      return json({
        page: {
          id: 'p1',
          slug: 'kependudukan',
          title: 'Kependudukan',
          sortOrder: 0,
          chapters: [
            {
              id: 'c1',
              slug: 'jumlah-penduduk',
              number: null,
              title: 'Jumlah Penduduk',
              sortOrder: 0,
              sections: [{ id: 'sec-1', slug: 'ringkasan', title: null, sortOrder: 0 }],
            },
          ],
          createdAt: CREATED,
          updatedAt: CREATED,
        },
      });
    }

    if (url === '/api/indicators?pageSize=200') {
      return json({ indicators: [indicator], total: 1, page: 1, pageSize: 200 });
    }

    if (url === '/api/indicator-tables?pageSize=200') {
      return json({ tables: [table], total: 1, page: 1, pageSize: 200 });
    }

    if (url === '/api/indicator-tables/tbl-1') {
      return json({
        table: {
          ...table,
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
        },
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function mountView() {
  return mount(DataManagementView, {
    global: {
      plugins: [createPinia()],
      stubs: { RouterLink: true, teleport: true },
    },
  });
}

describe('DataManagementView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    installFetchMock();
  });

  it('lists scalar indicators and matrix tables with their page context', async () => {
    const wrapper = mountView();
    await flushPromises();

    const cards = wrapper.findAll('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.text()).toContain('Total Penduduk');
    expect(cards[0]?.text()).toContain('Kependudukan');
    expect(cards[0]?.text()).toContain('Data berumur');
    expect(cards[1]?.text()).toContain('Piramida Usia');
    expect(cards[0]?.text()).toContain('skalar');
    expect(cards[1]?.text()).toContain('matriks');

    expect(wrapper.find('[data-test="result-count"]').text()).toContain(
      'Menampilkan 2 dari 2 data',
    );

    wrapper.unmount();
  });

  it('filters by search text and by type', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('#data-search').setValue('piramida');
    expect(wrapper.find('[data-test="result-count"]').text()).toContain(
      'Menampilkan 1 dari 2 data',
    );
    expect(wrapper.findAll('article')).toHaveLength(1);

    await wrapper.find('#data-search').setValue('');

    await wrapper.find('#data-type').setValue('skalar');
    expect(wrapper.find('[data-test="result-count"]').text()).toContain(
      'Menampilkan 1 dari 2 data',
    );
    expect(wrapper.findAll('article')[0]?.text()).toContain('Total Penduduk');

    wrapper.unmount();
  });

  it('shows an explicit empty state instead of an empty list', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pages') return json({ pages: [] });
      if (url.startsWith('/api/indicators?')) return json({ indicators: [], total: 0 });
      if (url.startsWith('/api/indicator-tables?')) return json({ tables: [], total: 0 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Belum ada data indikator');
    expect(wrapper.findAll('article')).toHaveLength(0);

    wrapper.unmount();
  });

  it('opens the scalar edit dialog with a labelled form', async () => {
    const wrapper = mountView();
    await flushPromises();

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Total Penduduk'));
    expect(editButton).toBeDefined();

    await editButton?.trigger('click');
    await flushPromises();

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.text()).toContain('Edit Angka Indikator Skalar');
    expect(wrapper.find('#indicator-label').exists()).toBe(true);

    wrapper.unmount();
  });

  it('loads the table detail before opening the matrix dialog', async () => {
    const wrapper = mountView();
    await flushPromises();

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Piramida Usia'));
    expect(editButton).toBeDefined();

    await editButton?.trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').text()).toContain('Edit Tabel Matriks');
    expect(wrapper.find('#table-row-row-1-male').exists()).toBe(true);

    wrapper.unmount();
  });

  it('does not offer bulk import, which is out of scope (SPEC §4)', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text().toLowerCase()).not.toContain('import from');

    wrapper.unmount();
  });
});
