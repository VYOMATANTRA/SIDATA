import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '../stores/settings.store';
import { MANGGAR_MAP_CENTER, MANGGAR_MAP_DEFAULT_ZOOM } from '../constants/mapOrigin';
import type { SpatialPointDTO } from '../types/maps';

const leafletMocks = vi.hoisted(() => {
  const setView = vi.fn(function (this: unknown) {
    return this;
  });
  const fitBounds = vi.fn(function (this: unknown) {
    return this;
  });
  const getZoom = vi.fn(() => 13);
  const getMaxZoom = vi.fn(() => 19);
  const getBounds = vi.fn(() => ({ contains: () => false }));
  const off = vi.fn();
  const once = vi.fn();
  const remove = vi.fn();
  const invalidateSize = vi.fn();
  const addToMap = vi.fn().mockReturnThis();

  const zoomToShowLayer = vi.fn((_marker: unknown, cb?: () => void) => {
    cb?.();
  });
  const zoomToBounds = vi.fn();
  const eachLayer = vi.fn();
  const clusterOn = vi.fn();
  const clusterAddTo = vi.fn().mockReturnThis();
  const clusterRemoveLayer = vi.fn();
  const clusterAddLayer = vi.fn();

  const markerOn = vi.fn();
  const markerSetIcon = vi.fn();
  const markerSetLatLng = vi.fn();
  const markerSetZIndexOffset = vi.fn();
  const markerGetLatLng = vi.fn(() => ({ lat: -1.2251, lng: 116.9438 }));
  const markerGetElement = vi.fn(() => {
    const el = document.createElement('div');
    el.className = 'leaflet-marker-icon';
    return el;
  });

  const state = {
    lastClusterGroupOptions: null as Record<string, unknown> | null,
    layeraddHandler: null as ((event: { layer: unknown }) => void) | null,
    animationendHandler: null as (() => void) | null,
  };

  const on = vi.fn(function (this: unknown) {
    return this;
  });
  const mapInstance: Record<string, unknown> = {
    setView,
    fitBounds,
    getZoom,
    getMaxZoom,
    getBounds,
    on,
    off,
    once,
    remove,
    invalidateSize,
    addLayer: vi.fn(),
  };
  setView.mockImplementation(function (this: unknown) {
    return mapInstance;
  });

  const markerClusterGroup = (opts: Record<string, unknown>) => {
    state.lastClusterGroupOptions = opts;
    const group = {
      addTo: clusterAddTo,
      zoomToShowLayer,
      zoomToBounds,
      eachLayer,
      removeLayer: clusterRemoveLayer,
      addLayer: clusterAddLayer,
      on: (event: string, handler: (...args: never[]) => void) => {
        clusterOn(event, handler);
        if (event === 'layeradd') {
          state.layeraddHandler = handler as (event: { layer: unknown }) => void;
        }
        if (event === 'animationend') {
          state.animationendHandler = handler as () => void;
        }
        return group;
      },
    };
    return group;
  };

  const L = {
    map: vi.fn(() => mapInstance),
    tileLayer: vi.fn(() => ({ addTo: addToMap })),
    control: {
      zoom: vi.fn(() => ({ addTo: addToMap })),
      attribution: vi.fn(() => ({
        addAttribution: vi.fn().mockReturnThis(),
        addTo: addToMap,
      })),
    },
    marker: vi.fn(() => ({
      on: markerOn,
      setIcon: markerSetIcon,
      setLatLng: markerSetLatLng,
      setZIndexOffset: markerSetZIndexOffset,
      getLatLng: markerGetLatLng,
      getElement: markerGetElement,
      options: {},
    })),
    divIcon: vi.fn((opts: unknown) => opts),
    latLngBounds: vi.fn((latlngs: unknown) => latlngs),
    markerClusterGroup,
  };

  return {
    setView,
    fitBounds,
    getZoom,
    getMaxZoom,
    zoomToShowLayer,
    zoomToBounds,
    state,
    L,
    mapInstance,
  };
});

vi.mock('leaflet', () => ({
  default: leafletMocks.L,
  ...leafletMocks.L,
}));

vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));

import InteractiveMap from '../components/maps/InteractiveMap.vue';

