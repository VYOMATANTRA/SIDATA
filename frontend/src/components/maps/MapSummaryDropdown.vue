<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { MapSummaryDTO } from '../../types/maps';
import { useIsDesktop } from '../../composables/useIsDesktop';

interface Props {
  summary: MapSummaryDTO | null;
}

defineProps<Props>();

const emit = defineEmits<{
  /**
   * Fired after the DOM has settled whenever opening/closing or the breakpoint changes the
   * summary's footprint. On mobile the disclosure is in normal flow and pushes the map, so the
   * parent should call the map's `invalidateSize()`.
   */
  (e: 'layout-change'): void;
}>();

// Below `md` the summary is an in-flow disclosure above the map; from `md` up it stays a
// floating overlay. An overlay cannot be reliably layered over a Leaflet map on a phone.
const { isDesktop } = useIsDesktop();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const triggerBtnRef = ref<HTMLButtonElement | null>(null);

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

watch([isOpen, isDesktop], () => emit('layout-change'), { flush: 'post' });

function handleClickOutside(event: MouseEvent) {
  // The in-flow disclosure is page content, not a popup: only the overlay dismisses on outside click.
  if (!isDesktop.value) return;
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (
    event.key === 'Escape' &&
    isOpen.value &&
    event.target instanceof Node &&
    dropdownRef.value?.contains(event.target)
  ) {
    event.preventDefault();
    isOpen.value = false;
    triggerBtnRef.value?.focus();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div
    v-if="summary"
    ref="dropdownRef"
    class="relative text-left select-none"
    :class="isDesktop ? 'inline-block' : 'block w-full'"
    data-test="map-summary-dropdown"
    :data-layout="isDesktop ? 'overlay' : 'inline'"
  >
    <!-- Dropdown Trigger Button -->
    <button
      ref="triggerBtnRef"
      type="button"
      class="text-brand-navy focus-visible:outline-brand-navy inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 py-2 text-sm font-medium shadow-md transition-all hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
      :class="[
        isOpen ? 'ring-brand-indigo/30 border-brand-indigo ring-2' : '',
        isDesktop ? 'backdrop-blur-md' : 'w-full justify-between',
      ]"
      :aria-expanded="isOpen"
      aria-controls="map-summary-panel"
      @click="toggleDropdown"
    >
      <span>Ringkasan data</span>
      <svg
        class="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 motion-reduce:transition-none"
        :class="{ 'rotate-180': isOpen }"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Menu List -->
    <transition
      :css="isDesktop"
      enter-active-class="transition ease-out duration-150 motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-y-1 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition ease-in duration-100 motion-reduce:transition-none"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-1 scale-95"
    >
      <div
        v-show="isOpen"
        id="map-summary-panel"
        class="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white p-3.5 text-sm shadow-xl"
        :class="
          isDesktop
            ? 'absolute right-0 z-50 max-h-[min(24rem,calc(100dvh-8rem))] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain'
            : 'w-full'
        "
      >
        <div class="pb-2.5">
          <span class="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Statistik Wilayah
          </span>
          <span class="text-xs text-slate-500">Kelurahan Manggar</span>
        </div>

        <ul class="space-y-2 py-2 text-slate-700">
          <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <div class="flex min-w-0 items-center gap-2">
              <span class="bg-brand-navy h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
              <span>Total Titik Spasial</span>
            </div>
            <span class="font-bold text-slate-900">{{ summary.totalPoints }}</span>
          </li>

          <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <div class="flex min-w-0 items-center gap-2">
              <span class="bg-brand-indigo h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
              <span>Pos / Ketua RT</span>
            </div>
            <span class="font-semibold text-slate-800">{{
              summary.pointsByType.ketua_rt || 0
            }}</span>
          </li>

          <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <div class="flex min-w-0 items-center gap-2">
              <span
                class="bg-brand-navy-deep h-2.5 w-2.5 shrink-0 rounded-full"
                aria-hidden="true"
              />
              <span>Bank Sampah Unit</span>
            </div>
            <span class="font-semibold text-slate-800">{{
              summary.pointsByType.bank_sampah || 0
            }}</span>
          </li>

          <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <div class="flex min-w-0 items-center gap-2">
              <span class="bg-brand-violet h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
              <span>Fasilitas Umum</span>
            </div>
            <span class="font-semibold text-slate-800">{{
              summary.pointsByType.fasilitas_umum || 0
            }}</span>
          </li>
        </ul>

        <div class="space-y-1.5 pt-2 text-xs text-slate-500">
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <span>RT Berkoordinat:</span>
            <span class="font-medium text-slate-700">
              {{ summary.rtLeadersWithCoordinates }} / {{ summary.totalRtLeaders }} RT
            </span>
          </div>
          <div
            v-if="summary.rtLeadersWithIntegrityConflicts > 0"
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 font-medium text-amber-700"
          >
            <span>Konflik Integritas:</span>
            <span>{{ summary.rtLeadersWithIntegrityConflicts }} RT</span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
