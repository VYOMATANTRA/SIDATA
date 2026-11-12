<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useContentBlocksStore } from '../stores/contentBlocks.store';
import { useIndicatorsStore } from '../stores/indicators.store';
import { isRouteAvailable as checkRouteAvailable } from '@/config/publicNav';
import SectionHero from '../components/landing/SectionHero.vue';
import SectionSambutanLurah from '../components/landing/SectionSambutanLurah.vue';
import StatOverview from '../components/common/StatOverview.vue';
import bgKependudukan from '@/assets/img/landing-page/demografi_penduduk.webp';
import bgPendidikan from '@/assets/img/landing-page/pendidikan.webp';
import bgKesehatan from '@/assets/img/landing-page/kesehatan.webp';
import bgEkonomi from '@/assets/img/landing-page/ekonomi.webp';
import bgPemerintahan from '@/assets/img/landing-page/pemerintahan_kelembagaan.webp';
import bgGeografis from '@/assets/img/landing-page/geografis_tata_ruang.webp';
import bgInfrastruktur from '@/assets/img/landing-page/infrastruktur_perumahan.webp';
import bgPersampahan from '@/assets/img/landing-page/persampahan.webp';

interface CeritaPreviewCategory {
  slug: string;
  title: string;
  description: string;
  cardTitle: string;
  to: string;
  bgOverlay: string;
  bgImage: string;
}

const CERITA_BG_OVERLAY =
  'linear-gradient(90deg, rgba(0, 0, 0, 0.75) 40%, rgba(68, 68, 68, 0.75) 100%)';

const CERITA_CATEGORIES: CeritaPreviewCategory[] = [
  {
    slug: 'kependudukan',
    title: 'Kependudukan',
    description:
      'Komposisi dan kepadatan penduduk, keluarga, persebaran rasio jenis kelamin, umur, pendidikan, dan lainnya',
    cardTitle: 'Ringkasan Statistik Kependudukan Kelurahan Manggar',
    to: '/cerita/kependudukan',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgKependudukan,
  },
  {
    slug: 'pendidikan',
    title: 'Pendidikan',
    description:
      'Data sarana prasarana sekolah, angka partisipasi sekolah, dan tingkat kelulusan jenjang pendidikan warga',
    cardTitle: 'Ringkasan Statistik Pendidikan Kelurahan Manggar',
    to: '/cerita/pendidikan',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgPendidikan,
  },
  {
    slug: 'kesehatan',
    title: 'Kesehatan',
    description:
      'Layanan posyandu, fasilitas kesehatan tingkat pertama, sebaran tenaga medis, dan derajat kesehatan balita',
    cardTitle: 'Ringkasan Statistik Kesehatan Kelurahan Manggar',
    to: '/cerita/kesehatan',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgKesehatan,
  },
  {
    slug: 'ekonomi-dan-ketertiban',
    title: 'Ekonomi & Ketertiban',
    description:
      'Potensi perekonomian maritim pesisir, sentra UMKM mandiri, ketertiban lingkungan, dan pos pengamanan wilayah',
    cardTitle: 'Ringkasan Statistik Ekonomi & Ketertiban Kelurahan Manggar',
    to: '/cerita/ekonomi-dan-ketertiban',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgEkonomi,
  },
  {
    slug: 'pemerintahan-dan-kelembagaan',
    title: 'Pemerintahan & Kelembagaan',
    description:
      'Struktur kelembagaan perangkat kelurahan, koordinasi 100 RT, LPM, PKK, dan lembaga kemasyarakatan kelurahan',
    cardTitle: 'Ringkasan Statistik Pemerintahan & Kelembagaan Kelurahan Manggar',
    to: '/cerita/pemerintahan-dan-kelembagaan',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgPemerintahan,
  },
  {
    slug: 'geografis-dan-tata-ruang',
    title: 'Geografis & Tata Ruang',
    description:
      'Luas wilayah administratif pesisir Balikpapan Timur, pemanfaatan tata guna lahan hijau, dan batas batas wilayah',
    cardTitle: 'Ringkasan Statistik Geografis & Tata Ruang Kelurahan Manggar',
    to: '/cerita/geografis-dan-tata-ruang',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgGeografis,
  },
  {
    slug: 'infrastruktur-dan-perumahan',
    title: 'Infrastruktur & Perumahan',
    description:
      'Cakupan sambungan air perpipaan PDAM, sanitasi layak, kualitas pemukiman, dan prasarana transportasi jalan',
    cardTitle: 'Ringkasan Statistik Infrastruktur & Perumahan Kelurahan Manggar',
    to: '/cerita/infrastruktur-dan-perumahan',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgInfrastruktur,
  },
  {
    slug: 'persampahan-dan-bank-sampah-unit',
    title: 'Persampahan & Bank Sampah Unit',
    description:
      'Pengelolaan persampahan berbasis masyarakat, inovasi Eco Boba, dan jaringan Bank Sampah Unit tingkat RT',
    cardTitle: 'Ringkasan Statistik Persampahan & Bank Sampah Unit Kelurahan Manggar',
    to: '/cerita/persampahan-dan-bank-sampah-unit',
    bgOverlay: CERITA_BG_OVERLAY,
    bgImage: bgPersampahan,
  },
];

const router = useRouter();
const contentBlocksStore = useContentBlocksStore();
const indicatorsStore = useIndicatorsStore();

function isRouteAvailable(path: string): boolean {
  return checkRouteAvailable(router, path);
}

onMounted(async () => {
  // The public settings load belongs to PublicLayout; this view only owns its own content.
  await Promise.allSettled([contentBlocksStore.fetchBlocks(), indicatorsStore.fetchIndicators()]);
});
</script>

<template>
  <!-- PublicLayout supplies the skip link, header, <main id="main-content"> and footer. -->
  <div>
    <!-- 1. Hero (Spec §8 top section) -->
    <SectionHero />

    <!-- 2. Sambutan Lurah (Spec §8 section 2) -->
    <SectionSambutanLurah />

    <!-- 3. Cerita preview (Spec §8 section 3: slot with accessible fallback) -->
    <section
      id="cerita-preview"
      aria-labelledby="cerita-preview-title"
      class="border-b border-white/10 bg-slate-950"
    >
      <h2 id="cerita-preview-title" class="sr-only">Cerita & Data Wilayah</h2>

      <!-- Cerita Preview Slot (Figma StatOverview 8 category sections) -->
      <slot name="cerita-preview">
        <div class="flex w-full flex-col divide-y divide-white/10">
          <StatOverview
            v-for="category in CERITA_CATEGORIES"
            :key="category.slug"
            :title="category.title"
            :description="category.description"
            :stats="indicatorsStore.getStatsForPage(category.slug)"
            :card-title="category.cardTitle"
            card-variant="glass"
            heading-tag="h3"
            button-label="Lihat selengkapnya"
            :to="category.to"
            :show-button="isRouteAvailable(category.to)"
            align="left"
            :is-full-bleed="true"
            :bg-image="category.bgImage"
            :bg-overlay="category.bgOverlay"
          >
            <template #card-empty>
              <div class="flex flex-col items-center justify-center py-6 text-center">
                <p class="text-sm text-slate-300 italic">Data belum tersedia</p>
              </div>
            </template>
          </StatOverview>
        </div>
      </slot>
    </section>
  </div>
</template>
