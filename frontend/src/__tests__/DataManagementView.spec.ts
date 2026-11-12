import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DataManagementView from '../views/DataManagementView.vue';
import type { Indicator } from '../stores/indicators.store';
import type { IndicatorTable } from '../stores/indicatorTables.store';
import { useAuthStore } from '../stores/auth';
import { useComparisonTemplatesStore } from '../stores/comparisonTemplates.store';
import { DEFAULT_PUBLIC_SETTINGS, useSettingsStore } from '../stores/settings.store';
import { USER_MESSAGES } from '../utils/userMessages';
import { resetLeafletMock } from './leafletMock';

vi.mock('leaflet', async () => (await import('./leafletMock')).createLeafletMock());

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

interface FetchOverrides {
  /** Answers `PATCH /api/indicator-tables/tbl-1`; the default succeeds with the stored detail. */
  tablePatch?: (body: Record<string, unknown>) => Response;
  /** Answers `GET /api/comparison-templates`; defaults to empty templates array. */
  templatesResponse?: () => Response;
  /** Answers `GET /api/settings/public`. */
  settingsGet?: () => Promise<Response> | Response;
  /** Answers `GET /api/content-blocks`; defaults to `contentBlocks()`. */
  contentBlocks?: () => Array<Record<string, unknown>>;
  /** Answers `PATCH /api/content-blocks/:slug`; the default echoes the saved block. */
  contentBlockPatch?: (slug: string, body: Record<string, unknown>) => Response;
}

/** Every PATCH the content-block editor sent, in order. */
let patchedBlocks: Array<{ slug: string; body: Record<string, unknown> }> = [];

function contentBlocks(): Array<Record<string, unknown>> {
  const base = { sectionId: null, sortOrder: null, createdAt: CREATED, updatedAt: CREATED };
  return [
    {
      ...base,
      id: 'b-hero',
      slug: 'landing-hero',
      type: 'hero',
      title: 'Sistem Informasi Data Terpadu Kelurahan',
      body: 'Selamat datang di portal data kelurahan.',
      metadata: null,
    },
    {
      ...base,
      id: 'b-sambutan',
      slug: 'landing-sambutan-lurah',
      type: 'sambutan_lurah',
      title: 'Sambutan Lurah Manggar',
      body: 'Sambutan resmi.',
      metadata: null,
    },
    {
      ...base,
      id: 'b-profil',
      slug: 'tentang-kelurahan-profil',
      type: 'prose',
      title: 'Profil Kelurahan Manggar',
      body: 'Data profil.',
      metadata: null,
    },
    {
      ...base,
      id: 'b-highlights',
      slug: 'landing-highlights',
      type: 'highlight',
      title: 'Potensi Unggulan Wilayah',
      body: 'Narasi uji.',
      metadata: { items: [{ title: 'Poin Satu', desc: 'Deskripsi satu' }] },
    },
    {
      ...base,
      id: 'b-publikasi',
      slug: 'publikasi-katalog',
      type: 'prose',
      title: 'Katalog Publikasi Uji',
      body: 'Katalog uji.',
      metadata: {
        publications: [
          {
            category: 'Statistik',
            title: 'Dokumen Uji',
            description: 'Deskripsi uji.',
            isAvailableOnline: false,
          },
        ],
      },
    },
  ];
}

