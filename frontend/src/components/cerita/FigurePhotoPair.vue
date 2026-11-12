<script setup lang="ts">
import type { ArticlePhoto } from '../../types/ceritaArticle';
import FigureCard from './FigureCard.vue';

/** Two pictures as an offset pair: the second card sits lower and to the right of the first. */
defineProps<{ photos: ArticlePhoto[] }>();
</script>

<template>
  <div class="space-y-[-1.25rem] py-1" data-test="figure-pair">
    <FigureCard :photo="photos[0]!" class="w-[72%]" />
    <FigureCard :photo="photos[1]!" class="relative ml-auto w-[72%]" />
  </div>
</template>
