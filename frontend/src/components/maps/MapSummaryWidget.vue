<script setup lang="ts">
import type { MapSummaryDTO } from '../../types/maps';
import StatCard from '../common/StatCard.vue';

interface Props {
  summary: MapSummaryDTO | null;
}

defineProps<Props>();
</script>

<template>
  <div v-if="summary" class="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
    <StatCard :value="summary.totalPoints" label="Total Titik" theme="dark">
      <template #icon>
        <svg class="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
        </svg>
      </template>
    </StatCard>

    <StatCard :value="summary.pointsByType.ketua_rt || 0" label="Pos RT" theme="light">
      <template #icon>
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      </template>
    </StatCard>

    <StatCard :value="summary.pointsByType.bank_sampah || 0" label="Bank Sampah" theme="light">
      <template #icon>
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </template>
    </StatCard>

    <StatCard
      :value="summary.pointsByType.fasilitas_umum || 0"
      label="Fasilitas Umum"
      theme="light"
    >
      <template #icon>
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      </template>
    </StatCard>
  </div>
</template>
