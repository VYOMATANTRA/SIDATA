<script setup lang="ts">
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import TentangFigureCard from '../components/tentang/TentangFigureCard.vue';
import TentangInfoCard from '../components/tentang/TentangInfoCard.vue';
import TentangFeatureBand from '../components/tentang/TentangFeatureBand.vue';
import TentangResourceCard from '../components/tentang/TentangResourceCard.vue';
import TentangTeamCard from '../components/tentang/TentangTeamCard.vue';
import TentangLogoRow from '../components/tentang/TentangLogoRow.vue';
import heroImage from '@/assets/img/background_laman_depan_kelurahan.png';
import logoVyomatantra from '@/assets/img/logo_vyomatantra.png';
import logoItk from '@/assets/img/logo_itk.png';
import logoSdgsDesa from '@/assets/img/sdgs_desa.png';
import logoSdgs17 from '@/assets/img/17_kemitraan_pembangunan_desa.png';

interface InitiativeItem {
  title: string;
  description: string;
  impact: string;
}

const initiatives: InitiativeItem[] = [
  {
    title: 'Program Eco Boba (Briket Arang Batok Kelapa)',
    description:
      'Inisiatif pengolahan limbah tempurung kelapa dari para pedagang dan rumah tangga menjadi briket arang ramah lingkungan tanpa asap dan berkalori tinggi. Program ini mencakup pelatihan teknik pirolisis, pencetakan briket, pengemasan, hingga penyusunan Booklet Edukasi Eco Boba.',
    impact:
      'Mereduksi timbunan sampah batok kelapa dan membuka peluang wirausaha hijau bagi kelompok warga.',
  },
  {
    title: 'Pembinaan & Pemetaan Bank Sampah Unit (BSU)',
    description:
      'Pendampingan tata kelola operasional dan pencatatan nasabah bagi Bank Sampah Unit di lingkungan RT Kelurahan Manggar. Mengintegrasikan titik-titik persebaran unit pengumpulan sampah ke dalam peta spasial interaktif kelurahan.',
    impact:
      'Meningkatkan kesadaran pemilahan sampah dari sumbernya dan memperkuat ekonomi sirkular lokal.',
  },
  {
    title: 'Rancang Bangun Sistem SIDATA',
    description:
      'Pengembangan Sistem Informasi Data Terpadu Kelurahan Manggar (SIDATA) sebagai platform publik yang menyajikan data statistik kependudukan, sarana prasarana, peta spasial RT, dan keterbukaan informasi berbasis web.',
    impact:
      'Menyediakan basis data terpadu yang mudah diakses warga, peneliti, dan pemerintah daerah.',
  },
];

const collaborationLogos = [
  { src: logoVyomatantra, alt: 'Logo Tim Inovasi Sosial VYOMATANTRA' },
  { src: logoItk, alt: 'Logo Institut Teknologi Kalimantan (ITK)' },
];

const sdgsLogos = [
  { src: logoSdgsDesa, alt: 'Logo SDGs Desa' },
  { src: logoSdgs17, alt: 'Logo SDGs 17: Kemitraan untuk Pembangunan Desa' },
];

const partners = [
  {
    title: 'Institut Teknologi Kalimantan (ITK)',
    role: 'Perguruan Tinggi Pengusul',
    meta: 'Jl. Soekarno-Hatta Km. 15, Karang Joang, Balikpapan Utara, Kalimantan Timur 76127',
  },
  {
    title: 'Sekretariat Tim Inovasi Sosial',
    role: 'Koordinator Program',
    meta: 'Kelurahan Manggar, Balikpapan Timur & Kampus ITK Balikpapan',
  },
];

interface TeamMember {
  title: string;
  role: string;
  meta?: string;
}

