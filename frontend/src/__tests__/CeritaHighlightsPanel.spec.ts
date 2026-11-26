import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CeritaHighlightsPanel from '../components/admin/cerita/CeritaHighlightsPanel.vue';
import * as ceritaService from '../services/ceritaAdmin.service';
import type { AdminPage } from '../stores/ceritaAdmin.store';
import type { Indicator } from '../stores/indicators.store';
import { ApiError } from '../utils/apiClient';

vi.mock('../services/ceritaAdmin.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/ceritaAdmin.service')>();
  return {
    ...actual,
    getPageHighlights: vi.fn<(pageSlug: string) => Promise<unknown>>(),
    putPageHighlights: vi.fn<(pageSlug: string, ids: string[], token: string) => Promise<unknown>>(),
  };
});

const getHighlights = vi.mocked(ceritaService.getPageHighlights);
const putHighlights = vi.mocked(ceritaService.putPageHighlights);

const page: AdminPage = {
  id: 'page-1',
  slug: 'kependudukan',
  title: 'Kependudukan',
  headline: null,
  bylineAuthor: null,
  bylineAffiliation: null,
  sortOrder: 0,
  createdAt: null,
  updatedAt: 'page-t1',
  chapters: [
    {
      id: 'chap-1',
      slug: 'penduduk',
      number: '1',
      title: 'Penduduk',
      sortOrder: 0,
      updatedAt: 'chap-t1',
      sections: [
        { id: 'sec-1', slug: 'jumlah', title: 'Jumlah', sortOrder: 0, updatedAt: 'sec-t1' },
        { id: 'sec-2', slug: 'rincian', title: 'Rincian', sortOrder: 1, updatedAt: 'sec-t2' },
      ],
    },
  ],
};

function indicator(overrides: Partial<Indicator>): Indicator {
  return {
    id: 'ind',
    sectionId: 'sec-1',
    slug: 'slug',
    label: 'Label',
    unit: 'jiwa',
    valueCurrent: '1',
    valuePrevious: null,
    periodCurrent: '2026',
    periodPrevious: null,
    isComputedComparison: false,
    isStale: false,
    source: null,
    hedgeNote: null,
    sortOrder: 0,
    pageSlug: 'kependudukan',
    ...overrides,
  };
}

const indicators: Indicator[] = [
  indicator({ id: 'i1', label: 'Jumlah penduduk', valueCurrent: '53098', sortOrder: 0 }),
  indicator({ id: 'i2', label: 'Jumlah laki-laki', valueCurrent: '26000', sortOrder: 1 }),
  indicator({
    id: 'i3',
    sectionId: 'sec-2',
    label: 'Jumlah perempuan',
    valueCurrent: '27000',
    sortOrder: 0,
  }),
  indicator({
    id: 'i4',
    sectionId: 'sec-2',
    label: 'Kepala keluarga',
    unit: 'KK',
    valueCurrent: '12000',
    sortOrder: 1,
  }),
  indicator({ id: 'i5', sectionId: 'sec-2', label: 'Rasio jenis kelamin', sortOrder: 2 }),
];

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

let wrapper: VueWrapper | null = null;

async function mountPanel(): Promise<VueWrapper> {
  const mounted = mount(CeritaHighlightsPanel, {
    props: { page },
    attachTo: document.body,
  });
  wrapper = mounted;
  await flushPromises();
  return mounted;
}

function serverList(indicatorIds: string[], isFallback = false): void {
  getHighlights.mockResolvedValue({ indicatorIds, isFallback, pageUpdatedAt: 'page-t1' });
}

function labelsShown(current: VueWrapper): string[] {
  return current.findAll('[data-test="highlights-item"] p.font-semibold').map((node) => node.text());
}

function saveButton(current: VueWrapper): HTMLButtonElement {
  return current.find('[data-test="highlights-save"]').element as HTMLButtonElement;
}

function addButton(current: VueWrapper): HTMLButtonElement {
  return current.find('[data-test="highlights-add"]').element as HTMLButtonElement;
}

