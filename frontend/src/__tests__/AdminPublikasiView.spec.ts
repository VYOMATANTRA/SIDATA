import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import AdminPublikasiView from '../views/AdminPublikasiView.vue';
import { useAuthStore } from '../stores/auth';
import type { ContentBlock } from '../stores/contentBlocks.store';

type Pub = Record<string, unknown>;

/** The publications sent by the first save; fails the test when no save was sent. */
function sentList(index = 0): Pub[] {
  const body = putBodies[index];
  if (!body) throw new Error('no save was sent');
  return body.publications as Pub[];
}

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function pub(overrides: Pub = {}): Pub {
  return {
    category: 'Statistik',
    title: 'Dokumen A',
    description: 'Deskripsi A.',
    isAvailableOnline: false,
    ...overrides,
  };
}

function catalogBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: 'b-pub',
    sectionId: null,
    type: 'prose',
    slug: 'publikasi-katalog',
    title: 'Katalog Uji',
    body: 'Narasi uji.',
    metadata: { publications: [pub()] },
    sortOrder: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

let stored: ContentBlock;
let putBodies: Array<Record<string, unknown>>;
/** Answers a PUT; the default stores what was sent and returns the new token. */
let putResponse: (body: Record<string, unknown>) => Response;
let blocksGet: () => Response | Promise<Response>;
const mounted: VueWrapper[] = [];

