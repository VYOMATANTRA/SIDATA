<script setup lang="ts">
import AppNavbar from '../components/common/AppNavbar.vue';
import AppFooter from '../components/common/AppFooter.vue';
import lurahPhoto from '@/assets/img/lurah_placeholder_sample.png';

// SOTK (Struktur Organisasi dan Tata Kerja) Kelurahan Manggar
interface SotkItem {
  role: string;
  officialName: string;
  duties: string;
  notes?: string;
}

const sotkMembers: SotkItem[] = [
  {
    role: 'Lurah',
    officialName: 'Lurah Kelurahan Manggar', // TODO: Konfirmasi nama definitif Lurah Manggar
    duties:
      'Memimpin, mengatur, membina, dan mengawasi penyelenggaraan pemerintahan kelurahan serta pelaksanaan pelimpahan wewenang dari Walikota Balikpapan.',
    notes: 'Penanggung jawab utama kelurahan',
  },
  {
    role: 'Sekretaris Kelurahan',
    officialName: 'Sekretaris Kelurahan', // TODO: Masukkan nama definitif Sekretaris Kelurahan
    duties:
      'Mengkoordinasikan perencanaan, ketatausahaan, kepegawaian, perlengkapan, keuangan, serta pelayanan administrasi internal kelurahan.',
    notes: 'Koordinator administrasi & aparatur',
  },
  {
    role: 'Seksi Pemerintahan',
    officialName: 'Kepala Seksi Pemerintahan', // TODO: Masukkan nama definitif Kasi Pemerintahan
    duties:
      'Menyelenggarakan urusan administrasi pemerintahan umum, kependudukan, pertanahan, serta pembinaan organisasi Rukun Tetangga (RT).',
    notes: 'Pembinaan 100 RT & kependudukan',
  },
  {
    role: 'Seksi Ketenteraman dan Ketertiban',
    officialName: 'Kepala Seksi Trantib', // TODO: Masukkan nama definitif Kasi Trantib
    duties:
      'Memelihara ketenteraman, ketertiban umum, penegakan peraturan daerah, perlindungan masyarakat, dan koordinasi pencegahan bencana.',
    notes: 'Ketertiban umum & Linmas',
  },
  {
    role: 'Seksi Pemberdayaan Masyarakat',
    officialName: 'Kepala Seksi Pemberdayaan Masyarakat', // TODO: Masukkan nama definitif Kasi PM
    duties:
      'Memfasilitasi pemberdayaan masyarakat, pembinaan kelembagaan kemasyarakatan (LPM, PKK, Karang Taruna), lingkungan hidup, dan UMKM.',
    notes: 'Pengembangan masyarakat & Bank Sampah',
  },
  {
    role: 'Seksi Kesejahteraan Sosial',
    officialName: 'Kepala Seksi Kesejahteraan Sosial', // TODO: Masukkan nama definitif Kasi Kessos
    duties:
      'Mengelola pelayanan bantuan sosial, pemutakhiran data kemiskinan, pembinaan kesehatan, kepemudaan, dan keagamaan.',
    notes: 'Jaminan sosial & pelayanan warga',
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
                  Tentang Kelurahan Manggar
                </span>
              </li>
            </ol>
          </nav>

          <span
            class="inline-block rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800 uppercase"
          >
            Profil Pemerintahan
          </span>
          <h1
            id="page-title"
            class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl"
          >
            Tentang Kelurahan Manggar
          </h1>
          <p class="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Mengenal profil wilayah, jajaran kepemimpinan, dan Struktur Organisasi dan Tata Kerja
            (SOTK) Kelurahan Manggar, Kecamatan Balikpapan Timur, Kota Balikpapan.
          </p>
        </div>
      </section>

      <!-- Profil Lurah Section -->
      <section
        class="border-b border-slate-200/80 bg-slate-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="lurah-section-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="lurah-section-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Pimpinan Kelurahan
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Kepemimpinan yang berdedikasi melayani warga dan mengawal keterbukaan data terpadu di
              Kelurahan Manggar.
            </p>
          </div>

          <div
            class="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 md:p-10"
          >
            <div class="flex flex-col items-center gap-8 md:flex-row md:items-start">
              <!-- Lurah Photo Container -->
              <div class="shrink-0 text-center">
                <div
                  class="relative mx-auto h-48 w-48 overflow-hidden rounded-2xl border-4 border-slate-100 bg-slate-100 shadow-md sm:h-56 sm:w-56"
                >
                  <img
                    :src="lurahPhoto"
                    alt="Foto resmi Lurah Kelurahan Manggar"
                    class="h-full w-full object-cover object-top"
                  />
                </div>
                <span
                  class="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                >
                  Kepala Kelurahan
                </span>
              </div>

              <!-- Lurah Profile Details -->
              <div class="flex-1 space-y-4 text-left">
                <div>
                  <h3 class="text-xl font-bold text-slate-900 sm:text-2xl">
                    Lurah Kelurahan Manggar
                  </h3>
                  <!-- TODO: Konfirmasi nama definitif Lurah Manggar -->
                  <p class="text-xs text-slate-500 sm:text-sm">
                    NIP. 197XXXXXXXXXXXXXXX
                    <!-- TODO: Masukkan NIP definitif Lurah Manggar -->
                  </p>
                </div>

                <div class="space-y-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                  <p>
                    Sebagai garda terdepan pelayanan pemerintah daerah bagi masyarakat di wilayah
                    Balikpapan Timur, Kelurahan Manggar senantiasa berkomitmen untuk menghadirkan
                    pelayanan yang ramah, akuntabel, dan transparan.
                  </p>
                  <p>
                    Melalui integrasi program <strong>Kelurahan Cinta Statistik (Desa Cantik)</strong>
                    serta peluncuran portal <strong>SIDATA</strong>, kami berikhtiar membangun tata
                    kelola berbasis data akurat bersama 100 Rukun Tetangga (RT). Data yang tepat
                    menjadi kompas kami dalam merencanakan program sosial, penanganan lingkungan,
                    serta pemulihan ekonomi masyarakat yang berkelanjutan.
                  </p>
                </div>

                <div class="pt-2 text-xs text-slate-500 sm:text-sm">
                  <p class="font-medium text-slate-900">Masa Bakti Jabatan</p>
                  <p>Periode Berjalan — Kelurahan Manggar, Balikpapan Timur</p>
                  <!-- TODO: Perbarui informasi masa bakti jika telah tersedia surat keputusan resmi -->
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Profil Wilayah Singkat -->
      <section
        class="border-b border-slate-200/80 bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="wilayah-section-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="wilayah-section-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Gambaran Umum Wilayah
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Karakteristik geografis dan pembagian administratif Kelurahan Manggar.
            </p>
          </div>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
              <span class="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Jumlah RT
              </span>
              <p class="mt-2 text-3xl font-extrabold text-emerald-700">100</p>
              <p class="mt-1 text-xs text-slate-600">Rukun Tetangga terdaftar</p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
              <span class="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Kecamatan
              </span>
              <p class="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">Balikpapan Timur</p>
              <p class="mt-1 text-xs text-slate-600">Kota Balikpapan</p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
              <span class="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Karakter Wilayah
              </span>
              <p class="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">Pesisir & Dataran</p>
              <p class="mt-1 text-xs text-slate-600">Potensi pantai & pertanian</p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
              <span class="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Status Program
              </span>
              <p class="mt-2 text-xl font-bold text-emerald-700 sm:text-2xl">Desa Cantik</p>
              <p class="mt-1 text-xs text-slate-600">Kelurahan Cinta Statistik</p>
            </div>
          </div>

          <div class="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm sm:text-base">
            <h3 class="font-semibold text-slate-900">Batas-Batas Wilayah Administratif:</h3>
            <ul class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 text-slate-700">
              <li class="flex items-center gap-2">
                <span class="font-medium text-slate-900">Sebelah Utara:</span>
                <span>Kelurahan Karang Joang & Manggar Baru</span>
              </li>
              <li class="flex items-center gap-2">
                <span class="font-medium text-slate-900">Sebelah Timur:</span>
                <span>Selat Makassar</span>
              </li>
              <li class="flex items-center gap-2">
                <span class="font-medium text-slate-900">Sebelah Selatan:</span>
                <span>Kelurahan Manggar Baru</span>
              </li>
              <li class="flex items-center gap-2">
                <span class="font-medium text-slate-900">Sebelah Barat:</span>
                <span>Kelurahan Lamaru & Sepinggan</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- SOTK Table Section per docs/ACCESSIBILITY.md -->
      <section
        class="border-b border-slate-200/80 bg-slate-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="sotk-section-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="sotk-section-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Struktur Organisasi dan Tata Kerja (SOTK)
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Bagan tugas dan fungsi perangkat Kelurahan Manggar dalam menyelenggarakan urusan
              pemerintahan dan pelayanan warga.
            </p>
          </div>

          <!-- Semantic Table -->
          <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
            <table class="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
              <caption class="sr-only">
                Daftar Struktur Organisasi dan Tata Kerja Kelurahan Manggar beserta tugas pokok dan fungsi
              </caption>
              <thead class="bg-slate-100 text-xs font-semibold tracking-wider text-slate-900 uppercase">
                <tr>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Jabatan / Satuan Tugas</th>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Nama Pejabat / Pelaksana</th>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Tugas Pokok & Tanggung Jawab</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 bg-white">
                <tr
                  v-for="(member, idx) in sotkMembers"
                  :key="idx"
                  class="transition-colors hover:bg-slate-50"
                >
                  <th scope="row" class="px-4 py-4 font-semibold text-slate-900 sm:px-6 align-top">
                    <div>{{ member.role }}</div>
                    <span v-if="member.notes" class="text-xs font-normal text-slate-500">
                      {{ member.notes }}
                    </span>
                  </th>
                  <td class="px-4 py-4 text-slate-700 sm:px-6 align-top">
                    <span class="font-medium text-slate-800">{{ member.officialName }}</span>
                  </td>
                  <td class="px-4 py-4 leading-relaxed text-slate-600 sm:px-6 align-top">
                    {{ member.duties }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="mt-3 text-xs text-slate-500">
            * Data aparatur dan penugasan diperbarui secara berkala berdasarkan keputusan mutasi dan
            penetapan resmi Pemerintah Kota Balikpapan.
          </p>
        </div>
      </section>

      <!-- Visi & Misi Section -->
      <section
        class="bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="visi-misi-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="visi-misi-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Visi dan Misi Pelayanan
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Arah dan komitmen bersama aparatur kelurahan dalam melayani masyarakat Manggar.
            </p>
          </div>

          <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
            <!-- Visi Card -->
            <div
              class="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 shadow-xs sm:p-8"
            >
              <h3 class="text-lg font-bold text-emerald-900 sm:text-xl">Visi Kelurahan</h3>
              <p class="mt-4 text-sm leading-relaxed text-slate-700 sm:text-base">
                "Terwujudnya Pelayanan Publik Kelurahan Manggar yang Profesional, Akuntabel,
                Partisipatif, dan Berbasis Data Terpadu Menuju Masyarakat yang Maju dan Sejahtera."
              </p>
              <!-- TODO: Selaraskan rumusan visi dengan dokumen Rencana Strategis definitif -->
            </div>

            <!-- Misi Card -->
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-xs sm:p-8">
              <h3 class="text-lg font-bold text-slate-900 sm:text-xl">Misi Kelurahan</h3>
              <ol class="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700 sm:text-base">
                <li>
                  Meningkatkan mutu pelayanan administrasi kelurahan yang cepat, tepat, dan transparan.
                </li>
                <li>
                  Memperkuat peran kelembagaan 100 Rukun Tetangga (RT) dalam pemeliharaan lingkungan dan ketertiban.
                </li>
                <li>
                  Mengoptimalkan pemanfaatan data statistik melalui inisiatif Kelurahan Cinta Statistik.
                </li>
                <li>
                  Mendukung inovasi pemberdayaan masyarakat dan pengelolaan sampah terpadu (Eco Boba dan Bank Sampah Unit).
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer Landmark -->
    <AppFooter />
  </div>
</template>
