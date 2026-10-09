<script setup lang="ts">
import AppNavbar from '../components/common/AppNavbar.vue';
import AppFooter from '../components/common/AppFooter.vue';
import logoDesaCantik from '@/assets/img/logo_desa_cantik.png';
import logoBps from '@/assets/img/logo_bps.png';

interface PillarItem {
  title: string;
  description: string;
}

const pillars: PillarItem[] = [
  {
    title: 'Standardisasi Data Sektoral',
    description:
      'Menstandarisasi metadata, variabel, dan format pelaporan data kelurahan agar selaras dengan prinsip Satu Data Indonesia (SDI) dan kaidah statistik resmi BPS.',
  },
  {
    title: 'Penguatan Kapasitas Aparatur & Agen RT',
    description:
      'Melatih perangkat kelurahan dan 100 Ketua RT sebagai agen literasi statistik yang mampu mengumpulkan data lapangan secara tertib, valid, dan berkesinambungan.',
  },
  {
    title: 'Penyusunan Publikasi Statistik Kelurahan',
    description:
      'Menghasilkan dokumen resmi tahunan seperti "Kelurahan Manggar Dalam Angka 2026" sebagai rujukan bagi pengambil kebijakan di tingkat kecamatan dan kota.',
  },
  {
    title: 'Pemanfaatan Data untuk Kebijakan Nyata',
    description:
      'Memanfaatkan data kependudukan, kemiskinan, dan potensi lingkungan secara tepat sasaran dalam perencanaan musrenbang, bansos, dan pengelolaan sampah.',
  },
];
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50 text-slate-800">
    <!-- Skip to Content Link per docs/ACCESSIBILITY.md §3 (2.4.1) -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
    >
      Lewati ke konten utama
    </a>

    <!-- Top Navigation -->
    <AppNavbar variant="navy" />

    <!-- Main Content Landmark -->
    <main id="main-content" class="flex-grow">
      <!-- Hero / Header Section -->
      <section
        class="border-b border-slate-200 bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="page-title"
      >
        <div class="mx-auto max-w-5xl">
          <nav aria-label="Breadcrumb" class="mb-4">
            <ol class="flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
              <li>
                <RouterLink to="/" class="hover:text-emerald-700 hover:underline">
                  Beranda
                </RouterLink>
              </li>
              <li aria-hidden="true" class="text-slate-400">/</li>
              <li>
                <span class="font-medium text-slate-900" aria-current="page">
                  Program Desa/Kelurahan Cantik
                </span>
              </li>
            </ol>
          </nav>

          <div class="flex flex-wrap items-center gap-4">
            <span
              class="inline-block rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800 uppercase"
            >
              Inisiatif Pembinaan Statistik
            </span>
          </div>

          <h1
            id="page-title"
            class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl"
          >
            Program Desa/Kelurahan Cinta Statistik (Desa Cantik)
          </h1>
          <p class="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Program nasional percepatan pembinaan statistik sektoral pada tingkat desa dan kelurahan
            oleh Badan Pusat Statistik (BPS) guna mewujudkan tata kelola data yang akurat, mutakhir,
            dan terintegrasi.
          </p>

          <!-- Partner Badges -->
          <div class="mt-8 flex flex-wrap items-center gap-6 border-t border-slate-100 pt-6">
            <div class="flex items-center gap-3">
              <img
                :src="logoDesaCantik"
                alt="Logo Desa Cantik"
                class="h-12 w-auto object-contain sm:h-14"
              />
              <div class="text-left">
                <span class="block text-xs font-medium text-slate-500">Program Pembinaan</span>
                <span class="block text-sm font-bold text-slate-800">Desa/Kelurahan Cantik</span>
              </div>
            </div>

            <div class="hidden h-10 w-px bg-slate-200 sm:block" aria-hidden="true" />

            <div class="flex items-center gap-3">
              <img
                :src="logoBps"
                alt="Logo Badan Pusat Statistik (BPS)"
                class="h-12 w-auto object-contain sm:h-14"
              />
              <div class="text-left">
                <span class="block text-xs font-medium text-slate-500">Instansi Pembina</span>
                <span class="block text-sm font-bold text-slate-800">Badan Pusat Statistik (BPS)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Scope Notice Banner per SPEC.md §1 -->
      <section class="border-b border-amber-200 bg-amber-50/70 px-4 py-4 sm:px-6 lg:px-8">
        <div class="mx-auto flex max-w-5xl items-start gap-3">
          <div
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800"
            aria-hidden="true"
          >
            !
          </div>
          <div class="text-xs leading-relaxed text-amber-900 sm:text-sm">
            <strong class="font-semibold">Catatan Batasan Portal (SPEC §1):</strong>
            Situs web <strong>SIDATA</strong> adalah salah satu luaran inovasi terpadu yang
            mendukung implementasi pembinaan Desa Cantik di Kelurahan Manggar, dan diberi merek secara
            tersendiri. Portal ini bukan portal resmi milik Badan Pusat Statistik (BPS).
          </div>
        </div>
      </section>

      <!-- Latar Belakang & Tujuan -->
      <section
        class="border-b border-slate-200/80 bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="tujuan-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="tujuan-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Latar Belakang dan Tujuan Program
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Menjadikan desa dan kelurahan sebagai produsen data yang tertib statistik dan mandiri.
            </p>
          </div>

          <div class="space-y-6 text-sm leading-relaxed text-slate-700 sm:text-base">
            <p>
              Desa dan kelurahan merupakan subjek utama sekaligus garda terdepan pembangunan
              nasional. Sebagian besar kebijakan publik bermula dari data yang dicatat di tingkat
              wilayah terkecil. Melalui program <strong>Desa Cantik</strong>, Badan Pusat Statistik
              (BPS) menginisiasi pembinaan statistik secara berkelanjutan agar aparatur kelurahan
              memiliki kompetensi teknis dalam mengidentifikasi kebutuhan data, menyusun instrumen,
              serta menyajikan informasi wilayah secara terstandar.
            </p>
            <p>
              Dengan data yang valid, perencanaan program pembangunan di Kelurahan Manggar tidak lagi
              berlandaskan perkiraan, melainkan berdasarkan bukti nyata (<em>evidence-based policy</em>).
            </p>
          </div>

          <!-- 3 Key Objectives Cards -->
          <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-xs">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold text-white"
              >
                1
              </div>
              <h3 class="mt-4 text-base font-bold text-slate-900">Standardisasi Data</h3>
              <p class="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Menyelaraskan konsep, definisi, dan klasifikasi data wilayah dengan standar statistik
                nasional Satu Data Indonesia.
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-xs">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold text-white"
              >
                2
              </div>
              <h3 class="mt-4 text-base font-bold text-slate-900">Literasi Statistik</h3>
              <p class="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Meningkatkan kapabilitas perangkat kelurahan dan pengurus RT dalam membaca,
                menganalisis, dan memanfaatkan indikator data.
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-xs">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold text-white"
              >
                3
              </div>
              <h3 class="mt-4 text-base font-bold text-slate-900">Pemanfaatan Nyata</h3>
              <p class="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Menghadirkan keterbukaan informasi publik dan akurasi penetapan target bantuan sosial,
                kesehatan, serta penataan lingkungan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 4 Pilar Implementasi di Manggar -->
      <section
        class="border-b border-slate-200/80 bg-slate-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="pilar-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2 id="pilar-title" class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Implementasi di Kelurahan Manggar
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Empat fokus utama pelaksanaan pembinaan Desa Cantik di lingkungan Kelurahan Manggar.
            </p>
          </div>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <article
              v-for="(pillar, idx) in pillars"
              :key="idx"
              class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-shadow hover:shadow-md sm:p-8"
            >
              <div class="flex items-center gap-3">
                <span
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800"
                >
                  {{ idx + 1 }}
                </span>
                <h3 class="text-lg font-bold text-slate-900">{{ pillar.title }}</h3>
              </div>
              <p class="mt-3 text-sm leading-relaxed text-slate-600">
                {{ pillar.description }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <!-- Official Pointer Section -->
      <section
        class="bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="rujukan-title"
      >
        <div class="mx-auto max-w-5xl text-center">
          <h2
            id="rujukan-title"
            class="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
          >
            Informasi Lebih Lanjut Mengenai Desa Cantik
          </h2>
          <p class="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Untuk mempelajari pedoman teknis nasional, publikasi metodologi, dan praktik baik
            program Desa Cantik di seluruh Indonesia, kunjungi portal resmi Badan Pusat Statistik.
          </p>
          <div class="mt-6">
            <a
              href="https://www.bps.go.id"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span>Kunjungi Portal Resmi BPS RI</span>
              <span class="sr-only">(Tautan eksternal, terbuka di tab baru)</span>
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer Landmark -->
    <AppFooter />
  </div>
</template>