function installFetch(): void {
  putBodies = [];
  putResponse = (body) =>
    json({
      block: {
        ...stored,
        title: body.title,
        body: body.body,
        metadata: { publications: body.publications },
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    });
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
    if (method === 'GET' && url === '/api/content-blocks') return blocksGet();
    if (method === 'PUT' && url === '/api/publikasi/catalog') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      putBodies.push(body);
      return putResponse(body);
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}

async function mountView(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth({ id: '1', email: 'editor@example.com', role: 'editor' }, 'token');
  const wrapper = mount(AdminPublikasiView, {
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

/** Dialogs are teleported to <body>, so they are read from the document. */
function dialogRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function field(selector: string): HTMLInputElement | HTMLTextAreaElement {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!element) throw new Error(`no field ${selector}`);
  return element;
}

async function typeInto(selector: string, value: string): Promise<void> {
  const element = field(selector);
  element.value = value;
  element.dispatchEvent(new Event('input'));
  await nextTick();
}

async function submitDialogForm(): Promise<void> {
  const form = document.querySelector<HTMLFormElement>('[role="dialog"] form');
  if (!form) throw new Error('no form in the dialog');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await flushPromises();
}

function buttonIn(root: ParentNode, label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    (button.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(label),
  );
  if (!found) throw new Error(`no button starting with "${label}"`);
  return found;
}

async function clickPage(wrapper: VueWrapper, selector: string): Promise<void> {
  await wrapper.find(selector).trigger('click');
  await flushPromises();
}

async function clickDialogButton(label: string): Promise<void> {
  const root = dialogRoot() ?? document.body;
  buttonIn(root, label).click();
  await flushPromises();
}

describe('AdminPublikasiView', () => {
  beforeEach(() => {
    stored = catalogBlock();
    blocksGet = () => json({ blocks: [stored] });
    installFetch();
  });

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('when the catalog cannot be loaded', () => {
    const RETRY = '[data-test="publikasi-unavailable"] [data-test="alert-banner-retry"]';

    it('shows the failure with a retry for a server error and none for a forbidden one', async () => {
      blocksGet = () => json({ error: 'x' }, 500);
      const wrapper = await mountView();
      expect(wrapper.find(RETRY).exists()).toBe(true);
      wrapper.unmount();

      blocksGet = () => json({ error: 'x' }, 403);
      const forbidden = await mountView();
      expect(forbidden.find('[data-test="publikasi-unavailable"]').exists()).toBe(true);
      expect(forbidden.find(RETRY).exists()).toBe(false);
    });

    it('keeps the banner mounted, with its retry busy, while the retry runs', async () => {
      blocksGet = () => json({ error: 'x' }, 500);
      const wrapper = await mountView();

      blocksGet = () => new Promise<Response>(() => {});
      await wrapper.find(RETRY).trigger('click');
      await flushPromises();

      const banner = wrapper.find('[data-test="publikasi-unavailable"]');
      expect(banner.exists()).toBe(true);
      expect(banner.text()).not.toContain('Memuat katalog publikasi');
      expect((wrapper.find(RETRY).element as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows the grid once a retry succeeds', async () => {
      blocksGet = () => json({ error: 'x' }, 500);
      const wrapper = await mountView();

      blocksGet = () => json({ blocks: [stored] });
      await wrapper.find(RETRY).trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="publication-grid"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="publikasi-unavailable"]').exists()).toBe(false);
    });

    it('says so plainly when the catalog block does not exist', async () => {
      stored = catalogBlock({ slug: 'lain' });
      const wrapper = await mountView();
      expect(wrapper.find('[data-test="publikasi-unavailable"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="publication-grid"]').exists()).toBe(false);
    });
  });

  describe('grid', () => {
    it('shows one card per publication with its page count and month', async () => {
      stored = catalogBlock({
        metadata: {
          publications: [pub({ pageCount: 12, publishedAt: '2026-03-15', title: 'Laporan' })],
        },
      });
      const wrapper = await mountView();
      const cards = wrapper.findAll('[data-test="publication-grid"] > li');
      expect(cards).toHaveLength(1);
      expect(wrapper.find('[data-test="card-meta"]').text()).toBe(
        '12 Halaman, Diterbitkan Maret 2026',
      );
      expect(wrapper.find('h2').text()).toBe('Katalog Uji');
    });

    it('says a saved empty catalog is empty, with no cards', async () => {
      stored = catalogBlock({ metadata: { publications: [] } });
      const wrapper = await mountView();
      expect(wrapper.find('[data-test="publications-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="publication-grid"]').exists()).toBe(false);
    });

    it('searches title, category and description', async () => {
      stored = catalogBlock({
        metadata: {
          publications: [
            pub({ title: 'Dokumen A' }),
            pub({ title: 'Peta Wilayah', category: 'Infografis', description: 'Batas RT' }),
          ],
        },
      });
      const wrapper = await mountView();
      const search = wrapper.find('input#publikasi-search');
      await search.setValue('infografis');
      expect(wrapper.find('[data-test="result-count"]').text()).toBe(
        'Menampilkan 1 dari 2 publikasi',
      );
      await search.setValue('batas rt');
      expect(wrapper.findAll('[data-test="publication-grid"] > li')).toHaveLength(1);
      await search.setValue('tidak ada');
      expect(wrapper.find('[data-test="publications-no-match"]').exists()).toBe(true);
    });

    it('filters by category, offering each category once in order', async () => {
      stored = catalogBlock({
        metadata: {
          publications: [
            pub({ title: 'Satu', category: 'Statistik' }),
            pub({ title: 'Dua', category: 'Infografis' }),
            pub({ title: 'Tiga', category: 'Statistik' }),
          ],
        },
      });
      const wrapper = await mountView();
      const options = wrapper.findAll('select#publikasi-category option').map((o) => o.text());
      expect(options).toEqual(['Semua Kategori', 'Infografis', 'Statistik']);

      await wrapper.find('select#publikasi-category').setValue('Statistik');
      expect(wrapper.findAll('[data-test="publication-grid"] > li')).toHaveLength(2);
    });

    it('turns reordering off while a search or filter hides rows', async () => {
      stored = catalogBlock({
        metadata: { publications: [pub({ title: 'Satu' }), pub({ title: 'Dua' })] },
      });
      const wrapper = await mountView();
      expect(wrapper.find('[data-test="card-move-down"]').attributes('disabled')).toBeUndefined();

      await wrapper.find('input#publikasi-search').setValue('dua');
      expect(wrapper.find('[data-test="card-move-down"]').attributes('disabled')).toBeDefined();
    });

    it('stops adding at 25 publications', async () => {
      stored = catalogBlock({
        metadata: {
          publications: Array.from({ length: 25 }, (_, i) => pub({ title: `Dokumen ${i}` })),
        },
      });
      const wrapper = await mountView();
      expect(wrapper.find('[data-test="publikasi-add"]').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-test="publications-full"]').text()).toContain('25 publikasi');
    });
  });

  describe('saving one publication', () => {
    it('adds a publication, saves the whole list with the stored token and closes', async () => {
      const wrapper = await mountView();
      await clickPage(wrapper, '[data-test="publikasi-add"]');
      expect(dialogRoot()?.querySelector('h2')?.textContent).toBe('Tambah publikasi');

      await typeInto('#publikasi-item-category', 'Lain');
      await typeInto('#publikasi-item-title', 'Dokumen Baru');
      await typeInto('#publikasi-item-description', 'Deskripsi baru');
      await submitDialogForm();

      expect(putBodies).toHaveLength(1);
      expect(putBodies[0]).toMatchObject({
        title: 'Katalog Uji',
        body: 'Narasi uji.',
        expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
      });
      expect(sentList().map((p) => p.title)).toEqual([
        'Dokumen A',
        'Dokumen Baru',
      ]);
      expect(dialogRoot()).toBeNull();
      expect(wrapper.find('[data-test="publikasi-status"]').text()).toBe(
        'Publikasi “Dokumen Baru” ditambahkan.',
      );
    });

    it('edits one publication and leaves the others as stored', async () => {
      stored = catalogBlock({
        metadata: {
          publications: [pub({ title: 'Satu' }), pub({ title: 'Dua', pageCount: 7 })],
        },
      });
      const wrapper = await mountView();
      await clickPage(wrapper, '#publikasi-card-1-edit');
      expect(dialogRoot()?.querySelector('h2')?.textContent).toBe('Ubah publikasi');
      expect(field('#publikasi-item-pageCount').value).toBe('7');

      await typeInto('#publikasi-item-title', 'Dua (revisi)');
      await submitDialogForm();

      const sent = sentList();
      expect(sent[0]).toEqual(pub({ title: 'Satu' }));
      expect(sent[1]).toMatchObject({ title: 'Dua (revisi)', pageCount: 7 });
    });

    it('deletes only after the confirmation, and cancelling sends nothing', async () => {
      stored = catalogBlock({
        metadata: { publications: [pub({ title: 'Satu' }), pub({ title: 'Dua' })] },
      });
      const wrapper = await mountView();

      await clickPage(wrapper, '#publikasi-card-0-delete');
      expect(dialogRoot()?.querySelector('h2')?.textContent).toBe('Hapus publikasi?');
      await clickDialogButton('Batal');
      expect(putBodies).toHaveLength(0);

      await clickPage(wrapper, '#publikasi-card-0-delete');
      await clickDialogButton('Hapus “Satu”');
      expect(putBodies).toHaveLength(1);
      expect(sentList().map((p) => p.title)).toEqual(['Dua']);
      expect(wrapper.find('[data-test="publikasi-status"]').text()).toBe(
        'Publikasi “Satu” dihapus.',
      );
    });

    it('moves a publication down and saves the new order', async () => {
      stored = catalogBlock({
        metadata: { publications: [pub({ title: 'Satu' }), pub({ title: 'Dua' })] },
      });
      const wrapper = await mountView();
      await clickPage(wrapper, '#publikasi-card-0-down');

      expect(sentList().map((p) => p.title)).toEqual(['Dua', 'Satu']);
      expect(wrapper.find('[data-test="publikasi-status"]').text()).toBe(
        'Publikasi “Satu” dipindah ke posisi 2.',
      );
    });

    it('keeps the draft and offers the latest version after a stale write', async () => {
      const wrapper = await mountView();
      putResponse = () =>
        json(
          { error: 'Katalog publikasi telah diubah oleh pengguna lain.', code: 'STALE_WRITE' },
          409,
        );
      await clickPage(wrapper, '#publikasi-card-0-edit');
      await typeInto('#publikasi-item-title', 'Judul draf');
      await submitDialogForm();

      expect(dialogRoot()).not.toBeNull();
      expect(field('#publikasi-item-title').value).toBe('Judul draf');
      expect(dialogRoot()?.querySelector('[data-test="dialog-error"]')).not.toBeNull();
      expect(dialogRoot()?.querySelector('[data-test="catalog-reload"]')).not.toBeNull();

      stored = catalogBlock({
        updatedAt: '2026-09-03T00:00:00.000Z',
        metadata: { publications: [pub({ title: 'Dokumen Baru' })] },
      });
      await clickDialogButton('Muat versi terbaru');

      expect(dialogRoot()).toBeNull();
      expect(wrapper.find('[data-test="card-edit"]').exists()).toBe(true);
      expect(wrapper.find('h3').text()).toBe('Dokumen Baru');
    });

    it('keeps every field when the save fails for another reason', async () => {
      const wrapper = await mountView();
      putResponse = () => json({ error: 'Terjadi kesalahan internal server' }, 500);
      await clickPage(wrapper, '#publikasi-card-0-edit');
      await typeInto('#publikasi-item-title', 'Judul draf');
      await submitDialogForm();

      expect(field('#publikasi-item-title').value).toBe('Judul draf');
      expect(dialogRoot()?.querySelector('[data-test="dialog-error"]')).not.toBeNull();
      expect(dialogRoot()?.querySelector('[data-test="catalog-reload"]')).toBeNull();
    });

    it('shows a page-level error when a move fails and no dialog is open', async () => {
      stored = catalogBlock({
        metadata: { publications: [pub({ title: 'Satu' }), pub({ title: 'Dua' })] },
      });
      const wrapper = await mountView();
      putResponse = () => json({ error: 'Terjadi kesalahan internal server' }, 500);
      await clickPage(wrapper, '#publikasi-card-0-down');

      expect(wrapper.find('[data-test="page-error"]').exists()).toBe(true);
      expect(dialogRoot()).toBeNull();
    });
  });

  describe('catalog title and intro', () => {
    it('saves a changed title and intro and keeps the publications', async () => {
      const wrapper = await mountView();
      await clickPage(wrapper, '[data-test="info-open"]');
      await typeInto('#publikasi-katalog-title', 'Katalog Baru');
      await typeInto('#publikasi-katalog-body', 'Pengantar baru.');
      await submitDialogForm();

      expect(putBodies[0]).toMatchObject({
        title: 'Katalog Baru',
        body: 'Pengantar baru.',
        publications: [pub()],
      });
      expect(wrapper.find('h2').text()).toBe('Katalog Baru');
    });

    it('requires the title and sends nothing without it', async () => {
      const wrapper = await mountView();
      await clickPage(wrapper, '[data-test="info-open"]');
      await typeInto('#publikasi-katalog-title', '   ');
      await submitDialogForm();

      expect(putBodies).toHaveLength(0);
      expect(dialogRoot()?.textContent).toContain('Judul katalog wajib diisi.');
      expect(wrapper.find('h2').text()).toBe('Katalog Uji');
    });
  });
});
