<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import InteractiveMap from '../components/maps/InteractiveMap.vue';
import MapFilterBar from '../components/maps/MapFilterBar.vue';
import MapSummaryDropdown from '../components/maps/MapSummaryDropdown.vue';
import SpatialPointDrawer from '../components/maps/SpatialPointDrawer.vue';
import { useMapsStore } from '../stores/maps';
import { useSettingsStore } from '../stores/settings.store';
import { useGeolocation } from '../composables/useGeolocation';
import { useIsDesktop } from '../composables/useIsDesktop';
import type { SpatialPointDTO, SpatialPointType } from '../types/maps';
import { MANGGAR_MAP_DEFAULT_ZOOM, MANGGAR_MAP_ORIGIN } from '../constants/mapOrigin';

const mapsStore = useMapsStore();
const settingsStore = useSettingsStore();
const mapRef = ref<InstanceType<typeof InteractiveMap> | null>(null);

/** The in-flow summary disclosure moves the map on mobile; re-measure so tiles don't misrender. */
function onSummaryLayoutChange() {
  mapRef.value?.invalidateSize?.();
}

function retryMapData() {
  void mapsStore.loadPoints();
  void mapsStore.loadSummary();
}

onMounted(() => {
  retryMapData();
  if (!settingsStore.isLoaded && !settingsStore.isLoading) {
    void settingsStore.fetchPublicSettings();
  }
});

const search = ref('');
const currentPage = ref(1);
const PAGE_SIZE = 5;

// The visitor's location lives in the shared session state of `useGeolocation`: nothing here
// stores it, and a failure never blocks browsing (distances then use the kelurahan centre).
const geolocation = useGeolocation();
const locationStatus = geolocation.status;
const userLocation = computed(() => geolocation.position.value);

/**
 * Distances use the CMS default coordinates when they have loaded.
 * `KELURAHAN_ORIGIN` is only the fallback when settings are unavailable.
 */
const KELURAHAN_ORIGIN = MANGGAR_MAP_ORIGIN;

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
  const rtPrefix = asRtNumber === null ? '' : String(asRtNumber);

  return mapsStore.filteredPoints.filter((point) => {
    const nameMatches =
      point.name.toLowerCase().includes(term) ||
      (point.rtLeader?.name.toLowerCase().includes(term) ?? false);
    if (nameMatches) return true;
    return rtPrefix !== '' && point.rts.some((rt) => String(rt).startsWith(rtPrefix));
  });
});

const defaultOrigin = computed(() => {
  const coords = settingsStore.defaultCoordinates;
  if (
    coords &&
    typeof coords.lat === 'number' &&
    Number.isFinite(coords.lat) &&
    Math.abs(coords.lat) <= 90 &&
    typeof coords.lon === 'number' &&
    Number.isFinite(coords.lon) &&
    Math.abs(coords.lon) <= 180
  ) {
    return { latitude: coords.lat, longitude: coords.lon };
  }
  return KELURAHAN_ORIGIN;
});

const defaultZoom = computed(() => {
  const zoom = settingsStore.defaultCoordinates?.zoom;
  return typeof zoom === 'number' && Number.isInteger(zoom) && zoom >= 1 && zoom <= 20
    ? zoom
    : MANGGAR_MAP_DEFAULT_ZOOM;
});

const defaultCenter = computed<[number, number]>(() => [
  defaultOrigin.value.latitude,
  defaultOrigin.value.longitude,
]);

const origin = computed(() => userLocation.value ?? defaultOrigin.value);
/** Every distance names where it is measured from (SPEC §8). */
const originLabel = computed(() => (userLocation.value ? 'lokasi Anda' : 'pusat kelurahan'));
const originSentence = computed(() => `Jarak dari ${originLabel.value}`);

const isFiltered = computed(
  () => search.value.trim() !== '' || mapsStore.activeTypeFilter !== 'all',
);
const totalPointCount = computed(() => mapsStore.points.length);

