<script setup lang="ts">
import { computed } from 'vue';
import WeatherIcon from './WeatherIcon.vue';
import { parseForecastDatetime, type WeatherForecastEntry } from '../../stores/weather.store';

const props = withDefaults(
  defineProps<{
    entry?: WeatherForecastEntry | null;
  }>(),
  {
    entry: null,
  },
);

const timeParts = computed(() => {
  if (!props.entry?.datetime) return null;
  const ms = parseForecastDatetime(props.entry.datetime);
  if (!ms) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(ms));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return { hour, minute };
});

const timeDisplay = computed(() =>
  timeParts.value ? `${timeParts.value.hour}.${timeParts.value.minute} WITA` : '- WITA',
);

const srTimeText = computed(() =>
  timeParts.value
    ? `Prakiraan cuaca pukul ${timeParts.value.hour} lewat ${timeParts.value.minute} Waktu Indonesia Tengah`
    : 'Prakiraan cuaca tidak tersedia',
);

const temp = computed(() =>
  props.entry &&
  typeof props.entry.temperatureCelsius === 'number' &&
  Number.isFinite(props.entry.temperatureCelsius)
    ? props.entry.temperatureCelsius
    : '-',
);

const srTempText = computed(() =>
  temp.value !== '-' ? `${temp.value} derajat Celsius` : 'Data suhu tidak tersedia',
);

const description = computed(() => props.entry?.description || '-');
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-between rounded-2xl border border-white/20 bg-white/10 p-4 text-center text-white shadow-xl backdrop-blur-md transition-all duration-300 hover:border-white/30 sm:p-5"
    data-test="weather-upcoming-card"
  >
    <!-- Time Header -->
    <div class="text-xs font-semibold tracking-wide text-slate-200 sm:text-sm">
      <span class="sr-only">{{ srTimeText }}</span>
      <span aria-hidden="true">{{ timeDisplay }}</span>
    </div>

    <!-- Centered Weather Icon -->
    <div class="my-2 flex items-center justify-center sm:my-3">
      <WeatherIcon
        :description="entry?.description"
        class="h-10 w-10 text-white sm:h-12 sm:w-12"
        data-test="upcoming-weather-icon"
      />
    </div>

    <!-- Temperature & Condition -->
    <div class="w-full space-y-0.5">
      <div class="text-xl font-bold tracking-tight text-white sm:text-2xl">
        <span class="sr-only">{{ srTempText }}</span>
        <span aria-hidden="true">{{ temp !== '-' ? `${temp}°C` : '-' }}</span>
      </div>
      <div
        class="truncate text-xs font-medium text-slate-200/90 capitalize sm:text-sm"
        :title="description"
      >
        {{ description }}
      </div>
    </div>
  </div>
</template>
