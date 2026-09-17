<script setup lang="ts">
import { computed } from 'vue';
import { useContentBlocksStore } from '../../stores/contentBlocks.store';

interface HighlightItem {
  title: string;
  desc: string;
}

const contentBlocksStore = useContentBlocksStore();

const highlights = computed(() => contentBlocksStore.highlights);

const items = computed<HighlightItem[]>(() => {
  const meta = highlights.value.metadata;
  if (meta && Array.isArray(meta.items)) {
    const valid = meta.items.filter(
      (item): item is HighlightItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as HighlightItem).title === 'string' &&
        Boolean((item as HighlightItem).title.trim()) &&
        typeof (item as HighlightItem).desc === 'string' &&
        Boolean((item as HighlightItem).desc.trim()),
    );
    if (valid.length > 0) {
      return valid;
    }
  }
  return [
    {
      title: 'Bank Sampah Mandiri',
      desc: 'Jaringan unit pengolahan dan pemilahan sampah warga terdistribusi di kawasan RT.',
    },
    {
      title: 'Sektor Pesisir & Kelautan',
      desc: 'Sentra ekonomi nelayan tangkap, budidaya pesisir, dan destinasi wisata bahari.',
    },
    {
      title: 'Partisipasi Warga 100 RT',
      desc: 'Keterpaduan koordinasi 100 Ketua RT dalam penyampaian data dan pelayanan warga.',
    },
  ];
});
</script>

<template>
  <section
    id="potensi"
    class="border-b border-slate-200/80 bg-white px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    aria-labelledby="highlights-title"
  >
    <div class="mx-auto max-w-6xl space-y-12">
      <!-- Section Header -->
      <div class="mx-auto max-w-3xl space-y-4 text-center">
        <h2
          id="highlights-title"
          class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl"
        >
          {{ highlights.title || 'Potensi Unggulan Wilayah' }}
        </h2>
        <p class="text-base leading-relaxed text-slate-600 sm:text-lg">
          {{ highlights.body }}
        </p>
      </div>

      <!-- Highlights Grid -->
      <div class="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
        <article
          v-for="(item, index) in items"
          :key="index"
          class="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50 p-6 transition-all duration-200 hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-md sm:p-8"
        >
          <div class="space-y-4">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-800 transition-colors group-hover:bg-emerald-200/80"
              aria-hidden="true"
            >
              {{ index + 1 }}
            </div>
            <h3
              class="text-lg font-bold tracking-tight text-slate-900 group-hover:text-emerald-900 sm:text-xl"
            >
              {{ item.title }}
            </h3>
            <p class="text-sm leading-relaxed text-slate-600 sm:text-base">
              {{ item.desc }}
            </p>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
