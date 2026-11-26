<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ArticleFigure as ArticleFigureData, ChartTable } from '../../types/ceritaArticle';
import ArticleFigure from './ArticleFigure.vue';
import SectionProse from './SectionProse.vue';

/**
 * A section's prose and its figure, shared by the public reader, the editor preview and the
 * `/cerita/contoh` mockup. From `lg`, when the figure has something to show beside text, the text
 * sits in the left column and the figure in the right, both top-aligned. The DOM order stays text
 * then figure, so a linear read (and the narrow stack) matches the desktop reading order.
 * Without a visible figure, or without any text beside it, the body is a plain stack.
 */
const props = withDefaults(
  defineProps<{
    /** The section's prose bodies in reading order; each is rendered as limited Markdown. */
    prose: string[];
    /** The section's stored figure, or null when it has none. */
    figure?: ArticleFigureData | null;
    /** Indicator tables by id, for a chart figure. */
    tables?: Record<string, ChartTable>;
  }>(),
  {
    figure: null,
    tables: () => ({}),
  },
);
const emit = defineEmits<{ 'visible-change': [visible: boolean] }>();

/** Whether the figure reports something to show; it stays unknown until the figure has reported. */
const figureVisible = ref(false);
watch(
  () => props.figure,
  (figure) => {
    if (!figure) figureVisible.value = false;
  },
);

const sideBySide = computed(
  () => props.figure !== null && figureVisible.value && props.prose.length > 0,
);

function onVisibleChange(visible: boolean): void {
  figureVisible.value = visible;
  emit('visible-change', visible);
}
</script>

<template>
  <div
    v-if="prose.length > 0 || figure"
    :class="
      sideBySide
        ? 'space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0'
        : 'space-y-4'
    "
    data-test="section-body"
    :data-side-by-side="sideBySide ? 'true' : undefined"
  >
    <div v-if="prose.length > 0" class="space-y-4" data-test="section-text">
      <SectionProse v-for="(body, index) in prose" :key="index" :body="body" />
    </div>
    <ArticleFigure
      v-if="figure"
      :figure="figure"
      :tables="tables"
      @visible-change="onVisibleChange"
    />
  </div>
</template>
