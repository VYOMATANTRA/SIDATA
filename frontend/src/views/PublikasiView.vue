<script setup lang="ts">
import { computed, onMounted } from 'vue';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import {
  PUBLICATIONS,
  isDownloadable,
  formatFileSize,
  publicationCoverSrc,
  publicationDownloadHref,
  type PublicationItem,
} from '../content/publikasi';
import { useContentBlocksStore } from '../stores/contentBlocks.store';

const contentBlocksStore = useContentBlocksStore();

onMounted(() => {
  void contentBlocksStore.fetchBlocks();
});

const isExplicitlyEmpty = computed(() => {
  const custom = contentBlocksStore.publikasiKatalog.metadata?.publications;
  return Array.isArray(custom) && custom.length === 0;
});

const publikasiCatalog = computed<PublicationItem[]>(() => {
  const custom = contentBlocksStore.publikasiKatalog.metadata?.publications;
  if (Array.isArray(custom)) {
    if (custom.length === 0) return [];
    const valid = custom.filter((item): item is PublicationItem => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as PublicationItem).title === 'string' &&
        (item as PublicationItem).title.trim() !== '' &&
        typeof (item as PublicationItem).category === 'string' &&
        typeof (item as PublicationItem).description === 'string'
      );
    });
    return valid;
  }
  return PUBLICATIONS;
});

const hasPendingPublication = computed(() =>
  publikasiCatalog.value.some((item) => !isDownloadable(item)),
);
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Publikasi" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel
      title="Publikasi Kelurahan Manggar"
      subtitle="Temukan dokumen, infografis, dan publikasi statistik tentang Kelurahan Manggar."
    />

    <section aria-labelledby="daftar-publikasi" class="bg-white px-4 py-8 sm:px-6 sm:py-10">
      <div class="mx-auto max-w-5xl">
        <div class="border-border flex flex-wrap items-end justify-between gap-3 border-b pb-4">
          <div>
            <p class="text-text-muted text-sm">Koleksi publikasi</p>
            <h2 id="daftar-publikasi" class="text-brand-navy mt-1 text-xl font-bold">
              Sumber daya untuk warga
            </h2>
          </div>
          <p class="text-text-muted text-sm">
            {{ publikasiCatalog.length }} {{ isExplicitlyEmpty ? 'publikasi' : 'kategori' }}
          </p>
        </div>

        <div
          v-if="publikasiCatalog.length === 0"
          class="rounded-card border-border mt-6 border border-dashed bg-white px-6 py-12 text-center"
          data-test="empty-publication-catalog"
        >
          <p class="text-brand-navy text-base font-semibold">Belum ada publikasi</p>
          <p class="text-text-muted mx-auto mt-2 max-w-md text-sm">
            Koleksi publikasi, infografis, dan dokumen resmi belum tersedia saat ini.
          </p>
        </div>

        <ul v-else class="divide-border mt-2 divide-y" data-test="publication-list">
          <li
            v-for="(publication, index) in publikasiCatalog"
            :key="`${publication.category}-${publication.title}-${index}`"
          >
            <article
              class="grid gap-3 py-6 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5"
            >
              <span aria-hidden="true" class="text-text-muted font-mono text-sm tabular-nums">
                {{ String(index + 1).padStart(2, '0') }}
              </span>

              <div class="min-w-0">
                <img
                  v-if="publicationCoverSrc(publication)"
                  :src="publicationCoverSrc(publication)!"
                  alt=""
                  loading="lazy"
                  width="226"
                  height="320"
                  class="rounded-btn border-border mb-3 h-40 w-auto border object-cover"
                  data-test="publication-cover"
                />
                <p class="text-brand-navy text-xs font-semibold tracking-wide">
                  {{ publication.category }}
                </p>
                <h3 class="text-brand-navy mt-1 text-lg leading-snug font-semibold">
                  {{ publication.title }}
                </h3>
                <p class="text-text-muted mt-1 max-w-2xl text-sm leading-relaxed sm:text-base">
                  {{ publication.description }}
                </p>
                <p
                  v-if="publication.source"
                  class="text-text-muted mt-1 text-xs italic"
                  data-test="publication-source"
                >
                  Sumber: {{ publication.source }}
                </p>
              </div>

              <div
                v-if="isDownloadable(publication)"
                class="flex flex-col items-start gap-1 sm:items-end"
              >
                <a
                  :href="publicationDownloadHref(publication) ?? undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rounded-btn border-brand-navy bg-brand-navy hover:bg-brand-navy-deep inline-flex w-fit items-center border px-3 py-2 text-sm font-medium text-white"
                  data-test="publication-link"
                >
                  Unduh Dokumen
                </a>
                <span
                  v-if="publication.fileType || publication.fileSizeBytes"
                  class="text-text-muted font-mono text-xs"
                  data-test="publication-file-info"
                >
                  <template v-if="publication.fileType">{{ publication.fileType }}</template>
                  <template v-if="publication.fileType && publication.fileSizeBytes">
                    &middot;
                  </template>
                  <template v-if="publication.fileSizeBytes">{{
                    formatFileSize(publication.fileSizeBytes)
                  }}</template>
                </span>
              </div>
              <span
                v-else
                class="rounded-btn border-border text-text-muted inline-flex w-fit items-center border px-3 py-2 text-sm font-medium"
                data-test="publication-status"
              >
                Segera hadir
              </span>
            </article>
          </li>
        </ul>

        <p
          v-if="!isExplicitlyEmpty && hasPendingPublication"
          class="border-brand-navy text-text-muted mt-5 max-w-3xl border-l-4 pl-4 text-sm leading-relaxed"
        >
          Publikasi sedang disiapkan. Tautan unduhan akan ditampilkan setelah dokumen resmi
          tersedia.
        </p>
      </div>
    </section>
  </TentangPageLayout>
</template>
