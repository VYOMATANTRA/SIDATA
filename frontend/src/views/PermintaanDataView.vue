<script setup lang="ts">
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import TentangNotice from '../components/tentang/TentangNotice.vue';
import TentangStepList, { type StepItem } from '../components/tentang/TentangStepList.vue';
import TentangFeatureBand from '../components/tentang/TentangFeatureBand.vue';
import TentangIcon from '../components/tentang/TentangIcon.vue';

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
      'Lengkapi identitas dan formulir permohonan sesuai UU KIP dan SOP PPID No. 490/365/M/DISKOMINFO.',
    details: [
      'Perorangan: Kartu Tanda Penduduk (KTP) yang masih berlaku.',
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
      'Simpan bukti pendaftaran resmi berupa Nomor Register Permohonan Informasi (SOP Tahap 3).',
    ],
  },
  {
    step: 4,
    title: 'Proses Verifikasi dan Tenggat Tanggapan',
    description:
      'Petugas PPID meregister berkas dan berkoordinasi dengan PPID Pelaksana (Kelurahan/OPD terkait).',
    details: [
      'PPID memeriksa keabsahan identitas, meregister permohonan, dan berkoordinasi dengan PPID Pelaksana.',
      'PPID menyampaikan pemberitahuan tertulis paling lambat 10 hari kerja sejak permohonan diterima.',
      'PPID dapat memperpanjang waktu tanggapan 7 hari kerja dengan alasan tertulis kepada pemohon.',
    ],
  },
  {
    step: 5,
    title: 'Penerimaan Salinan Data atau Informasi',
    description: 'Pemohon menerima salinan data atau penjelasan resmi atas permohonannya.',
    details: [
      'Petugas PPID menghubungi pemohon saat dokumen informasi telah siap diserahkan.',
      'Pemohon menandatangani Tanda Terima Informasi dan menerima salinan dokumen (digital atau fisik).',
      'Jika informasi dikecualikan, pemohon menerima surat penolakan tertulis beserta dasar hukum pengujian konsekuensi.',
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
    regulation:
      'SOP Layanan PPID Balikpapan No. 490/365/M/DISKOMINFO & Perki No. 1/2021 (Pasal 22 ayat (4)–(6) UU No. 14/2008)',
  },
  {
    stage: 'Penyampaian Tanggapan Tertulis PPID',
    duration: 'Maksimal 10 Hari Kerja',
    regulation:
      'Pasal 22 ayat (7) UU No. 14 Tahun 2008 tentang Keterbukaan Informasi Publik & SOP PPID Balikpapan',
  },
  {
    stage: 'Perpanjangan Waktu Tanggapan (Opsional)',
    duration: 'Maksimal 7 Hari Kerja',
    regulation:
      'Pasal 22 ayat (8) UU No. 14 Tahun 2008 (disertai surat pemberitahuan alasan perpanjangan)',
  },
  {
    stage: 'Pengajuan Keberatan atas Tanggapan PPID',
    duration: 'Maksimal 30 Hari Kerja',
    regulation:
      'Pasal 36 ayat (1) UU No. 14 Tahun 2008 (diajukan tertulis kepada Atasan PPID Kota Balikpapan)',
  },
  {
    stage: 'Biaya Layanan Informasi Publik',
    duration: 'Bebas Biaya (Gratis)',
    regulation:
      'SOP Layanan PPID Balikpapan No. 490/365/M/DISKOMINFO & Prinsip Biaya Ringan Pasal 21 UU No. 14/2008 (biaya salinan fisik/media simpan mandiri)',
  },
];

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
  {
    title: 'Permohonan',
    target: 'PPID Kota Balikpapan & Meja Layanan Kelurahan',
    note: 'Diajukan tertulis atau daring. PPID wajib memberikan pemberitahuan tertulis paling lambat 10 hari kerja sejak permohonan diterima, dan dapat memperpanjang waktu paling lambat 7 hari kerja berikutnya dengan alasan tertulis. Dasar hukum: Pasal 22 ayat (7)–(8) UU No. 14 Tahun 2008.',
  },
  {
    title: 'Keberatan',
    target: 'Atasan PPID Kota Balikpapan',
    note: 'Diajukan tertulis paling lambat 30 hari kerja sejak ditemukannya alasan keberatan, misalnya permohonan ditolak, tidak ditanggapi, atau tidak dipenuhi. Atasan PPID memberikan tanggapan tertulis paling lambat 30 hari kerja sejak keberatan diterima. Dasar hukum: Pasal 35 ayat (1) dan Pasal 36 ayat (1)–(2) UU No. 14 Tahun 2008.',
  },
  {
    title: 'Sengketa',
    target: 'Komisi Informasi Provinsi Kaltim',
    note: 'Permohonan penyelesaian sengketa diajukan paling lambat 14 hari kerja sejak tanggapan tertulis Atasan PPID diterima, atau sejak berakhirnya batas waktu 30 hari kerja pemberian tanggapan apabila tidak ada jawaban. Dasar hukum: Pasal 13 PerKI No. 1 Tahun 2013, Pasal 37 ayat (2), dan Pasal 38 ayat (2) UU No. 14 Tahun 2008. Penyelesaian mediasi/ajudikasi paling lama 100 hari kerja.',
  },
];