describe('CeritaHighlightsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    getHighlights.mockReset();
    putHighlights.mockReset();
    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/indicators?pageSize=200')) {
        return json({ indicators, total: indicators.length });
      }
      return json({ pages: [] });
    }) as typeof fetch;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('shows the chosen statistics in order, with their formatted values and units', async () => {
    serverList(['i2', 'i1']);
    const current = await mountPanel();

    expect(current.find('h2').text()).toBe('Statistik unggulan (maks. 4)');
    expect(labelsShown(current)).toEqual(['Jumlah laki-laki', 'Jumlah penduduk']);
    expect(current.text()).toContain('26.000 jiwa');
    expect(current.text()).toContain('53.098 jiwa');
    expect(current.find('[data-test="highlights-fallback"]').exists()).toBe(false);
  });

  it('explains the fallback when nothing has been chosen yet', async () => {
    serverList(['i1', 'i2', 'i3', 'i4'], true);
    const current = await mountPanel();

    expect(current.find('[data-test="highlights-fallback"]').text()).toContain(
      'Belum dipilih — beranda menampilkan 4 statistik pertama sesuai urutan isi.',
    );
  });

  it('keeps Simpan disabled until the list changes', async () => {
    serverList(['i1']);
    const current = await mountPanel();

    expect(saveButton(current).disabled).toBe(true);

    await current.find('[data-test="highlight-remove"]').trigger('click');
    expect(saveButton(current).disabled).toBe(false);
  });

  it('limits the list to four: Tambah is disabled and the hint says how to make room', async () => {
    serverList(['i1', 'i2', 'i3', 'i4']);
    const current = await mountPanel();

    expect(addButton(current).disabled).toBe(true);
    expect(current.find('[data-test="highlights-add"]').attributes('aria-describedby')).toBeTruthy();
    expect(current.text()).toContain('Sudah 4 statistik. Hapus salah satu untuk menambah.');
  });

  it('removes a statistic and saves the rest in their order with the page token', async () => {
    serverList(['i1', 'i2', 'i3']);
    putHighlights.mockResolvedValue({
      indicatorIds: ['i2', 'i3'],
      isFallback: false,
      pageUpdatedAt: 'page-t2',
    });
    const current = await mountPanel();

    await current.findAll('[data-test="highlight-remove"]')[0]!.trigger('click');
    expect(labelsShown(current)).toEqual(['Jumlah laki-laki', 'Jumlah perempuan']);

    await current.find('[data-test="highlights-save"]').trigger('click');
    await flushPromises();

    expect(putHighlights).toHaveBeenCalledWith('kependudukan', ['i2', 'i3'], 'page-t1');
    expect(saveButton(current).disabled).toBe(true);
  });

  it('adds from the picker grouped by Bab and Bagian, leaving out chosen statistics', async () => {
    serverList(['i1']);
    putHighlights.mockResolvedValue({
      indicatorIds: ['i1', 'i3'],
      isFallback: false,
      pageUpdatedAt: 'page-t2',
    });
    const current = await mountPanel();

    await current.find('[data-test="highlights-add"]').trigger('click');
    const picker = current.find('[data-test="highlights-picker"]');
    expect(picker.exists()).toBe(true);
    expect(picker.text()).toContain('Bab 1 · Penduduk');
    expect(picker.text()).toContain('Bagian 1.2 · Rincian');
    expect(picker.text()).not.toContain('Jumlah penduduk');

    const option = picker.findAll('button').find((node) => node.text().startsWith('Jumlah perempuan'));
    await option!.trigger('click');
    await current.find('[data-test="highlights-save"]').trigger('click');
    await flushPromises();

    expect(putHighlights).toHaveBeenCalledWith('kependudukan', ['i1', 'i3'], 'page-t1');
  });

  it('reorders on the grip with the keyboard and saves the new order', async () => {
    serverList(['i1', 'i2']);
    putHighlights.mockResolvedValue({
      indicatorIds: ['i2', 'i1'],
      isFallback: false,
      pageUpdatedAt: 'page-t2',
    });
    const current = await mountPanel();

    const grip = current.findAll('[data-test="grip"]')[0]!;
    await grip.trigger('keydown', { key: ' ' });
    await grip.trigger('keydown', { key: 'ArrowDown' });
    await grip.trigger('keydown', { key: ' ' });
    await flushPromises();

    expect(labelsShown(current)).toEqual(['Jumlah laki-laki', 'Jumlah penduduk']);
    await current.find('[data-test="highlights-save"]').trigger('click');
    await flushPromises();
    expect(putHighlights).toHaveBeenCalledWith('kependudukan', ['i2', 'i1'], 'page-t1');
  });

  it('keeps the draft and offers a reload when someone else saved first', async () => {
    serverList(['i1', 'i2']);
    putHighlights.mockRejectedValue(new ApiError('stale', 409, { code: 'STALE_WRITE' }));
    const current = await mountPanel();

    await current.findAll('[data-test="highlight-remove"]')[0]!.trigger('click');
    await current.find('[data-test="highlights-save"]').trigger('click');
    await flushPromises();

    expect(current.find('[data-test="highlights-save-error"]').exists()).toBe(true);
    expect(current.find('[data-test="highlights-reload"]').exists()).toBe(true);
    expect(labelsShown(current)).toEqual(['Jumlah laki-laki']);
  });
});