/** Says whether the number covers every point or only the search/filter results. */
const countText = computed(() => {
  if (totalPointCount.value === 0) return '';
  if (!isFiltered.value) return `Menampilkan semua ${totalPointCount.value} titik.`;
  return `Menampilkan ${visiblePoints.value.length} dari ${totalPointCount.value} titik sesuai pencarian atau filter.`;
});

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

watch([search, () => mapsStore.activeTypeFilter, userLocation, defaultOrigin], () => {
  currentPage.value = 1;
});

/** Result-list selections reveal the marker; marker clicks do not move the map. */
async function selectFromList(point: SpatialPointDTO) {
  void mapsStore.selectPoint(point);
  await nextTick();
  mapRef.value?.revealPoint(point.id);
}

function onMapEscape() {
  if (mapsStore.selectedPoint) mapsStore.clearSelection();
}

watch(visiblePoints, (points) => {
  if (mapsStore.selectedPoint && !points.some((p) => p.id === mapsStore.selectedPoint?.id)) {
    mapsStore.clearSelection();
  }
});

const prevPageBtn = ref<HTMLButtonElement | null>(null);
const nextPageBtn = ref<HTMLButtonElement | null>(null);
const pagerHadFocus = ref(false);

function onPagerFocusIn() {
  pagerHadFocus.value = true;
}

function onPagerFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (next === prevPageBtn.value || next === nextPageBtn.value) return;
  pagerHadFocus.value = false;
}

watch(totalPages, async (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
  await nextTick();
  if (!pagerHadFocus.value) return;
  const activeEl = document.activeElement;
  const onPager = activeEl === prevPageBtn.value || activeEl === nextPageBtn.value;
  if (onPager && !(activeEl as HTMLButtonElement).disabled) return;
  if (!onPager && activeEl !== document.body) return;
  focusEnabledPager(nextPageBtn.value, prevPageBtn.value);
});

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function paginationFocusLost(activeEl: Element | null): boolean {
  if (!activeEl || activeEl === document.body) return true;
  const button = activeEl as HTMLButtonElement;
  return button.disabled === true || activeEl.hasAttribute('disabled');
}

function focusEnabledPager(preferred: HTMLButtonElement | null, other: HTMLButtonElement | null) {
  if (preferred && !preferred.disabled) preferred.focus();
  else if (other && !other.disabled) other.focus();
  else document.getElementById('peta-search')?.focus();
}

function shouldHandoffPager(event: Event): boolean {
  const activeEl = document.activeElement as HTMLButtonElement | null;
  if (activeEl?.disabled) return true;
  const keyboard = event instanceof MouseEvent && event.detail === 0;
  return keyboard && paginationFocusLost(activeEl);
}

async function goToPreviousPage(event: Event) {
  if (currentPage.value > 1) {
    currentPage.value -= 1;
    await nextTick();
    if (shouldHandoffPager(event)) focusEnabledPager(nextPageBtn.value, prevPageBtn.value);
  }
}

async function goToNextPage(event: Event) {
  if (currentPage.value < totalPages.value) {
    currentPage.value += 1;
    await nextTick();
    if (shouldHandoffPager(event)) focusEnabledPager(prevPageBtn.value, nextPageBtn.value);
  }
}

// ---- Location ----

let isUnmounted = false;

/** The visitor pressed the button: ask once, then centre the map unless they moved it meanwhile. */
async function enableLocation() {
  const interactionsBefore = mapRef.value?.getInteractionCount?.() ?? 0;
  const position = await geolocation.request();
  if (!position || isUnmounted || !geolocation.position.value) return;
  await nextTick();
  const interactionsNow = mapRef.value?.getInteractionCount?.() ?? 0;
  if (interactionsNow === interactionsBefore) mapRef.value?.focusUserLocation?.();
}

function switchToCentre() {
  geolocation.reset();
}

