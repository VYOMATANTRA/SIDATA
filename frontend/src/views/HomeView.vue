<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings.store';
import { useContentBlocksStore } from '../stores/contentBlocks.store';
import { useIndicatorsStore } from '../stores/indicators.store';
import AppNavbar from '../components/common/AppNavbar.vue';
import AppFooter from '../components/common/AppFooter.vue';
import SectionHero from '../components/landing/SectionHero.vue';
import SectionSambutanLurah from '../components/landing/SectionSambutanLurah.vue';
import SectionHighlights from '../components/landing/SectionHighlights.vue';
import StatOverview from '../components/common/StatOverview.vue';
import defaultHeroBg from '@/assets/img/background_laman_depan_kelurahan.png';

interface CeritaPreviewCategory {
  slug: string;
  title: string;
  description: string;
  cardTitle: string;
  to: string;
  bgOverlay: string;
}

const CERITA_CATEGORIES: CeritaPreviewCategory[] = [
  {
    slug: 'kependudukan',
    title: 'Kependudukan',
    description:
      'Komposisi dan kepadatan penduduk, keluarga, persebaran rasio jenis kelamin, umur, pendidikan, dan lainnya',
    cardTitle: 'Ringkasan Statistik Kependudukan Kelurahan Manggar',
    to: '/cerita/kependudukan',
    bgOverlay: 'linear-gradient(180deg, rgba(8, 20, 42, 0.88) 0%, rgba(6, 15, 32, 0.96) 100%)',
  },
  {
    slug: 'pendidikan',
    title: 'Pendidikan',
    description:
      'Data sarana prasarana sekolah, angka partisipasi sekolah, dan tingkat kelulusan jenjang pendidikan warga',
    cardTitle: 'Ringkasan Statistik Pendidikan Kelurahan Manggar',
    to: '/cerita/pendidikan',
    bgOverlay: 'linear-gradient(180deg, rgba(10, 24, 48, 0.88) 0%, rgba(7, 18, 38, 0.96) 100%)',
  },
  {
    slug: 'kesehatan',
    title: 'Kesehatan',
    description:
      'Layanan posyandu, fasilitas kesehatan tingkat pertama, sebaran tenaga medis, dan derajat kesehatan balita',
    cardTitle: 'Ringkasan Statistik Kesehatan Kelurahan Manggar',
    to: '/cerita/kesehatan',
    bgOverlay: 'linear-gradient(180deg, rgba(12, 28, 54, 0.88) 0%, rgba(9, 21, 42, 0.96) 100%)',
  },
  {
    slug: 'ekonomi-dan-ketertiban',
    title: 'Ekonomi & Ketertiban',
    description:
      'Potensi perekonomian maritim pesisir, sentra UMKM mandiri, ketertiban lingkungan, dan pos pengamanan wilayah',
    cardTitle: 'Ringkasan Statistik Ekonomi & Ketertiban Kelurahan Manggar',
    to: '/cerita/ekonomi-dan-ketertiban',
    bgOverlay: 'linear-gradient(180deg, rgba(10, 26, 50, 0.88) 0%, rgba(8, 20, 40, 0.96) 100%)',
  },
  {
    slug: 'pemerintahan-dan-kelembagaan',
    title: 'Pemerintahan & Kelembagaan',
    description:
      'Struktur kelembagaan perangkat kelurahan, koordinasi 100 RT, LPM, PKK, dan lembaga kemasyarakatan kelurahan',
    cardTitle: 'Ringkasan Statistik Pemerintahan & Kelembagaan Kelurahan Manggar',
    to: '/cerita/pemerintahan-dan-kelembagaan',
    bgOverlay: 'linear-gradient(180deg, rgba(14, 30, 58, 0.88) 0%, rgba(10, 22, 44, 0.96) 100%)',
  },
  {
    slug: 'geografis-dan-tata-ruang',
    title: 'Geografis & Tata Ruang',
    description:
      'Luas wilayah administratif pesisir Balikpapan Timur, pemanfaatan tata guna lahan hijau, dan batas batas wilayah',
    cardTitle: 'Ringkasan Statistik Geografis & Tata Ruang Kelurahan Manggar',
    to: '/cerita/geografis-dan-tata-ruang',
    bgOverlay: 'linear-gradient(180deg, rgba(11, 25, 52, 0.88) 0%, rgba(7, 19, 41, 0.96) 100%)',
  },
  {
    slug: 'infrastruktur-dan-perumahan',
    title: 'Infrastruktur & Perumahan',
    description:
      'Cakupan sambungan air perpipaan PDAM, sanitasi layak, kualitas pemukiman, dan prasarana transportasi jalan',
    cardTitle: 'Ringkasan Statistik Infrastruktur & Perumahan Kelurahan Manggar',
    to: '/cerita/infrastruktur-dan-perumahan',
    bgOverlay: 'linear-gradient(180deg, rgba(9, 23, 49, 0.88) 0%, rgba(6, 17, 37, 0.96) 100%)',
  },
  {
    slug: 'persampahan-dan-bank-sampah-unit',
    title: 'Persampahan & Bank Sampah Unit',
    description:
      'Pengelolaan persampahan berbasis masyarakat, inovasi Eco Boba, dan jaringan Bank Sampah Unit tingkat RT',
    cardTitle: 'Ringkasan Statistik Persampahan & Bank Sampah Unit Kelurahan Manggar',
    to: '/cerita/persampahan-dan-bank-sampah-unit',
    bgOverlay: 'linear-gradient(180deg, rgba(8, 22, 46, 0.88) 0%, rgba(5, 16, 35, 0.96) 100%)',
  },
];

