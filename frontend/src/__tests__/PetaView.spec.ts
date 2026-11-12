import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { defineComponent, h } from 'vue';
import PetaView from '../views/PetaView.vue';
import type { MapSummaryDTO, RtLeaderDTO, SpatialPointDTO } from '../types/maps';
import { MANGGAR_MAP_ORIGIN } from '../constants/mapOrigin';
import { READ_USER_MESSAGES } from '../utils/userMessages';
import { resetGeolocationSession } from '../composables/useGeolocation';

const revealPointMock = vi.fn<(id: string) => void>();
const invalidateSizeMock = vi.fn<() => void>();
const focusUserLocationMock = vi.fn<() => void>();
let interactionCount = 0;
const MapStub = defineComponent({
  name: 'InteractiveMap',
  props: {
    points: { type: Array, default: () => [] },
    selectedPointId: { type: String, default: null },
    defaultCenter: { type: Array, default: () => [] },
    defaultZoom: { type: Number, default: 0 },
  },
  emits: ['select-point', 'escape'],
  setup(_props, { expose, emit }) {
    expose({
      revealPoint: revealPointMock,
      invalidateSize: invalidateSizeMock,
      focusUserLocation: focusUserLocationMock,
      getInteractionCount: () => interactionCount,
    });
    return () =>
      h('div', { 'data-test': 'map-stub' }, [
        h('button', {
          'data-test': 'map-escape',
          onClick: () => emit('escape'),
        }),
      ]);
  },
});

const POINTS: SpatialPointDTO[] = [
  {
    id: 'point-1',
    name: 'Pos Ketua RT 01',
    type: 'ketua_rt',
    latitude: MANGGAR_MAP_ORIGIN.latitude,
    longitude: MANGGAR_MAP_ORIGIN.longitude,
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
  coordinates: {
    latitude: MANGGAR_MAP_ORIGIN.latitude,
    longitude: MANGGAR_MAP_ORIGIN.longitude,
    pointId: 'point-1',
  },
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
      stubs: { InteractiveMap: MapStub },
    },
  });
  await flushPromises();

  return wrapper;
}

/** `true` matches the `md` query (desktop layout); `false` is the phone layout. */
function stubViewport(isDesktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn<(query: string) => unknown>().mockReturnValue({
      matches: isDesktop,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }),
  );
}

const navigatorOverrides: string[] = [];

/** Defines a navigator property for one test; `undefined` hides it. Undone in `afterEach`. */
function setNavigator(key: 'geolocation' | 'permissions', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true });
  navigatorOverrides.push(key);
}

