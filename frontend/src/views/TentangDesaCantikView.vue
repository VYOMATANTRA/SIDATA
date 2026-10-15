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

const collaborationLogos = [
  { src: logoDesaCantik, alt: 'Logo Desa Cantik' },
  { src: logoBps, alt: 'Logo Badan Pusat Statistik (BPS)' },
];
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Program Desa/Kelurahan Cantik" />

    <TentangHeroPanel
      title="Program Desa/Kelurahan Cinta Statistik (Desa Cantik)"
      subtitle="Upaya Kelurahan Manggar dalam mewujudkan nagari sadar statistik."
    >
      <template #figure>
        <TentangFigureCard
          :image="heroImage"
          caption="Kantor Kelurahan Manggar, Balikpapan Timur"
          source="Tim Inovasi Sosial VYOMATANTRA"
        />
      </template>
    </TentangHeroPanel>

    <!-- Catatan batasan portal -->
    <section class="border-b border-gray-200 bg-white px-4 py-4 sm:px-6" aria-labelledby="scope-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="scope-title" class="text-base font-bold text-brand-navy">
          Catatan Batasan Portal
        </h2>
        <p class="mt-1 text-base leading-relaxed text-gray-800">
          Situs web <strong>SIDATA</strong> adalah salah satu luaran inovasi terpadu yang mendukung
          implementasi pembinaan Desa Cantik di Kelurahan Manggar, dan diberi merek secara
          tersendiri. Portal ini
          <strong>bukan portal resmi milik Badan Pusat Statistik (BPS)</strong>.
        </p>
      </div>
    </section>

    <div class="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-12">
      <TentangInfoCard heading="Tentang Program Kelurahan Cantik" icon="info">
        <p>
          Kelurahan Cinta Statistik merupakan inisiatif dari Badan Pusat Statistik (BPS) untuk
          meningkatkan literasi, pengelolaan, dan pemanfaatan data statistik di tingkat desa atau
          kelurahan. Jadi, fokus utama Program Desa Cantik adalah meningkatkan literasi dan
          kapabilitas perangkat desa dalam mengelola serta memanfaatkan data statistik agar
          pembangunan desa lebih tepat sasaran.
        </p>
      </TentangInfoCard>

      <TentangInfoCard heading="Mewujudkan Sadar Statistik di Manggar" icon="chart">
        <p>
          Melalui pendampingan ini, Kelurahan Manggar berupaya menyusun kependudukan, potensi
          geografis, dan sumber daya secara akurat. Data yang dihasilkan (seperti yang ditampilkan di
          portal SIDATA ini) diharapkan dapat menjadi rujukan dalam perencanaan pembangunan kelurahan
          ke depannya.
        </p>
      </TentangInfoCard>
    </div>

    <TentangFeatureBand heading="Dampak Nyata Program Kelurahan Cantik di Manggar">
      <div class="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TentangResourceCard
          title="Manggar Dalam Angka 2026"
          icon="document"
          cta-label="Lihat Publikasi"
        >
          Kompilasi statistik sektoral tahunan kelurahan yang memuat demografi, ekonomi
          nelayan/wisata, dan sarana permukiman.
        </TentangResourceCard>

        <TentangResourceCard
          title="Peta Spasial RT dan Bank Sampah Unit"
          icon="map"
          cta-label="Peta Geospasial"
        >
          Plot titik koordinat rumah seluruh ketua RT dan sebaran lokasi penimbangan sampah aktif di
          Balikpapan Timur.
        </TentangResourceCard>

        <TentangResourceCard title="Sistem SIDATA" icon="system">
          Platform pencarian agregat kependudukan real-time, monitoring per RT, dan sinkronisasi
          metadata secara berkala tanpa hambatan.
        </TentangResourceCard>
      </div>
    </TentangFeatureBand>

    <!-- Empat pilar implementasi -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="pilar-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="pilar-title" class="text-lg font-bold text-brand-navy">
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
        <h2 id="rujukan-title" class="text-lg font-bold text-brand-navy">
          Informasi Lebih Lanjut Mengenai Desa Cantik
        </h2>
        <p class="mx-auto mt-2 max-w-2xl text-base text-brand-navy/90">
          Untuk mempelajari pedoman teknis nasional, publikasi metodologi, dan praktik baik program
          Desa Cantik di seluruh Indonesia, kunjungi portal resmi Badan Pusat Statistik.
        </p>
        <div class="mt-6">
          <a
            href="https://www.bps.go.id"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-btn bg-brand-navy px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-brand-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
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
        <h2 id="didukung-title" class="text-lg font-bold text-brand-navy">Didukung Oleh</h2>
        <div class="mt-5">
          <TentangLogoRow :logos="collaborationLogos" />
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