const router = useRouter();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const contentBlocksStore = useContentBlocksStore();
const indicatorsStore = useIndicatorsStore();

const isLoggingOut = ref(false);
const logoutError = ref('');

function isRouteAvailable(path: string): boolean {
  const routes = router.getRoutes();
  return routes.some((r) => {
    if (r.path === path) return true;
    if (r.path.includes(':')) {
      const basePattern = r.path.split('/:')[0];
      if (basePattern && path.startsWith(`${basePattern}/`)) {
        return true;
      }
    }
    return false;
  });
}

onMounted(async () => {
  await Promise.allSettled([
    settingsStore.fetchPublicSettings(),
    contentBlocksStore.fetchBlocks(),
    indicatorsStore.fetchIndicators(),
  ]);
});

async function handleLogout() {
  if (isLoggingOut.value) return;
  isLoggingOut.value = true;
  logoutError.value = '';

  try {
    const result = await authStore.logout();

    if (!result.success) {
      logoutError.value = result.error || 'Gagal keluar dari sesi. Silakan coba lagi.';
      return;
    }

    await router.push('/login');
  } catch {
    logoutError.value = 'Terjadi kesalahan tidak terduga saat keluar. Silakan coba lagi.';
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<template>
  <div
    class="selection:bg-brand-cyan selection:text-brand-navy flex min-h-screen flex-col bg-slate-50"
  >
    <!-- Skip to Content Link per docs/ACCESSIBILITY.md §3 (2.4.1) -->
    <a
      href="#main-content"
      class="focus:rounded-btn focus:bg-brand-navy focus-visible:outline-brand-cyan sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Lewati ke konten utama
    </a>

    <!-- Top Navigation Landmark using PR #56 AppNavbar -->
    <AppNavbar
      :sticky="true"
      :title="settingsStore.institutionName"
      :subtitle="settingsStore.appName"
    >
      <!-- Desktop Actions Slot -->
      <template #actions>
        <template v-if="authStore.isAuthenticated">
          <div class="hidden flex-col text-right sm:flex">
            <span class="text-xs font-semibold text-slate-100">{{ authStore.user?.email }}</span>
            <span class="text-brand-cyan text-[11px] font-medium tracking-wider uppercase">
              Peran: {{ authStore.user?.role }}
            </span>
          </div>

          <router-link
            v-if="authStore.isAdmin"
            to="/users"
            class="rounded-btn focus-visible:outline-brand-cyan bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-2 sm:text-sm"
          >
            Manajemen Pengguna
          </router-link>

          <button
            type="button"
            @click="handleLogout"
            :disabled="isLoggingOut"
            data-test="logout-btn"
            class="rounded-btn hover:text-brand-navy focus-visible:outline-brand-cyan cursor-pointer border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-white focus-visible:outline-2 disabled:opacity-50 sm:text-sm"
          >
            <span v-if="isLoggingOut">Memproses...</span>
            <span v-else>Keluar (Logout)</span>
          </button>
        </template>

        <template v-else>
          <router-link
            to="/login"
            class="rounded-btn bg-brand-cyan text-brand-navy focus-visible:outline-brand-cyan px-4 py-2 text-xs font-semibold shadow-md shadow-black/20 transition-all hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-sm"
          >
            Masuk (Login)
          </router-link>
        </template>
      </template>

      <!-- Mobile Menu Slot -->
      <template #menu="{ close }">
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <router-link
            to="/"
            class="block rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            @click="close"
          >
            Beranda
          </router-link>
          <router-link
            v-if="isRouteAvailable('/publikasi')"
            to="/publikasi"
            class="block rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            @click="close"
          >
            Publikasi
          </router-link>
          <router-link
            v-if="isRouteAvailable('/peta')"
            to="/peta"
            class="block rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            @click="close"
          >
            Peta
          </router-link>
          <router-link
            v-if="isRouteAvailable('/ketua-rt')"
            to="/ketua-rt"
            class="block rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            @click="close"
          >
            Ketua RT
          </router-link>
        </div>

        <!-- Mobile Auth Actions inside Drawer -->
        <div class="mt-4 border-t border-white/10 pt-4 md:hidden">
          <template v-if="authStore.isAuthenticated">
            <div class="mb-3 space-y-0.5">
              <p class="text-xs font-semibold text-slate-200">{{ authStore.user?.email }}</p>
              <p class="text-brand-cyan text-[11px] font-medium tracking-wider uppercase">
                Peran: {{ authStore.user?.role }}
              </p>
            </div>
            <div class="flex flex-col gap-2">
              <router-link
                v-if="authStore.isAdmin"
                to="/users"
                data-test="mobile-admin-link"
                class="rounded-btn block bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
                @click="close"
              >
                Manajemen Pengguna
              </router-link>
              <button
                type="button"
                @click="
                  () => {
                    close();
                    handleLogout();
                  }
                "
                :disabled="isLoggingOut"
                data-test="mobile-logout-btn"
                class="rounded-btn hover:text-brand-navy w-full border border-white/20 bg-white/10 px-4 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white disabled:opacity-50"
              >
                <span v-if="isLoggingOut">Memproses...</span>
                <span v-else>Keluar (Logout)</span>
              </button>
            </div>
          </template>
          <template v-else>
            <router-link
              to="/login"
              data-test="mobile-login-link"
              class="rounded-btn bg-brand-cyan text-brand-navy block w-full px-4 py-2 text-center text-sm font-semibold transition-colors hover:bg-white"
              @click="close"
            >
              Masuk (Login)
            </router-link>
          </template>
        </div>
      </template>
    </AppNavbar>

    <!-- Logout Error Notification Banner -->
    <div
      v-if="logoutError"
      class="mx-auto mt-2 max-w-7xl rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-center text-xs font-medium text-rose-600 sm:text-sm"
      role="alert"
    >
      {{ logoutError }}
    </div>

    <!-- Main Content Landmark per docs/ACCESSIBILITY.md -->
    <main id="main-content" class="flex-grow">
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
              :bg-image="defaultHeroBg"
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

      <!-- 4. Publikasi / Peta highlights (Spec §8 section 4) -->
      <SectionHighlights />

      <!-- 5. Widget Cuaca (Spec §8 section 5: slot with accessible fallback) -->
      <section
        id="widget-cuaca"
        aria-labelledby="weather-widget-title"
        class="border-b border-slate-200/80 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div class="mx-auto max-w-6xl space-y-8">
          <div class="mx-auto max-w-3xl space-y-3 text-center">
            <h2
              id="weather-widget-title"
              class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl"
            >
              Prakiraan Cuaca Manggar
            </h2>
            <p class="text-base leading-relaxed text-slate-600 sm:text-lg">
              Kondisi cuaca terkini dari Badan Meteorologi, Klimatologi, dan Geofisika (BMKG) untuk
              wilayah Balikpapan Timur.
            </p>
          </div>

          <!-- Weather Widget Slot (separate issue will provide live BMKG integration) -->
          <slot name="weather">
            <div
              class="rounded-card mx-auto max-w-xl border border-slate-200/90 bg-white p-8 text-center shadow-xs"
            >
              <div
                class="bg-brand-navy/10 text-brand-navy mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                aria-hidden="true"
              >
                <svg
                  class="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                </svg>
              </div>
              <p class="text-sm font-medium text-slate-700">
                Data prakiraan cuaca operasional BMKG akan ditampilkan di sini.
              </p>
              <p class="mt-1 text-xs text-slate-400">
                Pembaruan berkala suhu, kelembapan, dan kecepatan angin Balikpapan Timur
              </p>
            </div>
          </slot>
        </div>
      </section>
    </main>

    <!-- Footer Landmark per SPEC.md §8 using PR #56 AppFooter -->
    <AppFooter />
  </div>
</template>
