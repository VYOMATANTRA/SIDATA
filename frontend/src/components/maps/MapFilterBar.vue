<script setup lang="ts">
import { ref, watch } from 'vue';
import type { SpatialPointType } from '../../types/maps';

interface Props {
  activeType: SpatialPointType | 'all';
  activeRt: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:type', type: SpatialPointType | 'all'): void;
  (e: 'update:rt', rt: number | null): void;
}>();

const rtInput = ref<string | number>(props.activeRt ? String(props.activeRt) : '');

watch(
  () => props.activeRt,
  (newVal) => {
    rtInput.value = newVal ? String(newVal) : '';
  },
);

function handleTypeClick(type: SpatialPointType | 'all') {
  emit('update:type', type);
}

function handleRtSearch() {
  const strVal =
    rtInput.value !== null && rtInput.value !== undefined ? String(rtInput.value).trim() : '';
  const parsed = parseInt(strVal, 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    emit('update:rt', parsed);
  } else {
    emit('update:rt', null);
    rtInput.value = '';
  }
}

function handleClearRt() {
  rtInput.value = '';
  emit('update:rt', null);
}
</script>

<template>
  <div class="flex w-full flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
    <!-- Category Filter Pills -->
    <div
      class="flex scrollbar-none items-center gap-2 overflow-x-auto pb-1 sm:pb-0"
      role="group"
      aria-label="Filter kategori titik spasial"
    >
      <button
        type="button"
        class="rounded-btn text-sm cursor-pointer px-3.5 py-1.5 font-medium whitespace-nowrap transition-all select-none"
        :class="
          activeType === 'all'
            ? 'bg-brand-navy text-white shadow-sm'
            : 'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
        "
        :aria-pressed="activeType === 'all'"
        @click="handleTypeClick('all')"
      >
        Semua Titik
      </button>

      <button
        type="button"
        class="rounded-btn text-sm flex cursor-pointer items-center gap-1.5 px-3.5 py-1.5 font-medium whitespace-nowrap transition-all select-none"
        :class="
          activeType === 'ketua_rt'
            ? 'bg-brand-indigo text-white shadow-sm'
            : 'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
        "
        :aria-pressed="activeType === 'ketua_rt'"
        @click="handleTypeClick('ketua_rt')"
      >
        <span
          class="h-2.5 w-2.5 rounded-full bg-brand-indigo"
          :class="{ 'bg-white': activeType === 'ketua_rt' }"
        />
        Ketua RT
      </button>

      <button
        type="button"
        class="rounded-btn text-sm flex cursor-pointer items-center gap-1.5 px-3.5 py-1.5 font-medium whitespace-nowrap transition-all select-none"
        :class="
          activeType === 'bank_sampah'
            ? 'bg-emerald-700 text-white shadow-sm'
            : 'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
        "
        :aria-pressed="activeType === 'bank_sampah'"
        @click="handleTypeClick('bank_sampah')"
      >
        <span
          class="h-2.5 w-2.5 rounded-full bg-emerald-500"
          :class="{ 'bg-white': activeType === 'bank_sampah' }"
        />
        Bank Sampah
      </button>

      <button
        type="button"
        class="rounded-btn text-sm flex cursor-pointer items-center gap-1.5 px-3.5 py-1.5 font-medium whitespace-nowrap transition-all select-none"
        :class="
          activeType === 'fasilitas_umum'
            ? 'bg-brand-violet text-white shadow-sm'
            : 'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
        "
        :aria-pressed="activeType === 'fasilitas_umum'"
        @click="handleTypeClick('fasilitas_umum')"
      >
        <span
          class="h-2.5 w-2.5 rounded-full bg-brand-violet"
          :class="{ 'bg-white': activeType === 'fasilitas_umum' }"
        />
        Fasilitas Umum
      </button>
    </div>

    <!-- RT Search Filter -->
    <div class="relative flex min-w-[140px] shrink-0 items-center sm:w-[160px]">
      <label for="rt-filter-input" class="sr-only">Filter berdasarkan nomor RT</label>
      <input
        id="rt-filter-input"
        v-model="rtInput"
        type="number"
        min="1"
        placeholder="Filter RT (e.g. 1)"
        class="rounded-btn text-sm focus:border-brand-indigo w-full border border-slate-200 bg-white py-1.5 pr-8 pl-3 text-slate-800 placeholder-slate-400 shadow-sm focus:outline-none"
        @keydown.enter.prevent="handleRtSearch"
        @blur="handleRtSearch"
      />
      <button
        v-if="rtInput"
        type="button"
        class="absolute right-2 cursor-pointer text-sm text-slate-400 hover:text-slate-600"
        aria-label="Hapus filter nomor RT"
        @click="handleClearRt"
      >
        ✕
      </button>
    </div>
  </div>
</template>
