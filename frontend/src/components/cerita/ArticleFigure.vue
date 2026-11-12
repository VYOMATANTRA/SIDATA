<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ArticleFigureBlock } from '../../types/ceritaArticle';

const props = defineProps<{ block: ArticleFigureBlock }>();

// A photo that fails to load is dropped together with its caption, so the page never shows a
// broken frame.
const failed = ref(false);
watch(
  () => props.block.src,
  () => {
    failed.value = false;
  },
);

const safeSrc = computed(() => {
  const src = props.block.src.trim();
  if ((src.startsWith('/') && !src.startsWith('//')) || /^https:\/\/[^/]+/i.test(src)) return src;
  return null;
});
const visible = computed(() => safeSrc.value !== null && !failed.value);
</script>

<template>
  <figure v-if="visible" class="space-y-2" data-test="article-figure">
    <img
      :src="safeSrc ?? undefined"
      :alt="block.alt"
      loading="lazy"
      class="rounded-card border-border block h-auto w-full border object-cover"
      @error="failed = true"
    />
    <figcaption
      v-if="block.caption || block.credit"
      class="text-text-muted text-sm leading-snug"
      data-test="article-figure-caption"
    >
      <span v-if="block.caption" class="text-brand-navy block font-medium">{{
        block.caption
      }}</span>
      <span v-if="block.credit" class="block">{{ block.credit }}</span>
    </figcaption>
  </figure>
</template>
