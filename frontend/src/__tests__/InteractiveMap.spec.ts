import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { MANGGAR_MAP_CENTER, MANGGAR_MAP_DEFAULT_ZOOM } from '../constants/mapOrigin';
import type { SpatialPointDTO } from '../types/maps';

const leafletMocks = vi.hoisted(() => {
  const setView = vi.fn<(...args: unknown[]) => unknown>(function (this: unknown) {
    return this;
  });
  const fitBounds = vi.fn<(...args: unknown[]) => unknown>(function (this: unknown) {
    return this;
  });
  const getZoom = vi.fn<() => number>(() => 13);
  const getMaxZoom = vi.fn<() => number>(() => 19);
  const getBounds = vi.fn<() => { contains: () => boolean }>(() => ({ contains: () => false }));
  const off = vi.fn<() => void>();
  const once = vi.fn<() => void>();
  const remove = vi.fn<() => void>();
  const invalidateSize = vi.fn<() => void>();
  const addToMap = vi.fn<() => unknown>().mockReturnThis();

  const zoomToShowLayer = vi.fn<(marker: unknown, cb?: () => void) => void>((_marker, cb) => {
    cb?.();
  });
  const zoomToBounds = vi.fn<() => void>();
  const spiderfy = vi.fn<() => void>();
  const clusterOn = vi.fn<(event: string, handler: (...args: never[]) => void) => void>();
  const clusterAddTo = vi.fn<() => unknown>().mockReturnThis();
  const clusterRemoveLayer = vi.fn<() => void>();
  const clusterAddLayer = vi.fn<() => void>();

  const markerOn = vi.fn<() => void>();
  const markerSetIcon = vi.fn<() => void>();
  const markerSetLatLng = vi.fn<() => void>();
  const markerSetZIndexOffset = vi.fn<() => void>();
  const markerGetLatLng = vi.fn<() => { lat: number; lng: number }>(() => ({
    lat: -1.2251,
    lng: 116.9438,
  }));

  const state = {
    lastClusterGroupOptions: null as Record<string, unknown> | null,
    layeraddHandler: null as ((event: { layer: unknown }) => void) | null,
    animationendHandler: null as (() => void) | null,
    clusterLayers: [] as unknown[],
  };

  const eachLayer = vi.fn<(fn: (layer: unknown) => void) => void>((fn) => {
    for (const layer of state.clusterLayers) fn(layer);
  });

  const mapInstance: Record<string, unknown> = {
    setView,
    fitBounds,
    getZoom,
    getMaxZoom,
    getBounds,
    off,
    once,
    on: vi.fn<(event: string, handler: () => void) => void>(),
    eachLayer: (fn: (layer: unknown) => void) => {
      for (const layer of state.clusterLayers) fn(layer);
    },
    remove,
    invalidateSize,
    addLayer: vi.fn<() => void>(),
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
      spiderfy,
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
    map: vi.fn<() => Record<string, unknown>>(() => mapInstance),
    tileLayer: vi.fn<() => { addTo: typeof addToMap }>(() => ({ addTo: addToMap })),
    control: {
      zoom: vi.fn<() => { addTo: typeof addToMap }>(() => ({ addTo: addToMap })),
      attribution: vi.fn<
        () => { addAttribution: ReturnType<typeof vi.fn>; addTo: typeof addToMap }
      >(() => ({
        addAttribution: vi.fn<() => unknown>().mockReturnThis(),
        addTo: addToMap,
      })),
    },
    marker: vi.fn<() => Record<string, unknown>>(() => {
      const el = document.createElement('div');
      el.className = 'leaflet-marker-icon';
      return {
        on: markerOn,
        setIcon: markerSetIcon,
        setLatLng: markerSetLatLng,
        setZIndexOffset: markerSetZIndexOffset,
        getLatLng: markerGetLatLng,
        getElement: () => el,
        options: {},
      };
    }),
    divIcon: vi.fn<(opts: unknown) => unknown>((opts) => opts),
    latLngBounds: vi.fn<(latlngs: unknown) => unknown>((latlngs) => latlngs),
    markerClusterGroup,
  };

  return {
    setView,
    fitBounds,
    getZoom,
    getMaxZoom,
    zoomToShowLayer,
    zoomToBounds,
    spiderfy,
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
  props: {
    points?: SpatialPointDTO[];
    selectedPointId?: string | null;
    defaultCenter?: [number, number];
    defaultZoom?: number;
  } = {},
) {
  const wrapper = mount(InteractiveMap, {
    props: {
      points: props.points ?? [point()],
      selectedPointId: props.selectedPointId ?? null,
      ...(props.defaultCenter ? { defaultCenter: props.defaultCenter } : {}),
      ...(props.defaultZoom ? { defaultZoom: props.defaultZoom } : {}),
    },
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
    leafletMocks.state.clusterLayers = [];
    leafletMocks.getZoom.mockReturnValue(13);
    leafletMocks.setView.mockImplementation(function () {
      return leafletMocks.mapInstance;
    });
    vi.stubGlobal(
      'matchMedia',
      vi
        .fn<
          () => { matches: boolean; addEventListener: () => void; removeEventListener: () => void }
        >()
        .mockReturnValue({
          matches: true,
          addEventListener: vi.fn<() => void>(),
          removeEventListener: vi.fn<() => void>(),
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

  it('uses CMS default centre and zoom when supplied', async () => {
    await mountMap({ defaultCenter: [-1.2, 116.9], defaultZoom: 12 });
    expect(leafletMocks.setView).toHaveBeenCalledWith([-1.2, 116.9], 12);
  });

  it('highlights a selected point without moving the viewport', async () => {
    const wrapper = await mountMap({ points: [point()], selectedPointId: null });
    leafletMocks.setView.mockClear();
    leafletMocks.zoomToShowLayer.mockClear();

    await wrapper.setProps({ selectedPointId: 'point-1' });
    await flushPromises();

    expect(leafletMocks.zoomToShowLayer).not.toHaveBeenCalled();
    expect(leafletMocks.setView).not.toHaveBeenCalled();
    const marker = leafletMocks.L.marker.mock.results[0]?.value as {
      setZIndexOffset: ReturnType<typeof vi.fn>;
    };
    expect(marker.setZIndexOffset).toHaveBeenCalledWith(1000);
  });

  it('reveals a point only when the result list explicitly asks for it', async () => {
    const wrapper = await mountMap({ points: [point()], selectedPointId: 'point-1' });
    leafletMocks.setView.mockClear();
    leafletMocks.zoomToShowLayer.mockClear();

    (wrapper.vm as unknown as { revealPoint: (id: string) => void }).revealPoint('point-1');
    await flushPromises();

    expect(leafletMocks.zoomToShowLayer).toHaveBeenCalledTimes(1);
    expect(leafletMocks.setView).not.toHaveBeenCalled();
  });

  it('applies a late default centre only before points frame the map or the user moves it', async () => {
    const wrapper = await mountMap({ points: [] });
    leafletMocks.setView.mockClear();
    await wrapper.setProps({ defaultCenter: [-1.2, 116.9], defaultZoom: 12 });
    expect(leafletMocks.setView).toHaveBeenCalledWith([-1.2, 116.9], 12);

    const framed = await mountMap();
    leafletMocks.setView.mockClear();
    await framed.setProps({ defaultCenter: [-1.1, 116.8], defaultZoom: 11 });
    expect(leafletMocks.setView).not.toHaveBeenCalled();
  });

  it('emits escape from within the map', async () => {
    const wrapper = await mountMap();
    await wrapper.find('.leaflet-container, div').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('escape')).toBeDefined();
  });

  it('creates accessible cluster activators and zooms or spiderfies on Enter/Space', async () => {
    const wrapper = await mountMap({
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

    const iconCreate = leafletMocks.state.lastClusterGroupOptions?.iconCreateFunction as (cluster: {
      getChildCount: () => number;
    }) => { html: string; className: string };
    const created = iconCreate({ getChildCount: () => 2 });
    expect(created.className).toBe('map-cluster');
    expect(created.html).toContain('role="button"');
    expect(created.html).toContain('tabindex="0"');
    expect(created.html).toContain('Kelompok 2 titik');
    expect(created.html).toContain('data-cluster-activator');

    const iconEl = document.createElement('div');
    iconEl.className = 'map-cluster leaflet-marker-icon';
    iconEl.innerHTML = created.html;
    const cluster = {
      getChildCount: () => 2,
      getElement: () => iconEl,
      zoomToBounds: leafletMocks.zoomToBounds,
      spiderfy: leafletMocks.spiderfy,
    };
    leafletMocks.state.clusterLayers = [cluster];

    (wrapper.element.querySelector('[data-test="map-canvas"]') as HTMLElement).appendChild(iconEl);
    const activator = iconEl.querySelector('[data-cluster-activator]') as HTMLElement;
    expect(activator).toBeTruthy();
    expect(activator.getAttribute('role')).toBe('button');
    expect(activator.getAttribute('tabindex')).toBe('0');
    expect(activator.getAttribute('aria-label')).toContain('Kelompok 2');

    activator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(leafletMocks.zoomToBounds).toHaveBeenCalledTimes(1);

    leafletMocks.zoomToBounds.mockClear();
    activator.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(leafletMocks.zoomToBounds).toHaveBeenCalledTimes(1);

    leafletMocks.zoomToBounds.mockClear();
    leafletMocks.getZoom.mockReturnValue(19);
    activator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(leafletMocks.zoomToBounds).not.toHaveBeenCalled();
    expect(leafletMocks.spiderfy).toHaveBeenCalledTimes(1);
  });

  it('refreshes a marker aria-label when only the name changes', async () => {
    const wrapper = await mountMap({
      points: [point({ id: 'point-1', name: 'Pos Lama', rts: [1] })],
    });
    const marker = leafletMocks.L.marker.mock.results[0]?.value as {
      getElement: () => HTMLElement;
    };
    const el = marker.getElement();

    await wrapper.setProps({ points: [point({ id: 'point-1', name: 'Pos Lama', rts: [1] })] });
    await flushPromises();
    expect(el.getAttribute('aria-label')).toContain('Pos Lama');

    await wrapper.setProps({ points: [point({ id: 'point-1', name: 'Pos Baru', rts: [1] })] });
    await flushPromises();

    expect(el.getAttribute('aria-label')).toContain('Pos Baru');
    expect(leafletMocks.L.marker).toHaveBeenCalledTimes(1);
  });
});
