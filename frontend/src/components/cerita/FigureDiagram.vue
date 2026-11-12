<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DiagramFigure } from '../../types/ceritaArticle';
import { safeImageSrc } from '../../utils/ceritaFigures';
import BarDiagram from '../common/BarDiagram.vue';

/** A plot or diagram on a white card: centred title, the picture (or live bars), source below. */
const props = defineProps<{ figure: DiagramFigure }>();

const emit = defineEmits<{ 'image-error': [] }>();

const failed = ref(false);
watch(
  () => props.figure.src,
  () => {
    failed.value = false;
  },
);
function onImageError() {
  failed.value = true;
  emit('image-error');
}
const src = computed(() => safeImageSrc(props.figure.src));
const showImage = computed(() => src.value !== null && !failed.value);
const showBars = computed(() => !showImage.value && (props.figure.bars?.items.length ?? 0) > 0);
</script>

<template>
  <figure
    v-if="showImage || showBars"
    class="rounded-card border-border border bg-white p-4 shadow-md"
    data-test="figure-diagram"
  >
    <template v-if="showImage">
      <p class="text-brand-navy text-center text-base font-semibold">{{ figure.title }}</p>
      <img
        :src="src ?? undefined"
        :alt="figure.alt ?? figure.title"
        loading="lazy"
        class="mt-3 block h-auto w-full object-contain"
        @error="onImageError"
      />
    </template>
    <BarDiagram
      v-else
      :title="figure.title"
      :unit="figure.bars?.unit"
      :items="figure.bars?.items ?? []"
    />
    <figcaption v-if="figure.source" class="text-text-muted mt-3 text-sm">
      Sumber: {{ figure.source }}
    </figcaption>
  </figure>
</template>
