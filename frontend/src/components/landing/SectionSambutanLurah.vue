<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_SAMBUTAN_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import HugeQuote from '../common/HugeQuote.vue';
import defaultLurahPhoto from '@/assets/img/lurah_placeholder_sample.png';

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

const photoUrl = computed(() => {
  const meta = sambutan.value.metadata;
  // If metadata is explicitly null or authorName/photoUrl not specified in dynamic store, use defaultLurahPhoto
  if (!meta) {
    return null;
  }
  if ('photoUrl' in meta) {
    const rawPhoto = meta.photoUrl;
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
    return null;
  }
  return defaultLurahPhoto;
});
</script>

<template>
  <div
    class="border-b border-white/10 bg-gradient-to-b from-brand-navy to-brand-navy-deep px-4 pt-12 pb-8 text-white sm:px-6 sm:pt-16 sm:pb-12 lg:px-8"
  >
    <div class="mx-auto flex max-w-4xl justify-center">
      <HugeQuote
        id="sambutan-lurah"
        aria-labelledby="sambutan-title"
        title-id="sambutan-title"
        :title="sambutan.title || 'Sambutan'"
        :quote="sambutan.body || DEFAULT_SAMBUTAN_BLOCK.body"
        :author-name="authorName"
        :author-position="authorTitle"
        :image-src="photoUrl || undefined"
        variant="transparent"
        heading-tag="h2"
      />
    </div>
  </div>
</template>