const objectionReasons = [
  'Permohonan informasi publik ditolak tanpa alasan yang sah.',
  'Informasi berkala tidak disediakan atau tidak diumumkan secara berkala.',
  'Permintaan informasi tidak ditanggapi dalam batas waktu yang ditentukan.',
  'Permintaan informasi ditanggapi tidak sebagaimana yang diminta.',
  'Permintaan informasi tidak dipenuhi oleh Badan Publik.',
  'Biaya yang dikenakan untuk perolehan salinan tidak wajar atau melampaui ketentuan.',
  'Penyampaian informasi melebihi jangka waktu yang ditentukan oleh peraturan perundang-undangan.',
];

interface SopDocument {
  id: string;
  title: string;
  category: 'Layanan PPID' | 'Eskalasi & Pengujian' | 'Statistik Sektoral';
  refNumber: string;
  description: string;
  url: string;
}

const officialSopDocuments: SopDocument[] = [
  {
    id: 'sop-permohonan-ppid',
    title: 'SOP Pelayanan Permohonan Informasi Publik di PPID',
    category: 'Layanan PPID',
    refNumber: 'Nomor 490/365/M/DISKOMINFO',
    description:
      'Standar baku 19 langkah kerja pelayanan permohonan informasi publik dari meja informasi, registrasi formulir, koordinasi PPID Pelaksana, hingga tanda terima penyerahan berkas.',
    url: 'https://ppid.balikpapan.go.id/assets/global_file/SOP_PPID/SOP_Pelayanan%20Permohonan%20Informasi%20Publik%20di%20PPID.pdf',
  },
  {
    id: 'sop-keberatan-informasi',
    title: 'Tata Cara Pengajuan Keberatan Informasi Publik',
    category: 'Eskalasi & Pengujian',
    refNumber: 'Perki No. 1/2021 & UU No. 14/2008',
    description:
      'Prosedur resmi pengajuan keberatan jika permohonan ditolak atau tidak dijawab, memuat 7 alasan sah pengajuan dan tenggat jawaban tertulis Atasan PPID maksimal 30 hari.',
    url: 'https://ppid.balikpapan.go.id/assets/content_pdf/1699149426486.pdf',
  },
  {
    id: 'sop-sengketa-informasi',
    title: 'Prosedur Permohonan Penyelesaian Sengketa Informasi',
    category: 'Eskalasi & Pengujian',
    refNumber: 'Pasal 13 PerKI No. 1 Tahun 2013; Pasal 37–38 UU No. 14 Tahun 2008',
    description:
      'Permohonan penyelesaian sengketa diajukan paling lambat 14 hari kerja sejak tanggapan tertulis Atasan PPID diterima, atau sejak berakhirnya batas waktu 30 hari kerja pemberian tanggapan apabila tidak ada jawaban. Penyelesaian mediasi/ajudikasi paling lama 100 hari kerja.',
    url: 'https://ppid.balikpapan.go.id/assets/content_pdf/1667187395208.pdf',
  },
  {
    id: 'perki-sengketa-informasi-2013',
    title: 'Peraturan Komisi Informasi No. 1 Tahun 2013',
    category: 'Eskalasi & Pengujian',
    refNumber: 'Pasal 13 PerKI No. 1 Tahun 2013',
    description:
      'Peraturan resmi tentang prosedur penyelesaian sengketa informasi publik, termasuk tenggat pengajuan pada Pasal 13.',
    url: 'https://peraturan.go.id/files/bn649-2013.pdf',
  },
  {
    id: 'sop-uji-konsekuensi',
    title: 'SOP Uji Konsekuensi Penetapan Informasi Dikecualikan',
    category: 'Eskalasi & Pengujian',
    refNumber: 'Nomor 490/378/M/DISKOMINFO',
    description:
      'Pedoman telaah pengujian konsekuensi kepentingan umum vs kerahasiaan sebelum suatu informasi ditetapkan dalam Daftar Informasi Publik Dikecualikan (Pasal 17 UU KIP).',
    url: 'https://ppid.balikpapan.go.id/assets/global_file/SOP_PPID/SOP%20Uji%20Kosekuensi%20Penetapan%20Informasi%20Dikecualikan.pdf',
  },
  {
    id: 'sop-pengumpulan-statistik',
    title: 'SOP Pengumpulan Data Statistik Sektoral',
    category: 'Statistik Sektoral',
    refNumber: 'Penyelenggaraan Satu Data Balikpapan',
    description:
      'Standar pengumpulan data statistik sektoral dari produsen data (OPD dan kelurahan) guna memastikan keterpaduan Satu Data Kota Balikpapan.',
    url: 'https://ppid.balikpapan.go.id/assets/global_file/SOP_PPID/SOP%20Pengumpulan%20Data%20Statistik%20Sektoral.pdf',
  },
  {
    id: 'sop-pengolahan-statistik',
    title: 'SOP Pengolahan Data Statistik Sektoral',
    category: 'Statistik Sektoral',
    refNumber: 'Portal data.balikpapan.go.id',
    description:
      'Tata laksana pengolahan, verifikasi, dan validasi data statistik sektoral sebelum didiseminasikan secara resmi kepada publik.',
    url: 'https://ppid.balikpapan.go.id/assets/global_file/SOP_PPID/SOP%20Pengolahan%20Data%20Statistik%20Sektoral.pdf',
  },
  {
    id: 'maklumat-pelayanan-ppid',
    title: 'Maklumat Pelayanan Informasi Publik',
    category: 'Layanan PPID',
    refNumber: 'Pemerintah Kota Balikpapan',
    description:
      'Pernyataan komitmen tertulis seluruh aparatur PPID Kota Balikpapan mengenai standar mutu, kepatuhan jadwal, dan integritas layanan informasi.',
    url: 'https://ppid.balikpapan.go.id/assets/global_file/SOP_PPID/Maklumat%20Pelayanan%20Informasi%20Publik%20Pemkot%20Balikpapan%20-%202021.pdf',
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

    <TentangNotice heading="Batasan Layanan Portal Informasi">
      <p>
        Portal <strong>SIDATA</strong> menyajikan profil data terbuka kelurahan dan
        <strong>tidak menyimpan dokumen resmi PPID</strong>, seperti transparansi keuangan, RKA,
        atau berkas administratif internal.
      </p>
      <p>
        Laman panduan ini membantu Anda memahami tata cara dan alur pengajuan permohonan informasi
        publik secara resmi kepada
        <strong
          >Pejabat Pengelola Informasi dan Dokumentasi (PPID) Pemerintah Kota Balikpapan</strong
        >.
      </p>
    </TentangNotice>

    <!-- Jenis informasi publik -->
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
            <div v-for="item in informationClasses" :key="item.title" class="p-5">
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

    <!-- Jalur eskalasi -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="eskalasi-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="eskalasi-title" class="text-lg font-bold text-brand-navy">
          Jika Permohonan Ditolak atau Tidak Dijawab
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Permohonan yang tidak terpenuhi atau ditolak dapat Anda lanjutkan melalui tahapan eskalasi
          resmi berikut.
        </p>

        <ol class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <li
            v-for="(stage, index) in escalationPath"
            :key="stage.title"
            class="flex flex-col justify-between rounded-btn border border-gray-300 bg-white p-5"
          >
            <div>
              <div class="flex items-center gap-3">
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-base font-bold text-white"
                  aria-hidden="true"
                >
                  {{ index + 1 }}
                </span>
                <h3 class="text-base font-bold text-brand-navy">{{ stage.title }}</h3>
              </div>
              <p class="mt-2 text-xs font-semibold text-brand-indigo">{{ stage.target }}</p>
              <p class="mt-2 text-sm leading-relaxed text-gray-800">{{ stage.note }}</p>
            </div>
          </li>
        </ol>

        <!-- 7 Alasan Sah Keberatan -->
        <div class="mt-6 rounded-btn border border-brand-navy/20 bg-brand-cyan/10 p-5 sm:p-6">
          <h3 class="text-base font-bold text-brand-navy">
            7 Alasan Sah Pengajuan Keberatan (Perki No. 1/2021 &amp; SOP PPID)
          </h3>
          <p class="mt-1 text-sm text-gray-700">
            Pemohon berhak mengajukan keberatan tertulis kepada Atasan PPID Kota Balikpapan
            berdasarkan salah satu dari kondisi berikut:
          </p>
          <ul class="mt-3 grid grid-cols-1 gap-2.5 text-sm text-gray-800 sm:grid-cols-2">
            <li
              v-for="(reason, rIdx) in objectionReasons"
              :key="rIdx"
              class="flex items-start gap-2"
            >
              <span
                class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                ✓
              </span>
              <span>{{ reason }}</span>
            </li>
          </ul>

          <div class="mt-5 flex flex-wrap items-center gap-4 text-sm">
            <a
              href="https://ppid.balikpapan.go.id/ppid/keberatan"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-brand-navy underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            >
              <span>Formulir Keberatan PPID Balikpapan</span>
              <span class="sr-only">Tautan eksternal, terbuka di tab baru</span>
              <span aria-hidden="true">&nearr;</span>
            </a>
            <a
              href="https://ppid.balikpapan.go.id/assets/content_pdf/1699149426486.pdf"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-gray-700 underline hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            >
              <span>Unduh Tata Cara Keberatan (PDF)</span>
              <span class="sr-only"
                >Tautan eksternal dokumen panduan keberatan PPID, terbuka di tab baru</span
              >
              <span aria-hidden="true">&nearr;</span>
            </a>
          </div>
        </div>
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
              <tr v-for="rule in slaRules" :key="rule.stage" class="transition-colors">
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

        <div
          class="mt-4 flex flex-col gap-2 text-xs text-brand-navy/80 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            * Standar waktu dan prosedur diselaraskan dengan SOP PPID Kota Balikpapan No.
            490/365/M/DISKOMINFO, UU No. 14 Tahun 2008 tentang Keterbukaan Informasi Publik,
            Peraturan Komisi Informasi No. 1 Tahun 2021, serta SOP Layanan Informasi PPID Pemerintah
            Kota Balikpapan.
          </p>
          <a
            href="https://ppid.balikpapan.go.id/assets/global_file/SOP_PPID/SOP_Pelayanan%20Permohonan%20Informasi%20Publik%20di%20PPID.pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex shrink-0 items-center gap-1.5 font-semibold text-brand-navy underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            <span>Unduh SOP PPID (PDF)</span>
            <span class="sr-only"
              >Tautan eksternal dokumen SOP PPID Balikpapan, terbuka di tab baru</span
            >
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </div>
    </section>

    <!-- Dokumen SOP & Regulasi Terkait -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="sop-title">
      <div class="mx-auto max-w-5xl">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="sop-title" class="text-lg font-bold text-brand-navy">
              Dokumen Standar Operasional Prosedur (SOP) &amp; Regulasi Resmi
            </h2>
            <p class="mt-2 max-w-3xl text-base text-gray-700">
              Kumpulan SOP PPID dan peraturan resmi sebagai rujukan pelayanan informasi publik.
            </p>
          </div>
          <a
            href="https://ppid.balikpapan.go.id"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-btn border border-brand-navy/30 bg-white px-4 py-2 text-xs font-semibold text-brand-navy transition-colors hover:border-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            <span>Portal PPID Balikpapan</span>
            <span class="sr-only"
              >Tautan eksternal portal resmi PPID Balikpapan, terbuka di tab baru</span
            >
            <span aria-hidden="true">&nearr;</span>
          </a>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="doc in officialSopDocuments"
            :key="doc.id"
            class="flex flex-col justify-between rounded-btn border border-gray-300 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div>
              <div class="flex items-center justify-between gap-2">
                <span
                  class="inline-block rounded-[5px] bg-brand-cyan/40 px-2 py-0.5 text-xs font-semibold text-brand-navy"
                >
                  {{ doc.category }}
                </span>
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy"
                  aria-hidden="true"
                >
                  <TentangIcon name="document" />
                </span>
              </div>

              <h3 class="mt-3 text-base font-bold text-brand-navy">
                {{ doc.title }}
              </h3>

              <p class="mt-1 text-xs font-medium text-brand-indigo">
                {{ doc.refNumber }}
              </p>

              <p class="mt-2.5 text-sm leading-relaxed text-gray-700">
                {{ doc.description }}
              </p>
            </div>

            <a
              :href="doc.url"
              target="_blank"
              rel="noopener noreferrer"
              class="group mt-4 inline-flex min-h-[44px] items-center justify-between rounded-btn border border-brand-navy/20 bg-brand-cyan/10 px-3.5 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            >
              <span class="inline-flex items-center gap-2">
                <span
                  class="rounded bg-brand-navy px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase transition-colors group-hover:bg-white group-hover:text-brand-navy"
                >
                  PDF
                </span>
                <span>Unduh Dokumen</span>
              </span>
              <span class="sr-only"
                >Tautan eksternal dokumen {{ doc.title }}, terbuka di tab baru</span
              >
              <span aria-hidden="true">&nearr;</span>
            </a>
          </article>
        </div>
      </div>
    </section>

    <!-- Ajukan permohonan -->
    <TentangFeatureBand heading="Ajukan Permohonan Informasi">
      <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
        Pendaftaran, pengisian formulir daring, dan pelacakan status permohonan dilakukan di portal
        resmi PPID Kota Balikpapan.
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <a
          href="https://ppid.balikpapan.go.id/ppid/permohonan"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-btn bg-brand-navy px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-brand-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
        >
          Isi Formulir Permohonan
          <span class="sr-only">Tautan eksternal, terbuka di tab baru</span>
          <span aria-hidden="true">&rarr;</span>
        </a>

        <a
          href="https://ppid.balikpapan.go.id/ppid/keberatan"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-btn border-2 border-brand-navy bg-white px-5 py-2.5 text-base font-medium text-brand-navy transition-colors hover:bg-brand-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
        >
          Formulir Keberatan Daring
          <span class="sr-only"
            >Tautan eksternal formulir keberatan PPID Balikpapan, terbuka di tab baru</span
          >
          <span aria-hidden="true">&rarr;</span>
        </a>

        <a
          href="https://ppid.balikpapan.go.id"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-btn border border-brand-navy/40 bg-brand-cyan/20 px-4 py-2.5 text-base font-medium text-brand-navy transition-colors hover:border-brand-navy hover:bg-brand-cyan/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
        >
          Portal PPID Balikpapan
          <span class="sr-only">Tautan eksternal, terbuka di tab baru</span>
          <span aria-hidden="true">&nearr;</span>
        </a>
      </div>
    </TentangFeatureBand>
  </TentangPageLayout>
</template>
