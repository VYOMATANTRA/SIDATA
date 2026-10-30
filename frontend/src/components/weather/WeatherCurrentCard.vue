<script setup lang="ts">
import { computed } from 'vue';
import WeatherIcon from './WeatherIcon.vue';
import { localizeWindDirection, type WeatherForecastEntry } from '../../stores/weather.store';

const props = withDefaults(
  defineProps<{
    entry?: WeatherForecastEntry | null;
    locationName?: string;
    stale?: boolean;
  }>(),
  {
    entry: null,
    locationName: 'Manggar',
    stale: false,
  },
);

const temp = computed(() =>
  props.entry &&
  typeof props.entry.temperatureCelsius === 'number' &&
  Number.isFinite(props.entry.temperatureCelsius)
    ? props.entry.temperatureCelsius
    : '-',
);

const description = computed(() => props.entry?.description || 'Data cuaca tidak tersedia');

const humidity = computed(() =>
  props.entry &&
  typeof props.entry.humidityPercent === 'number' &&
  Number.isFinite(props.entry.humidityPercent)
    ? props.entry.humidityPercent
    : '-',
);

const windSpeed = computed(() =>
  props.entry &&
  typeof props.entry.windSpeedKmh === 'number' &&
  Number.isFinite(props.entry.windSpeedKmh)
    ? props.entry.windSpeedKmh
    : '-',
);

const windDirectionLocalized = computed(() =>
  props.entry?.windDirection ? localizeWindDirection(props.entry.windDirection) : '-',
);

const srTempText = computed(() =>
  temp.value !== '-' ? `${temp.value} derajat Celsius` : 'Data suhu tidak tersedia',
);

const srHumidityText = computed(() =>
  humidity.value !== '-'
    ? `Kelembapan udara ${humidity.value} persen`
    : 'Kelembapan udara tidak tersedia',
);

const srWindSpeedText = computed(() =>
  windSpeed.value !== '-'
    ? `Kecepatan angin ${windSpeed.value} kilometer per jam`
    : 'Kecepatan angin tidak tersedia',
);

const srWindDirectionText = computed(() =>
  windDirectionLocalized.value !== '-'
    ? `Arah angin: ${windDirectionLocalized.value}`
    : 'Arah angin tidak tersedia',
);
</script>

<template>
  <div
    class="flex h-full flex-col justify-between rounded-2xl border border-white/20 bg-white/10 p-5 text-white shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/30 sm:p-6"
    data-test="weather-current-card"
  >
    <!-- Card Header -->
    <div class="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
      <div>
        <h2
          id="weather-widget-title"
          class="text-base font-bold tracking-tight text-white sm:text-lg"
        >
          Perkiraan Cuaca {{ locationName || 'Manggar' }}
        </h2>
        <span class="text-brand-cyan text-xs font-bold tracking-wider uppercase">
          SAAT INI
        </span>
      </div>

      <div
        v-if="stale"
        class="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200"
        data-test="stale-badge"
      >
        <span>Luring</span>
      </div>
    </div>

    <!-- Condition Row -->
    <div class="flex items-center gap-4 py-4 sm:py-5">
      <WeatherIcon
        :description="entry?.description"
        class="h-14 w-14 shrink-0 text-white sm:h-16 sm:w-16"
        data-test="current-weather-icon"
      />

      <div class="flex flex-col">
        <div class="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          <span class="sr-only">{{ srTempText }}</span>
          <span aria-hidden="true">{{ temp !== '-' ? `${temp}°C` : '-' }}</span>
        </div>
        <div class="text-sm font-medium text-slate-200 capitalize sm:text-base">
          {{ description }}
        </div>
      </div>
    </div>

    <!-- Metric Chips -->
    <div class="flex flex-wrap items-center gap-2 pt-1 text-xs font-medium sm:text-sm">
      <div
        class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-slate-100 backdrop-blur-sm"
        data-test="metric-humidity"
      >
        <span class="sr-only">{{ srHumidityText }}</span>
        <span aria-hidden="true">Kelembapan : {{ humidity !== '-' ? `${humidity}%` : '-' }}</span>
      </div>

      <div
        class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-slate-100 backdrop-blur-sm"
        data-test="metric-wind-speed"
      >
        <span class="sr-only">{{ srWindSpeedText }}</span>
        <span aria-hidden="true">Kecepatan Angin : {{ windSpeed !== '-' ? `${windSpeed} km/jam` : '-' }}</span>
      </div>

      <div
        class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-slate-100 backdrop-blur-sm"
        data-test="metric-wind-direction"
      >
        <span class="sr-only">{{ srWindDirectionText }}</span>
        <span aria-hidden="true">Arah Angin : {{ windDirectionLocalized }}</span>
      </div>
    </div>
  </div>
</template>
