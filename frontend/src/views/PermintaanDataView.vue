<script setup lang="ts">
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import TentangNotice from '../components/tentang/TentangNotice.vue';
import TentangStepList, { type StepItem } from '../components/tentang/TentangStepList.vue';
import TentangFeatureBand from '../components/tentang/TentangFeatureBand.vue';

const steps: StepItem[] = [
  {
    step: 1,
    title: 'Periksa Ketersediaan Data Publik di Portal SIDATA',
    description:
      'Pastikan data yang Anda perlukan belum tersedia pada menu publikasi portal SIDATA.',
    details: [
      'Cek data statistik sektoral pada menu Cerita Statistik.',
      'Cek publikasi resmi seperti Buku Kelurahan Manggar Dalam Angka pada menu Publikasi.',
      'Cek sebaran titik spasial pada menu Peta dan kontak pengurus pada menu Ketua RT.',
    ],
  },
  {
    step: 2,
    title: 'Siapkan Dokumen Persyaratan Pemohon',
    description:
      'Lengkapi identitas dan formulir permohonan sesuai UU Keterbukaan Informasi Publik (UU KIP).',
    details: [
      'Perorangan: pindai Kartu Tanda Penduduk (KTP) yang masih berlaku.',
      'Badan hukum atau organisasi: salinan akta pendirian atau pengesahan Kemenkumham, beserta surat kuasa.',
      'Rincian permintaan: sebutkan jenis data yang diminta dan tujuan penggunaannya secara spesifik.',
    ],
  },
  {
    step: 3,
    title: 'Ajukan Permohonan Resmi ke PPID Kota Balikpapan',
    description: 'Ajukan secara daring melalui portal PPID atau serahkan berkas langsung.',
    details: [
      'Daring: isi formulir permohonan pada portal resmi PPID Pemerintah Kota Balikpapan.',
      'Luring: serahkan berkas di Meja Informasi Kantor Kelurahan Manggar atau Diskominfo Kota Balikpapan.',
      'Simpan tanda terima pendaftaran berupa stempel atau tiket elektronik.',
    ],
  },
  {
    step: 4,
    title: 'Proses Verifikasi dan Tenggat Tanggapan',
    description:
      'Petugas PPID memproses permohonan dan menguji konsekuensi informasi yang diminta.',
    details: [
      'PPID memberi pemberitahuan tertulis paling lambat 10 hari kerja sejak berkas dinyatakan lengkap.',
      'PPID dapat memperpanjang tanggapan 7 hari kerja dengan alasan tertulis kepada pemohon.',
    ],
  },
  {
    step: 5,
    title: 'Penerimaan Salinan Data atau Informasi',
    description: 'Pemohon menerima salinan data atau penjelasan resmi atas permohonannya.',
    details: [
      'Informasi diserahkan dalam bentuk dokumen digital atau salinan fisik.',
      'Jika informasi dikecualikan (rahasia negara atau pribadi), pemohon menerima surat penolakan tertulis beserta dasar hukumnya.',
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

// Taksonomi kelas informasi publik menurut UU KIP — dipinjam dari portal PPID Kota
// Balikpapan agar pemohon tahu apa yang rutin terbit, apa yang serta-merta, dan apa
// yang harus diminta. Halaman ini tetap penunjuk eksternal (SPEC §1), bukan penyedia dokumen.
const informationClasses = [
  {
    title: 'Informasi Berkala',
    description:
      'Diumumkan rutin tanpa diminta — laporan keuangan, laporan kinerja, dan produk hukum.',
  },
  {
    title: 'Informasi Serta-merta',
    description:
      'Wajib tersedia segera saat dibutuhkan — misalnya informasi bencana atau penutupan jalan.',
  },
  {
    title: 'Informasi Setiap Saat',
    description:
      'Disediakan atas permintaan — termasuk Daftar Informasi Publik (DIP) dan rencana kerja.',
  },
];

const escalationPath = [
  { title: 'Permohonan', note: 'Diajukan ke PPID Kota Balikpapan' },
  { title: 'Keberatan', note: 'Maksimal 30 hari kerja bila tanggapan ditolak' },
  { title: 'Sengketa', note: 'Diselesaikan melalui Komisi Informasi' },
];

const serviceDesk = [
  {
    title: 'Alamat Kantor',
    lines: [
      'Kantor Kelurahan Manggar',
      'Jl. Mulawarman No. 1, RT 39',
      'Kecamatan Balikpapan Timur',
      'Kota Balikpapan, 76116',
    ],
  },
  {
    title: 'Jam Pelayanan',
    lines: [
      'Senin – Kamis: 08.00 – 15.30 WITA',
      'Jumat: 08.00 – 11.30 WITA',
      'Sabtu, Minggu & hari libur nasional: tutup',
    ],
  },
  {
    title: 'Kontak Resmi',
    lines: [
      'Telepon: (0542) 772158',
      'WhatsApp/SMS PPID: 0811 5440542',
      'Email: kelurahan.manggar@balikpapan.go.id',
    ],
  },
];
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Permintaan Data" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel
      title="Permintaan Data & Informasi Publik"
      subtitle="Panduan mengajukan permohonan informasi publik ke PPID Kota Balikpapan sesuai UU No. 14 Tahun 2008."
    />

    <TentangNotice heading="Pemberitahuan Batasan Layanan Portal (SPEC §1 & §9)">
      <p>
        Portal <strong>SIDATA</strong> menyajikan profil data terbuka kelurahan dan
        <strong>tidak menyimpan dokumen resmi PPID</strong>, seperti transparansi keuangan, RKA, atau
        berkas administratif internal.
      </p>
      <p>
        Laman ini berfungsi sebagai <strong>penunjuk eksternal (external pointer)</strong> resmi yang
        menjelaskan tata cara dan alur pengajuan permohonan informasi ke PPID Pemerintah Kota
        Balikpapan.
      </p>
    </TentangNotice>

    <!-- Jenis informasi publik — dipinjam dari taksonomi UU KIP di portal PPID -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="jenis-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="jenis-title" class="text-lg font-bold text-brand-navy">Jenis Informasi Publik</h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Kenali tiga kelas informasi sebelum mengajukan permohonan.
        </p>

        <div class="mt-5 rounded-btn border border-gray-300 bg-white">
          <dl
            class="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            <div v-for="(item, index) in informationClasses" :key="index" class="p-5">
              <dt class="text-base font-bold text-brand-navy">{{ item.title }}</dt>
              <dd class="mt-1 text-base leading-relaxed text-gray-800">
                {{ item.description }}
              </dd>
            </div>
          </dl>
        </div>

        <p class="mt-3 text-sm text-gray-600">
          Informasi yang dikecualikan diatur dalam Surat Keputusan tersendiri di portal PPID.
        </p>
      </div>
    </section>

    <!-- Alur permohonan -->
    <section class="bg-brand-cyan px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="alur-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="alur-title" class="text-lg font-bold text-brand-navy">
          Alur Pengajuan Permohonan Informasi
        </h2>
        <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
          Lima tahapan resmi permohonan data dan dokumen publik.
        </p>

        <div class="mt-5 rounded-btn bg-white p-5 sm:p-6">
          <TentangStepList :steps="steps" />
        </div>
      </div>
    </section>

    <!-- Jalur eskalasi — dipinjam dari alur keberatan/sengketa portal PPID -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="eskalasi-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="eskalasi-title" class="text-lg font-bold text-brand-navy">
          Jika Permohonan Ditolak atau Tidak Dijawab
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Permohonan yang tidak terpenuhi dapat Anda lanjutkan melalui jalur berikut.
        </p>

        <ol class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <li
            v-for="(stage, index) in escalationPath"
            :key="index"
            class="rounded-btn border border-gray-300 bg-white p-5"
          >
            <span
              class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-base font-bold text-white"
              aria-hidden="true"
            >
              {{ index + 1 }}
            </span>
            <h3 class="mt-3 text-base font-bold text-brand-navy">{{ stage.title }}</h3>
            <p class="mt-1 text-base leading-relaxed text-gray-800">{{ stage.note }}</p>
          </li>
        </ol>

        <p class="mt-4 text-base text-gray-700">
          Ajukan keberatan melalui
          <a
            href="https://ppid.balikpapan.go.id/ppid/keberatan"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-brand-navy underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            Formulir Keberatan PPID Balikpapan
            <span class="sr-only">Tautan eksternal, terbuka di tab baru</span>
          </a>
        </p>
      </div>
    </section>

    <!-- Standar waktu layanan -->
    <section class="bg-brand-cyan px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="sla-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="sla-title" class="text-lg font-bold text-brand-navy">
          Standar Waktu Layanan dan Ketentuan Biaya
        </h2>
        <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
          Jaminan kepastian tenggat pemrosesan permohonan informasi publik.
        </p>

        <div class="mt-5 overflow-x-auto rounded-btn border border-gray-300 bg-white">
          <table class="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-800">
            <caption class="sr-only">
              Tabel Standar Waktu Layanan Informasi Publik dan Ketentuan Biaya Permohonan
            </caption>
            <thead class="bg-brand-navy text-xs font-semibold tracking-wider text-white uppercase">
              <tr>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Tahapan / Jenis Layanan</th>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Jangka Waktu Maksimal</th>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Keterangan / Regulasi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-for="(rule, idx) in slaRules" :key="idx" class="transition-colors">
                <th scope="row" class="px-4 py-4 align-top font-semibold text-brand-navy sm:px-6">
                  {{ rule.stage }}
                </th>
                <td class="px-4 py-4 align-top font-medium text-brand-indigo sm:px-6">
                  {{ rule.duration }}
                </td>
                <td class="px-4 py-4 align-top text-gray-700 sm:px-6">
                  {{ rule.regulation }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Ajukan permohonan — satu tindakan utama, tautan dalam ke formulir resmi -->
    <TentangFeatureBand heading="Ajukan Permohonan Informasi">
      <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
        Pendaftaran, pengisian formulir daring, dan pelacakan status permohonan dilakukan di portal
        resmi PPID Kota Balikpapan.
      </p>

      <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href="https://ppid.balikpapan.go.id/ppid/permohonan"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center gap-2 rounded-btn bg-brand-navy px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-brand-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
        >
          Isi Formulir Permohonan
          <span class="sr-only">Tautan eksternal, terbuka di tab baru</span>
          <span aria-hidden="true">&rarr;</span>
        </a>

        <a
          href="https://ppid.balikpapan.go.id"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center gap-2 rounded-btn border-2 border-brand-navy bg-white px-5 py-2.5 text-base font-medium text-brand-navy transition-colors hover:bg-brand-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
        >
          Buka Portal PPID Balikpapan
          <span class="sr-only">Tautan eksternal, terbuka di tab baru</span>
        </a>
      </div>
    </TentangFeatureBand>

    <!-- Meja pelayanan -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="meja-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="meja-title" class="text-lg font-bold text-brand-navy">
          Meja Pelayanan Informasi Kelurahan Manggar
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Bantuan konsultasi dan penerimaan berkas permohonan secara luring.
        </p>

        <div class="mt-5 rounded-btn border border-gray-300 bg-white">
          <dl
            class="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            <div v-for="(desk, index) in serviceDesk" :key="index" class="p-5">
              <dt class="text-base font-bold text-brand-navy">{{ desk.title }}</dt>
              <dd class="mt-2 space-y-1 text-base leading-relaxed text-gray-800">
                <p v-for="(line, lineIdx) in desk.lines" :key="lineIdx">{{ line }}</p>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
