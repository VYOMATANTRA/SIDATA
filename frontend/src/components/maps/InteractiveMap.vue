<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
// Leaflet's own stylesheet positions the tile/marker panes. Without it the tiles
// stack in normal flow and the container grows to thousands of pixels.
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster';
import type { SpatialPointDTO, SpatialPointType } from '../../types/maps';
import { MANGGAR_MAP_CENTER, MANGGAR_MAP_DEFAULT_ZOOM } from '../../constants/mapOrigin';

interface Props {
  points: SpatialPointDTO[];
  /** Full unfiltered set used once for initial bounds; falls back to `points`. */
  framePoints?: SpatialPointDTO[];
  selectedPointId?: string | null;
  defaultCenter?: [number, number];
  defaultZoom?: number;
  userLocation?: { latitude: number; longitude: number; accuracy: number } | null;
}

const props = withDefaults(defineProps<Props>(), {
  selectedPointId: null,
  defaultCenter: () => [...MANGGAR_MAP_CENTER],
  defaultZoom: MANGGAR_MAP_DEFAULT_ZOOM,
  userLocation: null,
});

const emit = defineEmits<{
  (e: 'select-point', point: SpatialPointDTO): void;
  (e: 'escape'): void;
}>();

const mapContainer = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let markerLayerGroup: L.MarkerClusterGroup | null = null;
let userLocationLayer: L.LayerGroup | null = null;
let sizeInvalidationTimer: number | null = null;
let isUnmounted = false;
const markers = new Map<string, L.Marker>();
const markerSignatures = new Map<string, string>();
/**
 * The first data load frames the map on the surveyed extent; later changes (a
 * filter, a selection) must not move the viewport out from under the user.
 */
let hasFramedPoints = false;
let userMovedViewport = false;
/**
 * Counts viewport changes that started with the visitor (drag, wheel, touch, zoom controls or keys),
 * so a caller can tell whether the visitor moved the map while it was waiting for something else,
 * such as a location fix. Programmatic moves never count.
 */
let userInteractionCount = 0;

function markUserMoved() {
  userMovedViewport = true;
  userInteractionCount += 1;
}

/**
 * Leaflet makes markers focusable, so each one needs a name a screen reader can
 * announce — otherwise the map is a row of unnamed buttons.
 */
function markerLabel(point: SpatialPointDTO): string {
  const coverage = point.rts.length > 0 ? ` (RT ${point.rts.join(', ')})` : '';
  return `${point.name}${coverage}`;
}

