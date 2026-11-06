<script setup lang="ts">
import type { SpatialPointType } from '../../types/maps';

interface Props {
  activeType: SpatialPointType | 'all';
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:type', type: SpatialPointType | 'all'): void;
}>();

function handleTypeClick(type: SpatialPointType | 'all') {
  emit('update:type', type);
}
</script>

<template>
  <div class="w-full">
    <!-- Category Filter Pills -->
    <div
      class="flex w-full flex-wrap items-center gap-2"
      role="group"
      aria-label="Filter kategori titik spasial"
    >
      <button
        type="button"
        class="min-h-10 rounded-btn text-sm cursor-pointer px-3 py-1.5 font-medium whitespace-nowrap transition-colors select-none"
        :class="
          activeType === 'all'
            ? 'bg-brand-navy text-white shadow-sm'
            : 'border border-gray-300 bg-white text-brand-navy hover:border-brand-navy'
        "
        :aria-pressed="activeType === 'all'"
        @click="handleTypeClick('all')"
      >
        Semua Titik
      </button>

      <button
        type="button"
        class="min-h-10 rounded-btn text-sm flex cursor-pointer items-center gap-1.5 px-3 py-1.5 font-medium whitespace-nowrap transition-colors select-none"
        :class="
          activeType === 'ketua_rt'
            ? 'bg-brand-indigo text-white shadow-sm'
            : 'border border-gray-300 bg-white text-brand-navy hover:border-brand-navy'
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
        class="min-h-10 rounded-btn text-sm flex cursor-pointer items-center gap-1.5 px-3 py-1.5 font-medium whitespace-nowrap transition-colors select-none"
        :class="
          activeType === 'bank_sampah'
            ? 'bg-brand-navy-deep text-white shadow-sm'
            : 'border border-gray-300 bg-white text-brand-navy hover:border-brand-navy'
        "
        :aria-pressed="activeType === 'bank_sampah'"
        @click="handleTypeClick('bank_sampah')"
      >
        <span
          class="h-2.5 w-2.5 rounded-full bg-brand-navy-deep"
          :class="{ 'bg-white': activeType === 'bank_sampah' }"
        />
        Bank Sampah
      </button>

      <button
        type="button"
        class="min-h-10 rounded-btn text-sm flex cursor-pointer items-center gap-1.5 px-3 py-1.5 font-medium whitespace-nowrap transition-colors select-none"
        :class="
          activeType === 'fasilitas_umum'
            ? 'bg-brand-violet text-white shadow-sm'
            : 'border border-gray-300 bg-white text-brand-navy hover:border-brand-navy'
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

  </div>
</template>
