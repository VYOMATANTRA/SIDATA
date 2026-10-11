<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import InteractiveMap from '../components/maps/InteractiveMap.vue';
import MapFilterBar from '../components/maps/MapFilterBar.vue';
import MapSummaryDropdown from '../components/maps/MapSummaryDropdown.vue';
import SpatialPointDrawer from '../components/maps/SpatialPointDrawer.vue';
import { useMapsStore } from '../stores/maps';
import type { SpatialPointDTO, SpatialPointType } from '../types/maps';

const mapsStore = useMapsStore();

onMounted(() => {
  void mapsStore.loadPoints();
  void mapsStore.loadSummary();
});

const search = ref('');
const userLocation = ref<{ latitude: number; longitude: number } | null>(null);
const locationError = ref<string | null>(null);

/**
 * The dataset carries no coordinate for the kelurahan office itself, so
 * distances are measured from the map's Manggar centre and labelled as such
 * rather than pretending to be measured from the office.
 */
const KELURAHAN_ORIGIN = { latitude: -1.2235, longitude: 116.9521 };

const TYPE_LABELS: Record<SpatialPointType, string> = {
  ketua_rt: 'Ketua RT',
  bank_sampah: 'Bank Sampah Unit',
  fasilitas_umum: 'Fasilitas Umum',
};

/** Text search sits on top of the type/RT filters the store already applies. */
const visiblePoints = computed<SpatialPointDTO[]>(() => {
  const term = search.value.trim().toLowerCase();

  if (term === '') {
    return mapsStore.filteredPoints;
  }

  const asRtNumber = /^\d+$/.test(term) ? Number.parseInt(term, 10) : null;

  return mapsStore.filteredPoints.filter((point) => {
    if (asRtNumber !== null && point.rts.includes(asRtNumber)) {
      return true;
    }
    return point.name.toLowerCase().includes(term);
  });
});

const origin = computed(() => userLocation.value ?? KELURAHAN_ORIGIN);
const originLabel = computed(() => (userLocation.value ? 'lokasi Anda' : 'pusat kelurahan'));

function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadiusKm = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

const nearbyPoints = computed(() =>
  visiblePoints.value
    .map((point) => ({ point, distanceKm: haversineKm(origin.value, point) }))
    .sort((a, b) => a.distanceKm - b.distanceKm),
);

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Geolocation is only requested on click — never on load. */
function requestUserLocation() {
  locationError.value = null;

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    locationError.value = 'Perangkat ini tidak mendukung deteksi lokasi.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation.value = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    },
    () => {
      locationError.value = 'Izin lokasi tidak diberikan, jarak tetap dihitung dari pusat kelurahan.';
    },
  );
}
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Peta" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel
      title="Peta Kelurahan Manggar"
      subtitle="Sebaran titik Ketua RT dan Bank Sampah Unit. Pilih penanda pada peta atau daftar untuk melihat detail dan kontaknya."
    />

    <section class="bg-white px-4 py-8 sm:px-6 sm:py-10" aria-labelledby="peta-title">
      <div class="mx-auto max-w-6xl">
        <h2 id="peta-title" class="text-lg font-bold text-brand-navy">Sebaran Titik Spasial</h2>

        <div class="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="w-full lg:max-w-sm">
            <label for="peta-search" class="block text-base font-medium text-brand-navy">
              Cari nama titik atau nomor RT
            </label>
            <input
              id="peta-search"
              v-model="search"
              type="search"
              name="peta-search"
              placeholder="Contoh: Bank Sampah atau 30"
              autocomplete="off"
              class="mt-2 w-full rounded-btn border border-gray-400 bg-white px-4 py-2.5 text-base text-brand-navy placeholder:text-gray-500 focus-visible:border-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
              data-test="peta-search"
            />
          </div>

          <MapSummaryDropdown :summary="mapsStore.summary" />
        </div>

        <div class="mt-3">
          <MapFilterBar
            :active-type="mapsStore.activeTypeFilter"
            :active-rt="mapsStore.activeRtFilter"
            @update:type="mapsStore.setTypeFilter"
            @update:rt="mapsStore.setRtFilter"
          />
        </div>

        <p class="mt-3 text-base text-gray-700" aria-live="polite" data-test="peta-count">
          Menampilkan {{ visiblePoints.length }} dari {{ mapsStore.points.length }} titik.
        </p>

        <div
          v-if="mapsStore.error"
          class="mt-4 rounded-btn border border-gray-400 bg-white p-5"
          role="alert"
          data-test="peta-error"
        >
          <p class="text-base text-brand-navy">{{ mapsStore.error }}</p>
          <button
            type="button"
            class="mt-3 rounded-btn bg-brand-navy px-4 py-2.5 text-base font-medium text-white hover:bg-brand-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            @click="mapsStore.loadPoints()"
          >
            Coba lagi
          </button>
        </div>

        <p v-else-if="mapsStore.isLoading" class="mt-3 text-base text-gray-700" role="status">
          Memuat titik spasial&hellip;
        </p>

        <div v-else class="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <InteractiveMap
            :points="visiblePoints"
            :selected-point-id="mapsStore.selectedPoint?.id ?? null"
            @select-point="mapsStore.selectPoint"
          />

          <div class="flex flex-col gap-4">
            <SpatialPointDrawer
              v-if="mapsStore.selectedPoint"
              :point="mapsStore.selectedPoint"
              :leader="mapsStore.selectedLeader"
              @close="mapsStore.clearSelection"
            />

            <!-- Nearby list is the default panel state; choosing a row swaps in the detail view -->
            <section
              v-else
              class="rounded-btn border border-gray-300 bg-white p-5"
              aria-labelledby="terdekat-title"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 id="terdekat-title" class="text-base font-bold text-brand-navy">
                  Titik terdekat
                </h3>
                <button
                  type="button"
                  class="rounded-btn border-2 border-brand-navy bg-white px-3 py-2.5 text-sm font-medium text-brand-navy transition-colors hover:bg-brand-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                  @click="requestUserLocation"
                >
                  Dekat saya
                </button>
              </div>

              <p class="mt-1 text-sm text-gray-600">Jarak dihitung dari {{ originLabel }}.</p>

              <p v-if="locationError" role="alert" class="mt-2 text-sm text-brand-navy">
                {{ locationError }}
              </p>

              <ol v-if="nearbyPoints.length > 0" class="mt-3 divide-y divide-gray-200">
                <li v-for="item in nearbyPoints" :key="item.point.id">
                  <button
                    type="button"
                    class="flex w-full cursor-pointer items-start justify-between gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                    @click="mapsStore.selectPoint(item.point)"
                  >
                    <span>
                      <span class="block text-base font-medium text-brand-navy">
                        {{ item.point.name }}
                      </span>
                      <span class="block text-sm text-gray-600">
                        {{ TYPE_LABELS[item.point.type] }}
                        <template v-if="item.point.rts.length > 0">
                          &middot; RT {{ item.point.rts.join(', ') }}
                        </template>
                      </span>
                    </span>
                    <span class="shrink-0 text-sm font-medium text-brand-navy">
                      {{ formatDistance(item.distanceKm) }}
                    </span>
                  </button>
                </li>
              </ol>

              <p v-else class="mt-3 text-base text-gray-800" data-test="peta-empty">
                Tidak ada titik yang cocok dengan pencarian atau filter saat ini.
              </p>
            </section>
          </div>
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
