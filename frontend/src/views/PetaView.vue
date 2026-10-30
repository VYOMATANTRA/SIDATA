<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import InteractiveMap from '../components/maps/InteractiveMap.vue';
import MapFilterBar from '../components/maps/MapFilterBar.vue';
import MapSummaryDropdown from '../components/maps/MapSummaryDropdown.vue';
import SpatialPointDrawer from '../components/maps/SpatialPointDrawer.vue';
import { useMapsStore } from '../stores/maps';
import { useSettingsStore } from '../stores/settings.store';
import type { SpatialPointDTO, SpatialPointType } from '../types/maps';

const mapsStore = useMapsStore();
const settingsStore = useSettingsStore();

onMounted(() => {
  void mapsStore.loadPoints();
  void mapsStore.loadSummary();
  void settingsStore.fetchPublicSettings();
});

const search = ref('');
const currentPage = ref(1);
const PAGE_SIZE = 5;
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
    if (asRtNumber !== null) {
      return point.rts.includes(asRtNumber);
    }
    return (
      point.name.toLowerCase().includes(term) ||
      (point.rtLeader?.name.toLowerCase().includes(term) ?? false)
    );
  });
});

const defaultOrigin = computed(() => {
  const coords = settingsStore.defaultCoordinates;
  if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
    return { latitude: coords.lat, longitude: coords.lon };
  }
  return KELURAHAN_ORIGIN;
});

const origin = computed(() => userLocation.value ?? defaultOrigin.value);
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

const totalPages = computed(() => Math.max(1, Math.ceil(nearbyPoints.value.length / PAGE_SIZE)));
const paginatedNearbyPoints = computed(() =>
  nearbyPoints.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE),
);
const paginationStart = computed(() =>
  nearbyPoints.value.length === 0 ? 0 : (currentPage.value - 1) * PAGE_SIZE + 1,
);
const paginationEnd = computed(() =>
  Math.min(currentPage.value * PAGE_SIZE, nearbyPoints.value.length),
);

watch(
  [search, () => mapsStore.activeTypeFilter, () => mapsStore.activeRtFilter, userLocation],
  () => {
    currentPage.value = 1;
  },
);

watch(visiblePoints, (points) => {
  if (mapsStore.selectedPoint && !points.some((p) => p.id === mapsStore.selectedPoint?.id)) {
    mapsStore.clearSelection();
  }
});

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
});

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function goToPreviousPage() {
  if (currentPage.value > 1) {
    currentPage.value -= 1;
  }
}

function goToNextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value += 1;
  }
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
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        locationError.value =
          'Izin lokasi tidak diberikan, jarak tetap dihitung dari pusat kelurahan.';
      } else if (err.code === err.TIMEOUT) {
        locationError.value =
          'Waktu permintaan lokasi habis; coba lagi atau gunakan jarak dari pusat kelurahan.';
      } else {
        locationError.value =
          'Lokasi tidak dapat ditentukan saat ini; jarak tetap dihitung dari pusat kelurahan.';
      }
    },
    { timeout: 10000 },
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
        <h2 id="peta-title" class="text-brand-navy text-lg font-bold">Sebaran Titik Spasial</h2>

        <div class="mt-4 flex justify-end">
          <MapSummaryDropdown :summary="mapsStore.summary" />
        </div>

        <p class="mt-3 text-base text-gray-700" aria-live="polite" data-test="peta-count">
          Menampilkan {{ visiblePoints.length }} dari {{ mapsStore.points.length }} titik.
        </p>

        <div
          v-if="mapsStore.error"
          class="rounded-btn mt-4 border border-gray-400 bg-white p-5"
          role="alert"
          data-test="peta-error"
        >
          <p class="text-brand-navy text-base">{{ mapsStore.error }}</p>
          <button
            type="button"
            class="rounded-btn bg-brand-navy hover:bg-brand-navy-deep focus-visible:outline-brand-navy mt-3 px-4 py-2.5 text-base font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            @click="mapsStore.loadPoints()"
          >
            Coba lagi
          </button>
        </div>

        <p v-if="mapsStore.isLoading" class="mt-3 text-base text-gray-700" role="status">
          Memuat titik spasial&hellip;
        </p>

        <!-- Keep map + search + panel mounted so retrying or loading doesn't tear down the Leaflet instance or typed search query -->
        <div class="mt-4 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <InteractiveMap
            :points="visiblePoints"
            :selected-point-id="mapsStore.selectedPoint?.id ?? null"
            @select-point="mapsStore.selectPoint"
          />

          <section
            class="rounded-btn flex max-h-[640px] flex-col overflow-hidden border border-gray-300 bg-white"
            aria-labelledby="terdekat-title"
          >
            <div class="border-b border-gray-200 p-5 pb-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="terdekat-title" class="text-brand-navy text-base font-bold">
                    Titik terdekat
                  </h3>
                  <p class="mt-1 text-sm text-gray-600">Jarak dihitung dari {{ originLabel }}.</p>
                </div>
                <button
                  v-if="mapsStore.selectedPoint"
                  type="button"
                  class="rounded-btn text-brand-navy focus-visible:outline-brand-navy min-h-11 border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                  @click="mapsStore.clearSelection"
                >
                  Kembali ke hasil
                </button>
                <button
                  v-else
                  type="button"
                  class="rounded-btn border-brand-navy text-brand-navy hover:bg-brand-navy focus-visible:outline-brand-navy min-h-11 border px-3 py-2 text-sm font-medium transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
                  @click="requestUserLocation"
                >
                  Dekat saya
                </button>
              </div>

              <label for="peta-search" class="sr-only"
                >Cari nama titik, nomor RT, atau nama ketua RT</label
              >
              <input
                id="peta-search"
                v-model="search"
                type="search"
                name="peta-search"
                placeholder="Cari lokasi, nama, atau nomor RT"
                autocomplete="off"
                class="rounded-btn text-brand-navy focus-visible:border-brand-navy focus-visible:outline-brand-navy mt-4 min-h-11 w-full border border-gray-400 bg-white px-4 py-2.5 text-base placeholder:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2"
                data-test="peta-search"
              />
              <div class="mt-3">
                <MapFilterBar
                  :active-type="mapsStore.activeTypeFilter"
                  @update:type="mapsStore.setTypeFilter"
                />
              </div>
              <p class="mt-3 text-sm text-gray-600" data-test="peta-list-count">
                {{ nearbyPoints.length }} lokasi ditemukan
              </p>
            </div>

            <p v-if="locationError" role="alert" class="text-brand-navy mt-2 px-5 text-sm">
              {{ locationError }}
            </p>

            <SpatialPointDrawer
              v-if="mapsStore.selectedPoint"
              class="min-h-0 flex-1 overflow-y-auto"
              :point="mapsStore.selectedPoint"
              :leader="mapsStore.selectedLeader"
              close-label="Tutup detail"
              @close="mapsStore.clearSelection"
            />

            <ol
              v-else-if="nearbyPoints.length > 0"
              class="min-h-0 flex-1 divide-y divide-gray-200 overflow-y-auto px-5"
            >
              <li
                v-for="item in paginatedNearbyPoints"
                :key="item.point.id"
                :data-test="`peta-result-${item.point.id}`"
              >
                <button
                  type="button"
                  class="focus-visible:outline-brand-navy flex min-h-[68px] w-full cursor-pointer items-start justify-between gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                  :aria-label="`Tampilkan ${item.point.name} pada peta`"
                  data-test="peta-result"
                  @click="mapsStore.selectPoint(item.point)"
                >
                  <span>
                    <span class="text-brand-navy block text-base font-semibold">
                      {{
                        item.point.type === 'ketua_rt' && item.point.rts[0]
                          ? `RT ${item.point.rts[0]}`
                          : item.point.name
                      }}
                    </span>
                    <span class="block text-sm text-gray-600">
                      {{ TYPE_LABELS[item.point.type] }}
                      <template v-if="item.point.rtLeader"
                        >&middot; {{ item.point.rtLeader.name }}</template
                      >
                      <template v-if="item.point.rts.length > 0">
                        &middot; RT {{ item.point.rts.join(', ') }}
                      </template>
                    </span>
                  </span>
                  <span class="text-brand-navy shrink-0 text-sm font-medium">
                    {{ formatDistance(item.distanceKm) }}
                  </span>
                </button>
              </li>
            </ol>

            <p
              v-else-if="!mapsStore.selectedPoint && !mapsStore.isLoading && !mapsStore.error"
              class="mt-3 px-5 text-base text-gray-800"
              data-test="peta-empty"
            >
              Tidak ada titik yang cocok dengan pencarian atau filter saat ini.
            </p>

            <div
              v-if="!mapsStore.selectedPoint && nearbyPoints.length > PAGE_SIZE"
              class="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-3"
            >
              <p class="text-sm text-gray-600 tabular-nums" data-test="peta-pagination-summary">
                {{ paginationStart }}–{{ paginationEnd }} dari {{ nearbyPoints.length }} lokasi
              </p>
              <nav aria-label="Halaman hasil peta" class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-btn text-brand-navy focus-visible:outline-brand-navy min-h-11 min-w-11 border border-gray-300 px-3 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  aria-label="Halaman sebelumnya"
                  data-test="peta-previous-page"
                  :aria-disabled="currentPage === 1"
                  @click="goToPreviousPage"
                >
                  Sebelumnya
                </button>
                <span class="text-sm text-gray-700 tabular-nums"
                  >{{ currentPage }} / {{ totalPages }}</span
                >
                <button
                  type="button"
                  class="rounded-btn text-brand-navy focus-visible:outline-brand-navy min-h-11 min-w-11 border border-gray-300 px-3 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  aria-label="Halaman selanjutnya"
                  data-test="peta-next-page"
                  :aria-disabled="currentPage === totalPages"
                  @click="goToNextPage"
                >
                  Selanjutnya
                </button>
              </nav>
            </div>
          </section>
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
