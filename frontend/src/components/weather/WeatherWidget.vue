<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useWeatherStore } from '../../stores/weather.store';
import WeatherCurrentCard from './WeatherCurrentCard.vue';
import WeatherUpcomingCard from './WeatherUpcomingCard.vue';

const props = withDefaults(
  defineProps<{
    autoFetch?: boolean;
  }>(),
  {
    autoFetch: true,
  },
);

const weatherStore = useWeatherStore();
const isRetrying = ref(false);
const lastError = ref<string | null>(null);

const isLoadingState = computed(
  () =>
    !isRetrying.value &&
    (weatherStore.isLoading || (props.autoFetch && !weatherStore.isLoaded)) &&
    !weatherStore.error,
);

onMounted(async () => {
  if (props.autoFetch && !weatherStore.isLoaded && !weatherStore.isLoading) {
    await weatherStore.fetchWeather();
  }
});

async function handleRetry() {
  if (weatherStore.error) {
    lastError.value = weatherStore.error;
  }
  isRetrying.value = true;
  try {
    await weatherStore.fetchWeather(true);
  } finally {
    isRetrying.value = false;
  }
}
</script>

<template>
  <div class="w-full text-white" data-test="weather-widget-root">
    <!-- 1. Loading State (Accessible Skeleton) -->
    <div
      v-if="isLoadingState"
      role="status"
      aria-live="polite"
      aria-busy="true"
      class="w-full"
      data-test="weather-loading-skeleton"
    >
      <h2 id="weather-widget-title" class="sr-only">Perkiraan Cuaca Manggar</h2>
      <span class="sr-only">Memuat data perkiraan cuaca...</span>
      <div class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:gap-5">
        <!-- Main Card Skeleton -->
        <div
          class="flex min-h-[13.5rem] flex-col justify-between animate-pulse motion-reduce:animate-none rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md sm:min-h-[14rem] sm:p-6 lg:col-span-6"
        >
          <div>
            <div class="h-5 w-40 rounded-md bg-white/20"></div>
            <div class="mt-2 h-3 w-16 rounded-md bg-brand-cyan/40"></div>
            <div class="mt-5 flex items-center gap-4">
              <div class="h-14 w-14 rounded-full bg-white/20 sm:h-16 sm:w-16"></div>
              <div class="space-y-2">
                <div class="h-8 w-20 rounded-md bg-white/20 sm:h-10"></div>
                <div class="h-4 w-28 rounded-md bg-white/15"></div>
              </div>
            </div>
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            <div class="h-7 w-28 rounded-lg bg-white/15"></div>
            <div class="h-7 w-36 rounded-lg bg-white/15"></div>
            <div class="h-7 w-32 rounded-lg bg-white/15"></div>
          </div>
        </div>

        <!-- Upcoming Cards Skeleton -->
        <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-6">
          <div
            class="flex min-h-[13.5rem] flex-col items-center justify-between animate-pulse motion-reduce:animate-none rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md sm:min-h-[14rem] sm:p-5"
          >
            <div class="h-4 w-20 rounded-md bg-white/20"></div>
            <div class="h-10 w-10 rounded-full bg-white/20 sm:h-12 sm:w-12"></div>
            <div class="space-y-1.5 text-center">
              <div class="mx-auto h-6 w-14 rounded-md bg-white/20"></div>
              <div class="mx-auto h-3 w-16 rounded-md bg-white/15"></div>
            </div>
          </div>
          <div
            class="flex min-h-[13.5rem] flex-col items-center justify-between animate-pulse motion-reduce:animate-none rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md sm:min-h-[14rem] sm:p-5"
          >
            <div class="h-4 w-20 rounded-md bg-white/20"></div>
            <div class="h-10 w-10 rounded-full bg-white/20 sm:h-12 sm:w-12"></div>
            <div class="space-y-1.5 text-center">
              <div class="mx-auto h-6 w-14 rounded-md bg-white/20"></div>
              <div class="mx-auto h-3 w-16 rounded-md bg-white/15"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Error State -->
    <div
      v-else-if="(weatherStore.error || isRetrying) && !weatherStore.isLoaded"
      role="alert"
      class="flex flex-col items-start justify-between gap-3 rounded-2xl border border-rose-300/40 bg-white/10 p-4 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:p-5"
      data-test="weather-error-alert"
    >
      <div class="space-y-1">
        <h2 id="weather-widget-title" class="text-sm font-bold text-rose-200 sm:text-base">
          Gagal Memuat Perkiraan Cuaca
        </h2>
        <p class="text-xs text-slate-200 sm:text-sm">
          {{ weatherStore.error || lastError || 'Sedang mencoba menghubungkan kembali ke server BMKG...' }}
        </p>
      </div>

      <button
        type="button"
        @click="handleRetry"
        :disabled="isRetrying || weatherStore.isLoading"
        class="rounded-btn focus-visible:outline-brand-cyan shrink-0 cursor-pointer border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        data-test="weather-retry-btn"
      >
        <span v-if="isRetrying || weatherStore.isLoading">Memuat...</span>
        <span v-else>Coba Lagi</span>
      </button>
    </div>

    <!-- 3. Stale Data Notice Banner (when stale is true and loaded) -->
    <div
      v-if="weatherStore.isLoaded && weatherStore.isStale"
      role="status"
      aria-live="polite"
      class="mb-3 flex flex-col gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/20 px-3.5 py-2 text-xs font-medium text-amber-200 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
      data-test="weather-stale-banner"
    >
      <div class="flex flex-wrap items-center gap-1.5">
        <span>Data perkiraan cuaca BMKG belum diperbarui (mode luring).</span>
        <span
          v-if="weatherStore.error"
          class="font-semibold text-rose-200"
          data-test="weather-stale-error"
        >
          ({{ weatherStore.error }})
        </span>
      </div>
      <button
        type="button"
        @click="handleRetry"
        :disabled="isRetrying || weatherStore.isLoading"
        class="focus-visible:outline-brand-cyan shrink-0 cursor-pointer underline hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span v-if="isRetrying || weatherStore.isLoading">Memuat...</span>
        <span v-else>Muat ulang</span>
      </button>
    </div>

    <!-- 4. Populated State (Mobile Pic 1 & Desktop Pic 2) -->
    <div
      v-if="weatherStore.isLoaded && weatherStore.currentEntry"
      class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:gap-5"
      data-test="weather-populated-grid"
    >
      <!-- Main Card: full width on mobile/tablet, 6 cols on desktop (or 12 cols if no upcoming entries) -->
      <div :class="weatherStore.upcomingEntries.length > 0 ? 'lg:col-span-6' : 'lg:col-span-12'">
        <WeatherCurrentCard
          :entry="weatherStore.currentEntry"
          :location-name="weatherStore.locationName"
          :stale="weatherStore.isStale"
        />
      </div>

      <!-- Upcoming Cards Grid: 2 cols side-by-side on mobile, 6 cols total on desktop (3 cols each) -->
      <div
        v-if="weatherStore.upcomingEntries.length > 0"
        :class="[
          'grid gap-3 sm:gap-4 lg:col-span-6',
          weatherStore.upcomingEntries.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
        ]"
        data-test="weather-upcoming-grid"
      >
        <WeatherUpcomingCard
          v-if="weatherStore.upcomingEntries[0]"
          :entry="weatherStore.upcomingEntries[0]"
          data-test="weather-upcoming-0"
        />
        <WeatherUpcomingCard
          v-if="weatherStore.upcomingEntries[1]"
          :entry="weatherStore.upcomingEntries[1]"
          data-test="weather-upcoming-1"
        />
      </div>
    </div>

    <!-- 5. Empty State (When forecast is empty upon load) -->
    <div
      v-else-if="weatherStore.isLoaded && !weatherStore.currentEntry"
      class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-5 text-center text-white shadow-xl backdrop-blur-md sm:p-6"
      data-test="weather-empty-notice"
    >
      <h2 id="weather-widget-title" class="text-sm font-semibold text-slate-200 sm:text-base">
        Data perkiraan cuaca belum tersedia
      </h2>
      <button
        type="button"
        @click="handleRetry"
        :disabled="isRetrying || weatherStore.isLoading"
        class="rounded-btn focus-visible:outline-brand-cyan cursor-pointer border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        data-test="weather-empty-retry-btn"
      >
        <span v-if="isRetrying || weatherStore.isLoading">Memuat...</span>
        <span v-else>Muat Ulang</span>
      </button>
    </div>
  </div>
</template>
