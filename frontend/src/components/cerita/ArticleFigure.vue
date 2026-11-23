<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  ArticleFigure,
  ArticlePhoto,
  ChartFigure,
  ChartTable,
  DiagramFigure,
} from '../../types/ceritaArticle';
import { safeImageSrc } from '../../utils/ceritaFigures';
import { chartGroups } from '../../utils/ceritaChart';
import FigureCard from './FigureCard.vue';
import FigurePhotoPair from './FigurePhotoPair.vue';
import FigureCarousel from './FigureCarousel.vue';
import FigureDiagram from './FigureDiagram.vue';
import FigureChart from './FigureChart.vue';

/**
 * Picks the layout for a section's figure: one picture, a pair, a carousel, or a diagram.
 * A picture that fails to load (never attached, deleted, offline) is left out and the rest is laid
 * out again: a pair of which one fails becomes a single card, a diagram whose picture fails falls
 * back to its bars. When nothing is left the figure renders nothing at all, and says so through
 * `visible-change` so the section can count itself as empty. A chart is laid out from the page's
 * indicator tables (`tables`, by id); a chart whose table is missing or empty is left out.
 */
const props = withDefaults(
  defineProps<{ figure: ArticleFigure; tables?: Record<string, ChartTable> }>(),
  {
    tables: () => ({}),
  },
);
const emit = defineEmits<{ 'visible-change': [visible: boolean] }>();

const failedPhotoIds = ref<Set<string>>(new Set());
const diagramImageFailed = ref(false);

// A figure whose content changed (it was saved) gets its pictures tried again. The reader rebuilds
// equal figure objects on every unrelated content refresh, so this compares content, not identity;
// otherwise a photo that already failed would be requested and shown again each time.
const signature = computed(() => JSON.stringify(props.figure));
watch(signature, () => {
  failedPhotoIds.value = new Set();
  diagramImageFailed.value = false;
});

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

const chart = computed<ChartFigure | null>(() =>
  props.figure.kind === 'chart' ? props.figure : null,
);
const chartTable = computed(() => (chart.value ? props.tables[chart.value.tableId] : undefined));

const visible = computed(() => {
  if (chart.value) return chartGroups(chart.value, chartTable.value).length > 0;
  if (diagram.value) {
    return safeImageSrc(diagram.value.src) !== null || (diagram.value.bars?.items.length ?? 0) > 0;
  }
  return photos.value.length > 0;
});

watch(visible, (value) => emit('visible-change', value), { immediate: true });
</script>

<template>
  <template v-if="!visible" />
  <template v-else-if="chart">
    <FigureChart :figure="chart" :table="chartTable" />
  </template>
  <template v-else-if="diagram">
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
