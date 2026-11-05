<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MANGGAR_MAP_CENTER, MANGGAR_MAP_DEFAULT_ZOOM } from '../../constants/mapOrigin';

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

const props = defineProps<{
  modelValue: PickedLocation | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: PickedLocation | null): void;
}>();

const container = ref<HTMLElement | null>(null);
const accuracy = ref<number | null>(null);
const locationError = ref('');
let map: L.Map | null = null;
let marker: L.Marker | null = null;
let isUnmounted = false;

function setLocation(location: PickedLocation) {
  if (props.disabled) return;
  emit('update:modelValue', location);
}

function placeMarker(location: PickedLocation) {
  if (!map) return;
  if (!marker) {
    marker = L.marker([location.latitude, location.longitude], {
      draggable: !props.disabled,
    }).addTo(map);
    marker.on('dragend', () => {
      const next = marker?.getLatLng();
      if (next) setLocation({ latitude: next.lat, longitude: next.lng });
    });
  } else {
    marker.setLatLng([location.latitude, location.longitude]);
  }
}

onMounted(() => {
  isUnmounted = false;
  nextTick(() => {
    if (isUnmounted || !container.value) return;
    const start = props.modelValue ?? {
      latitude: MANGGAR_MAP_CENTER[0],
      longitude: MANGGAR_MAP_CENTER[1],
    };
    map = L.map(container.value).setView(
      [start.latitude, start.longitude],
      props.modelValue ? 17 : MANGGAR_MAP_DEFAULT_ZOOM,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      setLocation({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
    if (props.modelValue) placeMarker(props.modelValue);
    window.setTimeout(() => map?.invalidateSize(), 100);
  });
});

watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      marker?.remove();
      marker = null;
      return;
    }
    placeMarker(value);
  },
  { deep: true },
);

function requestCurrentLocation() {
  locationError.value = '';
  accuracy.value = null;
  if (!navigator.geolocation) {
    locationError.value = 'Perangkat ini tidak mendukung deteksi lokasi.';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      accuracy.value = position.coords.accuracy;
      setLocation(location);
      map?.setView([location.latitude, location.longitude], 17);
    },
    (error) => {
      locationError.value =
        error.code === error.PERMISSION_DENIED
          ? 'Izin lokasi tidak diberikan; pilih titik secara manual.'
          : 'Lokasi tidak dapat ditentukan; pilih titik secara manual.';
    },
    { timeout: 10000 },
  );
}

function clearLocation() {
  marker?.remove();
  marker = null;
  accuracy.value = null;
  emit('update:modelValue', null);
}

onUnmounted(() => {
  isUnmounted = true;
  map?.remove();
  map = null;
  marker = null;
});
</script>

<template>
  <div class="space-y-2">
    <div
      ref="container"
      class="h-64 w-full overflow-hidden rounded border border-slate-300"
      data-test="rt-location-picker"
    />
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="text-brand-navy rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
        :disabled="disabled"
        data-test="rt-location-detect"
        @click="requestCurrentLocation"
      >
        Gunakan lokasi saat ini
      </button>
      <button
        type="button"
        class="text-brand-navy rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
        :disabled="disabled || !modelValue"
        data-test="rt-location-clear"
        @click="clearLocation"
      >
        Hapus titik
      </button>
    </div>
    <p class="text-xs text-slate-600">
      Klik peta untuk menempatkan pin, lalu geser untuk menyesuaikan. Perangkat location belum tentu
      sama dengan lokasi rumah Ketua RT.
      <span v-if="accuracy !== null">Perkiraan akurasi ±{{ Math.round(accuracy) }} m.</span>
    </p>
    <p v-if="locationError" class="text-sm text-rose-700" role="alert">{{ locationError }}</p>
    <p v-if="!modelValue" class="text-sm text-slate-600">Lokasi belum dipilih.</p>
  </div>
</template>

<style>
.leaflet-container {
  font-family: inherit;
}
</style>