const point = (overrides: Partial<SpatialPointDTO> = {}): SpatialPointDTO => ({
  id: 'point-1',
  name: 'Pos RT 01',
  type: 'ketua_rt',
  latitude: MANGGAR_MAP_CENTER[0],
  longitude: MANGGAR_MAP_CENTER[1],
  metadata: null,
  rts: [1],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

async function mountMap(
  props: { points?: SpatialPointDTO[]; selectedPointId?: string | null } = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(InteractiveMap, {
    props: {
      points: props.points ?? [point()],
      selectedPointId: props.selectedPointId ?? null,
    },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  await nextTick();
  await flushPromises();
  return wrapper;
}

describe('InteractiveMap.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leafletMocks.state.lastClusterGroupOptions = null;
    leafletMocks.state.layeraddHandler = null;
    leafletMocks.state.animationendHandler = null;
    leafletMocks.getZoom.mockReturnValue(13);
    leafletMocks.setView.mockImplementation(function () {
      return leafletMocks.mapInstance;
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('initialises the map on the shared Manggar origin', async () => {
    await mountMap();
    expect(leafletMocks.setView).toHaveBeenCalledWith(MANGGAR_MAP_CENTER, MANGGAR_MAP_DEFAULT_ZOOM);
  });

  it('reveals a selected point with a single zoomToShowLayer and no competing setView', async () => {
    const wrapper = await mountMap({ points: [point()], selectedPointId: null });
    leafletMocks.setView.mockClear();
    leafletMocks.zoomToShowLayer.mockClear();

    await wrapper.setProps({ selectedPointId: 'point-1' });
    await flushPromises();

    expect(leafletMocks.zoomToShowLayer).toHaveBeenCalledTimes(1);
    expect(leafletMocks.setView).not.toHaveBeenCalled();
  });

  it('decorates cluster icons as buttons and zooms on Enter/Space', async () => {
    await mountMap({
      points: [
        point({ id: 'a' }),
        point({
          id: 'b',
          latitude: MANGGAR_MAP_CENTER[0] + 0.0001,
          longitude: MANGGAR_MAP_CENTER[1] + 0.0001,
        }),
      ],
    });

    expect(typeof leafletMocks.state.lastClusterGroupOptions?.iconCreateFunction).toBe('function');
    expect(leafletMocks.state.layeraddHandler).toBeTypeOf('function');

    const iconEl = document.createElement('div');
    iconEl.className = 'map-cluster leaflet-marker-icon';
    const cluster = {
      getChildCount: () => 2,
      getElement: () => iconEl,
      zoomToBounds: leafletMocks.zoomToBounds,
    };

    leafletMocks.state.layeraddHandler?.({ layer: cluster });
    await flushPromises();
    await new Promise((r) => queueMicrotask(r));

    expect(iconEl.getAttribute('role')).toBe('button');
    expect(iconEl.getAttribute('tabindex')).toBe('0');
    expect(iconEl.getAttribute('aria-label')).toContain('Kelompok 2');

    iconEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(leafletMocks.zoomToBounds).toHaveBeenCalledTimes(1);

    leafletMocks.zoomToBounds.mockClear();
    iconEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(leafletMocks.zoomToBounds).toHaveBeenCalledTimes(1);
  });

  it('recentres when settings arrive after mount if the user has not panned or framed points', async () => {
    // Mount with no points so framePoints never sets hasFramedPoints.
    await mountMap({ points: [] });
    leafletMocks.setView.mockClear();

    const store = useSettingsStore();
    store.settings.defaultCoordinates = { lat: -1.23, lon: 116.95, zoom: 14 };
    await flushPromises();
    await nextTick();

    expect(leafletMocks.setView).toHaveBeenCalledWith([-1.23, 116.95], 14, { animate: false });
  });

  it('does not yank the viewport when points have already been framed', async () => {
    await mountMap({
      points: [point(), point({ id: 'p2', latitude: -1.23, longitude: 116.96 })],
    });
    leafletMocks.setView.mockClear();

    const store = useSettingsStore();
    store.settings.defaultCoordinates = { lat: -1.24, lon: 116.97, zoom: 12 };
    await flushPromises();
    await nextTick();

    expect(leafletMocks.setView).not.toHaveBeenCalled();
  });
});
