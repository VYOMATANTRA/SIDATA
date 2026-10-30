import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import KetuaRtView from '../views/KetuaRtView.vue';
import type { RtLeader } from '../stores/rtLeaders.store';

const ROSTER_SIZE = 100;
/** The page's default page size, matching the view's initial `pageSize`. */
const DEFAULT_PAGE_SIZE = 10;

function buildRoster(sample = false): RtLeader[] {
  return Array.from({ length: ROSTER_SIZE }, (_, index) => {
    const rtNumber = index + 1;
    return {
      rtNumber,
      name: sample ? `Ketua RT ${String(rtNumber).padStart(2, '0')}` : `Ketua RT ${rtNumber}`,
      // When sample=true, phone is non-dialable placeholder
      phone: sample ? '—' : `+62 811-0000-${String(rtNumber).padStart(4, '0')}`,
      phoneIsWhatsapp: !sample && rtNumber % 2 === 1,
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

  it('renders a semantic table with the roster sorted by RT number', async () => {
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

    // The default page size is 10, so the first page holds the first 10 RTs —
    // still in RT-number order, and still the same rows the API returned.
    const rowHeaders = table.findAll('tbody th[scope="row"]');
    expect(rowHeaders).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(rowHeaders[0]?.text()).toBe('1');
    expect(rowHeaders[DEFAULT_PAGE_SIZE - 1]?.text()).toBe(String(DEFAULT_PAGE_SIZE));
  });

  it('paginates the roster client-side with a page-size control', async () => {
    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="rt-pagination"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="page-size-select"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navigasi halaman tabel Ketua RT"]').exists()).toBe(true);

    // Every leader is still loaded in one request — paging is client-side only.
    const calledUrl = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(calledUrl).toContain('limit=100');

    // The first page holds 10 rows; the summary names the visible slice.
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(wrapper.find('[data-test="pagination-summary"]').text()).toContain('1–10');
    expect(wrapper.find('[data-test="pagination-summary"]').text()).toContain('100');
  });

  it('moves between pages and back to the full roster with the page-size control', async () => {
    const wrapper = await mountReady();

    const next = wrapper.find('[data-test="pagination-next"]');
    await next.trigger('click');
    expect(wrapper.findAll('tbody th[scope="row"]')[0]?.text()).toBe('11');
    expect(wrapper.find('[data-test="rt-count"]').text()).toBe('Menampilkan 11–20 dari 100 RT');

    await wrapper.find('[data-test="pagination-prev"]').trigger('click');
    expect(wrapper.findAll('tbody th[scope="row"]')[0]?.text()).toBe('1');

    // Widening the page size shows every loaded row again.
    await wrapper.find('[data-test="page-size-select"]').setValue('100');
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(ROSTER_SIZE);
    expect(wrapper.find('[data-test="rt-count"]').text()).toBe('Menampilkan 100 dari 100 RT');
  });

  it('announces the live row count for the unfiltered default state', async () => {
    const wrapper = await mountReady();

    const count = wrapper.find('[data-test="rt-count"]');
    expect(count.exists()).toBe(true);
    expect(count.attributes('aria-live')).toBe('polite');
    expect(count.text()).toBe('Menampilkan 1–10 dari 100 RT');

    // Exactly one live region, so nothing competes with the count.
    expect(wrapper.findAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it('presents the rows as sample data, not the live kelurahan roster', async () => {
    const wrapper = await mountReady();

    // The hero says up front that this is sample data.
    expect(wrapper.text()).toContain('Contoh data daftar Ketua RT');
    // …and the notice repeats it, so a resident cannot mistake the table for the
    // real directory.
    expect(wrapper.text()).toContain('Data contoh, bukan daftar resmi');
    // The old wording presented the rows as the live directory.
    expect(wrapper.text()).not.toContain('Direktori 100 Rukun Tetangga');
  });

  it('hides sample notice and uses neutral hero subtitle when roster contains real data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          leaders: [
            {
              rtNumber: 1,
              name: 'Pak Budi Santoso',
              phone: '081234567890',
              phoneIsWhatsapp: true,
              alamat: 'Jl. Manggar No. 10',
            },
            {
              rtNumber: 2,
              name: 'Ibu Siti Rahma',
              phone: '081298765432',
              phoneIsWhatsapp: false,
              alamat: 'Jl. Manggar No. 20',
            },
          ],
        }),
      } as Response),
    );

    const { useRtLeadersStore } = await import('../stores/rtLeaders.store');
    const store = useRtLeadersStore();
    await store.fetchRtLeaders(true);

    const wrapper = await mountReady();
    expect(wrapper.text()).not.toContain('Data contoh, bukan daftar resmi');
    expect(wrapper.text()).toContain('Daftar Ketua RT Kelurahan Manggar');
    expect(wrapper.text()).not.toContain('Contoh data daftar Ketua RT');
  });

  it('hides sample notice when 99 rows are real and only 1 row is a placeholder', async () => {
    const mixedRoster = Array.from({ length: 100 }, (_, index) => {
      const rtNumber = index + 1;
      if (rtNumber === 50) {
        return {
          rtNumber,
          name: 'Ketua RT 50',
          phone: '—',
          phoneIsWhatsapp: false,
          alamat: null,
          coordinates: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        };
      }
      return {
        rtNumber,
        name: `Warga RT ${rtNumber} S.Pd.`,
        phone: `+62 812 3456 ${String(rtNumber).padStart(4, '0')}`,
        phoneIsWhatsapp: true,
        alamat: `Jl. RT ${rtNumber}`,
        coordinates: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    });

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({ leaders: mixedRoster }),
      } as Response),
    );

    const { useRtLeadersStore } = await import('../stores/rtLeaders.store');
    const store = useRtLeadersStore();
    await store.fetchRtLeaders(true);

    const wrapper = await mountReady();
    expect(wrapper.text()).not.toContain('Data contoh, bukan daftar resmi');
    expect(wrapper.text()).toContain('Daftar Ketua RT Kelurahan Manggar');
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

  it('treats a digits-only query as one exact RT number', async () => {
    const wrapper = await mountReady();
    const search = wrapper.find('[data-test="rt-search"]');

    // "7" must not substring-match RT 17, 27, 37, 70, 71, …
    await search.setValue('7');
    const rows = wrapper.findAll('tbody th[scope="row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toBe('7');

    await search.setValue('70');
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(1);
    expect(wrapper.find('tbody th[scope="row"]').text()).toBe('70');
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

    // RT 2 is not flagged as WhatsApp; preserves leading + from international format
    expect(wrapper.find('a[href="tel:+6281100000002"]').exists()).toBe(true);
  });

  it('handles multi-number phone values by linking only the first number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          leaders: [
            {
              rtNumber: 1,
              name: 'Ketua RT 01',
              phone: '08123456789 / 08129999888',
              phoneIsWhatsapp: true,
              alamat: null,
            },
            {
              rtNumber: 2,
              name: 'Ketua RT 02',
              phone: '+62 811 222 333, 0815 444 555',
              phoneIsWhatsapp: false,
              alamat: null,
            },
          ],
        }),
      } as Response),
    );

    const { useRtLeadersStore } = await import('../stores/rtLeaders.store');
    const store = useRtLeadersStore();
    await store.fetchRtLeaders(true);

    const wrapper = await mountReady();
    expect(wrapper.find('a[href="https://wa.me/628123456789"]').exists()).toBe(true);
    expect(wrapper.find('a[href="tel:+62811222333"]').exists()).toBe(true);
  });

  it('renders a placeholder phone as plain text instead of a dead link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          leaders: [
            {
              rtNumber: 1,
              name: 'Ketua RT 01',
              // The seeded roster stores a non-dialable marker, not a number.
              phone: '—',
              phoneIsWhatsapp: true,
              alamat: 'Jl. Contoh RT 01, Manggar',
              coordinates: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            {
              rtNumber: 2,
              name: 'Ketua RT 02',
              phone: '—',
              phoneIsWhatsapp: false,
              alamat: 'Jl. Contoh RT 02, Manggar',
              coordinates: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 2,
        }),
      } as Response),
    );

    const wrapper = await mountReady();

    // No number means nothing to call or message, so no anchor is rendered —
    // not even for a row still flagged as WhatsApp.
    const cells = wrapper.findAll('tbody tr td:nth-child(3)');
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.text()).toContain('—');
      expect(cell.find('a').exists()).toBe(false);
    }
    expect(wrapper.findAll('[data-test="rt-phone-placeholder"]')).toHaveLength(2);
    // Scoped to the table: the page footer carries its own kelurahan contact link.
    const table = wrapper.find('table');
    expect(table.find('a[href^="tel:"]').exists()).toBe(false);
    expect(table.find('a[href^="https://wa.me/"]').exists()).toBe(false);
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

    // "Hapus filter" restores the whole table
    const clearButton = empty.find('button');
    expect(clearButton.text()).toContain('Hapus filter');
    await clearButton.trigger('click');
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(wrapper.find('tbody th[scope="row"]').text()).toBe('1');
  });

  it('does not flash the "belum tersedia" state before the first fetch resolves', async () => {
    const { pinia, router } = mountView();
    await router.push('/ketua-rt');
    await router.isReady();

    const wrapper = mount(KetuaRtView, { global: { plugins: [pinia, router] } });
    // Before the response lands, the page shows neither an empty table nor "no data".
    expect(wrapper.find('[data-test="rt-nodata"]').exists()).toBe(false);

    await flushPromises();
    expect(wrapper.find('[data-test="rt-nodata"]').exists()).toBe(false);
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it('drops rows that cannot be rendered and reports how many', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          leaders: [
            ...buildRoster().slice(0, 2),
            { rtNumber: 3, name: '', phone: '08120000003', phoneIsWhatsapp: true },
            { rtNumber: 4, phone: '08120000004', phoneIsWhatsapp: true },
          ],
          total: 4,
        }),
      } as Response),
    );

    const wrapper = await mountReady();

    // The malformed rows are dropped instead of throwing on a missing name.
    expect(wrapper.findAll('tbody th[scope="row"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="rt-rejected"]').text()).toContain(
      '2 baris data tidak lengkap',
    );
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
    // The table is not rendered while errored, and count text is empty
    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.find('[data-test="rt-count"]').text()).toBe('');
  });

  it('keeps the last good roster when a forced refresh fails', async () => {
    const wrapper = await mountReady();
    expect(wrapper.findAll('tbody tr').length).toBe(DEFAULT_PAGE_SIZE);

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 500 } as Response),
    );

    const { useRtLeadersStore } = await import('../stores/rtLeaders.store');
    const store = useRtLeadersStore();
    const previousLength = store.rtLeaders.length;
    await store.fetchRtLeaders(true);
    await flushPromises();

    expect(wrapper.find('[data-test="rt-error"]').exists()).toBe(true);
    expect(store.rtLeaders).toHaveLength(previousLength);
    expect(wrapper.find('table').exists()).toBe(true);
  });

  it('normalises every accepted phone format for the wa.me link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          leaders: [
            {
              rtNumber: 1,
              name: 'Ketua RT 01',
              phone: '081234567801',
              phoneIsWhatsapp: true,
              alamat: null,
              coordinates: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            {
              rtNumber: 2,
              name: 'Ketua RT 02',
              phone: '+62 812-3456-7802',
              phoneIsWhatsapp: true,
              alamat: null,
              coordinates: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            {
              rtNumber: 3,
              name: 'Ketua RT 03',
              phone: '81234567803',
              phoneIsWhatsapp: true,
              alamat: null,
              coordinates: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 3,
        }),
      } as Response),
    );

    const wrapper = await mountReady();

    // Local 08…, international +62…, and bare 8… all resolve to the same MSISDN form.
    expect(wrapper.find('a[href="https://wa.me/6281234567801"]').exists()).toBe(true);
    expect(wrapper.find('a[href="https://wa.me/6281234567802"]').exists()).toBe(true);
    expect(wrapper.find('a[href="https://wa.me/6281234567803"]').exists()).toBe(true);

    // The cell groups each form readably.
    const cells = wrapper.findAll('tbody tr td:nth-child(3)').map((cell) => cell.text());
    expect(cells[0]).toContain('0812 3456 7801');
    expect(cells[1]).toContain('+62 812 3456 7802');
  });
});
