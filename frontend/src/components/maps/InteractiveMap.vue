<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
import type { SpatialPointDTO, SpatialPointType } from '../../types/maps';

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
let markerLayerGroup: L.LayerGroup | null = null;

// Default Manggar Coordinates: [-1.2235, 116.9521]
const DEFAULT_CENTER: [number, number] = [-1.2235, 116.9521];
const DEFAULT_ZOOM = 14;

function createCustomPin(type: SpatialPointType, isSelected: boolean, rtNumber?: number) {
  let bgClass = 'bg-brand-indigo';
  let label = 'RT';

  if (type === 'bank_sampah') {
    bgClass = 'bg-emerald-600';
    label = 'BS';
  } else if (type === 'fasilitas_umum') {
    bgClass = 'bg-brand-violet';
    label = 'FU';
  }

  const badgeText = type === 'ketua_rt' && rtNumber ? `RT ${rtNumber}` : label;
  const scaleClass = isSelected ? 'scale-125 z-50 ring-2 ring-white' : 'hover:scale-110';

  const html = `
    <div class="relative flex items-center justify-center transition-transform duration-200 ${scaleClass}">
      <div class="${bgClass} text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border-2 border-white flex items-center gap-1 whitespace-nowrap">
        <span>${badgeText}</span>
      </div>
      <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-white absolute -bottom-[5px]"></div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-map-marker',
    iconSize: [40, 30],
    iconAnchor: [20, 30],
  });
}

function renderMarkers() {
  if (!map || !markerLayerGroup) return;

  markerLayerGroup.clearLayers();

  for (const point of props.points) {
    const isSelected = point.id === props.selectedPointId;
    const primaryRt = point.rts[0];
    const icon = createCustomPin(point.type, isSelected, primaryRt);

    const marker = L.marker([point.latitude, point.longitude], { icon });

    marker.on('click', () => {
      emit('select-point', point);
      map?.panTo([point.latitude, point.longitude], { animate: true });
    });

    markerLayerGroup.addLayer(marker);
  }
}

function handleResize() {
  if (map) {
    map.invalidateSize();
  }
}

onMounted(() => {
  nextTick(() => {
    if (!mapContainer.value) return;

    map = L.map(mapContainer.value, {
      zoomControl: false,
      attributionControl: false,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

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
      .addAttribution('© OpenStreetMap')
      .addTo(map);

    markerLayerGroup = L.layerGroup().addTo(map);
    renderMarkers();

    // Trigger size invalidation to calculate proper tile grid after render
    setTimeout(() => {
      map?.invalidateSize();
    }, 150);

    window.addEventListener('resize', handleResize);
  });
});

watch(
  () => [props.points, props.selectedPointId],
  () => {
    renderMarkers();
  },
  { deep: true },
);

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<template>
  <div
    class="relative h-full min-h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-inner"
  >
    <div ref="mapContainer" class="h-full min-h-[480px] w-full" />
  </div>
</template>

<style>
/* Reset default leaflet div-icon background & border */
.custom-map-marker {
  background: transparent !important;
  border: none !important;
}

/* Ensure Leaflet container fills 100% height */
.leaflet-container {
  width: 100% !important;
  height: 100% !important;
  min-height: 480px !important;
  font-family: inherit !important;
}
</style>