const LOCATION_MESSAGES: Partial<Record<string, string>> = {
  checking: 'Memeriksa izin lokasi\u2026',
  'granted-locating': 'Mencari lokasi Anda\u2026',
  located: 'Lokasi Anda sedang dipakai di peta.',
  denied:
    'Izin lokasi ditolak, jadi jarak dihitung dari pusat kelurahan. Untuk memakai lokasi Anda, izinkan lokasi untuk situs ini di pengaturan browser.',
  unsupported:
    'Browser atau perangkat ini tidak mendukung deteksi lokasi. Jarak dihitung dari pusat kelurahan.',
  timeout:
    'Lokasi Anda belum ditemukan karena terlalu lama. Jarak tetap dihitung dari pusat kelurahan.',
  unavailable:
    'Lokasi Anda tidak dapat ditentukan saat ini. Jarak tetap dihitung dari pusat kelurahan.',
  insecure:
    'Lokasi hanya bisa dipakai pada sambungan aman (HTTPS). Jarak dihitung dari pusat kelurahan.',
};

const locationMessage = computed(() => LOCATION_MESSAGES[locationStatus.value] ?? '');
const canRetryLocation = computed(
  () => locationStatus.value === 'timeout' || locationStatus.value === 'unavailable',
);

// ---- Results panel (below `md` it is a collapsible panel under the map) ----

const { isDesktop } = useIsDesktop();
const panelOpen = ref(false);
const panelExpanded = computed(() => isDesktop.value || panelOpen.value);
const panelMode = computed<'results' | 'detail'>(() =>
  mapsStore.selectedPoint ? 'detail' : 'results',
);
const panelToggleLabel = computed(() => {
  const subject = panelMode.value === 'detail' ? 'detail titik' : 'daftar hasil';
  if (panelExpanded.value) return `Sembunyikan ${subject}`;
  return panelMode.value === 'detail'
    ? 'Lihat detail titik'
    : `Lihat daftar hasil (${nearbyPoints.value.length})`;
});
const panelToggleRef = ref<HTMLButtonElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);

function togglePanel() {
  panelOpen.value = !panelOpen.value;
}

/** Picking a point (marker or list) always shows its detail in the one panel. */
watch(
  () => mapsStore.selectedPoint?.id,
  (id) => {
    if (id && !isDesktop.value) panelOpen.value = true;
  },
);

/** The panel sits under the map, so opening or closing it re-measures the map without moving it. */
watch(
  [panelExpanded, isDesktop],
  () => {
    mapRef.value?.invalidateSize?.();
  },
  { flush: 'post' },
);

function onPanelKeydown(event: KeyboardEvent) {
  // The detail view closes itself on Escape; only an open list collapses here.
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (isDesktop.value || !panelOpen.value || mapsStore.selectedPoint) return;
  event.preventDefault();
  panelOpen.value = false;
  void nextTick(() => panelToggleRef.value?.focus());
}

// One primary overlay at a time: the navigation menu marks the page `inert` while it is a modal
// sheet, which is the signal to put this panel away.
let inertObserver: MutationObserver | null = null;

onMounted(() => {
  void geolocation.init();
  const main = rootRef.value?.closest('main');
  if (main && typeof MutationObserver !== 'undefined') {
    inertObserver = new MutationObserver(() => {
      if (main.hasAttribute('inert')) panelOpen.value = false;
    });
    inertObserver.observe(main, { attributes: true, attributeFilter: ['inert'] });
  }
});

