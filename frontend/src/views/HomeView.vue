<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getCsrfToken } from '../utils/csrf';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings.store';
import { useContentBlocksStore } from '../stores/contentBlocks.store';
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
  isLoggingOut.value = true;
  logoutError.value = '';

  try {
    const csrfToken = await getCsrfToken();

    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'x-csrf-token': csrfToken,
      },
    });

    if (!response.ok) {
      logoutError.value = 'Gagal keluar dari sesi. Silakan coba lagi.';
      return;
    }

    authStore.clearAuth();
    router.push('/login');
  } catch {
    logoutError.value = 'Terjadi kesalahan jaringan saat keluar. Silakan coba lagi.';
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

    <!-- Top Navigation Bar -->
    <nav
      class="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 px-4 py-3.5 backdrop-blur-md transition-all sm:px-6 lg:px-8"
      aria-label="Navigasi Utama Portal"
    >
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <!-- Logo & Branding -->
        <router-link
          to="/"
          class="group flex items-center gap-3 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-xl font-black text-white shadow-md shadow-emerald-700/20 transition-transform group-hover:scale-105"
            aria-hidden="true"
          >
            S
          </div>
          <div class="flex flex-col">
            <span
              class="text-lg leading-none font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-emerald-700"
            >
              {{ settingsStore.appName }}
            </span>
            <span class="text-xs leading-tight font-medium text-slate-500">
              {{ settingsStore.institutionName }}
            </span>
          </div>
        </router-link>

        <!-- Right Side: Auth State or Login Link -->
        <div class="flex items-center gap-3 sm:gap-4">
          <template v-if="authStore.isAuthenticated">
            <div class="hidden flex-col text-right sm:flex">
              <span class="text-xs font-semibold text-slate-800">{{ authStore.user?.email }}</span>
              <span class="text-[11px] font-medium tracking-wider text-emerald-600 uppercase">
                Peran: {{ authStore.user?.role }}
              </span>
            </div>

            <router-link
              v-if="authStore.isAdmin"
              to="/users"
              class="rounded-lg bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-slate-500 sm:text-sm"
            >
              Manajemen Pengguna
            </router-link>

            <button
              @click="handleLogout"
              :disabled="isLoggingOut"
              class="cursor-pointer rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-slate-900 disabled:opacity-50 sm:text-sm"
            >
              <span v-if="isLoggingOut">Memproses...</span>
              <span v-else>Keluar (Logout)</span>
            </button>
          </template>

          <template v-else>
            <router-link
              to="/login"
              class="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 sm:text-sm"
            >
              Masuk (Login)
            </router-link>
          </template>
        </div>
      </div>

      <!-- Logout Error Notification Banner -->
      <div
        v-if="logoutError"
        class="mx-auto mt-2 max-w-7xl rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-center text-xs font-medium text-rose-600 sm:text-sm"
      >
        {{ logoutError }}
      </div>
    </nav>

    <!-- Main Content Landmark per docs/ACCESSIBILITY.md -->
    <main id="main-content" class="flex-grow">
      <SectionHero />
      <SectionSambutanLurah />
      <SectionHighlights />
    </main>

    <!-- Footer per SPEC.md §8 -->
    <footer
      class="border-t border-slate-800 bg-slate-900 px-4 py-12 text-slate-400 sm:px-6 lg:px-8"
      aria-label="Kaki Halaman"
    >
      <div class="mx-auto grid max-w-7xl grid-cols-1 gap-8 text-sm md:grid-cols-3">
        <div class="space-y-3">
          <p class="text-base font-bold tracking-tight text-white">{{ settingsStore.appName }}</p>
          <p class="leading-relaxed text-slate-400">{{ settingsStore.tagline }}</p>
          <p class="text-xs text-slate-500">{{ settingsStore.administrativeArea }}</p>
        </div>

        <div class="space-y-3">
          <p class="font-semibold text-white">Kontak & Pelayanan</p>
          <p class="leading-relaxed">{{ settingsStore.contactAddress }}</p>
          <p>
            Telepon: <span class="text-slate-300">{{ settingsStore.contactPhone }}</span>
          </p>
          <p>
            Email: <span class="text-slate-300">{{ settingsStore.contactEmail }}</span>
          </p>
        </div>

        <div class="space-y-3">
          <p class="font-semibold text-white">Keterbukaan Data</p>
          <p class="text-xs leading-relaxed text-slate-400">
            Sistem Informasi Data Terpadu Kelurahan Manggar menyajikan integrasi data statistik,
            kependudukan, dan spasial yang akurat serta dapat dipertanggungjawabkan untuk kemajuan
            bersama.
          </p>
          <p class="pt-2 text-xs text-slate-600">
            &copy; {{ new Date().getFullYear() }} {{ settingsStore.institutionName }}. Hak cipta
            dilindungi.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
