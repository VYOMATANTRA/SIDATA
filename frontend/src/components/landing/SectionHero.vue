<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_HERO_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import { useSettingsStore } from '../../stores/settings.store';

const contentBlocksStore = useContentBlocksStore();
const settingsStore = useSettingsStore();

const hero = computed(() => contentBlocksStore.hero);

const titleText = computed(() => {
  const title = hero.value.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return settingsStore.tagline || DEFAULT_HERO_BLOCK.title;
});

const bodyText = computed(() => {
  const body = hero.value.body;
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  return DEFAULT_HERO_BLOCK.body;
});
</script>

<template>
  <header
    class="relative overflow-hidden border-b border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-4 py-16 text-white sm:px-6 md:py-24 lg:px-8"
    aria-labelledby="hero-title"
    data-test="landing-section-hero"
  >
    <!-- Background subtle mesh accents -->
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] opacity-10"
      aria-hidden="true"
    ></div>

    <div class="relative mx-auto max-w-5xl space-y-6 text-center">
      <!-- Fixed institutional eyebrow (not CMS badge/CTA — those belong to PR #86 backgroundImage hero) -->
      <p class="text-sm font-medium tracking-wide text-emerald-300/90 sm:text-base">
        {{ settingsStore.administrativeArea || 'Kelurahan Manggar' }}
      </p>

      <!-- Main Headline (Single h1 for the routed view per WCAG & docs/ACCESSIBILITY.md) -->
      <h1
        id="hero-title"
        class="text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
      >
        {{ titleText }}
      </h1>

      <!-- Institutional Narrative Body -->
      <p
        class="mx-auto max-w-3xl text-base leading-relaxed font-normal text-slate-300 sm:text-lg md:text-xl"
      >
        {{ bodyText }}
      </p>

      <div class="flex flex-wrap items-center justify-center gap-4 pt-4">
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
