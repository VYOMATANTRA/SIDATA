<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const isLoggingOut = ref(false);
const logoutError = ref('');

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
  <main
    id="main-content"
    class="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center text-slate-800"
  >
    <div
      class="w-full max-w-md space-y-6 rounded-2xl border border-slate-200/90 bg-white p-8 shadow-sm sm:p-10"
    >
      <!-- Success Icon -->
      <div
        class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <!-- Single Page Heading per docs/ACCESSIBILITY.md -->
      <div class="space-y-2">
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Login Berhasil</h1>
        <p class="text-sm leading-relaxed text-slate-600">
          Selamat datang di Sistem Informasi Data Terpadu Kelurahan Manggar
        </p>
      </div>

      <!-- User Profile Summary (Safe against null user) -->
      <div
        v-if="authStore.user"
        class="space-y-1 rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-xs sm:text-sm"
      >
        <p class="font-semibold text-slate-800">
          {{ authStore.user.email }}
        </p>
        <p class="font-medium tracking-wide text-emerald-600 uppercase">
          Peran: {{ authStore.user.role }}
        </p>
      </div>

      <!-- Logout Error Banner -->
      <div
        v-if="logoutError"
        class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-600 sm:text-sm"
        role="alert"
      >
        {{ logoutError }}
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-3 pt-2">
        <button
          type="button"
          @click="handleLogout"
          :disabled="isLoggingOut"
          class="inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span v-if="isLoggingOut">Memproses...</span>
          <span v-else>Keluar (Logout)</span>
        </button>

        <router-link
          to="/"
          class="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
        >
          Kembali ke Beranda Publik
        </router-link>
      </div>
    </div>
  </main>
</template>
