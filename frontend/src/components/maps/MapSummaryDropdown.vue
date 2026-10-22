<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { MapSummaryDTO } from '../../types/maps';

interface Props {
  summary: MapSummaryDTO | null;
}

defineProps<Props>();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    isOpen.value = false;
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
  <div v-if="summary" ref="dropdownRef" class="relative inline-block text-left select-none">
    <!-- Dropdown Trigger Button -->
    <button
      type="button"
      class="text-brand-navy text-sm inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 py-2 font-medium shadow-md backdrop-blur-md transition-all hover:bg-white"
      :class="{ 'ring-brand-indigo/30 border-brand-indigo ring-2': isOpen }"
      aria-haspopup="true"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
    >
      <span>Ringkasan Data</span>
      <svg
        class="h-3.5 w-3.5 text-slate-400 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Menu List -->
    <transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="opacity-0 translate-y-1 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-1 scale-95"
    >
      <div
        v-if="isOpen"
        class="text-sm absolute left-0 z-50 mt-2 w-64 divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-md"
      >
        <div class="pb-2.5">
          <span class="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Statistik Wilayah
          </span>
          <span class="text-xs text-slate-500">Kelurahan Manggar</span>
        </div>

        <ul class="space-y-2 py-2 text-slate-700">
          <li class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="bg-brand-navy h-2.5 w-2.5 rounded-full" />
              <span>Total Titik Spasial</span>
            </div>
            <span class="font-bold text-slate-900">{{ summary.totalPoints }}</span>
          </li>

          <li class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-brand-indigo" />
              <span>Pos / Ketua RT</span>
            </div>
            <span class="font-semibold text-slate-800">{{
              summary.pointsByType.ketua_rt || 0
            }}</span>
          </li>

          <li class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>Bank Sampah Unit</span>
            </div>
            <span class="font-semibold text-slate-800">{{
              summary.pointsByType.bank_sampah || 0
            }}</span>
          </li>

          <li class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-brand-violet" />
              <span>Fasilitas Umum</span>
            </div>
            <span class="font-semibold text-slate-800">{{
              summary.pointsByType.fasilitas_umum || 0
            }}</span>
          </li>
        </ul>

        <div class="space-y-1.5 pt-2 text-xs text-slate-500">
          <div class="flex items-center justify-between">
            <span>RT Berkoordinat:</span>
            <span class="font-medium text-slate-700">
              {{ summary.rtLeadersWithCoordinates }} / {{ summary.totalRtLeaders }} RT
            </span>
          </div>
          <div
            v-if="summary.rtLeadersWithIntegrityConflicts > 0"
            class="flex items-center justify-between text-amber-700 font-medium"
          >
            <span>Konflik Integritas:</span>
            <span>{{ summary.rtLeadersWithIntegrityConflicts }} RT</span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
