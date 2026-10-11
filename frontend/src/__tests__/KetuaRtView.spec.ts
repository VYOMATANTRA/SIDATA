import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import KetuaRtView from '../views/KetuaRtView.vue';
import type { RtLeader } from '../stores/rtLeaders.store';

const ROSTER_SIZE = 100;

function buildRoster(): RtLeader[] {
  return Array.from({ length: ROSTER_SIZE }, (_, index) => {
    const rtNumber = index + 1;
    return {
      rtNumber,
      name: `Ketua RT ${rtNumber}`,
      // International format, as stored by the survey import.
      phone: `+62 811-0000-${String(rtNumber).padStart(4, '0')}`,
      phoneIsWhatsapp: rtNumber % 2 === 1,
      alamat: rtNumber % 3 === 0 ? null : `Jl. Mulawarman RT ${rtNumber}`,
      coordinates: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  });
}

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/ketua-rt', component: KetuaRtView },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

async function mountReady() {
  const { pinia, router } = mountView();
  await router.push('/ketua-rt');
  await router.isReady();

  const wrapper = mount(KetuaRtView, { global: { plugins: [pinia, router] } });
  await flushPromises();

  return wrapper;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ leaders: buildRoster(), total: ROSTER_SIZE }),
    } as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KetuaRtView accessibility, search, and contact rendering', () => {
  it('renders landmarks, skip link, a single h1, and a breadcrumb', async () => {
    const wrapper = await mountReady();

    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);
    expect(wrapper.findAll('main#main-content').length).toBe(1);
    expect(wrapper.find('footer').exists()).toBe(true);

    const h1s = wrapper.findAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.text()).toContain('Ketua RT Kelurahan Manggar');

    const breadcrumb = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Beranda');
    expect(breadcrumb.text()).toContain('Ketua RT');
  });

  it('iterates the roster through one request capped at 100 leaders', async () => {
    await mountReady();

    const calledUrl = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/api/maps/rt-leaders');
    // DEFAULT_PAGE_SIZE is 10, so the explicit limit is load-bearing.
    expect(calledUrl).toContain('limit=100');
  });

  it('renders a semantic table for all 100 RTs, sorted by RT number', async () => {
    const wrapper = await mountReady();

    const table = wrapper.find('table');
    expect(table.exists()).toBe(true);
    expect(table.find('caption').exists()).toBe(true);

    const colHeaders = table.findAll('th[scope="col"]');
    expect(colHeaders).toHaveLength(4);
    expect(colHeaders.map((node) => node.text())).toEqual([
      'No. RT',
      'Nama Ketua RT',
      'Kontak',
      'Alamat',
    ]);

    const rowHeaders = table.findAll('tbody th[scope="row"]');
    expect(rowHeaders).toHaveLength(ROSTER_SIZE);
    expect(rowHeaders[0]?.text()).toBe('1');
    expect(rowHeaders[ROSTER_SIZE - 1]?.text()).toBe(String(ROSTER_SIZE));
  });

  it('announces the live row count for the unfiltered default state', async () => {
    const wrapper = await mountReady();

    const count = wrapper.find('[data-test="rt-count"]');
    expect(count.exists()).toBe(true);
    expect(count.attributes('aria-live')).toBe('polite');
    expect(count.text()).toBe('Menampilkan 100 dari 100 RT');
  });

  it('filters by RT number, including zero-padded input', async () => {
    const wrapper = await mountReady();
    const search = wrapper.find('[data-test="rt-search"]');

    // The label is programmatically associated with the input
    expect(wrapper.find('label[for="rt-search"]').exists()).toBe(true);
    expect(search.attributes('id')).toBe('rt-search');

    await search.setValue('007');
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(1);
    expect(wrapper.find('tbody th[scope="row"]').text()).toBe('7');
    expect(wrapper.find('[data-test="rt-count"]').text()).toBe('Menampilkan 1 dari 100 RT');
  });

  it('filters by leader name, case-insensitively', async () => {
    const wrapper = await mountReady();

    await wrapper.find('[data-test="rt-search"]').setValue('ketua rt 42');
    const rows = wrapper.findAll('tbody th[scope="row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toBe('42');
  });

  it('renders WhatsApp deep links and tel: links based on phoneIsWhatsapp', async () => {
    const wrapper = await mountReady();

    // RT 1 is flagged as WhatsApp
    const whatsappLinks = wrapper.findAll('a[href^="https://wa.me/"]');
    expect(whatsappLinks.length).toBeGreaterThan(0);
    expect(wrapper.find('a[href="https://wa.me/6281100000001"]').exists()).toBe(true);
    const whatsappLink = wrapper.find('a[href="https://wa.me/6281100000001"]');
    expect(whatsappLink.attributes('target')).toBe('_blank');
    expect(whatsappLink.attributes('rel')).toContain('noopener');
    expect(whatsappLink.attributes('rel')).toContain('noreferrer');

    // RT 2 is not
    expect(wrapper.find('a[href="tel:6281100000002"]').exists()).toBe(true);
  });

  it('normalises local 08… numbers to an international wa.me link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          // The seeded roster stores local-format numbers like this one.
          leaders: [
            {
              rtNumber: 1,
              name: 'Bambang Supriyanto',
              phone: '081234567801',
              phoneIsWhatsapp: true,
              alamat: 'Jl. Mulawarman No. 12',
              coordinates: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 1,
        }),
      } as Response),
    );

    const wrapper = await mountReady();

    // wa.me needs the country code, so 08… becomes 628…
    expect(wrapper.find('a[href="https://wa.me/6281234567801"]').exists()).toBe(true);
    // …while the cell groups the local number the way the source list does
    expect(wrapper.find('tbody tr').text()).toContain('0812 3456 7801');
  });

  it('drops the Alamat column entirely when no leader has an address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          // The kelurahan's own RT roster carries names and phones only.
          leaders: buildRoster().map((leader) => ({ ...leader, alamat: null })),
          total: ROSTER_SIZE,
        }),
      } as Response),
    );

    const wrapper = await mountReady();

    const colHeaders = wrapper.findAll('th[scope="col"]');
    expect(colHeaders).toHaveLength(3);
    expect(colHeaders.map((node) => node.text())).toEqual(['No. RT', 'Nama Ketua RT', 'Kontak']);
    // No column means no stray em dashes
    expect(wrapper.find('tbody').text()).not.toContain('—');
  });

  it('handles a missing alamat without breaking the row', async () => {
    const wrapper = await mountReady();

    // RT 3 has alamat: null
    await wrapper.find('[data-test="rt-search"]').setValue('3');
    const row = wrapper.find('tbody tr');
    expect(row.text()).toContain('—');
  });

  it('shows a recoverable empty state when nothing matches', async () => {
    const wrapper = await mountReady();

    await wrapper.find('[data-test="rt-search"]').setValue('zzzz');
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(0);

    const empty = wrapper.find('[data-test="rt-empty"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('Tidak ada RT yang cocok dengan');
    expect(wrapper.find('[data-test="rt-count"]').text()).toBe('Menampilkan 0 dari 100 RT');

    // "Hapus filter" restores the full table
    const clearButton = empty.find('button');
    expect(clearButton.text()).toContain('Hapus filter');
    await clearButton.trigger('click');
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(ROSTER_SIZE);
  });

  it('surfaces a retryable error state instead of an empty table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 500 } as Response),
    );

    const wrapper = await mountReady();

    const error = wrapper.find('[data-test="rt-error"]');
    expect(error.exists()).toBe(true);
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('Gagal memuat data Ketua RT');
    expect(error.find('button').text()).toContain('Coba lagi');
    // The table is not rendered while errored
    expect(wrapper.find('table').exists()).toBe(false);
  });
});
