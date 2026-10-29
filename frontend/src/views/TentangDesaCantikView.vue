<script setup lang="ts">
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import TentangFigureCard from '../components/tentang/TentangFigureCard.vue';
import TentangInfoCard from '../components/tentang/TentangInfoCard.vue';
import TentangFeatureBand from '../components/tentang/TentangFeatureBand.vue';
import TentangResourceCard from '../components/tentang/TentangResourceCard.vue';
import TentangLogoRow from '../components/tentang/TentangLogoRow.vue';
import heroImage from '@/assets/img/background_laman_depan_kelurahan.png';
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
    title: 'Penguatan Kapasitas Aparatur Kelurahan',
    description:
      'Melatih perangkat kelurahan sebagai agen statistik yang mampu mengumpulkan data lapangan secara tertib, valid, dan berkesinambungan.',
  },
  {
    title: 'Penyusunan Publikasi Statistik Kelurahan',
    description:
      'Menghasilkan dokumen resmi tahunan seperti "Kelurahan Manggar Dalam Angka 2026" sebagai rujukan bagi publik dan para pemangku kepentingan.',
  },
  {
    title: 'Pemanfaatan Data untuk Kebijakan Nyata',
    description:
      'Memanfaatkan data kependudukan, kemiskinan, dan potensi lingkungan secara tepat sasaran dalam perencanaan seperti bantuan sosial, pengelolaan sampah, dan lainnya.',
  },
];

const collaborationLogos = [
  { src: logoBps, alt: 'Logo Badan Pusat Statistik (BPS)' },
  { src: logoDesaCantik, alt: 'Logo Desa Cantik' },
];
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Program Desa/Kelurahan Cantik" />

    <TentangHeroPanel
      title="Program Desa/Kelurahan Cinta Statistik (Desa Cantik)"
      subtitle="Upaya Kelurahan Manggar dalam mewujudkan kelurahan sadar statistik."
    >
      <template #figure>
        <TentangFigureCard
          :image="heroImage"
          caption="Kantor Kelurahan Manggar, Balikpapan Timur"
          source="Tim Inovasi Sosial VYOMATANTRA"
        />
      </template>
    </TentangHeroPanel>

    <div class="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-12">
      <TentangInfoCard heading="Tentang Program Desa Cantik" icon="info">
        <p>
          Desa/Kelurahan Cinta Statistik merupakan inisiatif dari Badan Pusat Statistik (BPS) untuk
          meningkatkan literasi, pengelolaan, dan pemanfaatan data statistik di tingkat
          desa/kelurahan agar pembangunan desa/kelurahan lebih tepat sasaran.
        </p>
      </TentangInfoCard>

      <TentangInfoCard heading="Mewujudkan Sadar Statistik di Manggar" icon="chart">
        <p>
          Pendampingan ini membantu perangkat Kelurahan Manggar mengumpulkan, mengolah, dan
          menyajikan data statistik. Publikasi Manggar Dalam Angka 2026 menghimpun data geografi,
          pemerintahan, kependudukan, sosial, ekonomi, dan infrastruktur untuk menjadi rujukan
          perencanaan.
        </p>
      </TentangInfoCard>
    </div>

    <TentangFeatureBand heading="Luaran dan Kegiatan Desa Cantik di Manggar">
      <div class="mt-4 flex flex-col items-stretch gap-5 md:flex-row">
        <TentangResourceCard
          title="Manggar Dalam Angka 2026"
          icon="document"
          to="/publikasi"
          cta-label="Lihat Publikasi"
          class="flex-1"
        >
          Kompilasi statistik sektoral tahunan kelurahan yang memuat demografi, ekonomi
          nelayan/wisata, dan sarana permukiman.
        </TentangResourceCard>

        <TentangResourceCard
          title="Peta Spasial RT dan Bank Sampah Unit"
          icon="map"
          to="/peta"
          cta-label="Lihat Peta"
          class="flex-1"
        >
          Peta lokasi rumah ketua RT dan bank sampah aktif di Kelurahan Manggar, Kecamatan
          Balikpapan Timur.
        </TentangResourceCard>

        <TentangResourceCard
          title="Portal SIDATA"
          icon="system"
          to="/"
          cta-label="Beranda"
          class="flex-1"
        >
          Solusi terpadu untuk menyimpan dan menyajikan data kelurahan secara terstruktur.
        </TentangResourceCard>
      </div>
    </TentangFeatureBand>

    <!-- Empat pilar implementasi -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="pilar-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="pilar-title" class="text-brand-navy text-lg font-bold">
          Implementasi di Kelurahan Manggar
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Empat fokus utama pelaksanaan pembinaan Desa Cantik di lingkungan Kelurahan Manggar.
        </p>

        <div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TentangInfoCard
            v-for="(pillar, idx) in pillars"
            :key="pillar.title"
            :heading="pillar.title"
            :badge="String(idx + 1)"
            icon="chart"
          >
            <p>{{ pillar.description }}</p>
          </TentangInfoCard>
        </div>
      </div>
    </section>

    <!-- Rujukan resmi -->
    <section class="bg-brand-cyan px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="rujukan-title">
      <div class="mx-auto max-w-5xl text-center">
        <h2 id="rujukan-title" class="text-brand-navy text-lg font-bold">
          Informasi Lebih Lanjut Mengenai Desa Cantik
        </h2>
        <p class="text-brand-navy/90 mx-auto mt-2 max-w-2xl text-base">
          Untuk mempelajari pedoman teknis nasional, publikasi metodologi, dan praktik baik program
          Desa Cantik di seluruh Indonesia, kunjungi portal resmi Badan Pusat Statistik.
        </p>
        <div class="mt-6">
          <a
            href="https://www.bps.go.id"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-btn bg-brand-navy hover:bg-brand-navy-deep focus-visible:outline-brand-navy inline-flex items-center gap-2 px-5 py-2.5 text-base font-medium text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span>Kunjungi Portal Resmi BPS RI</span>
            <span class="sr-only">Tautan eksternal</span>
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

    <!-- Didukung oleh -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="didukung-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="didukung-title" class="text-brand-navy text-lg font-bold">Didukung Oleh</h2>
        <div class="mt-5">
          <TentangLogoRow :logos="collaborationLogos" />
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
