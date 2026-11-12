<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { ArticlePhoto } from '../../types/ceritaArticle';
import FigureCard from './FigureCard.vue';

/**
 * More than two pictures as a swipeable row that peeks at the next card, with Sebelumnya/Berikutnya
 * buttons (swiping is never the only way) and position dots.
 */
const props = defineProps<{ photos: ArticlePhoto[] }>();
defineEmits<{ 'image-error': [photo: ArticlePhoto] }>();

const labelId = useId();
const track = ref<HTMLElement | null>(null);
const index = ref(0);
const total = computed(() => props.photos.length);
// A photo that failed to load is removed from the row, so the position must stay within it.
watch(total, (count) => {
  index.value = Math.min(index.value, Math.max(0, count - 1));
});

function cardStep(): number {
  const first = track.value?.firstElementChild as HTMLElement | null;
  if (!first) return 0;
  const gap = parseFloat(getComputedStyle(track.value as HTMLElement).columnGap) || 0;
  return first.getBoundingClientRect().width + gap;
}

function syncIndex() {
  const el = track.value;
  const step = cardStep();
  if (!el || step === 0) return;
  // The row stops scrolling at its end, which can be short of the last card's own slot (e.g. three
  // cards at tablet width). Scrolled all the way to the end therefore always means the last photo.
  const atEnd = el.scrollLeft > 0 && el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
  index.value = atEnd
    ? total.value - 1
    : Math.min(total.value - 1, Math.max(0, Math.round(el.scrollLeft / step)));
}

function goTo(next: number) {
  const target = Math.min(total.value - 1, Math.max(0, next));
  // Instant, not smooth: a smooth programmatic scroll is cancelled by `snap-mandatory` in some
  // Chromium builds, which left the row where it was.
  track.value?.scrollTo({ left: target * cardStep(), behavior: 'auto' });
  index.value = target;
}

let raf = 0;
function onScroll() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(syncIndex);
}
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div
    role="group"
    aria-roledescription="carousel"
    :aria-labelledby="labelId"
    data-test="figure-carousel"
  >
    <p :id="labelId" class="sr-only">Galeri foto, {{ total }} foto</p>
    <div
      ref="track"
      class="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:scroll-pl-0 sm:px-0"
      tabindex="0"
      aria-label="Geser untuk melihat foto lainnya"
      data-test="figure-carousel-track"
      @scroll.passive="onScroll"
    >
      <FigureCard
        v-for="photo in photos"
        :key="photo.id"
        :photo="photo"
        class="w-[78%] shrink-0 snap-start sm:w-[60%]"
        @image-error="$emit('image-error', photo)"
      />
    </div>

    <div class="flex items-center justify-between gap-3">
      <p class="text-text-muted text-sm" aria-live="polite" data-test="figure-carousel-position">
        Foto {{ index + 1 }} dari {{ total }}
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-btn border-border text-brand-navy focus-visible:outline-focus-ring min-h-9 border bg-white px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
          :disabled="index === 0"
          data-test="figure-carousel-prev"
          @click="goTo(index - 1)"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="rounded-btn bg-brand-navy focus-visible:outline-focus-ring min-h-9 px-3 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
          :disabled="index >= total - 1"
          data-test="figure-carousel-next"
          @click="goTo(index + 1)"
        >
          Berikutnya
        </button>
      </div>
    </div>
    <div class="mt-3 flex justify-center gap-1.5" aria-hidden="true">
      <span
        v-for="(photo, i) in photos"
        :key="photo.id"
        class="h-1.5 w-1.5 rounded-full"
        :class="i === index ? 'bg-brand-navy' : 'bg-border'"
      />
    </div>
  </div>
</template>
