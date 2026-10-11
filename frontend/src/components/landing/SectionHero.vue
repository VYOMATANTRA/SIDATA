<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_HERO_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import { useSettingsStore } from '../../stores/settings.store';
import defaultHeroBg from '@/assets/img/background_laman_depan_kelurahan.png';

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
    class="relative flex min-h-[480px] w-full flex-col justify-center overflow-hidden px-6 py-14 text-white transition-all sm:min-h-[560px] sm:px-12 sm:py-20 md:py-24"
    :style="backgroundStyle"
    aria-labelledby="hero-title"
    data-test="section-hero"
  >
    <div class="relative z-10 mx-auto flex w-full max-w-5xl flex-col space-y-6 sm:space-y-8">
      <!-- Institutional Eyebrow Badge matching Figma -->
      <div class="flex items-center gap-2">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-white backdrop-blur-xs sm:text-sm"
        >
          <span class="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true"></span>
          <span>{{ badgeText }}</span>
          <span class="font-normal text-slate-300">|</span>
          <span class="text-slate-200">{{ settingsStore.administrativeArea }}</span>
        </span>
      </div>

      <!-- Main Headline & Description using Figma typography -->
      <div class="space-y-4">
        <h1
          id="hero-title"
          class="min-w-0 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl"
        >
          {{ titleText }}
        </h1>
        <p class="max-w-3xl text-base leading-relaxed text-slate-200/95 sm:text-lg">
          {{ bodyText }}
        </p>
      </div>

      <!-- Action Buttons matching Figma rounded-btn and brand-navy -->
      <div class="flex flex-wrap items-center gap-3 pt-2 sm:gap-4" data-test="hero-actions">
        <a
          :href="ctaLink"
          class="inline-flex items-center justify-center gap-2 rounded-btn bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:text-base"
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
          class="inline-flex items-center justify-center rounded-btn border border-white/20 bg-brand-navy-overlay px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-base"
        >
          Akses Petugas & Editor
        </router-link>
      </div>
    </div>
  </section>
</template>