onUnmounted(() => {
  isUnmounted = true;
  inertObserver?.disconnect();
  inertObserver = null;
});
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Peta" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel
      title="Peta Kelurahan Manggar"
      subtitle="Sebaran titik Ketua RT dan Bank Sampah Unit. Pilih penanda pada peta atau daftar untuk melihat detail dan kontaknya."
    />

    <section
      ref="rootRef"
      class="bg-white px-4 py-8 sm:px-6 sm:py-10"
      aria-labelledby="peta-title"
      data-test="peta-section"
    >
      <div class="mx-auto max-w-6xl">
        <!-- One toolbar: heading, what the count covers, and the secondary data details -->
        <div
          class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
          data-test="peta-toolbar"
        >
          <div class="min-w-0">
            <h2 id="peta-title" class="text-brand-navy text-lg font-bold">Sebaran Titik Spasial</h2>
            <p class="text-text-muted mt-1 text-base" aria-live="polite" data-test="peta-count">
              {{ countText }}
            </p>
          </div>
          <MapSummaryDropdown :summary="mapsStore.summary" @layout-change="onSummaryLayoutChange" />
        </div>
        <div
          v-if="mapsStore.summaryError"
          class="text-text-muted mt-2 text-sm md:text-right"
          role="status"
        >
          <span>Rincian data peta gagal dimuat. </span>
          <button
            type="button"
            class="text-brand-navy focus-visible:outline-brand-navy underline focus-visible:outline-2 focus-visible:outline-offset-2"
            :disabled="mapsStore.isSummaryLoading"
            @click="mapsStore.loadSummary()"
          >
            Coba muat rincian lagi
          </button>
        </div>

        <div
          v-if="mapsStore.error"
          class="rounded-btn border-border-strong mt-4 border bg-white p-5"
          role="alert"
          data-test="peta-error"
        >
          <p class="text-brand-navy text-base">{{ mapsStore.error }}</p>
          <button
            type="button"
            class="rounded-btn bg-brand-navy hover:bg-brand-navy-deep focus-visible:outline-brand-navy mt-3 min-h-11 px-4 py-2.5 text-base font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            @click="retryMapData"
          >
            Coba lagi
          </button>
        </div>

        <p v-if="mapsStore.isLoading" class="text-text-muted mt-3 text-base" role="status">
          Memuat titik spasial&hellip;
        </p>

        <!--
          Map, search and results stay mounted so retrying or loading never tears down the Leaflet
          instance or a typed query. Reading order is controls, map, results. From `lg` the map sits
          beside the controls and the list; below `lg` they stack, and below `md` the results are a
          collapsible panel under the map (never over it, so zoom and attribution stay reachable).
        -->
        <div
          class="mt-4 grid gap-4 lg:h-[640px] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-5"
        >
          <div
            class="rounded-btn border-border-strong border bg-white p-4 lg:col-start-2 lg:row-start-1"
            data-test="peta-controls"
          >
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
              class="rounded-btn text-brand-navy border-border-strong focus-visible:border-brand-navy focus-visible:outline-brand-navy placeholder:text-text-muted min-h-11 w-full border bg-white px-4 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
              data-test="peta-search"
            />
            <div class="mt-3">
              <MapFilterBar
                :active-type="mapsStore.activeTypeFilter"
                @update:type="mapsStore.setTypeFilter"
              />
            </div>

            <!-- Location: explained before it is requested; failure never blocks the map -->
            <div class="mt-3" data-test="peta-location" :data-status="locationStatus">
              <div
                v-if="locationStatus === 'prompt'"
                class="border-brand-navy bg-surface-muted rounded-btn border p-3"
                data-test="peta-location-prompt"
              >
                <p class="text-brand-navy text-sm font-semibold">
                  Gunakan lokasi Anda untuk jarak yang lebih tepat.
                </p>
                <p class="text-text-muted mt-1 text-sm">
                  Lokasi hanya dipakai di perangkat ini untuk menghitung jarak. Tidak disimpan dan
                  tidak dikirim ke mana pun. Tanpa lokasi, jarak dihitung dari pusat kelurahan.
                </p>
                <button
                  type="button"
                  class="rounded-btn bg-brand-navy hover:bg-brand-navy-deep focus-visible:outline-brand-navy mt-3 min-h-11 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  data-test="peta-enable-location"
                  @click="enableLocation"
                >
                  Aktifkan lokasi
                </button>
              </div>

              <template v-else>
                <p
                  v-if="locationMessage"
                  role="status"
                  class="text-text-muted text-sm"
                  data-test="peta-location-message"
                >
                  {{ locationMessage }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2 empty:hidden">
                  <button
                    v-if="locationStatus === 'idle' || canRetryLocation"
                    type="button"
                    class="rounded-btn border-brand-navy text-brand-navy hover:bg-brand-navy focus-visible:outline-brand-navy min-h-11 border px-3 py-2 text-sm font-medium transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                    data-test="peta-enable-location"
                    @click="enableLocation"
                  >
                    {{ canRetryLocation ? 'Coba lagi' : 'Gunakan lokasi saya' }}
                  </button>
                  <template v-if="locationStatus === 'located'">
                    <button
                      type="button"
                      class="rounded-btn text-brand-navy border-border-strong hover:bg-surface-muted focus-visible:outline-brand-navy min-h-11 border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                      data-test="peta-focus-location"
                      @click="mapRef?.focusUserLocation()"
                    >
                      Pusatkan lokasi saya
                    </button>
                    <button
                      type="button"
                      class="rounded-btn text-brand-navy border-border-strong hover:bg-surface-muted focus-visible:outline-brand-navy min-h-11 border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                      data-test="peta-reset-origin"
                      @click="switchToCentre"
                    >
                      Pakai pusat kelurahan
                    </button>
                  </template>
                </div>
              </template>
            </div>
          </div>

          <div class="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <InteractiveMap
              ref="mapRef"
              :points="visiblePoints"
              :frame-points="mapsStore.points"
              :user-location="userLocation"
              :selected-point-id="mapsStore.selectedPoint?.id ?? null"
              :default-center="defaultCenter"
              :default-zoom="defaultZoom"
              @select-point="mapsStore.selectPoint"
              @escape="onMapEscape"
            />
          </div>

          <section
            class="rounded-btn border-border-strong flex max-h-[28rem] min-h-0 flex-col overflow-hidden border bg-white lg:col-start-2 lg:row-start-2 lg:max-h-none"
            aria-labelledby="terdekat-title"
            :data-state="panelExpanded ? 'expanded' : 'collapsed'"
            :data-mode="panelMode"
            data-test="peta-panel"
            @keydown="onPanelKeydown"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-2 p-4"
              :class="panelExpanded ? 'border-border border-b' : ''"
            >
              <div class="min-w-0">
                <h3 id="terdekat-title" class="text-brand-navy text-base font-bold">
                  {{ panelMode === 'detail' ? 'Detail titik' : 'Titik terdekat' }}
                </h3>
                <p
                  class="text-text-muted mt-1 text-sm"
                  aria-live="polite"
                  data-test="peta-origin-label"
                >
                  {{ originSentence }}.
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  v-if="mapsStore.selectedPoint"
                  type="button"
                  class="rounded-btn text-brand-navy border-border-strong hover:bg-surface-muted focus-visible:outline-brand-navy min-h-11 border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                  @click="mapsStore.clearSelection"
                >
                  Kembali ke hasil
                </button>
                <button
                  v-if="!isDesktop"
                  ref="panelToggleRef"
                  type="button"
                  class="rounded-btn bg-brand-navy hover:bg-brand-navy-deep focus-visible:outline-brand-navy min-h-11 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  :aria-expanded="panelExpanded"
                  aria-controls="peta-panel-body"
                  data-test="peta-panel-toggle"
                  @click="togglePanel"
                >
                  {{ panelToggleLabel }}
                </button>
              </div>
            </div>

            <div
              v-show="panelExpanded"
              id="peta-panel-body"
              class="flex min-h-0 flex-1 flex-col"
              data-test="peta-panel-body"
            >
              <p
                v-if="panelMode === 'results'"
                class="text-text-muted px-4 pt-3 text-sm"
                data-test="peta-list-count"
              >
                {{
                  isFiltered
                    ? `${nearbyPoints.length} lokasi sesuai pencarian atau filter`
                    : `${nearbyPoints.length} lokasi (semua titik)`
                }}
              </p>

              <SpatialPointDrawer
                v-if="mapsStore.selectedPoint"
                class="min-h-0 flex-1 overflow-y-auto"
                :point="mapsStore.selectedPoint"
                close-label="Tutup detail"
                @close="mapsStore.clearSelection"
              />

              <ol
                v-else-if="nearbyPoints.length > 0"
                class="divide-border min-h-0 flex-1 divide-y overflow-y-auto px-4"
              >
                <li
                  v-for="item in paginatedNearbyPoints"
                  :key="item.point.id"
                  :data-test="`peta-result-${item.point.id}`"
                >
                  <button
                    type="button"
                    class="focus-visible:outline-brand-navy flex min-h-[68px] w-full cursor-pointer items-start justify-between gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                    data-test="peta-result"
                    @click="selectFromList(item.point)"
                  >
                    <span>
                      <span class="text-brand-navy block text-base font-semibold">
                        {{
                          item.point.type === 'ketua_rt' && item.point.rts[0]
                            ? `RT ${item.point.rts[0]}`
                            : item.point.name
                        }}
                      </span>
                      <span class="text-text-muted block text-sm">
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
                      {{ formatDistance(item.distanceKm)
                      }}<span class="sr-only"> dari {{ originLabel }}</span>
                    </span>
                  </button>
                </li>
              </ol>

              <p
                v-else-if="!mapsStore.selectedPoint && !mapsStore.isLoading && !mapsStore.error"
                class="text-brand-navy px-4 py-3 text-base"
                data-test="peta-empty"
              >
                Tidak ada titik yang cocok dengan pencarian atau filter saat ini.
              </p>

              <div
                v-if="!mapsStore.selectedPoint && nearbyPoints.length > PAGE_SIZE"
                class="border-border flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
              >
                <p
                  class="text-text-muted text-sm tabular-nums"
                  aria-live="polite"
                  data-test="peta-pagination-summary"
                >
                  {{ paginationStart }}–{{ paginationEnd }} dari {{ nearbyPoints.length }} lokasi
                </p>
                <nav aria-label="Halaman hasil peta" class="flex items-center gap-2">
                  <button
                    ref="prevPageBtn"
                    type="button"
                    class="rounded-btn text-brand-navy border-border-strong hover:bg-surface-muted focus-visible:outline-brand-navy disabled:border-border disabled:bg-surface-hover disabled:text-text-muted disabled:hover:bg-surface-hover min-h-11 min-w-11 border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
                    aria-label="Halaman sebelumnya"
                    data-test="peta-previous-page"
                    :disabled="currentPage === 1"
                    @focusin="onPagerFocusIn"
                    @focusout="onPagerFocusOut"
                    @click="goToPreviousPage"
                  >
                    Sebelumnya
                  </button>
                  <span class="text-brand-navy text-sm tabular-nums"
                    >{{ currentPage }} / {{ totalPages }}</span
                  >
                  <button
                    ref="nextPageBtn"
                    type="button"
                    class="rounded-btn text-brand-navy border-border-strong hover:bg-surface-muted focus-visible:outline-brand-navy disabled:border-border disabled:bg-surface-hover disabled:text-text-muted disabled:hover:bg-surface-hover min-h-11 min-w-11 border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
                    aria-label="Halaman selanjutnya"
                    data-test="peta-next-page"
                    :disabled="currentPage === totalPages"
                    @focusin="onPagerFocusIn"
                    @focusout="onPagerFocusOut"
                    @click="goToNextPage"
                  >
                    Selanjutnya
                  </button>
                </nav>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
