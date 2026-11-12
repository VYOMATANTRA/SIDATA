<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ArticlePhoto } from '../../types/ceritaArticle';
import { safeImageSrc } from '../../utils/ceritaFigures';

/** One picture on a white card with its caption and credit underneath. */
const props = defineProps<{ photo: ArticlePhoto }>();

// A picture that fails to load is dropped with its caption, so there is never a broken frame.
const failed = ref(false);
watch(
  () => props.photo.src,
  () => {
    failed.value = false;
  },
);
const src = computed(() => safeImageSrc(props.photo.src));
</script>

<template>
  <figure
    v-if="src && !failed"
    class="rounded-card border-border border bg-white p-3 shadow-md"
    data-test="figure-card"
  >
    <img
      :src="src"
      :alt="photo.alt"
      loading="lazy"
      class="bg-surface-muted block aspect-[4/3] w-full rounded-[inherit] object-cover"
      @error="failed = true"
    />
    <figcaption v-if="photo.caption || photo.credit" class="mt-3 space-y-0.5 leading-snug">
      <span v-if="photo.caption" class="text-brand-navy block text-base font-medium">{{
        photo.caption
      }}</span>
      <span v-if="photo.credit" class="text-text-muted block text-sm">{{ photo.credit }}</span>
    </figcaption>
  </figure>
</template>
