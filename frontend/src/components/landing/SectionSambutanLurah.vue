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
    return metaPhoto.trim();
  }
  return null;
});
</script>

<template>
  <section
    class="border-b border-slate-200/80 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    aria-labelledby="sambutan-title"
  >
    <div class="mx-auto max-w-4xl">
      <div
        class="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-10 md:p-12"
      >
        <!-- Decorative quote icon -->
        <div
          class="pointer-events-none absolute -top-4 -right-4 flex h-28 w-28 items-center justify-center text-slate-100 select-none"
          aria-hidden="true"
        >
          <svg fill="currentColor" viewBox="0 0 24 24" class="h-full w-full opacity-60">
            <path
              d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"
            />
          </svg>
        </div>

        <div class="relative space-y-6">
          <div class="flex items-center gap-3">
            <span class="h-6 w-1.5 rounded-full bg-emerald-600" aria-hidden="true"></span>
            <h2
              id="sambutan-title"
              class="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
            >
              {{ sambutan.title || 'Sambutan Kepala Kelurahan' }}
            </h2>
          </div>

          <!-- Message Body -->
          <div
            class="text-base leading-relaxed font-normal whitespace-pre-line text-slate-700 sm:text-lg"
          >
            {{ sambutan.body || DEFAULT_SAMBUTAN_BLOCK.body }}
          </div>

          <!-- Lurah Identity Card -->
          <div class="flex items-center gap-4 border-t border-slate-100 pt-6">
            <!-- Photo or Avatar -->
            <div
              v-if="photoUrl"
              class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border-2 border-emerald-500 shadow-sm sm:h-16 sm:w-16"
            >
              <img
                :src="photoUrl"
                :alt="`Foto resmi ${authorName}, ${authorTitle}`"
                class="h-full w-full object-cover"
              />
            </div>
            <div
              v-else
              class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 text-lg font-bold text-emerald-800 sm:h-16 sm:w-16 sm:text-xl"
              aria-hidden="true"
            >
              LM
            </div>

            <div>
              <p class="text-base font-bold text-slate-900 sm:text-lg">{{ authorName }}</p>
              <p class="text-sm font-medium text-slate-500">{{ authorTitle }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
