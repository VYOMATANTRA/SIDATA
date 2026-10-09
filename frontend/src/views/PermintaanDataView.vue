<script setup lang="ts">
import AppNavbar from '../components/common/AppNavbar.vue';
import AppFooter from '../components/common/AppFooter.vue';

interface StepItem {
  step: number;
  title: string;
  description: string;
  details: string[];
}

const steps: StepItem[] = [
  {
    step: 1,
    title: 'Periksa Ketersediaan Data Publik di Portal SIDATA',
    description:
      'Sebelum mengajukan permohonan tertulis ke PPID, pastikan data yang Anda perlukan belum tersedia pada menu publikasi portal SIDATA.',
    details: [
      'Cek data statistik sektoral pada menu Cerita Statistik.',
      'Cek publikasi resmi pada menu Publikasi (seperti Buku Kelurahan Manggar Dalam Angka).',
      'Cek sebaran titik spasial pada menu Peta dan kontak pengurus pada menu Ketua RT.',
    ],
  },
  {
    step: 2,
    title: 'Siapkan Dokumen Persyaratan Pemohon',
    description:
      'Lengkapi dokumen identitas dan formulir permohonan informasi publik sesuai ketentuan Undang-Undang Keterbukaan Informasi Publik (UU KIP).',
    details: [
      'Pemohon Perorangan: Fotokopi / pindaian Kartu Tanda Penduduk (KTP) yang masih berlaku.',
      'Pemohon Badan Hukum / Organisasi: Salinan Akta Pendirian atau pengesahan Kemenkumham, serta surat kuasa penugasan.',
      'Rincian Informasi: Sebutkan jenis data atau dokumen yang diminta serta tujuan penggunaan data secara spesifik dan sah.',
    ],
  },
  {
    step: 3,
    title: 'Ajukan Permohonan Resmi ke PPID Kota Balikpapan',
    description:
      'Pengajuan dapat dilakukan secara daring melalui Portal PPID Utama Kota Balikpapan atau secara langsung.',
    details: [
      'Layanan Daring: Mengisi formulir permohonan pada portal resmi PPID Pemerintah Kota Balikpapan.',
      'Layanan Langsung (Luring): Menyerahkan berkas di Meja Informasi Kantor Kelurahan Manggar atau Kantor Diskominfo Kota Balikpapan.',
      'Dapatkan tanda terima pendaftaran permohonan resmi berstempel atau bertiket elektronik.',
    ],
  },
  {
    step: 4,
    title: 'Proses Verifikasi dan Tenggat Tanggapan',
    description:
      'Petugas PPID memproses dan menguji konsekuensi informasi yang dimohonkan sesuai regulasi.',
    details: [
      'PPID wajib memberikan pemberitahuan tertulis paling lambat 10 (sepuluh) hari kerja sejak permohonan dinyatakan lengkap.',
      'PPID dapat memperpanjang waktu tanggapan selama 7 (tujuh) hari kerja dengan menyampaikan alasan tertulis kepada pemohon.',
    ],
  },
  {
    step: 5,
    title: 'Penerimaan Salinan Data atau Informasi',
    description:
      'Pemohon menerima salinan data atau penjelasan resmi mengenai status informasi yang dimohonkan.',
    details: [
      'Informasi dapat diserahkan dalam bentuk dokumen digital (softcopy) atau salinan fisik.',
      'Apabila informasi termasuk kategori informasi yang dikecualikan (rahasia negara/pribadi), pemohon akan menerima surat penolakan tertulis disertai dasar hukum.',
    ],
  },
];

interface SlaItem {
  stage: string;
  duration: string;
  regulation: string;
}