beforeEach(() => {
  revealPointMock.mockClear();
  invalidateSizeMock.mockClear();
  focusUserLocationMock.mockClear();
  interactionCount = 0;
  resetGeolocationSession();
  stubViewport(true);
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
        return {
          ok: true,
          json: async () => ({ points: POINTS, total: POINTS.length }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of navigatorOverrides.splice(0)) {
    delete (navigator as unknown as Record<string, unknown>)[key];
  }
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  resetGeolocationSession();
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
    expect(count.text()).toBe('Menampilkan semua 3 titik.');

    // The data details stay in their own disclosure
    expect(wrapper.text()).toContain('Rincian data');
  });

  it('re-measures the map after the in-flow summary disclosure opens or closes', async () => {
    stubViewport(false);
    const wrapper = await mountReady();
    invalidateSizeMock.mockClear();

    const trigger = wrapper.find('[data-test="map-summary-dropdown"] button');
    await trigger.trigger('click');
    await flushPromises();
    expect(invalidateSizeMock).toHaveBeenCalledTimes(1);

    await trigger.trigger('click');
    await flushPromises();
    expect(invalidateSizeMock).toHaveBeenCalledTimes(2);
  });

  it('lists five points per page, nearest-first, with a distance and a type label', async () => {
    const wrapper = await mountReady();

    expect(wrapper.text()).toContain('Titik terdekat');
    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe(
      'Jarak dari pusat kelurahan.',
    );

    const rows = wrapper.findAll('[data-test="peta-result"]');
    expect(rows.length).toBe(3);
    // Point 1 sits exactly on the origin, so it must sort first
    expect(rows[0]?.text()).toContain('RT 1');
    expect(rows[0]?.text()).toContain('0 m');
    // A multi-RT Bank Sampah shows its whole coverage
    expect(rows[1]?.text()).toContain('Bank Sampah Melati');
    expect(rows[1]?.text()).toContain('RT 30, 60, 72');
  });

  it('uses CMS default coordinates for distances and the map centre', async () => {
    const custom = { lat: -1.24, lon: 116.97, zoom: 20 };
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/settings/public')) {
          return {
            ok: true,
            json: async () => ({ settings: { defaultCoordinates: custom } }),
          } as Response;
        }
        if (url.includes('/api/maps/summary')) {
          return { ok: true, json: async () => SUMMARY } as Response;
        }
        if (url.includes('/api/maps/points')) {
          return {
            ok: true,
            json: async () => ({ points: POINTS, total: POINTS.length }),
          } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }),
    );
    const wrapper = await mountReady();

    const map = wrapper.findComponent(MapStub);
    expect(map.props('defaultCenter')).toEqual([custom.lat, custom.lon]);
    expect(map.props('defaultZoom')).toBe(20);

    // Point 3 sits exactly on the CMS origin, so it becomes nearest.
    const rows = wrapper.findAll('[data-test="peta-result"]');
    expect(rows[0]?.text()).toContain('Posyandu Manggar');
    expect(rows[0]?.text()).toContain('0 m');
    wrapper.unmount();
  });

  it('falls back to the shared origin when settings are unavailable', async () => {
    const wrapper = await mountReady();

    const map = wrapper.findComponent(MapStub);
    expect(map.props('defaultCenter')).toEqual([
      MANGGAR_MAP_ORIGIN.latitude,
      MANGGAR_MAP_ORIGIN.longitude,
    ]);
    expect(map.props('defaultZoom')).toBe(13);
    expect(wrapper.find('[data-test="peta-result"]').text()).toContain('0 m');
    wrapper.unmount();
  });

  it('reveals a marker only after a result-list selection', async () => {
    const wrapper = await mountReady();
    expect(revealPointMock).not.toHaveBeenCalled();

    await wrapper.findAll('[data-test="peta-result"]')[0]?.trigger('click');
    await flushPromises();

    expect(revealPointMock).toHaveBeenCalledWith('point-1');
    wrapper.unmount();
  });

  it('closes the open detail when Escape comes from the map', async () => {
    const wrapper = await mountReady();
    await wrapper.findAll('[data-test="peta-result"]')[0]?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="peta-result"]').exists()).toBe(false);

    await wrapper.find('[data-test="map-escape"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="peta-result"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('filters the list by name and by RT number', async () => {
    const wrapper = await mountReady();
    const search = wrapper.find('[data-test="peta-search"]');

    expect(wrapper.find('label[for="peta-search"]').exists()).toBe(true);

    await search.setValue('melati');
    expect(wrapper.findAll('[data-test="peta-result"]').length).toBe(1);
    expect(wrapper.find('[data-test="peta-count"]').text()).toBe(
      'Menampilkan 1 dari 3 titik sesuai pencarian atau filter.',
    );

    await search.setValue('72');
    expect(wrapper.findAll('[data-test="peta-result"]').length).toBe(1);
    expect(wrapper.find('[data-test="peta-result"]').text()).toContain('Bank Sampah Melati');

    await search.setValue('tidak ada');
    expect(wrapper.find('[data-test="peta-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="peta-empty"]').text()).toContain('Tidak ada titik yang cocok');
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
      latitude: MANGGAR_MAP_ORIGIN.latitude + index * 0.001,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/maps/summary'))
          return { ok: true, json: async () => SUMMARY } as Response;
        if (url.includes('/api/maps/points'))
          return {
            ok: true,
            json: async () => ({ points: manyPoints, total: manyPoints.length }),
          } as Response;
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }),
    );

    const wrapper = await mountReady();
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(5);
    expect(wrapper.find('[data-test="peta-pagination-summary"]').text()).toContain('1–5 dari 12');
    expect(
      wrapper.find<HTMLButtonElement>('[data-test="peta-previous-page"]').element.disabled,
    ).toBe(true);
    expect(wrapper.find<HTMLButtonElement>('[data-test="peta-next-page"]').element.disabled).toBe(
      false,
    );

    await wrapper.find('[data-test="peta-next-page"]').trigger('click');
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(5);
    expect(wrapper.find('[data-test="peta-pagination-summary"]').text()).toContain('6–10 dari 12');
    expect(
      wrapper.find<HTMLButtonElement>('[data-test="peta-previous-page"]').element.disabled,
    ).toBe(false);
    expect(wrapper.find<HTMLButtonElement>('[data-test="peta-next-page"]').element.disabled).toBe(
      false,
    );

    await wrapper.find('[data-test="peta-next-page"]').trigger('click');
    expect(wrapper.find<HTMLButtonElement>('[data-test="peta-next-page"]').element.disabled).toBe(
      true,
    );

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

    const ketuaRtLink = wrapper.find('main a[href="/ketua-rt"]');
    expect(ketuaRtLink.exists()).toBe(true);
    expect(ketuaRtLink.text()).toContain('Lihat seluruh daftar Ketua RT');

    // Closing returns to the list
    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Kembali ke hasil')
      ?.trigger('click');
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
    expect(error.text()).toContain(`Gagal memuat titik peta. ${READ_USER_MESSAGES.server}`);
    expect(error.text()).not.toContain('500');
    expect(error.find('button').text()).toContain('Coba lagi');
  });

  it('hands focus to previous/next page button when a pagination button becomes disabled', async () => {
    const manyPoints: SpatialPointDTO[] = Array.from({ length: 7 }, (_, i) => ({
      id: `point-${i + 1}`,
      name: `Titik Uji ${i + 1}`,
      type: 'fasilitas_umum',
      latitude: -1.23 + i * 0.001,
      longitude: 116.96 + i * 0.001,
      metadata: null,
      rts: [i + 1],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/maps/summary')) {
          return { ok: true, json: async () => ({ ...SUMMARY, totalPoints: 7 }) } as Response;
        }
        if (url.includes('/api/maps/points')) {
          return { ok: true, json: async () => ({ points: manyPoints, total: 7 }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );

    const { pinia, router } = mountView();
    await router.push('/peta');
    await router.isReady();

    const wrapper = mount(PetaView, {
      global: {
        plugins: [pinia, router],
        stubs: { InteractiveMap: { template: '<div data-test="map-stub" />' } },
      },
      attachTo: document.body,
    });
    await flushPromises();

    const nextBtn = wrapper.find<HTMLButtonElement>('[data-test="peta-next-page"]');
    const prevBtn = wrapper.find<HTMLButtonElement>('[data-test="peta-previous-page"]');
    expect(nextBtn.exists()).toBe(true);
    expect(nextBtn.element.disabled).toBe(false);
    expect(prevBtn.element.disabled).toBe(true);

    // Focus and click Next to go from page 1 to page 2 (last page)
    nextBtn.element.focus();
    expect(document.activeElement).toBe(nextBtn.element);

    await nextBtn.trigger('click');
    await flushPromises();

    // Next button is now disabled; focus must have been handed off to Previous button
    expect(nextBtn.element.disabled).toBe(true);
    expect(prevBtn.element.disabled).toBe(false);
    expect(document.activeElement).toBe(prevBtn.element);

    // Now test the reverse: clicking previous from page 2 back to page 1
    await prevBtn.trigger('click');
    await flushPromises();

    expect(prevBtn.element.disabled).toBe(true);
    expect(nextBtn.element.disabled).toBe(false);
    expect(document.activeElement).toBe(nextBtn.element);

    wrapper.unmount();
  });
});

interface FixOptions {
  latitude?: number;
  longitude?: number;
}

function successFix({ latitude = -1.22, longitude = 116.95 }: FixOptions = {}) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

function geoError(code: 1 | 2 | 3) {
  return { code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' };
}

type SuccessCb = (position: GeolocationPosition) => void;
type ErrorCb = (error: ReturnType<typeof geoError>) => void;

function stubPermission(state: PermissionState | 'unavailable') {
  if (state === 'unavailable') {
    setNavigator('permissions', undefined);
    return;
  }
  setNavigator('permissions', {
    query: vi.fn<() => Promise<unknown>>().mockResolvedValue({
      state,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }),
  });
}

describe('PetaView location (permission-aware, labelled distances)', () => {
  it('starts one bounded request on entry when permission is already granted, without recentring', async () => {
    stubPermission('granted');
    const getCurrentPosition = vi.fn<
      (ok: SuccessCb, fail?: ErrorCb, options?: PositionOptions) => void
    >((ok) => ok(successFix()));
    setNavigator('geolocation', { getCurrentPosition });

    const wrapper = await mountReady();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]).toBeDefined();
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ timeout: 10000, maximumAge: expect.any(Number) }),
    );
    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe('Jarak dari lokasi Anda.');
    expect(wrapper.find('[data-test="peta-location-message"]').text()).toContain('sedang dipakai');
    expect(wrapper.find('[data-test="peta-result"]').text()).toContain('dari lokasi Anda');
    // An automatic fix never moves the map; only the visitor's own button press does.
    expect(focusUserLocationMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('explains and waits for a button press when permission is undecided', async () => {
    stubPermission('prompt');
    const getCurrentPosition = vi.fn<(ok: SuccessCb) => void>((ok) => ok(successFix()));
    setNavigator('geolocation', { getCurrentPosition });

    const wrapper = await mountReady();

    const prompt = wrapper.find('[data-test="peta-location-prompt"]');
    expect(prompt.exists()).toBe(true);
    expect(prompt.text()).toContain('Tidak disimpan');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe(
      'Jarak dari pusat kelurahan.',
    );

    await wrapper.find('[data-test="peta-enable-location"]').trigger('click');
    await flushPromises();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe('Jarak dari lokasi Anda.');
    expect(focusUserLocationMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('does not recentre over a map move made while waiting for the fix', async () => {
    stubPermission('prompt');
    let deliver: SuccessCb = () => {};
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<(ok: SuccessCb) => void>((ok) => {
        deliver = ok;
      }),
    });

    const wrapper = await mountReady();
    await wrapper.find('[data-test="peta-enable-location"]').trigger('click');
    interactionCount += 1; // the visitor pans the map while the browser is still asking
    deliver(successFix());
    await flushPromises();

    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe('Jarak dari lokasi Anda.');
    expect(focusUserLocationMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('treats unreadable permission state as undecided', async () => {
    stubPermission('unavailable');
    setNavigator('geolocation', { getCurrentPosition: vi.fn<() => void>() });

    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="peta-location-prompt"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('makes no request and no repeat prompt when permission is denied', async () => {
    stubPermission('denied');
    const getCurrentPosition = vi.fn<() => void>();
    setNavigator('geolocation', { getCurrentPosition });

    const wrapper = await mountReady();

    expect(getCurrentPosition).not.toHaveBeenCalled();
    const message = wrapper.find('[data-test="peta-location-message"]');
    expect(message.text()).toContain('pengaturan browser');
    expect(wrapper.find('[data-test="peta-enable-location"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe(
      'Jarak dari pusat kelurahan.',
    );
    // Browsing is not blocked
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(3);
    wrapper.unmount();
  });

  it('explains an unsupported browser and keeps the list usable', async () => {
    setNavigator('geolocation', undefined);

    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="peta-location-message"]').text()).toContain('tidak mendukung');
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(3);
    wrapper.unmount();
  });

  it('explains that location needs a secure connection', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    setNavigator('geolocation', { getCurrentPosition: vi.fn<() => void>() });

    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="peta-location-message"]').text()).toContain('HTTPS');
    wrapper.unmount();
  });

  it('offers one retry after a timeout and then locates', async () => {
    stubPermission('granted');
    const getCurrentPosition = vi
      .fn<(ok: SuccessCb, fail: ErrorCb) => void>()
      .mockImplementationOnce((_ok, fail) => fail(geoError(3)))
      .mockImplementationOnce((ok) => ok(successFix()));
    setNavigator('geolocation', { getCurrentPosition });

    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="peta-location-message"]').text()).toContain('terlalu lama');
    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe(
      'Jarak dari pusat kelurahan.',
    );
    await wrapper.find('[data-test="peta-enable-location"]').trigger('click');
    await flushPromises();

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-test="peta-origin-label"]').text()).toBe('Jarak dari lokasi Anda.');
    wrapper.unmount();
  });

  it('reports an unavailable position without blocking the page', async () => {
    stubPermission('granted');
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<(ok: SuccessCb, fail: ErrorCb) => void>((_ok, fail) =>
        fail(geoError(2)),
      ),
    });

    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="peta-location-message"]').text()).toContain('tidak dapat');
    expect(wrapper.find('[data-test="peta-enable-location"]').text()).toBe('Coba lagi');
    expect(wrapper.findAll('[data-test="peta-result"]')).toHaveLength(3);
    wrapper.unmount();
  });

  it('shares one request between rapid presses', async () => {
    stubPermission('prompt');
    let deliver: SuccessCb = () => {};
    const getCurrentPosition = vi.fn<(ok: SuccessCb) => void>((ok) => {
      deliver = ok;
    });
    setNavigator('geolocation', { getCurrentPosition });

    const wrapper = await mountReady();
    const button = wrapper.find('[data-test="peta-enable-location"]');
    await button.trigger('click');
    await button.trigger('click');
    deliver(successFix());
    await flushPromises();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('reuses the fix on revisit instead of asking again, and resets to the centre on request', async () => {
    stubPermission('granted');
    const getCurrentPosition = vi.fn<(ok: SuccessCb) => void>((ok) => ok(successFix()));
    setNavigator('geolocation', { getCurrentPosition });

    const first = await mountReady();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = await mountReady();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(second.find('[data-test="peta-origin-label"]').text()).toBe('Jarak dari lokasi Anda.');

    await second.find('[data-test="peta-reset-origin"]').trigger('click');
    expect(second.find('[data-test="peta-origin-label"]').text()).toBe(
      'Jarak dari pusat kelurahan.',
    );
    expect(second.find('[data-test="peta-enable-location"]').text()).toBe('Gunakan lokasi saya');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('never writes the location to browser storage', async () => {
    stubPermission('granted');
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<(ok: SuccessCb) => void>((ok) => ok(successFix())),
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const wrapper = await mountReady();

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    wrapper.unmount();
  });
});

/** `v-show` hides with an inline `display: none`; jsdom does not apply the Tailwind classes. */
function hidden(element: Element): boolean {
  return (element as HTMLElement).style.display === 'none';
}

describe('PetaView results panel', () => {
  it('shows the list beside the map on desktop with no toggle', async () => {
    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="peta-panel-toggle"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="peta-panel"]').attributes('data-state')).toBe('expanded');
    expect(hidden(wrapper.find('[data-test="peta-panel-body"]').element)).toBe(false);
    wrapper.unmount();
  });

  it('collapses the list on a phone and opens it with a labelled, stateful button', async () => {
    stubViewport(false);
    const wrapper = await mountReady();
    const toggle = wrapper.find('[data-test="peta-panel-toggle"]');
    const body = wrapper.find('[data-test="peta-panel-body"]');

    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-controls')).toBe(body.attributes('id'));
    expect(toggle.text()).toBe('Lihat daftar hasil (3)');
    expect(hidden(body.element)).toBe(true);

    invalidateSizeMock.mockClear();
    await toggle.trigger('click');
    await flushPromises();
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.text()).toBe('Sembunyikan daftar hasil');
    expect(hidden(body.element)).toBe(false);
    expect(invalidateSizeMock).toHaveBeenCalled();

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(hidden(body.element)).toBe(true);
    wrapper.unmount();
  });

  it('keeps one panel that switches between results and detail', async () => {
    stubViewport(false);
    const wrapper = await mountReady();
    expect(wrapper.findAll('[data-test="peta-panel"]')).toHaveLength(1);
    expect(wrapper.find('[data-test="peta-panel"]').attributes('data-mode')).toBe('results');

    const { useMapsStore } = await import('../stores/maps');
    useMapsStore().selectPoint(POINTS[0]!);
    await flushPromises();

    const panel = wrapper.find('[data-test="peta-panel"]');
    expect(wrapper.findAll('[data-test="peta-panel"]')).toHaveLength(1);
    expect(panel.attributes('data-mode')).toBe('detail');
    // Selecting a point opens the panel on its detail
    expect(panel.attributes('data-state')).toBe('expanded');
    expect(wrapper.find('[data-test="peta-panel-toggle"]').text()).toBe('Sembunyikan detail titik');
    expect(wrapper.text()).toContain('Kontak Ketua RT');
    wrapper.unmount();
  });

  it('collapses the open list with Escape and returns focus to its button', async () => {
    stubViewport(false);
    const { pinia, router } = mountView();
    await router.push('/peta');
    await router.isReady();
    const wrapper = mount(PetaView, {
      global: { plugins: [pinia, router], stubs: { InteractiveMap: MapStub } },
      attachTo: document.body,
    });
    await flushPromises();

    const toggle = wrapper.find<HTMLButtonElement>('[data-test="peta-panel-toggle"]');
    await toggle.trigger('click');
    wrapper.find<HTMLElement>('[data-test="peta-result"]').element.focus();
    await wrapper.find('[data-test="peta-result"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle.element);
    wrapper.unmount();
  });

  it('puts the panel away when the navigation menu opens', async () => {
    stubViewport(false);
    const wrapper = await mountReady();
    const toggle = wrapper.find('[data-test="peta-panel-toggle"]');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');

    await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('main').attributes('inert')).toBeDefined();
    expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('states whether a count covers every point or only filtered results', async () => {
    const wrapper = await mountReady();
    expect(wrapper.find('[data-test="peta-list-count"]').text()).toBe('3 lokasi (semua titik)');

    await wrapper.find('[data-test="peta-search"]').setValue('melati');
    expect(wrapper.find('[data-test="peta-list-count"]').text()).toBe(
      '1 lokasi sesuai pencarian atau filter',
    );
    wrapper.unmount();
  });
});
