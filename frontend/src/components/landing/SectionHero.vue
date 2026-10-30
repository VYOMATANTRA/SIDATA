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
  return settingsStore.tagline || DEFAULT_HERO_BLOCK.title;
});

const bodyText = computed(() => {
  const body = hero.value.body;
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  return DEFAULT_HERO_BLOCK.body;
});

function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitizes and safely encodes an image URL for CSS backgroundImage.
 * Only permits leading `/` paths and `https://` URLs to prevent CSS breakout and tracking injection.
 */
function sanitizeBackgroundImageUrl(url: unknown): string {
  if (typeof url !== 'string') return defaultHeroBg;
  const trimmed = url.trim();
  if (!trimmed) return defaultHeroBg;

  // Disallow line breaks and control characters to prevent header/CSS injection
  if (hasControlCharacters(trimmed)) return defaultHeroBg;

  // Disallow protocol-relative URLs and backslashes
  if (trimmed.startsWith('//') || trimmed.includes('\\') || /%5c/i.test(trimmed)) {
    return defaultHeroBg;
  }

  // Only allow absolute paths starting with / or secure https: addresses
  const isPath = trimmed.startsWith('/');
  const isHttps = trimmed.startsWith('https://');
  if (!isPath && !isHttps) {
    return defaultHeroBg;
  }

  try {
    if (isHttps) {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') return defaultHeroBg;
    } else {
      const parsed = new URL(trimmed, 'https://placeholder.invalid');
      if (parsed.origin !== 'https://placeholder.invalid' || parsed.protocol !== 'https:') {
        return defaultHeroBg;
      }
    }
  } catch {
    return defaultHeroBg;
  }

  // Encode URI and escape quotes, parentheses, and backslashes to prevent CSS breakout
  const escaped = encodeURI(trimmed).replace(/['"()\\]/g, (char) => `\\${char}`);
  return escaped;
}

const backgroundStyle = computed(() => {
  const metaBg = hero.value.metadata?.backgroundImage;
  const image = sanitizeBackgroundImageUrl(metaBg);

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
          class="min-w-0 text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl"
        >
          {{ titleText }}
        </h1>
        <p class="max-w-3xl text-sm leading-relaxed text-slate-200/95 sm:text-base md:text-lg">
          {{ bodyText }}
        </p>
      </div>

      <!-- Hero Actions slot (renders only when slot content is provided) -->
      <div
        v-if="$slots.actions"
        class="flex flex-wrap items-center gap-3 pt-2 sm:gap-4"
        data-test="hero-actions"
      >
        <slot name="actions" />
      </div>
    </div>
  </section>
</template>