const teamMembers: TeamMember[] = [
  // TODO: Konfirmasi nama dan peran definitif anggota 1
  { title: 'Nama Anggota 1', role: 'Anggota Tim VYOMATANTRA' },
  // TODO: Konfirmasi nama dan peran definitif anggota 2
  { title: 'Nama Anggota 2', role: 'Anggota Tim VYOMATANTRA' },
  // TODO: Konfirmasi nama dan peran definitif anggota 3
  { title: 'Nama Anggota 3', role: 'Anggota Tim VYOMATANTRA' },
  // TODO: Konfirmasi nama dan peran definitif anggota 4
  { title: 'Nama Anggota 4', role: 'Anggota Tim VYOMATANTRA' },
  // TODO: Konfirmasi nama dan peran definitif anggota 5
  { title: 'Nama Anggota 5', role: 'Anggota Tim VYOMATANTRA' },
  // TODO: Konfirmasi nama dan peran definitif anggota 6
  { title: 'Nama Anggota 6', role: 'Anggota Tim VYOMATANTRA' },
  // TODO: Konfirmasi nama dan peran definitif anggota 7
  { title: 'Nama Anggota 7', role: 'Anggota Tim VYOMATANTRA' },
  // TODO: Konfirmasi nama dan peran definitif anggota 8
  { title: 'Nama Anggota 8', role: 'Anggota Tim VYOMATANTRA' },
];
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Inovasi Sosial VYOMATANTRA" />

    <TentangHeroPanel
      title="Inovasi Sosial VYOMATANTRA"
      subtitle="Data Tepat, Aksi Hebat. Kolaborasi pengabdian masyarakat antara Institut Teknologi Kalimantan (ITK) dan Kelurahan Manggar untuk menggerakkan kemandirian berbasis data, teknologi tepat guna, dan ekonomi sirkular."
    >
      <template #figure>
        <TentangFigureCard
          :image="heroImage"
          caption="Kantor Kelurahan Manggar, Balikpapan Timur — lokasi koordinasi kegiatan program Desa Cantik"
          source="Tim Inovasi Sosial VYOMATANTRA"
        />
      </template>
    </TentangHeroPanel>

    <div class="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-12">
      <TentangInfoCard heading="Latar Belakang" icon="info">
        <p>
          <strong>VYOMATANTRA</strong> adalah tim inovasi sosial yang diinisiasi oleh mahasiswa dan
          dosen pembimbing dari Institut Teknologi Kalimantan (ITK). Bergerak dengan semangat Tri
          Dharma Perguruan Tinggi, tim hadir di Kelurahan Manggar untuk menjembatani perkembangan
          teknologi digital dengan kearifan lokal masyarakat pesisir dan permukiman.
        </p>
        <p>
          Pendekatan yang diterapkan memadukan penelitian partisipatif
          (<em>participatory research</em>) dan aksi nyata di lapangan. Bersama aparatur kelurahan,
          pengurus RT, dan pegiat bank sampah, VYOMATANTRA mengurai tantangan persampahan kota
          menjadi peluang ekonomi bernilai tambah, sembari memperkuat kedaulatan data kelurahan lewat
          pengembangan portal terpadu <strong>SIDATA</strong>.
        </p>
      </TentangInfoCard>

      <TentangInfoCard heading="Peran" icon="chart">
        <p>
          Vyomatantra berperan dalam mengintegrasikan dan memvisualisasikan data wilayah Kelurahan
          Manggar dalam bentuk informasi geospasial yang mudah diakses. Data tersebut dapat membantu
          dalam mengidentifikasi kondisi wilayah, persebaran penduduk, potensi pengelolaan sampah,
          serta lokasi bank sampah sebagai dasar pengambilan keputusan.
        </p>
      </TentangInfoCard>
    </div>

    <TentangFeatureBand heading="Inisiatif Unggulan di Kelurahan Manggar">
      <div class="mt-4 flex flex-col gap-5 lg:flex-row items-stretch">
        <TentangResourceCard
          v-for="item in initiatives"
          :key="item.title"
          :title="item.title"
          icon="leaf"
          class="flex-1"
        >
          <p>{{ item.description }}</p>
          <template #footer>
            <p class="text-sm text-white">
              <span class="font-bold">Dampak:</span> {{ item.impact }}
            </p>
          </template>
        </TentangResourceCard>
      </div>
    </TentangFeatureBand>

    <!-- Kontribusi terhadap SDGs -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="sdgs-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="sdgs-title" class="text-lg font-bold text-brand-navy">
          Kontribusi Terhadap SDGs Desa
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Menyelaraskan kegiatan inovasi sosial dengan Tujuan Pembangunan Berkelanjutan (SDGs).
        </p>

        <div
          class="mt-5 flex flex-col items-center gap-6 rounded-btn border border-gray-300 bg-white p-5 sm:p-6 lg:flex-row lg:items-start"
        >
          <div class="flex shrink-0 items-center gap-4">
            <TentangLogoRow :logos="sdgsLogos" />
          </div>

          <div class="space-y-3 text-base leading-relaxed text-gray-800">
            <h3 class="text-lg font-bold text-brand-navy">
              SDG 17: Kemitraan untuk Mencapai Tujuan (Partnership for the Goals)
            </h3>
            <p>
              Inovasi sosial VYOMATANTRA membuktikan bahwa pembangunan desa dan kelurahan yang
              efektif lahir dari sinergi pentahelix: perguruan tinggi (ITK), aparatur pemerintah
              kelurahan, lembaga statistik (BPS Kota Balikpapan), kelompok masyarakat (Bank Sampah &
              Ketua RT), serta mitra pendukung.
            </p>
            <ul class="list-disc space-y-1.5 pl-5 text-base">
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

    <!-- Narahubung & sivitas pelaksana -->
    <section class="bg-brand-cyan px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="tim-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="tim-title" class="text-lg font-bold text-brand-navy">
          Tim Inovasi Sosial &amp; Narahubung
        </h2>
        <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
          Lembaga pengusul inisiatif pengabdian masyarakat.
        </p>

        <div class="mt-5 flex flex-col gap-5 lg:flex-row">
          <TentangTeamCard
            v-for="partner in partners"
            :key="partner.title"
            :title="partner.title"
            :role="partner.role"
            :meta="partner.meta"
            class="flex-1"
          />
        </div>

        <p class="mt-5 text-sm text-brand-navy">
          * Komposisi tim pelaksana dan publikasi ilmiah luaran program didokumentasikan dalam
          laporan resmi program pengabdian masyarakat.
          <!-- TODO: Konfirmasi susunan nama lengkap tim pelaksana mahasiswa dan dosen pembimbing VYOMATANTRA -->
        </p>
      </div>
    </section>

    <!-- Tim Pelaksana VYOMATANTRA -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="tim-pelaksana-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="tim-pelaksana-title" class="text-lg font-bold text-brand-navy">
          Tim Pelaksana VYOMATANTRA
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Civitas akademika Institut Teknologi Kalimantan (ITK) yang mendedikasikan keahlian dalam
          perancangan dan implementasi program inovasi sosial di Kelurahan Manggar.
        </p>

        <div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <TentangTeamCard
            v-for="(member, idx) in teamMembers"
            :key="idx"
            :title="member.title"
            :role="member.role"
            :meta="member.meta"
            :show-placeholder="true"
          />
        </div>

        <p class="mt-5 text-sm text-gray-600 italic">
          * Catatan (TODO): Susunan nama lengkap dan peran definitif 8 anggota tim pelaksana
          didokumentasikan dalam laporan resmi program pengabdian masyarakat.
        </p>
      </div>
    </section>

    <!-- Kolaborasi -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="kolaborasi-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="kolaborasi-title" class="text-lg font-bold text-brand-navy">Kolaborasi</h2>
        <div class="mt-5">
          <TentangLogoRow :logos="collaborationLogos" />
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
