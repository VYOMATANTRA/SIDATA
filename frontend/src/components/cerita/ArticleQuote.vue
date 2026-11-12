<script setup lang="ts">
import type { ArticleQuoteBlock } from '../../types/ceritaArticle';

defineProps<{ block: ArticleQuoteBlock }>();
</script>

<template>
  <figure
    class="border-brand-navy bg-surface-muted rounded-r-card border-l-4 px-4 py-3"
    data-test="article-quote"
  >
    <blockquote class="text-brand-navy text-base leading-relaxed font-medium italic">
      <p>{{ block.text }}</p>
    </blockquote>
    <figcaption v-if="block.attribution" class="text-text-muted mt-2 text-sm">
      {{ block.attribution }}
    </figcaption>
  </figure>
</template>