const slaRules: SlaItem[] = [
  {
    stage: 'Verifikasi & Registrasi Berkas Permohonan',
    duration: '1 Hari Kerja',
    regulation: 'Pemeriksaan kelengkapan dokumen identitas pemohon',
  },
  {
    stage: 'Penyampaian Tanggapan Tertulis PPID',
    duration: 'Maksimal 10 Hari Kerja',
    regulation: 'Pasal 22 ayat (7) UU No. 14 Tahun 2008 tentang KIP',
  },
  {
    stage: 'Perpanjangan Waktu Tanggapan (Opsional)',
    duration: 'Maksimal 7 Hari Kerja',
    regulation: 'Disertai surat pemberitahuan alasan perpanjangan waktu',
  },
  {
    stage: 'Pengajuan Keberatan atas Tanggapan PPID',
    duration: 'Maksimal 30 Hari Kerja',
    regulation: 'Diajukan kepada Atasan PPID Kota Balikpapan',
  },
  {
    stage: 'Biaya Layanan Informasi Publik',
    duration: 'Bebas Biaya (Gratis)',
    regulation: 'Biaya fotokopi / media simpan ditanggung mandiri bila salinan fisik',
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
                  Permintaan Data
                </span>
              </li>
            </ol>
          </nav>

          <span
            class="inline-block rounded-md bg-blue-100 px-3 py-1 text-xs font-semibold tracking-wide text-blue-900 uppercase"
          >
            Keterbukaan Informasi Publik
          </span>
          <h1
            id="page-title"
            class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl"
          >
            Permintaan Data & Informasi Publik
          </h1>
          <p class="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Panduan resmi prosedur permohonan informasi publik melalui Pejabat Pengelola Informasi
            dan Dokumentasi (PPID) Pemerintah Kota Balikpapan sesuai UU No. 14 Tahun 2008.
          </p>
        </div>
      </section>

      <!-- Mandatory Scope Warning Banner per SPEC.md §1 & §9 -->
      <section class="border-b border-blue-200 bg-blue-50/70 px-4 py-5 sm:px-6 lg:px-8">
        <div class="mx-auto flex max-w-5xl items-start gap-3.5">
          <div
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-200 text-sm font-bold text-blue-900"
            aria-hidden="true"
          >
            i
          </div>
          <div class="text-xs leading-relaxed text-blue-950 sm:text-sm">
            <strong class="font-semibold">
              Pemberitahuan Batasan Layanan Portal (SPEC §1 & §9):
            </strong>
            Portal <strong>SIDATA</strong> adalah portal penyajian profil data terbuka kelurahan dan
            <strong>tidak menyimpan dokumen resmi PPID</strong> (seperti Transparansi Keuangan, RKA,
            atau berkas administratif internal). Laman ini berfungsi sebagai
            <strong>penunjuk eksternal (external pointer)</strong> resmi yang menjelaskan tata cara
            dan alur pengajuan permohonan informasi ke PPID Pemerintah Kota Balikpapan.
          </div>
        </div>
      </section>

      <!-- Alur Prosedur Permohonan (Semantic <ol>) -->
      <section
        class="border-b border-slate-200/80 bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="alur-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2 id="alur-title" class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Alur Pengajuan Permohonan Informasi
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Ikuti lima tahapan resmi permohonan data dan dokumen publik sesuai ketentuan perundangan.
            </p>
          </div>

          <!-- Semantic Ordered List per docs/ACCESSIBILITY.md -->
          <ol class="space-y-6" data-test="procedure-steps">
            <li
              v-for="item in steps"
              :key="item.step"
              class="procedure-step relative rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-xs sm:p-8"
            >
              <div class="flex items-start gap-4">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-base font-extrabold text-white shadow-xs"
                  aria-hidden="true"
                >
                  {{ item.step }}
                </span>
                <div class="flex-1">
                  <h3 class="text-lg font-bold text-slate-900 sm:text-xl">
                    {{ item.title }}
                  </h3>
                  <p class="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
                    {{ item.description }}
                  </p>
                  <ul class="mt-3 list-disc space-y-1.5 pl-5 text-xs text-slate-600 sm:text-sm">
                    <li v-for="(detail, dIdx) in item.details" :key="dIdx">
                      {{ detail }}
                    </li>
                  </ul>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <!-- Standar Waktu Layanan & Ketentuan Biaya Table -->
      <section
        class="border-b border-slate-200/80 bg-slate-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="sla-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2 id="sla-title" class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Standar Waktu Layanan dan Ketentuan Biaya
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Jaminan kepastian tenggat pemrosesan permohonan informasi publik menurut regulasi resmi.
            </p>
          </div>

          <!-- Semantic Table per docs/ACCESSIBILITY.md -->
          <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
            <table class="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
              <caption class="sr-only">
                Tabel Standar Waktu Layanan Informasi Publik dan Ketentuan Biaya Permohonan
              </caption>
              <thead class="bg-slate-100 text-xs font-semibold tracking-wider text-slate-900 uppercase">
                <tr>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Tahapan / Jenis Layanan</th>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Jangka Waktu Maksimal</th>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Keterangan / Regulasi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 bg-white">
                <tr
                  v-for="(rule, idx) in slaRules"
                  :key="idx"
                  class="transition-colors hover:bg-slate-50"
                >
                  <th scope="row" class="px-4 py-4 font-semibold text-slate-900 sm:px-6 align-top">
                    {{ rule.stage }}
                  </th>
                  <td class="px-4 py-4 font-medium text-emerald-800 sm:px-6 align-top">
                    {{ rule.duration }}
                  </td>
                  <td class="px-4 py-4 text-slate-600 sm:px-6 align-top">
                    {{ rule.regulation }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- External Pointer CTA Card -->
      <section
        class="border-b border-slate-200/80 bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="portal-ppid-title"
      >
        <div class="mx-auto max-w-5xl">
          <div
            class="rounded-2xl border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-50/70 to-teal-50/50 p-6 sm:p-10"
          >
            <div class="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div class="max-w-2xl space-y-2">
                <span
                  class="inline-block rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white uppercase"
                >
                  Tautan Eksternal Resmi
                </span>
                <h2
                  id="portal-ppid-title"
                  class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
                >
                  Ajukan Permohonan di Portal PPID Balikpapan
                </h2>
                <p class="text-sm leading-relaxed text-slate-600 sm:text-base">
                  Kunjungi portal resmi Pejabat Pengelola Informasi dan Dokumentasi (PPID) Pemerintah
                  Kota Balikpapan untuk pendaftaran akun, pengisian formulir daring, dan pelacakan
                  status permohonan Anda.
                </p>
              </div>

              <div class="shrink-0">
                <a
                  href="https://ppid.balikpapan.go.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2.5 rounded-xl bg-emerald-700 px-6 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-emerald-600 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:text-base"
                >
                  <span>Buka Portal PPID Balikpapan</span>
                  <span class="sr-only">(Tautan eksternal, terbuka di tab baru)</span>
                  <svg
                    class="h-5 w-5"
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
          </div>
        </div>
      </section>

      <!-- Meja Informasi Kelurahan Section -->
      <section
        class="bg-slate-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
        aria-labelledby="meja-informasi-title"
      >
        <div class="mx-auto max-w-5xl">
          <div class="mb-8">
            <h2
              id="meja-informasi-title"
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Meja Pelayanan Informasi Kelurahan Manggar
            </h2>
            <p class="mt-2 text-sm text-slate-600 sm:text-base">
              Bantuan konsultasi dan penerimaan berkas permohonan informasi secara luring (tatap muka).
            </p>
          </div>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 class="font-bold text-slate-900">Alamat Kantor</h3>
              <p class="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Kantor Kelurahan Manggar<br />
                Jl. Mulawarman No. 1, RT 39<br />
                Kecamatan Balikpapan Timur<br />
                Kota Balikpapan, 76116
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 class="font-bold text-slate-900">Jam Pelayanan</h3>
              <p class="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Senin – Kamis: 08.00 – 15.30 WITA<br />
                Jumat: 08.00 – 11.30 WITA<br />
                Sabtu, Minggu & Hari Libur Nasional: Tutup
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 class="font-bold text-slate-900">Kontak Resmi</h3>
              <p class="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Telepon: (0542) 772158<br />
                Surel: kelurahan.manggar@balikpapan.go.id<br />
                Layanan Informasi Publik Kota Balikpapan
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
