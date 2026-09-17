<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_HERO_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import { useSettingsStore } from '../../stores/settings.store';

const contentBlocksStore = useContentBlocksStore();
const settingsStore = useSettingsStore();

const hero = computed(() => contentBlocksStore.hero);

const badgeText = computed(() => {
  const metaBadge = hero.value.metadata?.badge;
  if (typeof metaBadge === 'string' && metaBadge.trim()) {
    return metaBadge.trim();
  }
  return 'Portal Resmi Keterbukaan Informasi';
});

const ctaText = computed(() => {
  const metaCta = hero.value.metadata?.ctaText;
  if (typeof metaCta === 'string' && metaCta.trim()) {
    return metaCta.trim();
  }
  return 'Jelajahi Potensi Wilayah';
});

const ctaLink = computed(() => {
  const metaLink = hero.value.metadata?.ctaLink;
  if (typeof metaLink === 'string' && metaLink.trim()) {
    return metaLink.trim();
  }
  return '#potensi';
});
</script>

<template>
  <header
    class="relative overflow-hidden border-b border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-4 py-16 text-white sm:px-6 md:py-24 lg:px-8"
    aria-labelledby="hero-title"
  >
    <!-- Background subtle mesh accents -->
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] opacity-10"
      aria-hidden="true"
    ></div>

    <div class="relative mx-auto max-w-5xl space-y-6 text-center">
      <!-- Institutional Badge -->
      <div
        class="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-emerald-300 sm:text-sm"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true"></span>
        <span>{{ badgeText }}</span>
        <span class="font-normal text-slate-400">|</span>
        <span class="text-slate-300">{{ settingsStore.administrativeArea }}</span>
      </div>

      <!-- Main Headline (Single h1 for the routed view per WCAG & docs/ACCESSIBILITY.md) -->
      <h1
        id="hero-title"
        class="text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
      >
        {{ hero.title || settingsStore.tagline }}
      </h1>

      <!-- Institutional Narrative Body -->
      <p
        class="mx-auto max-w-3xl text-base leading-relaxed font-normal text-slate-300 sm:text-lg md:text-xl"
      >
        {{ hero.body || DEFAULT_HERO_BLOCK.body }}
      </p>

      <!-- Action Button -->
      <div class="flex flex-wrap items-center justify-center gap-4 pt-4">
        <a
          :href="ctaLink"
          class="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:text-base"
        >
          <span>{{ ctaText }}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </a>

        <router-link
          to="/login"
          class="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:text-base"
        >
          Akses Petugas & Editor
        </router-link>
      </div>
    </div>
  </header>
</template>
