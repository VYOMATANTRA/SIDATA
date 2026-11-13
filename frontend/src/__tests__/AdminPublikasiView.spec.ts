import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AdminPublikasiView from '../views/AdminPublikasiView.vue';
import { useAuthStore } from '../stores/auth';
import type { ContentBlock } from '../stores/contentBlocks.store';

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function catalogBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: 'b-pub',
    sectionId: null,
    type: 'prose',
    slug: 'publikasi-katalog',
    title: 'Katalog Uji',
    body: 'Narasi uji.',
    metadata: {
      publications: [
        {
          category: 'Statistik',
          title: 'Dokumen A',
          description: 'Deskripsi A.',
          isAvailableOnline: false,
        },
      ],
    },
    sortOrder: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

let stored: ContentBlock;
let putBodies: Array<Record<string, unknown>>;
let putResponse: () => Response;

function installFetch(): void {
  putBodies = [];
  putResponse = () => json({ block: { ...stored, updatedAt: '2026-09-02T00:00:00.000Z' } });
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
    if (method === 'GET' && url === '/api/content-blocks') return json({ blocks: [stored] });
    if (method === 'PUT' && url === '/api/publikasi/catalog') {
      putBodies.push(JSON.parse(String(init?.body)));
      return putResponse();
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}

async function mountView(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth({ id: '1', email: 'editor@example.com', role: 'editor' }, 'token');
  const wrapper = mount(AdminPublikasiView, { global: { plugins: [pinia] } });
  await flushPromises();
  return wrapper;
}

describe('AdminPublikasiView', () => {
  beforeEach(() => {
    stored = catalogBlock();
    installFetch();
  });

  it('loads the stored catalog into the form', async () => {
    const wrapper = await mountView();
    expect((wrapper.find('input#publikasi-pub-title-0').element as HTMLInputElement).value).toBe(
      'Dokumen A',
    );
    expect(wrapper.find('[data-test="block-placement"]').text()).toContain('halaman Publikasi');
  });

  it('saves through the catalog endpoint with the stored token and announces it', async () => {
    const wrapper = await mountView();
    await wrapper.find('input#publikasi-pub-title-0').setValue('Dokumen A (revisi)');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(putBodies).toHaveLength(1);
    expect(putBodies[0]).toMatchObject({
      title: 'Katalog Uji',
      body: 'Narasi uji.',
      expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
      publications: [{ title: 'Dokumen A (revisi)', isAvailableOnline: false }],
    });
    expect(wrapper.find('[data-test="publikasi-status"]').text()).toBe(
      'Katalog publikasi disimpan.',
    );
  });

  it('keeps the draft and offers the latest version after a stale write', async () => {
    const wrapper = await mountView();
    putResponse = () =>
      json(
        { error: 'Katalog publikasi telah diubah oleh pengguna lain.', code: 'STALE_WRITE' },
        409,
      );
    await wrapper.find('input#publikasi-pub-title-0').setValue('Judul draf');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect((wrapper.find('input#publikasi-pub-title-0').element as HTMLInputElement).value).toBe(
      'Judul draf',
    );
    expect(wrapper.find('[data-test="block-stale-notice"]').exists()).toBe(true);

    stored = catalogBlock({
      updatedAt: '2026-09-03T00:00:00.000Z',
      metadata: {
        publications: [
          {
            category: 'Statistik',
            title: 'Dokumen Baru',
            description: 'D.',
            isAvailableOnline: false,
          },
        ],
      },
    });
    await wrapper.find('[data-test="block-reload"]').trigger('click');
    await flushPromises();
    expect((wrapper.find('input#publikasi-pub-title-0').element as HTMLInputElement).value).toBe(
      'Dokumen Baru',
    );
    expect(wrapper.find('[data-test="block-stale-notice"]').exists()).toBe(false);
  });

  it('keeps every field when the save fails for another reason', async () => {
    const wrapper = await mountView();
    putResponse = () => json({ error: 'Terjadi kesalahan internal server' }, 500);
    await wrapper.find('input#publikasi-pub-title-0').setValue('Judul draf');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect((wrapper.find('input#publikasi-pub-title-0').element as HTMLInputElement).value).toBe(
      'Judul draf',
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it('says so plainly when the catalog block does not exist', async () => {
    stored = catalogBlock({ slug: 'lain' });
    const wrapper = await mountView();
    expect(wrapper.find('[data-test="publikasi-unavailable"]').exists()).toBe(true);
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
