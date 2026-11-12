<script setup lang="ts">
import { computed } from 'vue';
import type { ArticleFigure } from '../../types/ceritaArticle';
import { safeImageSrc } from '../../utils/ceritaFigures';
import FigureCard from './FigureCard.vue';
import FigurePhotoPair from './FigurePhotoPair.vue';
import FigureCarousel from './FigureCarousel.vue';
import FigureDiagram from './FigureDiagram.vue';

/** Picks the layout for a section's figure: one picture, a pair, a carousel, or a diagram. */
const props = defineProps<{ figure: ArticleFigure }>();

const usablePhotos = computed(() =>
  props.figure.kind === 'photos'
    ? props.figure.photos.filter((photo) => safeImageSrc(photo.src) !== null)
    : [],
);
</script>

<template>
  <FigureCard v-if="figure.kind === 'photo'" :photo="figure.photo" />
  <template v-else-if="figure.kind === 'photos'">
    <FigureCard v-if="usablePhotos.length === 1" :photo="usablePhotos[0]!" />
    <FigurePhotoPair v-else-if="usablePhotos.length === 2" :photos="usablePhotos" />
    <FigureCarousel v-else-if="usablePhotos.length > 2" :photos="usablePhotos" />
  </template>
  <FigureDiagram v-else-if="figure.kind === 'diagram'" :figure="figure" />
</template>
