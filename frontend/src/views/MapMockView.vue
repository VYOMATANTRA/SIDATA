<script setup lang="ts">
import { onMounted } from 'vue';
import { useMapsStore } from '../stores/maps';
import InteractiveMap from '../components/maps/InteractiveMap.vue';
import MapFilterBar from '../components/maps/MapFilterBar.vue';
import SpatialPointDrawer from '../components/maps/SpatialPointDrawer.vue';
import MapSummaryDropdown from '../components/maps/MapSummaryDropdown.vue';
import type { SpatialPointDTO, SpatialPointType } from '../types/maps';

const mapsStore = useMapsStore();

onMounted(async () => {
  await Promise.all([mapsStore.loadPoints(), mapsStore.loadSummary()]);
});

function handleTypeFilterChange(type: SpatialPointType | 'all') {
  mapsStore.setTypeFilter(type);
}

function handleRtFilterChange(rt: number | null) {
  mapsStore.setRtFilter(rt);
}

function handleSelectPoint(point: SpatialPointDTO) {
  mapsStore.selectPoint(point);
}

function handleCloseDrawer() {
  mapsStore.clearSelection();
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
    <!-- Header Section -->
    <header
      class="bg-brand-biru-hytam border-brand-biru-aja border-b px-4 py-6 text-white shadow-md sm:px-8"
    >
      <div
        class="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
      >
        <div>
          <div class="mb-1 flex items-center gap-2">
            <span
              class="bg-brand-ubi-ungu text-h4 rounded px-2 py-0.5 font-bold tracking-wider text-white uppercase"
            >
              Proof of Concept
            </span>
            <span class="text-xs text-white/70">SIDATA Kelurahan Manggar</span>
          </div>
          <h1 class="text-h2 font-bold tracking-tight text-white">Peta Interaktif Wilayah</h1>
          <p class="text-body-sm mt-0.5 text-white/80">
            Persebaran Pos Ketua RT, Bank Sampah Unit, dan Fasilitas Umum di Kelurahan Manggar.
          </p>
        </div>

        <router-link
          to="/"
          class="text-body-sm rounded-btn inline-flex items-center gap-1.5 bg-white/10 px-3 py-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <span>← Kembali ke Beranda</span>
        </router-link>
      </div>
    </header>

    <!-- Main Content Container -->
    <main class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <!-- Filter Controls Bar -->
      <section class="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
        <MapFilterBar
          :active-type="mapsStore.activeTypeFilter"
          :active-rt="mapsStore.activeRtFilter"
          @update:type="handleTypeFilterChange"
          @update:rt="handleRtFilterChange"
        />
      </section>

      <!-- Map & Detail Area -->
      <section class="relative h-[68vh] min-h-[520px] flex-1 overflow-hidden rounded-2xl shadow-md">
        <!-- Floating Dropdown Summary over Map -->
        <div class="absolute top-3 left-3 z-[1001]">
          <MapSummaryDropdown :summary="mapsStore.summary" />
        </div>

        <!-- Loading Overlay -->
        <div
          v-if="mapsStore.isLoading"
          class="text-brand-biru-hytam text-body-sm absolute inset-0 z-[1200] flex items-center justify-center gap-2 bg-white/70 font-medium backdrop-blur-sm"
        >
          <svg class="text-brand-ubi-ungu h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>Memuat titik koordinat...</span>
        </div>

        <!-- Error Banner -->
        <div
          v-if="mapsStore.error"
          class="absolute top-4 right-4 left-4 z-[1200] flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700 shadow-md"
        >
          <span>{{ mapsStore.error }}</span>
          <button
            class="ml-2 cursor-pointer font-bold text-rose-900 underline"
            @click="mapsStore.loadPoints"
          >
            Coba Lagi
          </button>
        </div>

        <!-- Leaflet Map Component -->
        <InteractiveMap
          :points="mapsStore.filteredPoints"
          :selected-point-id="mapsStore.selectedPoint?.id"
          @select-point="handleSelectPoint"
        />

        <!-- Slide-up / Floating Detail Drawer Overlay -->
        <transition
          enter-active-class="transition ease-out duration-200"
          enter-from-class="opacity-0 translate-y-4"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-150"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-4"
        >
          <div
            v-if="mapsStore.selectedPoint"
            class="absolute right-3 bottom-3 left-3 z-[1001] max-h-[calc(100%-1.5rem)] overflow-y-auto sm:right-4 sm:bottom-4 sm:left-auto sm:max-w-sm"
          >
            <SpatialPointDrawer
              :point="mapsStore.selectedPoint"
              :leader="mapsStore.selectedLeader"
              @close="handleCloseDrawer"
            />
          </div>
        </transition>
      </section>
    </main>
  </div>
</template>
