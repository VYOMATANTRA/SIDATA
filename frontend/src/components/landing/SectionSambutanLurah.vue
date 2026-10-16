<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_SAMBUTAN_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';
import HugeQuote from '../common/HugeQuote.vue';

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
  const metaPhoto = sambutan.value.metadata?.photoUrl;
  if (typeof metaPhoto === 'string' && metaPhoto.trim()) {
    const trimmed = metaPhoto.trim();
    if (
      (trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
      /^https:\/\/[^/]+/i.test(trimmed)
    ) {
      return trimmed;
    }
  }
  return null;
});
</script>

<template>
  <div
    class="border-b border-white/10 bg-gradient-to-b from-brand-navy to-brand-navy-deep px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8"
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
        variant="dark"
        heading-tag="h2"
      />
    </div>
  </div>
</template>

