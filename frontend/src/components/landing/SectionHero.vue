<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_HERO_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import { useSettingsStore } from '../../stores/settings.store';
import defaultHeroBg from '@/assets/img/background_laman_depan_kelurahan.webp';

const contentBlocksStore = useContentBlocksStore();
const settingsStore = useSettingsStore();

const hero = computed(() => contentBlocksStore.hero);

const titleText = computed(() => {
  const title = hero.value.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return settingsStore.tagline || 'Sistem Informasi Data Terpadu Kelurahan';
});

const bodyText = computed(() => {
  const body = hero.value.body;
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  return DEFAULT_HERO_BLOCK.body;
});

const backgroundStyle = computed(() => {
  return {
    backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.84), rgba(0, 27, 72, 0.90)), url(${defaultHeroBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});
</script>

<template>
  <section
    id="hero"
    class="relative flex min-h-[520px] w-full flex-col justify-center overflow-hidden px-5 py-16 text-white transition-all sm:min-h-[580px] sm:px-12 sm:py-20 md:py-24"
    :style="backgroundStyle"
    aria-labelledby="hero-title"
    data-test="section-hero"
  >
    <div class="relative z-10 mx-auto flex w-full max-w-5xl flex-col space-y-6 sm:space-y-8">
      <div class="space-y-4">
        <h1
          id="hero-title"
          class="min-w-0 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl"
        >
          {{ titleText }}
        </h1>
        <p class="max-w-3xl text-sm leading-relaxed text-slate-200/95 sm:text-base md:text-lg">
          {{ bodyText }}
        </p>
      </div>

      <!-- Action Buttons matching Figma rounded-btn and brand tokens -->
      <div class="flex flex-wrap items-center gap-3 pt-2 sm:gap-4" data-test="hero-actions">
      </div>
    </div>
  </section>
</template>