function createCustomPin(type: SpatialPointType, isSelected: boolean, rtNumber?: number) {
  let bgClass = 'bg-brand-indigo';
  let label = 'RT';

  if (type === 'bank_sampah') {
    bgClass = 'bg-brand-navy-deep';
    label = 'BS';
  } else if (type === 'fasilitas_umum') {
    bgClass = 'bg-brand-violet';
    label = 'FU';
  }

  const badgeText = type === 'ketua_rt' && rtNumber ? `${rtNumber}` : label;
  const selectedClass = isSelected ? 'custom-map-marker--selected' : '';

  const html = `
    <div class="custom-map-marker__badge ${bgClass} ${selectedClass}" aria-hidden="true">
        <span>${badgeText}</span>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-map-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function applyMarkerA11y(marker: L.Marker, point: SpatialPointDTO) {
  const markerElement = marker.getElement();
  if (markerElement) {
    markerElement.setAttribute('aria-label', markerLabel(point));
    markerElement.setAttribute('title', markerLabel(point));
    markerElement.setAttribute('role', 'button');
  }
}

function markerSignature(point: SpatialPointDTO, isSelected: boolean): string {
  return `${point.type}:${point.rts[0] ?? ''}:${isSelected}`;
}

function updateMarkerIcon(marker: L.Marker, point: SpatialPointDTO, isSelected: boolean) {
  marker.setIcon(createCustomPin(point.type, isSelected, point.rts[0]));
  applyMarkerA11y(marker, point);
}

function createMarker(point: SpatialPointDTO) {
  const primaryRt = point.rts[0];
  const icon = createCustomPin(point.type, point.id === props.selectedPointId, primaryRt);

  const marker = L.marker([point.latitude, point.longitude], {
    icon,
    title: markerLabel(point),
  });

  marker.on('click', () => {
    const fresh = props.points.find((item) => item.id === point.id) ?? point;
    emit('select-point', fresh);
  });

  marker.on('add', () => {
    const fresh = props.points.find((item) => item.id === point.id) ?? point;
    applyMarkerA11y(marker, fresh);
  });
  return marker;
}

function renderMarkers() {
  if (!map || !markerLayerGroup) return;

  const nextIds = new Set(props.points.map((point) => point.id));
  for (const [id, marker] of markers) {
    if (!nextIds.has(id)) {
      markerLayerGroup.removeLayer(marker);
      markers.delete(id);
      markerSignatures.delete(id);
    }
  }

  for (const point of props.points) {
    const isSelected = point.id === props.selectedPointId;
    const sig = markerSignature(point, isSelected);
    const current = markers.get(point.id);
    if (current) {
      current.setLatLng([point.latitude, point.longitude]);
      current.options.title = markerLabel(point);
      if (markerSignatures.get(point.id) !== sig) {
        updateMarkerIcon(current, point, isSelected);
        markerSignatures.set(point.id, sig);
      } else {
        // Name or coverage can change without a new icon. setIcon is skipped, so refresh the label.
        applyMarkerA11y(current, point);
      }
      current.setZIndexOffset(isSelected ? 1000 : 0);
      continue;
    }

    const marker = createMarker(point);
    markers.set(point.id, marker);
    markerSignatures.set(point.id, sig);
    markerLayerGroup.addLayer(marker);
  }
}

/**
 * Make a cluster icon keyboard-operable (Enter/Space zooms, or spiderfies at max
 * zoom). The activator lives inside the generated icon, so it is present before
 * Leaflet attaches the icon to the map and survives icon regeneration.
 */
function activateCluster(cluster: L.MarkerCluster) {
  if (!map) return;
  if (map.getZoom() >= map.getMaxZoom()) {
    cluster.spiderfy();
  } else {
    cluster.zoomToBounds({ padding: [28, 28] });
  }
}

/**
 * Keyboard activation is delegated from the map container, so it keeps working
 * after Leaflet regenerates cluster icons on zoom, filter, and spiderfy changes.
 * Leaflet already gives the cluster wrapper itself role="button" and tabindex="0";
 * the inner markup stays presentation-only so each cluster has one tab stop.
 */
function clusterForElement(element: HTMLElement): L.MarkerCluster | null {
  let found: L.MarkerCluster | null = null;
  map?.eachLayer((layer) => {
    const cluster = layer as L.MarkerCluster;
    if (typeof cluster.getChildCount === 'function' && cluster.getElement() === element) {
      found = cluster;
    }
  });
  return found;
}

function handleClusterKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const clusterElement = (event.target as HTMLElement | null)?.closest<HTMLElement>('.map-cluster');
  if (!clusterElement) return;
  const cluster = clusterForElement(clusterElement);
  if (!cluster) return;
  event.preventDefault();
  event.stopPropagation();
  activateCluster(cluster);
}

/**
 * Reveal a point only when the selection came from the result list. Marker
 * clicks select without moving the viewport the user just tapped on.
 */
function revealPoint(pointId: string) {
  if (!map || !markerLayerGroup || !pointId) return;
  const marker = markers.get(pointId);
  if (!marker) return;

  userMovedViewport = true;
  markerLayerGroup.zoomToShowLayer(marker, () => {
    if (props.selectedPointId !== pointId) return;
    const point = props.points.find((item) => item.id === pointId);
    if (point) {
      const sig = markerSignature(point, true);
      if (markerSignatures.get(pointId) !== sig) {
        updateMarkerIcon(marker, point, true);
        markerSignatures.set(pointId, sig);
      }
    }
    marker.setZIndexOffset(1000);
  });
}

function handleResize() {
  if (map) {
    map.invalidateSize();
  }
}

/**
 * Frames the map on the points themselves instead of the fixed default centre,
 * so the surveyed extent fits the viewport on first load.
 */
function frameInitialPoints() {
  const points = props.framePoints ?? props.points;
  if (!map || hasFramedPoints || userMovedViewport || points.length === 0) return;

  const bounds = L.latLngBounds(
    points.map((point) => [point.latitude, point.longitude] as [number, number]),
  );

  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  hasFramedPoints = true;
}

const ZOOM_KEYS = new Set(['+', '=', '-', '_', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Programmatic setView/fitBounds also fire zoomstart, so user intent is tracked
 * from the interactions that actually originate with the visitor.
 */
function handleUserInteraction(event: Event) {
  if (event.type === 'wheel' || event.type === 'touchstart' || event.type === 'dblclick') {
    markUserMoved();
    return;
  }
  if (event.type === 'click') {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.leaflet-control-zoom-in, .leaflet-control-zoom-out')) {
      markUserMoved();
    }
    return;
  }
  if (event.type === 'keydown' && ZOOM_KEYS.has((event as KeyboardEvent).key)) {
    markUserMoved();
  }
}

function renderUserLocation() {
  if (!map) return;
  if (!props.userLocation) {
    userLocationLayer?.clearLayers();
    return;
  }
  if (!userLocationLayer) userLocationLayer = L.layerGroup().addTo(map);
  userLocationLayer.clearLayers();

  const { latitude, longitude, accuracy } = props.userLocation;
  L.circle([latitude, longitude], {
    radius: Math.max(accuracy, 1),
    color: '#0a2353',
    weight: 1,
    fillColor: '#0a2353',
    fillOpacity: 0.12,
  }).addTo(userLocationLayer);
  L.marker([latitude, longitude], {
    icon: L.divIcon({
      className: 'custom-user-marker',
      html: '<span class="custom-user-marker__dot" aria-hidden="true"></span><span class="sr-only">Lokasi Anda</span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
    title: 'Lokasi Anda',
    alt: 'Lokasi Anda',
  }).addTo(userLocationLayer);
}

function focusUserLocation() {
  if (!map || !props.userLocation) return;
  userMovedViewport = true;
  map.setView(
    [props.userLocation.latitude, props.userLocation.longitude],
    Math.max(map.getZoom(), 16),
  );
}

onMounted(() => {
  isUnmounted = false;
  nextTick(() => {
    if (isUnmounted || typeof window === 'undefined' || !mapContainer.value) return;

    map = L.map(mapContainer.value, {
      zoomControl: false,
      attributionControl: false,
    }).setView(props.defaultCenter, props.defaultZoom);

    // A user pan must also win over a late-arriving CMS default.
    map.on('dragstart', markUserMoved);

    mapContainer.value.addEventListener('wheel', handleUserInteraction, { passive: true });
    mapContainer.value.addEventListener('touchstart', handleUserInteraction, { passive: true });
    mapContainer.value.addEventListener('dblclick', handleUserInteraction);
    mapContainer.value.addEventListener('click', handleUserInteraction);
    mapContainer.value.addEventListener('keydown', handleUserInteraction);

    // Standard OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
    }).addTo(map);

    // Add custom zoom control at bottom right
    L.control
      .zoom({
        position: 'bottomright',
      })
      .addTo(map);

    // Attribution
    L.control
      .attribution({
        position: 'bottomleft',
        prefix: false,
      })
      .addAttribution(
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      )
      .addTo(map);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    markerLayerGroup = L.markerClusterGroup({
      maxClusterRadius: 52,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      animate: !reduceMotion,
      chunkedLoading: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<span class="map-cluster__count" aria-hidden="true">${count}</span><span class="sr-only">Kelompok ${count} titik, tekan Enter atau Spasi untuk memperbesar</span>`,
          className: 'map-cluster',
          iconSize: [42, 42],
        });
      },
    }).addTo(map);

    mapContainer.value.addEventListener('keydown', handleClusterKeydown);

    renderMarkers();
    frameInitialPoints();
    renderUserLocation();

    // Trigger size invalidation to calculate proper tile grid after render
    sizeInvalidationTimer = window.setTimeout(() => {
      map?.invalidateSize();
    }, 150);

    window.addEventListener('resize', handleResize);
  });
});

