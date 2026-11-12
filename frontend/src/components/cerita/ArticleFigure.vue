<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ArticleFigure, ArticlePhoto, DiagramFigure } from '../../types/ceritaArticle';
import { safeImageSrc } from '../../utils/ceritaFigures';
import FigureCard from './FigureCard.vue';
import FigurePhotoPair from './FigurePhotoPair.vue';
import FigureCarousel from './FigureCarousel.vue';
import FigureDiagram from './FigureDiagram.vue';

/**
 * Picks the layout for a section's figure: one picture, a pair, a carousel, or a diagram.
 * A picture that fails to load (never attached, deleted, offline) is left out and the rest is laid
 * out again: a pair of which one fails becomes a single card, a diagram whose picture fails falls
 * back to its bars. When nothing is left the figure renders nothing at all, and says so through
 * `visible-change` so the section can count itself as empty.
 */
const props = defineProps<{ figure: ArticleFigure }>();
const emit = defineEmits<{ 'visible-change': [visible: boolean] }>();

const failedPhotoIds = ref<Set<string>>(new Set());
const diagramImageFailed = ref(false);

// A new figure (the content was saved or refetched) gets its pictures tried again.
watch(
  () => props.figure,
  () => {
    failedPhotoIds.value = new Set();
    diagramImageFailed.value = false;
  },
);

function markFailed(photo: ArticlePhoto) {
  failedPhotoIds.value = new Set(failedPhotoIds.value).add(photo.id);
}

function isUsable(photo: ArticlePhoto): boolean {
  return safeImageSrc(photo.src) !== null && !failedPhotoIds.value.has(photo.id);
}

const photos = computed<ArticlePhoto[]>(() => {
  const figure = props.figure;
  if (figure.kind === 'photo') return [figure.photo].filter(isUsable);
  if (figure.kind === 'photos') return figure.photos.filter(isUsable);
  return [];
});

const diagram = computed<DiagramFigure | null>(() => {
  const figure = props.figure;
  if (figure.kind !== 'diagram') return null;
  if (!diagramImageFailed.value) return figure;
  return { ...figure, src: undefined, alt: undefined };
});

const visible = computed(() => {
  if (diagram.value) {
    return safeImageSrc(diagram.value.src) !== null || (diagram.value.bars?.items.length ?? 0) > 0;
  }
  return photos.value.length > 0;
});

watch(visible, (value) => emit('visible-change', value), { immediate: true });
</script>

<template>
  <template v-if="diagram">
    <FigureDiagram :figure="diagram" @image-error="diagramImageFailed = true" />
  </template>
  <template v-else>
    <FigureCard
      v-if="photos.length === 1"
      :photo="photos[0]!"
      @image-error="markFailed(photos[0]!)"
    />
    <FigurePhotoPair v-else-if="photos.length === 2" :photos="photos" @image-error="markFailed" />
    <FigureCarousel v-else-if="photos.length > 2" :photos="photos" @image-error="markFailed" />
  </template>
</template>
