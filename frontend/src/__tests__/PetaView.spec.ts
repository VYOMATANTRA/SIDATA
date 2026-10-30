import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PetaView from '../views/PetaView.vue';
import type { MapSummaryDTO, RtLeaderDTO, SpatialPointDTO } from '../types/maps';

const POINTS: SpatialPointDTO[] = [
  {
    id: 'point-1',
    name: 'Pos Ketua RT 01',
    type: 'ketua_rt',
    latitude: -1.2235,
    longitude: 116.9521,
    metadata: null,
    rts: [1],
    rtLeader: {
      rtNumber: 1,
      name: 'Suwarjo Manggar',
      phone: '08125356695',
      phoneIsWhatsapp: true,
      alamat: null,
    },
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'point-2',
    name: 'Bank Sampah Melati',
    type: 'bank_sampah',
    latitude: -1.23,
    longitude: 116.96,
    metadata: null,
    rts: [30, 60, 72],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'point-3',
    name: 'Posyandu Manggar',
    type: 'fasilitas_umum',
    latitude: -1.24,
    longitude: 116.97,
    metadata: null,
    rts: [5],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
];

const SUMMARY: MapSummaryDTO = {
  totalPoints: 3,
  pointsByType: { ketua_rt: 1, bank_sampah: 1, fasilitas_umum: 1 },
  totalRtLeaders: 100,
  rtLeadersWithCoordinates: 1,
  rtLeadersWithoutCoordinates: 99,
  rtLeadersWithIntegrityConflicts: 0,
};

const LEADER: RtLeaderDTO = {
  rtNumber: 1,
  name: 'SUWARJO',
  phone: '08125356695',
  phoneIsWhatsapp: true,
  alamat: null,
  coordinates: { latitude: -1.2235, longitude: 116.9521, pointId: 'point-1' },
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/peta', component: PetaView },
      { path: '/ketua-rt', component: { template: '<div>Ketua RT</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

async function mountReady() {
  const { pinia, router } = mountView();
  await router.push('/peta');
  await router.isReady();

  const wrapper = mount(PetaView, {
    global: {
      plugins: [pinia, router],
      // Leaflet needs a real layout engine; the map itself is covered separately.
      stubs: { InteractiveMap: { template: '<div data-test="map-stub" />' } },
    },
  });
  await flushPromises();

  return wrapper;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/maps/summary')) {
        return { ok: true, json: async () => SUMMARY } as Response;
      }
      if (url.includes('/api/maps/rt-leaders/')) {
        return { ok: true, json: async () => ({ leader: LEADER }) } as Response;
      }
      if (url.includes('/api/maps/points')) {
        return { ok: true, json: async () => ({ points: POINTS, total: POINTS.length }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PetaView accessibility, filtering, and point selection', () => {
  it('renders landmarks, skip link, a single h1, and a breadcrumb', async () => {
    const wrapper = await mountReady();

    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);
    expect(wrapper.findAll('main#main-content').length).toBe(1);
    expect(wrapper.find('footer').exists()).toBe(true);

    const h1s = wrapper.findAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.text()).toContain('Peta Kelurahan Manggar');

    const breadcrumb = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Beranda');
    expect(breadcrumb.text()).toContain('Peta');
  });

  it('loads points and the summary, then announces the visible count', async () => {
    const wrapper = await mountReady();

    const count = wrapper.find('[data-test="peta-count"]');
    expect(count.exists()).toBe(true);
    expect(count.attributes('aria-live')).toBe('polite');
    expect(count.text()).toBe('Menampilkan 3 dari 3 titik.');

    // The summary control is kept as its own dropdown
    expect(wrapper.text()).toContain('Ringkasan Data');
  });

  it('lists five points per page, nearest-first, with a distance and a type label', async () => {
    const wrapper = await mountReady();

    expect(wrapper.text()).toContain('Titik terdekat');
    expect(wrapper.text()).toContain('Jarak dihitung dari pusat kelurahan.');

    const rows = wrapper.findAll('[data-test="peta-result"]');
    expect(rows.length).toBe(3);
    // Point 1 sits exactly on the origin, so it must sort first
    expect(rows[0]?.text()).toContain('RT 1');
    expect(rows[0]?.text()).toContain('0 m');
    // A multi-RT Bank Sampah shows its whole coverage
    expect(rows[1]?.text()).toContain('Bank Sampah Melati');
    expect(rows[1]?.text()).toContain('RT 30, 60, 72');
  });

  it('filters the list by name and by RT number', async () => {
    const wrapper = await mountReady();
    const search = wrapper.find('[data-test="peta-search"]');

    expect(wrapper.find('label[for="peta-search"]').exists()).toBe(true);

    await search.setValue('melati');
    expect(wrapper.findAll('[data-test="peta-result"]').length).toBe(1);
    expect(wrapper.find('[data-test="peta-count"]').text()).toBe('Menampilkan 1 dari 3 titik.');

    await search.setValue('72');
    expect(wrapper.findAll('[data-test="peta-result"]').length).toBe(1);
    expect(wrapper.find('[data-test="peta-result"]').text()).toContain('Bank Sampah Melati');

    await search.setValue('tidak ada');
    expect(wrapper.find('[data-test="peta-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="peta-empty"]').text()).toContain(
      'Tidak ada titik yang cocok',
    );
  });

  it('searches the RT leader name and paginates list results without removing map points', async () => {
    const wrapper = await mountReady();
    const search = wrapper.find('[data-test="peta-search"]');

    await search.setValue('suwarjo');
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(1);
    expect(wrapper.find('[data-test="peta-result"]').text()).toContain('Suwarjo Manggar');

    await search.setValue('');
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(3);
    expect(wrapper.find('[data-test="map-stub"]').exists()).toBe(true);
  });

  it('resets list pagination after a query changes', async () => {
    const manyPoints = Array.from({ length: 12 }, (_, index) => ({
      ...POINTS[0]!,
      id: `rt-${index + 1}`,
      name: `Pos Ketua RT ${index + 1}`,
      rts: [index + 1],
      latitude: -1.2235 + index * 0.001,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/maps/summary')) return { ok: true, json: async () => SUMMARY } as Response;
        if (url.includes('/api/maps/points')) return { ok: true, json: async () => ({ points: manyPoints, total: manyPoints.length }) } as Response;
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }),
    );

    const wrapper = await mountReady();
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(5);
    expect(wrapper.find('[data-test="peta-pagination-summary"]').text()).toContain('1–5 dari 12');

    await wrapper.find('[data-test="peta-next-page"]').trigger('click');
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(5);
    expect(wrapper.find('[data-test="peta-pagination-summary"]').text()).toContain('6–10 dari 12');

    await wrapper.find('[data-test="peta-search"]').setValue('RT');
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(5);
    expect(wrapper.find('[data-test="peta-pagination-summary"]').text()).toContain('1–5 dari 12');
  });

  it('swaps the nearby list for the detail view and links to the Ketua RT page', async () => {
    const wrapper = await mountReady();

    await wrapper.findAll('[data-test="peta-result"]')[0]?.trigger('click');
    await flushPromises();

    // Detail view replaces the list
    expect(wrapper.text()).toContain('Pos Ketua RT 01');
    expect(wrapper.text()).toContain('Kontak Ketua RT');
    expect(wrapper.text()).toContain('Suwarjo Manggar');

    const ketuaRtLink = wrapper.find('a[href="/ketua-rt"]');
    expect(ketuaRtLink.exists()).toBe(true);
    expect(ketuaRtLink.text()).toContain('Lihat seluruh daftar Ketua RT');

    // Closing returns to the list
    await wrapper.findAll('button').find((button) => button.text().trim() === 'Kembali ke hasil')?.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Titik terdekat');
  });

  it('clears the selected point when a category filter hides it', async () => {
    const wrapper = await mountReady();

    // Select the first point (ketua_rt)
    await wrapper.findAll('[data-test="peta-result"]')[0]?.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Pos Ketua RT 01');

    // Filter to Bank Sampah only
    const { useMapsStore } = await import('../stores/maps');
    const store = useMapsStore();
    store.setTypeFilter('bank_sampah');
    await flushPromises();

    // The drawer should be closed and the results list restored
    expect(store.selectedPoint).toBeNull();
    expect(wrapper.text()).toContain('Titik terdekat');
    expect(wrapper.text()).not.toContain('Kontak Ketua RT');
  });

  it('shows a retryable error state instead of an empty map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 500 } as Response),
    );

    const wrapper = await mountReady();

    const error = wrapper.find('[data-test="peta-error"]');
    expect(error.exists()).toBe(true);
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('Gagal memuat titik spasial');
    expect(error.find('button').text()).toContain('Coba lagi');
  });

  it('requests geolocation and allows resetting back to kelurahan origin', async () => {
    const originalNavigator = globalThis.navigator;
    const getCurrentPosition = vi.fn<typeof navigator.geolocation.getCurrentPosition>(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: -1.22,
            longitude: 116.95,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    );

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...originalNavigator,
        geolocation: { getCurrentPosition },
      },
      configurable: true,
    });

    const wrapper = await mountReady();
    const dekatSayaBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Gunakan lokasi saya');
    expect(dekatSayaBtn).toBeDefined();

    await dekatSayaBtn?.trigger('click');
    expect(wrapper.text()).toContain('Jarak dihitung dari lokasi Anda');

    const resetBtn = wrapper.find('[data-test="peta-reset-origin"]');
    expect(resetBtn.exists()).toBe(true);
    expect(resetBtn.text()).toContain('Pusat kelurahan');

    await resetBtn.trigger('click');
    expect(wrapper.text()).toContain('Jarak dihitung dari pusat kelurahan');

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });
});
