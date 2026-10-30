<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
// Leaflet's own stylesheet positions the tile/marker panes. Without it the tiles
// stack in normal flow and the container grows to thousands of pixels.
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster';
import type { SpatialPointDTO, SpatialPointType } from '../../types/maps';
import { useSettingsStore } from '../../stores/settings.store';

interface Props {
  points: SpatialPointDTO[];
  selectedPointId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  selectedPointId: null,
});

const emit = defineEmits<{
  (e: 'select-point', point: SpatialPointDTO): void;
}>();

const mapContainer = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let markerLayerGroup: L.MarkerClusterGroup | null = null;
let sizeInvalidationTimer: number | null = null;
let isUnmounted = false;
const markers = new Map<string, L.Marker>();
/**
 * The first data load frames the map on the surveyed extent; later changes (a
 * filter, a selection) must not move the viewport out from under the user.
 */
let hasFramedPoints = false;

// Default Manggar Coordinates: [-1.2235, 116.9521]
const DEFAULT_CENTER: [number, number] = [-1.2235, 116.9521];
const DEFAULT_ZOOM = 14;

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
    markerElement.setAttribute('role', 'button');
  }
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
    }
  }

  for (const point of props.points) {
    const current = markers.get(point.id);
    if (current) {
      current.setLatLng([point.latitude, point.longitude]);
      current.options.title = markerLabel(point);
      updateMarkerIcon(current, point, point.id === props.selectedPointId);
      current.setZIndexOffset(point.id === props.selectedPointId ? 1000 : 0);
      continue;
    }

    const marker = createMarker(point);
    markers.set(point.id, marker);
    markerLayerGroup.addLayer(marker);
  }
}

let activeZoomendHandler: (() => void) | null = null;

function revealSelectedPoint() {
  if (!map || !markerLayerGroup || !props.selectedPointId) return;
  const targetId = props.selectedPointId;
  const marker = markers.get(targetId);
  if (!marker) return;
  const TARGET_SELECTION_ZOOM = 16;
  const maxZoom = map.getMaxZoom() ?? 19;
  const zoom = Math.min(Math.max(map.getZoom(), TARGET_SELECTION_ZOOM), maxZoom);

  if (activeZoomendHandler && map) {
    map.off('zoomend', activeZoomendHandler);
    activeZoomendHandler = null;
  }

  const reveal = () => {
    if (props.selectedPointId !== targetId) return;
    markerLayerGroup?.zoomToShowLayer(marker, () => {
      if (props.selectedPointId !== targetId) return;
      const point = props.points.find((item) => item.id === targetId);
      if (point) updateMarkerIcon(marker, point, true);
      marker.setZIndexOffset(1000);
    });
  };

  if (map.getZoom() >= zoom) {
    reveal();
  } else {
    activeZoomendHandler = () => {
      activeZoomendHandler = null;
      reveal();
    };
    map.once('zoomend', activeZoomendHandler);
    map.setView(marker.getLatLng(), zoom, {
      animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  }
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
function framePoints() {
  if (!map || hasFramedPoints || props.points.length === 0) return;

  const bounds = L.latLngBounds(
    props.points.map((point) => [point.latitude, point.longitude] as [number, number]),
  );

  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  hasFramedPoints = true;
}

const settingsStore = useSettingsStore();

function getInitialCenter(): [number, number] {
  const coords = settingsStore.defaultCoordinates;
  if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
    return [coords.lat, coords.lon];
  }
  return DEFAULT_CENTER;
}

function getInitialZoom(): number {
  const coords = settingsStore.defaultCoordinates;
  if (coords && typeof coords.zoom === 'number') {
    return coords.zoom;
  }
  return DEFAULT_ZOOM;
}

onMounted(() => {
  isUnmounted = false;
  nextTick(() => {
    if (isUnmounted || typeof window === 'undefined' || !mapContainer.value) return;

    map = L.map(mapContainer.value, {
      zoomControl: false,
      attributionControl: false,
    }).setView(getInitialCenter(), getInitialZoom());

    // Standard OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
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
          html: `<span class="map-cluster__count" aria-hidden="true">${count}</span><span class="sr-only">Kelompok ${count} titik, tekan untuk memperbesar</span>`,
          className: 'map-cluster',
          iconSize: [42, 42],
        });
      },
    }).addTo(map);
    renderMarkers();
    framePoints();

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
    framePoints();
  },
  { deep: true },
);

watch(
  () => props.selectedPointId,
  (id) => {
    renderMarkers();
    if (id) revealSelectedPoint();
  },
);

onUnmounted(() => {
  isUnmounted = true;
  window.removeEventListener('resize', handleResize);
  if (activeZoomendHandler && map) {
    map.off('zoomend', activeZoomendHandler);
    activeZoomendHandler = null;
  }
  if (sizeInvalidationTimer !== null) {
    window.clearTimeout(sizeInvalidationTimer);
    sizeInvalidationTimer = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
  markers.clear();
});
</script>

<template>
  <div
    class="rounded-btn relative h-[420px] w-full overflow-hidden border border-gray-300 bg-gray-100 sm:h-[520px] lg:h-[640px]"
  >
    <div ref="mapContainer" class="h-full w-full" />
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
