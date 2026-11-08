/**
 * Shared Leaflet stand-in for the location-picker specs (jsdom cannot render a real map).
 *
 * Usage in a spec:
 *
 *   vi.mock('leaflet', async () => (await import('./leafletMock')).createLeafletMock());
 *
 * and import `leafletState` / `resetLeafletState` from './leafletMock' to drive and inspect it.
 * The map keeps a centre and zoom so code that reads them back behaves like the real thing, and
 * `setView` / `invalidateSize` / `panTo` fire `moveend` the way Leaflet does, so a component's
 * feedback-loop guard is actually exercised.
 *
 * Mock limitations:
 * - `panBy` does not perform pixel snapping against real browser display scaling.
 * - `panTo` ignores the `animate` option and immediately updates center.
 * - Pin mode touch and pointer interactions (such as pointer-cancel) require real-browser verification.
 */
import { vi } from 'vitest';

type Handler = (event?: unknown) => void;

export const leafletState = {
  center: { lat: 0, lng: 0 },
  zoom: 0,
  handlers: {} as Record<string, Handler>,
  markerHandlers: {} as Record<string, Handler>,
  markerLatLng: { lat: 0, lng: 0 },
  markerOptions: undefined as Record<string, unknown> | undefined,
  mapOptions: undefined as Record<string, unknown> | undefined,
  inBounds: true,
  markerCreated: 0,
  /**
   * Simulates Leaflet adjusting the centre during `invalidateSize` (e.g. a half-pixel shift when
   * the container size changes): added to the centre before `moveend` fires.
   * Real `setView` returns the requested centre exactly; this mock also applies the drift there so
   * specs can exercise the picker's guards. The picker uses no `maxBounds`.
   */
  centerDrift: null as { lat: number; lng: number } | null,
};

export function resetLeafletState(): void {
  leafletState.center = { lat: 0, lng: 0 };
  leafletState.zoom = 0;
  leafletState.handlers = {};
  leafletState.markerHandlers = {};
  leafletState.markerLatLng = { lat: 0, lng: 0 };
  leafletState.markerOptions = undefined;
  leafletState.mapOptions = undefined;
  leafletState.inBounds = true;
  leafletState.markerCreated = 0;
  leafletState.centerDrift = null;
}

const handlerStub = () => ({ enable: vi.fn<() => void>(), disable: vi.fn<() => void>() });

function applyDrift(): void {
  const drift = leafletState.centerDrift;
  if (!drift) return;
  leafletState.center = {
    lat: leafletState.center.lat + drift.lat,
    lng: leafletState.center.lng + drift.lng,
  };
}

export const leafletMap = {
  setView: vi.fn<(center: [number, number], zoom?: number, options?: unknown) => unknown>(),
  setZoom: vi.fn<(zoom: number, options?: unknown) => unknown>(),
  panBy: vi.fn<(offset: [number, number], options?: unknown) => unknown>(),
  panTo: vi.fn<(center: [number, number], options?: unknown) => unknown>(),
  getCenter: vi.fn<() => { lat: number; lng: number }>(),
  getZoom: vi.fn<() => number>(),
  getBounds: vi.fn<() => { contains: (point: unknown) => boolean }>(),
  on: vi.fn<(name: string, handler: Handler) => unknown>(),
  remove: vi.fn<() => unknown>(),
  invalidateSize: vi.fn<() => unknown>(),
  dragging: handlerStub(),
  touchZoom: handlerStub(),
  doubleClickZoom: handlerStub(),
  boxZoom: handlerStub(),
};

export const leafletMarker = {
  addTo: vi.fn<() => unknown>(),
  on: vi.fn<(name: string, handler: Handler) => unknown>(),
  setLatLng: vi.fn<(latLng: [number, number]) => unknown>(),
  getLatLng: vi.fn<() => { lat: number; lng: number }>(),
  remove: vi.fn<() => unknown>(),
  dragging: handlerStub(),
};

function wire(): void {
  leafletMap.setView.mockImplementation((center, zoom) => {
    leafletState.center = { lat: center[0], lng: center[1] };
    if (typeof zoom === 'number') leafletState.zoom = zoom;
    applyDrift();
    // Real Leaflet fires `moveend` synchronously for a non-animated setView.
    leafletState.handlers.moveend?.();
    return leafletMap;
  });
  leafletMap.setZoom.mockImplementation((zoom) => {
    leafletState.zoom = zoom;
    leafletState.handlers.zoomend?.();
    return leafletMap;
  });
  leafletMap.panBy.mockImplementation((offset) => {
    // Whole-pixel pan at the current zoom (Web Mercator, 256 px tiles), like Leaflet's `panBy`.
    const perPixel = 360 / (256 * 2 ** leafletState.zoom);
    const cos = Math.cos((leafletState.center.lat * Math.PI) / 180);
    leafletState.center = {
      lat: leafletState.center.lat - offset[1] * perPixel * cos,
      lng: leafletState.center.lng + offset[0] * perPixel,
    };
    leafletState.handlers.moveend?.();
    return leafletMap;
  });
  leafletMap.panTo.mockImplementation((center) => {
    leafletState.center = { lat: center[0], lng: center[1] };
    // Real Leaflet fires `moveend` once the pan finishes, i.e. after the call has returned.
    queueMicrotask(() => leafletState.handlers.moveend?.());
    return leafletMap;
  });
  leafletMap.invalidateSize.mockImplementation(() => {
    applyDrift();
    leafletState.handlers.moveend?.();
    return leafletMap;
  });
  leafletMap.getCenter.mockImplementation(() => ({ ...leafletState.center }));
  leafletMap.getZoom.mockImplementation(() => leafletState.zoom);
  leafletMap.getBounds.mockImplementation(() => ({ contains: () => leafletState.inBounds }));
  leafletMap.on.mockImplementation((name, handler) => {
    leafletState.handlers[name] = handler;
    return leafletMap;
  });
  leafletMarker.addTo.mockImplementation(() => leafletMarker);
  leafletMarker.on.mockImplementation((name, handler) => {
    leafletState.markerHandlers[name] = handler;
    return leafletMarker;
  });
  leafletMarker.setLatLng.mockImplementation((latLng) => {
    leafletState.markerLatLng = { lat: latLng[0], lng: latLng[1] };
    return leafletMarker;
  });
  leafletMarker.getLatLng.mockImplementation(() => ({ ...leafletState.markerLatLng }));
}

/** Clears call history, state and re-installs implementations. Call from `beforeEach`. */
export function resetLeafletMock(): void {
  vi.clearAllMocks();
  resetLeafletState();
  wire();
}

export function createLeafletMock() {
  wire();
  return {
    default: {
      map: (_element: unknown, options?: Record<string, unknown>) => {
        leafletState.mapOptions = options;
        return leafletMap;
      },
      marker: (latLng: [number, number], options?: Record<string, unknown>) => {
        leafletState.markerCreated += 1;
        leafletState.markerLatLng = { lat: latLng[0], lng: latLng[1] };
        leafletState.markerOptions = options;
        return leafletMarker;
      },
      divIcon: (options: unknown) => options,
      tileLayer: () => ({ addTo: vi.fn<() => unknown>() }),
    },
  };
}
