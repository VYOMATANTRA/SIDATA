<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_HERO_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import { useSettingsStore } from '../../stores/settings.store';
import defaultHeroBg from '@/assets/img/background_laman_depan_kelurahan.webp';

const contentBlocksStore = useContentBlocksStore();
const settingsStore = useSettingsStore();

const hero = computed(() => contentBlocksStore.hero);

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
    const trimmed = metaLink.trim();
    if (trimmed.includes('\\') || /%5c/i.test(trimmed)) {
      return '#potensi';
    }
    if (trimmed.startsWith('#')) {
      return trimmed;
    }
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      try {
        const parsed = new URL(trimmed, 'https://placeholder.invalid');
        if (parsed.origin === 'https://placeholder.invalid' && parsed.protocol === 'https:') {
          return trimmed;
        }
      } catch {
        return '#potensi';
      }
    }
    if (/^https:\/\/[^/]+/i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:') {
          return trimmed;
        }
      } catch {
        return '#potensi';
      }
    }
  }
  return '#potensi';
});

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

const backgroundStyle = computed(() => {
  const metaBg = hero.value.metadata?.backgroundImage;
  const image =
    typeof metaBg === 'string' && metaBg.trim() && !metaBg.includes('javascript:')
      ? metaBg.trim()
      : defaultHeroBg;

  return {
    backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.84), rgba(0, 27, 72, 0.90)), url('${image}')`,
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
        <a
          :href="ctaLink"
          class="inline-flex items-center justify-center gap-2 rounded-btn bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy shadow-lg shadow-black/30 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cyan sm:text-base"
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
          class="inline-flex items-center justify-center rounded-btn border border-white/20 bg-brand-navy-overlay px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-base"
        >
          Akses Petugas & Editor
        </router-link>
      </div>
    </div>
  </section>
</template>
