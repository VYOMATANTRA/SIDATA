<script setup lang="ts">
import AppNavbar from '../components/common/AppNavbar.vue';
import AppFooter from '../components/common/AppFooter.vue';
import logoVyomatantra from '@/assets/img/logo_vyomatantra.png';
import logoItk from '@/assets/img/logo_itk.png';
import logoSdgsDesa from '@/assets/img/sdgs_desa.png';
import logoSdgs17 from '@/assets/img/17_kemitraan_pembangunan_desa.png';

interface InitiativeItem {
  tag: string;
  title: string;
  description: string;
  impact: string;
}

const initiatives: InitiativeItem[] = [
  {
    tag: 'Pengolahan Limbah Organik',
    title: 'Program Eco Boba (Briket Arang Batok Kelapa)',
    description:
      'Inisiatif pengolahan limbah tempurung kelapa dari para pedagang dan rumah tangga menjadi briket arang ramah lingkungan tanpa asap dan berkalori tinggi. Program ini mencakup pelatihan teknik pirolisis, pencetakan briket, pengemasan, hingga penyusunan Booklet Edukasi Eco Boba.',
    impact: 'Mereduksi timbunan sampah batok kelapa dan membuka peluang wirausaha hijau bagi kelompok warga.',
  },
  {
    tag: 'Tata Kelola Sampah Warga',
    title: 'Pembinaan & Pemetaan Bank Sampah Unit (BSU)',
    description:
      'Pendampingan tata kelola operasional dan pencatatan nasabah bagi Bank Sampah Unit di lingkungan RT Kelurahan Manggar. Mengintegrasikan titik-titik persebaran unit pengumpulan sampah ke dalam peta spasial interaktif kelurahan.',
    impact: 'Meningkatkan kesadaran pemilahan sampah dari sumbernya dan memperkuat ekonomi sirkular lokal.',
  },
  {
    tag: 'Digitalisasi Pemerintahan',
    title: 'Rancang Bangun Sistem SIDATA',
    description:
      'Pengembangan Sistem Informasi Data Terpadu Kelurahan Manggar (SIDATA) sebagai platform publik yang menyajikan data statistik kependudukan, sarana prasarana, peta spasial RT, dan keterbukaan informasi berbasis web.',
    impact: 'Menyediakan basis data terpadu yang mudah diakses warga, peneliti, dan pemerintah daerah.',
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
                  Inovasi Sosial VYOMATANTRA
                </span>
              </li>
            </ol>
          </nav>

          <span
            class="inline-block rounded-md bg-purple-100 px-3 py-1 text-xs font-semibold tracking-wide text-purple-900 uppercase"
          >
            Kolaborasi Kampus & Masyarakat
          </span>
          <h1
            id="page-title"
            class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl"
          >
            Inovasi Sosial VYOMATANTRA
          </h1>
          <p class="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Kolaborasi pengabdian masyarakat antara Institut Teknologi Kalimantan (ITK) dan
            Kelurahan Manggar untuk menggerakkan kemandirian berbasis data, teknologi tepat guna, dan
            ekonomi sirkular.
          </p>

          <!-- Badges Section -->
          <div class="mt-8 flex flex-wrap items-center gap-6 border-t border-slate-100 pt-6">
            <div class="flex items-center gap-3">
              <img
                :src="logoVyomatantra"
                alt="Logo Tim Inovasi Sosial VYOMATANTRA"
                class="h-12 w-auto object-contain sm:h-14"
              />
              <div class="text-left">
                <span class="block text-xs font-medium text-slate-500">Inisiator Proyek</span>
                <span class="block text-sm font-bold text-slate-800">Tim Insos VYOMATANTRA</span>
              </div>
            </div>

            <div class="hidden h-10 w-px bg-slate-200 sm:block" aria-hidden="true" />

            <div class="flex items-center gap-3">
              <img
                :src="logoItk"
                alt="Logo Institut Teknologi Kalimantan (ITK)"
                class="h-12 w-auto object-contain sm:h-14"
              />
              <div class="text-left">
                <span class="block text-xs font-medium text-slate-500">Perguruan Tinggi</span>
                <span class="block text-sm font-bold text-slate-800">
                  Institut Teknologi Kalimantan
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Profil Tim Section -->
      <section
        class="border-b border-slate-200/80 bg-slate-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="profil-tim-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="profil-tim-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Mengenal Inovasi Sosial VYOMATANTRA
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Mewujudkan sains dan teknologi yang berpijak pada kebutuhan nyata warga.
            </p>
          </div>

          <div class="space-y-4 text-sm leading-relaxed text-slate-700 sm:text-base">
            <p>
              <strong>VYOMATANTRA</strong> adalah tim inovasi sosial yang diinisiasi oleh mahasiswa
              dan dosen pembimbing dari Institut Teknologi Kalimantan (ITK). Bergerak dengan semangat
              Tri Dharma Perguruan Tinggi, tim hadir di Kelurahan Manggar untuk menjembatani
              perkembangan teknologi digital dengan kearifan lokal masyarakat pesisir dan permukiman.
            </p>
            <p>
              Pendekatan yang diterapkan memadukan penelitian partisipatif (<em>participatory research</em>)
              dan aksi nyata di lapangan. Bersama aparatur kelurahan, pengurus RT, dan pegiat bank
              sampah, VYOMATANTRA mengurai tantangan persampahan kota menjadi peluang ekonomi bernilai
              tambah, sembari memperkuat kedaulatan data kelurahan lewat pengembangan portal terpadu
              <strong>SIDATA</strong>.
            </p>
          </div>
        </div>
      </section>

      <!-- Program Kerja & Inisiatif Unggulan -->
      <section
        class="border-b border-slate-200/80 bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="inisiatif-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="inisiatif-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Inisiatif Unggulan di Kelurahan Manggar
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Tiga pilar kegiatan utama yang diimplementasikan bersama masyarakat dan pemangku kepentingan.
            </p>
          </div>

          <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
            <article
              v-for="(item, idx) in initiatives"
              :key="idx"
              class="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-xs transition-shadow hover:shadow-md sm:p-8"
            >
              <div>
                <span
                  class="inline-block rounded-md bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800"
                >
                  {{ item.tag }}
                </span>
                <h3 class="mt-4 text-lg font-bold text-slate-900">{{ item.title }}</h3>
                <p class="mt-3 text-sm leading-relaxed text-slate-600">
                  {{ item.description }}
                </p>
              </div>

              <div class="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-700">
                <span class="font-bold text-slate-900">Dampak:</span> {{ item.impact }}
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- Keterkaitan dengan SDGs Desa -->
      <section
        class="border-b border-slate-200/80 bg-slate-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="sdgs-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2 id="sdgs-title" class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Kontribusi Terhadap SDGs Desa
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Menyelaraskan kegiatan inovasi sosial dengan Tujuan Pembangunan Berkelanjutan (SDGs).
            </p>
          </div>

          <div class="flex flex-col items-center gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 md:flex-row">
            <!-- Badges -->
            <div class="flex shrink-0 items-center gap-4">
              <img
                :src="logoSdgsDesa"
                alt="Logo SDGs Desa"
                class="h-16 w-auto object-contain sm:h-20"
              />
              <img
                :src="logoSdgs17"
                alt="Logo SDGs 17: Kemitraan untuk Pembangunan Desa"
                class="h-16 w-auto object-contain sm:h-20"
              />
            </div>

            <!-- SDGs Content -->
            <div class="space-y-3 text-sm leading-relaxed text-slate-700 sm:text-base">
              <h3 class="text-lg font-bold text-slate-900">
                SDG 17: Kemitraan untuk Mencapai Tujuan (Partnership for the Goals)
              </h3>
              <p>
                Inovasi sosial VYOMATANTRA membuktikan bahwa pembangunan desa dan kelurahan yang
                efektif lahir dari sinergi pentahelix: perguruan tinggi (ITK), aparatur pemerintah
                kelurahan, lembaga statistik (BPS Kota Balikpapan), kelompok masyarakat (Bank Sampah &
                Ketua RT), serta mitra pendukung.
              </p>
              <ul class="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
                <li>
                  <strong>SDG 12 (Konsumsi dan Produksi yang Bertanggung Jawab):</strong> Diterapkan
                  lewat pemanfaatan limbah padat tempurung kelapa menjadi briket arang Eco Boba.
                </li>
                <li>
                  <strong>SDG 8 (Pekerjaan Layak dan Pertumbuhan Ekonomi):</strong> Menciptakan potensi
                  lapangan usaha baru dan nilai tambah ekonomi bagi pegiat bank sampah warga.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Tim & Kontak Section -->
      <section
        class="bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="tim-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2 id="tim-title" class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Narahubung & Sivitas Pelaksana
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Lembaga pengusung inisiatif pengabdian masyarakat.
            </p>
          </div>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <h3 class="text-base font-bold text-slate-900">Institut Teknologi Kalimantan (ITK)</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-600">
                Kampus ITK Balikpapan, Jl. Soekarno-Hatta Km. 15, Kelurahan Karang Joang, Kecamatan
                Balikpapan Utara, Kota Balikpapan, Kalimantan Timur 76127.
              </p>
              <!-- TODO: Masukkan tautan resmi laman pengabdian masyarakat ITK jika tersedia -->
            </div>

            <div class="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <h3 class="text-base font-bold text-slate-900">Sekretariat Tim Inovasi Sosial</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-600">
                Kelurahan Manggar, Balikpapan Timur & Kampus ITK Balikpapan.
              </p>
              <p class="mt-2 text-xs text-slate-500">
                <!-- TODO: Konfirmasi susunan nama lengkap tim pelaksana mahasiswa dan dosen pembimbing VYOMATANTRA -->
                * Komposisi tim pelaksana dan publikasi ilmiah luaran program didokumentasikan dalam laporan resmi program pengabdian masyarakat.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer Landmark -->
    <AppFooter />
  </div>
</template>
