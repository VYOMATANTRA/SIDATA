<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_SAMBUTAN_BLOCK, useContentBlocksStore } from '../../stores/contentBlocks.store';

const contentBlocksStore = useContentBlocksStore();

const sambutan = computed(() => contentBlocksStore.sambutanLurah);

const authorName = computed(() => {
  const metaName = sambutan.value.metadata?.authorName;
  if (typeof metaName === 'string' && metaName.trim()) {
    return metaName.trim();
  }
  return 'Lurah Manggar';
});

const authorTitle = computed(() => {
  const metaTitle = sambutan.value.metadata?.authorTitle;
  if (typeof metaTitle === 'string' && metaTitle.trim()) {
    return metaTitle.trim();
  }
  return 'Kepala Kelurahan Manggar';
});

const photoUrl = computed(() => {
  const metaPhoto = sambutan.value.metadata?.photoUrl;
  if (typeof metaPhoto === 'string' && metaPhoto.trim()) {
    const trimmed = metaPhoto.trim();
    if (
      (trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
      /^https:\/\/[^/]+/i.test(trimmed)
    ) {
      return trimmed;
    }
  }
  return null;
});
</script>

<template>
  <section
    class="border-b border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8"
    aria-labelledby="sambutan-title"
  >
    <div class="mx-auto max-w-4xl">
      <div
        class="relative overflow-hidden rounded-2xl border border-white/10 bg-[#232528]/90 p-6 text-white shadow-xl sm:p-10 md:p-12"
      >
        <!-- Top Area: Heading & Quote Body -->
        <div class="relative space-y-4">
          <div class="flex items-center gap-3">
            <span class="h-6 w-1.5 rounded-full bg-brand-cyan" aria-hidden="true"></span>
            <h2
              id="sambutan-title"
              class="text-xl font-bold tracking-tight text-white sm:text-2xl"
            >
              {{ sambutan.title || 'Sambutan Kepala Kelurahan' }}
            </h2>
          </div>

          <!-- Message Body in Public Sans -->
          <div
            class="text-base leading-relaxed font-normal whitespace-pre-line text-slate-200/95 sm:text-lg"
          >
            {{ sambutan.body || DEFAULT_SAMBUTAN_BLOCK.body }}
          </div>
        </div>

        <!-- Bottom Area: Split layout with Author info (left) and Portrait/Placeholder (right) -->
        <div
          class="relative mt-8 flex flex-col-reverse items-start justify-between gap-6 border-t border-white/10 pt-6 sm:mt-10 sm:flex-row sm:items-center sm:gap-8"
        >
          <!-- Author Details -->
          <div class="space-y-1">
            <p class="text-base font-bold text-white sm:text-lg">{{ authorName }}</p>
            <p class="text-sm font-medium text-slate-300">{{ authorTitle }}</p>
          </div>

          <!-- Portrait Photo or Initials Avatar Placeholder -->
          <div
            class="flex shrink-0 items-center justify-center"
            data-test="portrait-container"
          >
            <div
              v-if="photoUrl"
              class="h-16 w-16 overflow-hidden rounded-full border-2 border-brand-cyan/60 shadow-md sm:h-20 sm:w-20"
            >
              <img
                :src="photoUrl"
                :alt="`Foto resmi ${authorName}, ${authorTitle}`"
                class="h-full w-full object-cover"
              />
            </div>
            <div
              v-else
              class="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-lg font-bold text-white shadow-inner sm:h-20 sm:w-20"
              aria-hidden="true"
            >
              LM
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
