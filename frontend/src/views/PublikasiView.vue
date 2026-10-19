<script setup lang="ts">
import AppFooter from '../components/common/AppFooter.vue';
import AppNavbar from '../components/common/AppNavbar.vue';

const publications = [
  {
    category: 'Prodeskel',
    title: 'Publikasi Prodeskel',
    description: 'Dokumen dan publikasi resmi Kelurahan Manggar dari Prodeskel.',
  },
  {
    category: 'Infografis',
    title: 'Infografis Kelurahan Manggar',
    description: 'Ringkasan informasi dan statistik Kelurahan Manggar dalam bentuk visual.',
  },
  {
    category: 'Lingkungan',
    title: 'Booklet Eco Boba',
    description: 'Dokumentasi program dan pelatihan pengolahan sampah organik Eco Boba.',
  },
  {
    category: 'Statistik',
    title: 'Manggar dalam Angka 2026',
    description: 'Publikasi tahunan statistik Kelurahan Manggar.',
  },
] as const;
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white text-brand-navy">
    <a
      href="#main-content"
      class="sr-only z-50 rounded-btn bg-white px-4 py-3 text-brand-navy focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:outline-2 focus:outline-offset-2 focus:outline-brand-navy"
    >
      Lewati ke konten utama
    </a>

    <AppNavbar variant="navy" />

    <main id="main-content" class="mx-auto w-full max-w-7xl flex-1 px-6 py-10 sm:px-8 sm:py-14 lg:px-12">
      <nav aria-label="Breadcrumb" class="mb-8 text-sm text-gray-600">
        <ol class="flex flex-wrap items-center gap-2">
          <li><RouterLink to="/" class="underline underline-offset-4 hover:text-brand-navy">Beranda</RouterLink></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" class="font-medium text-brand-navy">Publikasi</li>
        </ol>
      </nav>

      <header class="max-w-3xl">
        <p class="text-sm font-semibold tracking-wide text-brand-indigo">SUMBER DAYA</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
          Publikasi Kelurahan Manggar
        </h1>
        <p class="mt-4 max-w-2xl text-base leading-relaxed text-gray-700 sm:text-lg">
          Temukan dokumen, infografis, dan publikasi statistik tentang Kelurahan Manggar.
        </p>
      </header>

      <section aria-labelledby="daftar-publikasi" class="mt-10 sm:mt-12">
        <div class="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <p class="text-sm text-gray-600">Koleksi publikasi</p>
            <h2 id="daftar-publikasi" class="mt-1 text-xl font-bold text-brand-navy">
              Sumber daya untuk warga
            </h2>
          </div>
          <p class="text-sm text-gray-600">{{ publications.length }} kategori</p>
        </div>

        <ul class="mt-2 divide-y divide-gray-200" data-test="publication-list">
          <li v-for="(publication, index) in publications" :key="publication.title">
            <article class="grid gap-3 py-6 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5">
              <span
                aria-hidden="true"
                class="font-mono text-sm tabular-nums text-gray-500"
              >
                {{ String(index + 1).padStart(2, '0') }}
              </span>

              <div class="min-w-0">
                <p class="text-xs font-semibold tracking-wide text-brand-indigo">
                  {{ publication.category }}
                </p>
                <h3 class="mt-1 text-lg font-semibold leading-snug text-brand-navy">
                  {{ publication.title }}
                </h3>
                <p class="mt-1 max-w-2xl text-sm leading-relaxed text-gray-700 sm:text-base">
                  {{ publication.description }}
                </p>
              </div>

              <span
                class="inline-flex w-fit items-center rounded-btn border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
                role="status"
                data-test="publication-status"
              >
                Segera hadir
              </span>
            </article>
          </li>
        </ul>

        <p class="mt-5 max-w-3xl border-l-4 border-brand-indigo pl-4 text-sm leading-relaxed text-gray-700">
          Publikasi sedang disiapkan. Tautan unduhan akan ditampilkan setelah dokumen resmi tersedia.
        </p>
      </section>
    </main>

    <AppFooter />
  </div>
</template>