watch(
  () => props.points,
  () => {
    renderMarkers();
    frameInitialPoints();
    renderUserLocation();
  },
  { deep: true },
);

watch(() => props.framePoints, frameInitialPoints, { deep: true });

watch(
  () => props.selectedPointId,
  () => {
    // Highlight only. Viewport reveal is requested explicitly by the result list.
    renderMarkers();
  },
);

watch(
  () => [props.defaultCenter, props.defaultZoom] as const,
  ([center, zoom]) => {
    if (!map || hasFramedPoints || userMovedViewport) return;
    map.setView(center, zoom);
  },
  { deep: true },
);

watch(() => props.userLocation, renderUserLocation, { deep: true });

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  emit('escape');
}

/** Re-measure after a sibling above the map expands or collapses. */
function invalidateSize() {
  map?.invalidateSize();
}

/** See {@link userInteractionCount}. */
function getInteractionCount(): number {
  return userInteractionCount;
}

defineExpose({ revealPoint, focusUserLocation, invalidateSize, getInteractionCount });

onUnmounted(() => {
  isUnmounted = true;
  window.removeEventListener('resize', handleResize);
  const container = mapContainer.value;
  container?.removeEventListener('keydown', handleClusterKeydown);
  container?.removeEventListener('wheel', handleUserInteraction);
  container?.removeEventListener('touchstart', handleUserInteraction);
  container?.removeEventListener('dblclick', handleUserInteraction);
  container?.removeEventListener('click', handleUserInteraction);
  container?.removeEventListener('keydown', handleUserInteraction);
  if (sizeInvalidationTimer !== null) {
    window.clearTimeout(sizeInvalidationTimer);
    sizeInvalidationTimer = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
  markers.clear();
  markerSignatures.clear();
  userLocationLayer = null;
});
</script>

<template>
  <div
    class="rounded-btn border-border-strong bg-surface-muted relative isolate z-0 h-[min(70dvh,26rem)] min-h-[16rem] w-full overflow-hidden border sm:h-[min(520px,max(70dvh,16rem))] lg:h-[640px]"
    data-test="interactive-map"
    @keydown="handleEscape"
  >
    <!--
      The root is a local stacking boundary (`isolate z-0`): Leaflet's panes (z-index 200-700) and
      controls (800-1000) stay ordered among themselves but cannot compete with page UI such as
      the summary overlay. Do not remove it or raise page z-indexes to compensate.
    -->
    <div ref="mapContainer" data-test="map-canvas" class="h-full w-full" />
  </div>
</template>

<style>
/* Reset default leaflet div-icon background & border */
.custom-map-marker {
  background: transparent !important;
  border: none !important;
}

.custom-map-marker__badge {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 2px solid white;
  border-radius: 50%;
  color: white;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 1px 4px rgb(10 35 83 / 32%);
  transition:
    box-shadow 120ms ease-out,
    transform 120ms ease-out;
}

.custom-map-marker--selected {
  outline: 3px solid #0a2353;
  outline-offset: 2px;
  transform: scale(1.12);
}

.map-cluster {
  display: grid;
  place-items: center;
  border: 3px solid rgb(255 255 255 / 90%);
  border-radius: 50%;
  background: #0a2353;
  box-shadow: 0 2px 8px rgb(10 35 83 / 24%);
}

.map-cluster__count {
  color: white;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.custom-user-marker {
  background: transparent !important;
  border: none !important;
}

.custom-user-marker__dot {
  display: block;
  width: 18px;
  height: 18px;
  border: 3px solid white;
  border-radius: 50%;
  background: #0a2353;
  box-shadow: 0 0 0 2px rgb(10 35 83 / 35%);
}

.map-cluster:focus-visible {
  outline: 3px solid #0a2353;
  outline-offset: 3px;
}

@media (hover: hover) and (pointer: fine) {
  .custom-map-marker:hover .custom-map-marker__badge {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .custom-map-marker__badge {
    transition: none;
  }
}

.leaflet-container {
  font-family: inherit !important;
}
</style>
