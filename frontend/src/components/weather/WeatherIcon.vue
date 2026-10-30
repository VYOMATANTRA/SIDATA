<script setup lang="ts">
import { computed } from 'vue';
import sunSvg from '@/assets/img/weathers/sun.svg';
import cloudSunSvg from '@/assets/img/weathers/cloud-sun.svg';
import cloudSvg from '@/assets/img/weathers/cloud.svg';
import cloudySvg from '@/assets/img/weathers/cloudy.svg';
import cloudDrizzleSvg from '@/assets/img/weathers/cloud-drizzle.svg';
import cloudRainSvg from '@/assets/img/weathers/cloud-rain.svg';
import cloudLightningSvg from '@/assets/img/weathers/cloud-lightning.svg';
import cloudFogSvg from '@/assets/img/weathers/cloud-fog.svg';

const props = withDefaults(
  defineProps<{
    description?: string | null;
    alt?: string;
  }>(),
  {
    description: '',
    alt: '',
  },
);

const iconSrc = computed<string | null>(() => {
  if (!props.description || typeof props.description !== 'string') return null;
  const desc = props.description.trim().toLowerCase();
  if (!desc) return null;

  if (desc.includes('petir')) {
    return cloudLightningSvg;
  }
  if (desc.includes('cerah berawan')) {
    return cloudSunSvg;
  }
  if (desc === 'cerah' || (desc.includes('cerah') && !desc.includes('berawan'))) {
    return sunSvg;
  }
  if (desc.includes('berawan tebal') || desc.includes('mendung')) {
    return cloudySvg;
  }
  if (desc.includes('gerimis') || desc.includes('hujan ringan')) {
    return cloudDrizzleSvg;
  }
  if (desc.includes('hujan')) {
    return cloudRainSvg;
  }
  if (desc.includes('berawan')) {
    return cloudSvg;
  }
  if (desc.includes('kabut') || desc.includes('udara kabur') || desc.includes('asap')) {
    return cloudFogSvg;
  }

  return null;
});
</script>

<template>
  <span class="inline-flex items-center justify-center shrink-0">
    <img
      v-if="iconSrc"
      :src="iconSrc"
      :alt="alt || ''"
      aria-hidden="true"
      class="w-full h-full object-contain filter brightness-0 invert"
      data-test="weather-icon-img"
    />
    <svg
      v-else
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="w-full h-full"
      data-test="weather-icon-fallback"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  </span>
</template>
