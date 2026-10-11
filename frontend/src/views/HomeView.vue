<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings.store';
import { useContentBlocksStore } from '../stores/contentBlocks.store';
import AppNavbar from '../components/common/AppNavbar.vue';
import AppFooter from '../components/common/AppFooter.vue';
import SectionHero from '../components/landing/SectionHero.vue';
import SectionSambutanLurah from '../components/landing/SectionSambutanLurah.vue';
import SectionHighlights from '../components/landing/SectionHighlights.vue';

const router = useRouter();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const contentBlocksStore = useContentBlocksStore();

const isLoggingOut = ref(false);
const logoutError = ref('');

onMounted(async () => {
  await Promise.allSettled([settingsStore.fetchPublicSettings(), contentBlocksStore.fetchBlocks()]);
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
  <div class="flex min-h-screen flex-col bg-slate-50 selection:bg-emerald-500 selection:text-white">
    <!-- Skip to Content Link per docs/ACCESSIBILITY.md §3 (2.4.1) -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
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
            <span class="text-[11px] font-medium tracking-wider text-emerald-300 uppercase">
              Peran: {{ authStore.user?.role }}
            </span>
          </div>

          <router-link
            v-if="authStore.isAdmin"
            to="/users"
            class="rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-emerald-400 sm:text-sm"
          >
            Manajemen Pengguna
          </router-link>

          <button
            type="button"
            @click="handleLogout"
            :disabled="isLoggingOut"
            data-test="logout-btn"
            class="cursor-pointer rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50 sm:text-sm"
          >
            <span v-if="isLoggingOut">Memproses...</span>
            <span v-else>Keluar (Logout)</span>
          </button>
        </template>

        <template v-else>
          <router-link
            to="/login"
            class="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-emerald-950/20 transition-all hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:text-sm"
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
            to="/publikasi"
            class="block rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            @click="close"
          >
            Publikasi
          </router-link>
          <router-link
            to="/peta"
            class="block rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            @click="close"
          >
            Peta
          </router-link>
          <router-link
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
              <p class="text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
                Peran: {{ authStore.user?.role }}
              </p>
            </div>
            <div class="flex flex-col gap-2">
              <router-link
                v-if="authStore.isAdmin"
                to="/users"
                data-test="mobile-admin-link"
                class="block rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
                @click="close"
              >
                Manajemen Pengguna
              </router-link>
              <button
                type="button"
                @click="() => { close(); handleLogout(); }"
                :disabled="isLoggingOut"
                data-test="mobile-logout-btn"
                class="w-full rounded-lg bg-emerald-600 px-4 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
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
              class="block w-full rounded-lg bg-emerald-500 px-4 py-2 text-center text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
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
        class="border-b border-slate-200/80 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div class="mx-auto max-w-6xl space-y-8">
          <div class="mx-auto max-w-3xl space-y-3 text-center">
            <h2
              id="cerita-preview-title"
              class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl"
            >
              Cerita & Data Wilayah
            </h2>
            <p class="text-base leading-relaxed text-slate-600 sm:text-lg">
              Eksplorasi ringkasan data kependudukan, pendidikan, kesehatan, dan potensi lingkungan
              Kelurahan Manggar.
            </p>
          </div>

          <!-- Cerita Preview Slot (separate issue will provide cards) -->
          <slot name="cerita-preview">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div
                v-for="(card, idx) in [
                  { title: 'Kependudukan', desc: 'Struktur demografi & piramida usia' },
                  { title: 'Pendidikan', desc: 'Rasio guru-murid & lembaga belajar' },
                  { title: 'Kesehatan', desc: 'Cakupan imunisasi & sanitasi warga' },
                  { title: 'Bank Sampah', desc: 'Inovasi unit daur ulang & lingkungan' },
                ]"
                :key="idx"
                class="rounded-xl border border-slate-200/90 bg-slate-50 p-5 text-left shadow-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
              >
                <h3 class="text-base font-bold text-slate-900">{{ card.title }}</h3>
                <p class="mt-1 text-xs text-slate-500">{{ card.desc }}</p>
              </div>
            </div>
          </slot>
        </div>
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
              class="mx-auto max-w-xl rounded-2xl border border-slate-200/90 bg-white p-6 text-center shadow-xs"
            >
              <p class="text-sm font-medium text-slate-500">
                Data prakiraan cuaca operasional BMKG akan ditampilkan di sini.
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
