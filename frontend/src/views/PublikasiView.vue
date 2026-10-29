<script setup lang="ts">
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';

const publications = [
  {
    category: 'Prodeskel',
    title: 'Publikasi Prodeskel',
    description: 'Dokumen dan publikasi resmi Kelurahan Manggar dari sistem Prodeskel.',
  },
  {
    category: 'Infografis',
    title: 'Infografis Kelurahan Manggar',
    description:
      'Ringkasan informasi dan statistik kependudukan Kelurahan Manggar dalam bentuk visual.',
  },
  {
    category: 'Lingkungan',
    title: 'Booklet Eco Boba',
    description:
      'Dokumentasi pelatihan pengolahan limbah kemasan plastik menjadi bahan isian bantal (cushion filling) dalam program Eco Boba.',
  },
  {
    category: 'Statistik',
    title: 'Manggar dalam Angka 2026',
    description:
      'Dokumen kompilasi data statistik, demografi, dan geografi Kelurahan Manggar edisi cetak/PDF tahun 2026.',
  },
] as const;
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
        <div class="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <p class="text-sm text-gray-600">Koleksi publikasi</p>
            <h2 id="daftar-publikasi" class="text-brand-navy mt-1 text-xl font-bold">
              Sumber daya untuk warga
            </h2>
          </div>
          <p class="text-sm text-gray-600">{{ publications.length }} kategori</p>
        </div>

        <ul class="mt-2 divide-y divide-gray-200" data-test="publication-list">
          <li v-for="(publication, index) in publications" :key="publication.title">
            <article
              class="grid gap-3 py-6 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5"
            >
              <span aria-hidden="true" class="font-mono text-sm text-gray-500 tabular-nums">
                {{ String(index + 1).padStart(2, '0') }}
              </span>

              <div class="min-w-0">
                <p class="text-brand-indigo text-xs font-semibold tracking-wide">
                  {{ publication.category }}
                </p>
                <h3 class="text-brand-navy mt-1 text-lg leading-snug font-semibold">
                  {{ publication.title }}
                </h3>
                <p class="mt-1 max-w-2xl text-sm leading-relaxed text-gray-700 sm:text-base">
                  {{ publication.description }}
                </p>
              </div>

              <span
                class="rounded-btn inline-flex w-fit items-center border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
                data-test="publication-status"
              >
                Segera hadir
              </span>
            </article>
          </li>
        </ul>

        <p
          class="border-brand-indigo mt-5 max-w-3xl border-l-4 pl-4 text-sm leading-relaxed text-gray-700"
        >
          Publikasi sedang disiapkan. Tautan unduhan akan ditampilkan setelah dokumen resmi
          tersedia.
        </p>
      </div>
    </section>
  </TentangPageLayout>
</template>
