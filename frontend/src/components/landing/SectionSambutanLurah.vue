<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DEFAULT_SAMBUTAN_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import defaultLurahPhoto from '@/assets/img/landing-page/wajah_lurah.webp';

const contentBlocksStore = useContentBlocksStore();

const sambutan = computed(() => contentBlocksStore.sambutanLurah);

const authorName = computed(() => {
  const metaName = sambutan.value.metadata?.authorName;
  if (typeof metaName === 'string' && metaName.trim()) {
    return metaName.trim();
  }
  return 'Lurah Manggar';
});

const authorTitle = computed(() => {
  const metaTitle = sambutan.value.metadata?.authorTitle;
  if (typeof metaTitle === 'string' && metaTitle.trim()) {
    return metaTitle.trim();
  }
  return 'Kepala Kelurahan Manggar';
});

/**
 * Portrait source. Missing key, empty string: the bundled default portrait. A safe path or HTTPS
 * URL: that photo. `null` (an explicit removal) or an unsafe URL: no portrait at all, and the
 * copy takes the full width instead of leaving an empty frame.
 */
const photoUrl = computed<string | null>(() => {
  const meta = sambutan.value.metadata;
  if (!meta || !('photoUrl' in meta)) {
    return defaultLurahPhoto;
  }
  const rawPhoto = meta.photoUrl;
  if (rawPhoto === null) {
    return null;
  }
  if (typeof rawPhoto === 'string' && rawPhoto.trim()) {
    const trimmed = rawPhoto.trim();
    if (
      (trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
      /^https:\/\/[^/]+/i.test(trimmed)
    ) {
      return trimmed;
    }
    return null;
  }
  return defaultLurahPhoto;
});

// A photo that fails to load is dropped, so the copy reflows instead of keeping a broken frame.
const photoFailed = ref(false);
watch(photoUrl, () => {
  photoFailed.value = false;
});
const showPortrait = computed(() => photoUrl.value !== null && !photoFailed.value);

const portraitAlt = computed(() => `Foto ${authorName.value}, ${authorTitle.value}`);
</script>

<template>
  <!--
    Greeting band. The surface is a vertical gradient from navy to a lightened navy (navy 75% over
    white), so every text colour below stays white on a navy-family fill. Copy and portrait are
    two zones: stacked on narrow widths (copy first, portrait grounded on the bottom edge), side
    by side from md. The portrait never overlaps the name and title.
  -->
  <section
    id="sambutan-lurah"
    aria-labelledby="sambutan-title"
    class="sambutan-surface relative overflow-hidden border-b border-white/10 px-4 pt-12 text-white sm:px-6 sm:pt-16 lg:px-8"
    :class="showPortrait ? 'pb-0' : 'pb-12 sm:pb-16'"
    data-test="sambutan-section"
  >
    <div
      class="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8"
      :class="showPortrait ? 'md:grid-cols-[minmax(0,1fr)_auto] md:items-end' : ''"
      data-test="sambutan-layout"
    >
      <div class="min-w-0" :class="showPortrait ? 'md:pb-12' : ''" data-test="sambutan-copy">
        <h2
          id="sambutan-title"
          class="text-2xl leading-tight font-bold tracking-tight [overflow-wrap:anywhere] text-white sm:text-3xl md:text-4xl"
        >
          {{ sambutan.title || 'Sambutan' }}
        </h2>
        <p
          class="mt-3 max-w-2xl text-base leading-relaxed [overflow-wrap:anywhere] text-white"
          data-test="sambutan-quote"
        >
          {{ sambutan.body || DEFAULT_SAMBUTAN_BLOCK.body }}
        </p>

        <div class="mt-8 border-t border-white/30 pt-5" data-test="author-details">
          <h3
            class="text-lg leading-snug font-bold [overflow-wrap:anywhere] text-white sm:text-2xl"
          >
            {{ authorName }}
          </h3>
          <p class="mt-1 text-base [overflow-wrap:anywhere] text-white">{{ authorTitle }}</p>
        </div>
      </div>

      <div
        v-if="showPortrait"
        class="flex min-w-0 items-end justify-center md:justify-end"
        data-test="portrait-container"
      >
        <img
          :src="photoUrl ?? undefined"
          :alt="portraitAlt"
          class="block h-auto max-h-[22rem] w-auto max-w-full object-contain object-bottom drop-shadow-2xl sm:max-h-[26rem] md:max-h-[30rem] lg:max-h-[34rem]"
          data-test="quote-image"
          @error="photoFailed = true"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Navy at the top, navy 75% over white at the bottom: white text stays above 6.5:1 on both ends. */
.sambutan-surface {
  background-image: linear-gradient(to bottom, #0a2353 0%, #475a7e 100%);
}
</style>