function installFetchMock(overrides: FetchOverrides = {}) {
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/api/auth/csrf-token') {
      return json({ csrfToken: 'csrf-token' });
    }

    if (url === '/api/settings/public') {
      if (overrides.settingsGet) return overrides.settingsGet();
      return json({ settings: DEFAULT_PUBLIC_SETTINGS });
    }

    if (url === '/api/pages?include=sections') {
      return json({
        pages: [
          {
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
        ],
      });
    }

    if (url === '/api/indicators?pageSize=200') {
      return json({ indicators: [indicator], total: 1, page: 1, pageSize: 200 });
    }

    if (url === '/api/content-blocks' && init?.method === 'PATCH') {
      throw new Error('unexpected PATCH on collection url');
    }

    if (url === '/api/content-blocks') {
      return json({
        blocks: overrides.contentBlocks ? overrides.contentBlocks() : contentBlocks(),
      });
    }

    if (url.startsWith('/api/content-blocks/') && init?.method === 'PATCH') {
      const slug = decodeURIComponent(url.slice('/api/content-blocks/'.length));
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patchedBlocks.push({ slug, body });
      if (overrides.contentBlockPatch) return overrides.contentBlockPatch(slug, body);
      const stored = contentBlocks().find((block) => block.slug === slug);
      return json({ block: { ...stored, ...body, updatedAt: '2026-02-01T00:00:00.000Z' } });
    }

    if (url === '/api/indicator-tables?pageSize=200') {
      return json({ tables: [table], total: 1, page: 1, pageSize: 200 });
    }

    if (url === '/api/indicator-tables/tbl-1' && init?.method === 'PATCH') {
      if (overrides.tablePatch) {
        return overrides.tablePatch(JSON.parse(String(init.body)) as Record<string, unknown>);
      }
      return json({ table: tableDetail() });
    }

    if (url === '/api/indicator-tables/tbl-1') {
      return json({ table: tableDetail() });
    }

    if (url === '/api/comparison-templates') {
      if (overrides.templatesResponse) {
        return overrides.templatesResponse();
      }
      return json({ templates: [] });
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function tableDetail() {
  return {
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
  };
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
    resetLeafletMock();
    patchedBlocks = [];
    document.body.innerHTML = '';
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
      if (url === '/api/pages?include=sections') return json({ pages: [] });
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

  it('keeps every unsaved row draft when the table save fails', async () => {
    installFetchMock({
      tablePatch: () => json({ error: 'Baris 12 bentrok dengan data lain.' }, false, 409),
    });

    const wrapper = mountView();
    await flushPromises();

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Piramida Usia'));
    await editButton?.trigger('click');
    await flushPromises();

    await wrapper.find('#table-row-row-1-male').setValue('250');
    await wrapper.find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain(`Gagal menyimpan perubahan tabel. ${USER_MESSAGES.conflict}`);

    // The save is one atomic PATCH, so a failure wrote nothing and there is nothing to reconcile.
    // A refetch here is what used to wipe the drafts: it replaces `table`, and the form resets
    // every draft on a new table object.
    const fetchMock = globalThis.fetch as unknown as {
      mock: { calls: Array<[unknown, RequestInit | undefined]> };
    };
    const tableGets = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input) === '/api/indicator-tables/tbl-1' && init?.method !== 'PATCH',
    );
    expect(tableGets).toHaveLength(1);

    wrapper.unmount();
  });

  it('saves the table header and its rows as one batch request', async () => {
    let patchBody: Record<string, unknown> | null = null;
    installFetchMock({
      tablePatch: (body) => {
        patchBody = body;
        return json({ table: tableDetail() });
      },
    });

    const wrapper = mountView();
    await flushPromises();

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Piramida Usia'));
    await editButton?.trigger('click');
    await flushPromises();

    await wrapper.find('#table-row-row-1-male').setValue('250');
    await wrapper.find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(patchBody).toEqual({ rows: [{ id: 'row-1', male: 250 }] });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('switches to content blocks tab and lists editable content blocks', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-test="tab-konten"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Sistem Informasi Data Terpadu Kelurahan');
    expect(wrapper.text()).toContain('Sambutan Lurah Manggar');
    expect(wrapper.text()).toContain('Profil Kelurahan Manggar');

    const editHeroBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Sistem Informasi Data Terpadu'));
    expect(editHeroBtn).toBeDefined();

    wrapper.unmount();
  });

  /**
   * The dialog teleports to `<body>`; a stubbed Teleport remounts the form on every re-render,
   * which would hide the very draft-keeping behaviour these tests check. Mount attached with the
   * real Teleport and read the dialog from the body instead.
   */
  function mountAttached() {
    return mount(DataManagementView, {
      global: { plugins: [createPinia()], stubs: { RouterLink: true } },
      attachTo: document.body,
    });
  }

  function body(): DOMWrapper<HTMLElement> {
    return new DOMWrapper(document.body);
  }

  async function openBlockTab(wrapper: VueWrapper) {
    await wrapper.find('[data-test="tab-konten"]').trigger('click');
    await flushPromises();
  }

  async function openBlock(wrapper: VueWrapper, titleText: string) {
    const button = wrapper.findAll('button').find((b) => b.text().includes(titleText));
    expect(button).toBeDefined();
    await button?.trigger('click');
    await flushPromises();
  }

  it('states where each content block appears and shows no slugs or block types', async () => {
    const wrapper = mountAttached();
    await flushPromises();
    await openBlockTab(wrapper);

    const byTitle = (title: string) =>
      wrapper.findAll('article').find((card) => card.text().includes(title));

    expect(byTitle('Sistem Informasi Data Terpadu Kelurahan')?.text()).toContain(
      'Tampil di: Beranda, bagian atas',
    );
    expect(byTitle('Sambutan Lurah Manggar')?.text()).toContain(
      'Tampil di: Beranda, bagian Sambutan Lurah',
    );
    expect(byTitle('Profil Kelurahan Manggar')?.text()).toContain(
      'Tampil di: halaman Tentang Kelurahan Manggar',
    );
    expect(byTitle('Katalog Publikasi Uji')?.text()).toContain('Tampil di: halaman Publikasi');

    const highlights = byTitle('Potensi Unggulan Wilayah');
    expect(highlights?.text()).toContain('Tidak ditampilkan di situs');
    expect(highlights?.text()).not.toContain('Tampil di');

    const text = wrapper.text();
    expect(text).not.toContain('landing-hero');
    expect(text).not.toContain('Slug:');
    expect(text).not.toContain('Tipe blok');

    wrapper.unmount();
  });

  it('opens each block in its named form without a JSON editor', async () => {
    const wrapper = mountAttached();
    await flushPromises();
    await openBlockTab(wrapper);

    await openBlock(wrapper, 'Potensi Unggulan Wilayah');
    expect(body().find('[role="dialog"] input#block-item-title-0').exists()).toBe(true);
    expect(body().find('[role="dialog"] textarea#block-metadata').exists()).toBe(false);
    expect(body().find('[role="dialog"]').text()).not.toContain('landing-highlights');
    wrapper.unmount();
  });

  it('sends the block updatedAt as the stale-write precondition on every save', async () => {
    const wrapper = mountAttached();
    await flushPromises();
    await openBlockTab(wrapper);
    await openBlock(wrapper, 'Sistem Informasi Data Terpadu');

    await body().find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(patchedBlocks).toHaveLength(1);
    expect(patchedBlocks[0]?.slug).toBe('landing-hero');
    expect(patchedBlocks[0]?.body.expectedUpdatedAt).toBe(CREATED);
    expect(body().find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the whole draft when a block save is refused as stale, and reloads only on request', async () => {
    let newer = false;
    installFetchMock({
      contentBlocks: () =>
        contentBlocks().map((block) =>
          newer && block.slug === 'landing-hero'
            ? {
                ...block,
                body: 'Isi terbaru dari orang lain.',
                updatedAt: '2026-01-15T00:00:00.000Z',
              }
            : block,
        ),
      contentBlockPatch: () => {
        newer = true;
        return json(
          {
            error: 'Blok konten telah diubah oleh pengguna lain. Muat ulang data lalu coba lagi.',
            code: 'STALE_WRITE',
            details: { currentUpdatedAt: '2026-01-15T00:00:00.000Z' },
          },
          false,
          409,
        );
      },
    });

    const wrapper = mountAttached();
    await flushPromises();
    await openBlockTab(wrapper);
    await openBlock(wrapper, 'Sistem Informasi Data Terpadu');

    await body().find('#block-title').setValue('Judul draf saya');
    await body().find('#block-body').setValue('Isi draf saya yang panjang.');
    await body().find('#block-backgroundImage').setValue('/img/draf.jpg');
    await body().find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    const dialog = body().find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain('baru saja diubah oleh orang lain');
    expect(dialog.text()).not.toContain('409');
    expect(dialog.text()).not.toContain('STALE_WRITE');
    expect((body().find('#block-title').element as HTMLInputElement).value).toBe('Judul draf saya');
    expect((body().find('#block-body').element as HTMLTextAreaElement).value).toBe(
      'Isi draf saya yang panjang.',
    );
    expect((body().find('#block-backgroundImage').element as HTMLInputElement).value).toBe(
      '/img/draf.jpg',
    );

    // The draft survives the background refresh too; nothing was swapped in yet.
    expect((body().find('#block-body').element as HTMLTextAreaElement).value).toBe(
      'Isi draf saya yang panjang.',
    );

    await body().find('[data-test="block-reload"]').trigger('click');
    await flushPromises();

    expect((body().find('#block-body').element as HTMLTextAreaElement).value).toBe(
      'Isi terbaru dari orang lain.',
    );
    expect(body().find('[data-test="block-stale-notice"]').exists()).toBe(false);

    // A save after reloading carries the new token.
    await body().find('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(patchedBlocks[patchedBlocks.length - 1]?.body.expectedUpdatedAt).toBe(
      '2026-01-15T00:00:00.000Z',
    );

    wrapper.unmount();
  });

  it('keeps every field and shows a plain message when a block save fails', async () => {
    installFetchMock({
      contentBlockPatch: () => json({ error: 'boom' }, false, 500),
    });
    const wrapper = mountAttached();
    await flushPromises();
    await openBlockTab(wrapper);
    await openBlock(wrapper, 'Potensi Unggulan Wilayah');

    await body().find('#block-item-title-0').setValue('Judul diubah');
    await body().find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    const dialog = body().find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain('Perubahan belum tersimpan');
    expect(dialog.text()).not.toContain('boom');
    expect((body().find('#block-item-title-0').element as HTMLInputElement).value).toBe(
      'Judul diubah',
    );
    expect(body().find('[data-test="block-stale-notice"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves highlight rows and an emptied publication catalog through the block endpoint', async () => {
    const wrapper = mountAttached();
    await flushPromises();
    await openBlockTab(wrapper);

    await openBlock(wrapper, 'Potensi Unggulan Wilayah');
    await body()
      .findAll('button')
      .find((b) => b.text() === 'Tambah poin')
      ?.trigger('click');
    await body().find('#block-item-title-1').setValue('Poin Dua');
    await body().find('#block-item-desc-1').setValue('Deskripsi dua');
    await body().find('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(patchedBlocks[0]?.slug).toBe('landing-highlights');
    expect(patchedBlocks[0]?.body.metadata).toEqual({
      items: [
        { title: 'Poin Satu', desc: 'Deskripsi satu' },
        { title: 'Poin Dua', desc: 'Deskripsi dua' },
      ],
    });

    await openBlock(wrapper, 'Katalog Publikasi Uji');
    await body().find('#block-pub-remove-0').trigger('click');
    await body().find('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(patchedBlocks[1]?.slug).toBe('publikasi-katalog');
    expect(patchedBlocks[1]?.body.metadata).toEqual({ publications: [] });

    wrapper.unmount();
  });

  it('hides public settings tab from non-admin editors', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore();
    authStore.setAuth({ id: '2', email: 'editor@example.com', role: 'editor' }, 'token');

    const wrapper = mount(DataManagementView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: true, teleport: true },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-test="tab-pengaturan"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('switches to public settings tab and displays public settings card for admins', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore();
    authStore.setAuth({ id: '1', email: 'admin@example.com', role: 'admin' }, 'token');

    const wrapper = mount(DataManagementView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: true, teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find('[data-test="tab-pengaturan"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Pengaturan Publik Portal');
    expect(wrapper.text()).toContain('Kelurahan Manggar');

    wrapper.unmount();
  });

  it('does not render template-error note in scalar form when an earlier admin page fetch failed', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const templatesStore = useComparisonTemplatesStore();
    templatesStore.error = 'Gagal memuat daftar templat kalimat dari admin page';

    const wrapper = mount(DataManagementView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: true, teleport: true },
      },
    });
    await flushPromises();

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Total Penduduk'));
    await editButton?.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-test="template-error"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders template-error note in scalar form when the form's own template fetch fails", async () => {
    installFetchMock({
      templatesResponse: () => json({ error: 'Server error' }, false, 500),
    });

    const wrapper = mountView();
    await flushPromises();

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Total Penduduk'));
    await editButton?.trigger('click');
    await flushPromises();

    const errorNote = wrapper.find('[data-test="template-error"]');
    expect(errorNote.exists()).toBe(true);
    expect(errorNote.text()).toContain('Gagal memuat daftar templat kalimat.');
    wrapper.unmount();
  });

  it('forces a fresh template fetch when opening scalar forms', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const templatesStore = useComparisonTemplatesStore();
    const fetchSpy = vi.spyOn(templatesStore, 'fetchTemplates');

    const wrapper = mount(DataManagementView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: true, teleport: true },
      },
    });
    await flushPromises();

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Total Penduduk'));
    await editButton?.trigger('click');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith({ force: true, forSelector: true });

    wrapper.unmount();
  });

  it('keeps public settings form mounted and interactive during background loading, closing without discard prompt', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore();
    authStore.setAuth({ id: '1', email: 'admin@example.com', role: 'admin' }, 'token');

    const settingsStore = useSettingsStore();
    settingsStore.settings = { ...DEFAULT_PUBLIC_SETTINGS };
    settingsStore.isLoaded = true;

    const wrapper = mount(DataManagementView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: true, teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find('[data-test="tab-pengaturan"]').trigger('click');
    await flushPromises();

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Edit'));
    await editBtn?.trigger('click');
    await flushPromises();

    const form = wrapper.findComponent({ name: 'PublicSettingsForm' });
    expect(form.exists()).toBe(true);

    // Simulate background refresh starting
    settingsStore.isLoading = true;
    await flushPromises();

    // The form should stay mounted and NOT be marked busy
    expect(wrapper.findComponent({ name: 'PublicSettingsForm' }).exists()).toBe(true);
    expect(form.props('busy')).toBe(false);

    // Closing an untouched form while loading should close cleanly without prompt
    const cancelBtn = form.findAll('button').find((b) => b.text() === 'Batal');
    await cancelBtn?.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-test="settings-discard-prompt"]').exists()).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    wrapper.unmount();
  });

  async function mountAdmin(settingsGet?: () => Promise<Response> | Response) {
    if (settingsGet) installFetchMock({ settingsGet });
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore();
    authStore.setAuth({ id: '1', email: 'admin@example.com', role: 'admin' }, 'token');
    const wrapper = mount(DataManagementView, {
      global: { plugins: [pinia], stubs: { RouterLink: true, teleport: true } },
    });
    await flushPromises();
    await wrapper.find('[data-test="tab-pengaturan"]').trigger('click');
    await flushPromises();
    return wrapper;
  }

  async function clickEdit(wrapper: Awaited<ReturnType<typeof mountAdmin>>) {
    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Edit'));
    await editBtn?.trigger('click');
    await flushPromises();
  }

  it('refuses to open the settings dialog while settings load, then opens once loaded', async () => {
    let resolveSettings!: (r: Response) => void;
    const wrapper = await mountAdmin(
      () => new Promise<Response>((resolve) => (resolveSettings = resolve)),
    );

    await clickEdit(wrapper);

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'PublicSettingsForm' }).exists()).toBe(false);
    expect(wrapper.find('[data-test="page-message"]').text()).toContain(
      'Pengaturan publik masih dimuat',
    );

    resolveSettings(json({ settings: DEFAULT_PUBLIC_SETTINGS }));
    await flushPromises();
    await clickEdit(wrapper);

    expect(wrapper.findComponent({ name: 'PublicSettingsForm' }).exists()).toBe(true);
    wrapper.unmount();
  });

  it('refuses to open the settings dialog when settings failed to load and shows the error on the page', async () => {
    const wrapper = await mountAdmin(() => Promise.reject(new Error('Network failure')));

    await clickEdit(wrapper);

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'PublicSettingsForm' }).exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').text()).toContain('Gagal memuat pengaturan publik');
    wrapper.unmount();
  });
});
