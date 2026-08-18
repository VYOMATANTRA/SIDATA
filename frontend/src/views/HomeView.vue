<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { getCsrfToken } from '../utils/csrf';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const isLoggingOut = ref(false);
const logoutError = ref('');

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
  <div class="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center">
    <div class="space-y-4">
      <div
        class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
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
      <h1 class="text-3xl font-bold tracking-tight text-slate-900">Login Berhasil</h1>
      <p class="text-sm text-slate-500">
        Selamat datang di Sistem Informasi Data Terpadu Kelurahan Manggar
      </p>

      <div v-if="logoutError" class="text-sm font-medium text-rose-600">{{ logoutError }}</div>

      <div class="flex flex-col items-center justify-center gap-3 pt-6 sm:flex-row">
        <router-link
          to="/peta"
          class="bg-brand-biru-hytam hover:bg-brand-ubi-ungu text-body-sm rounded-btn flex cursor-pointer items-center gap-2 px-5 py-2.5 font-medium text-white shadow-md transition-all"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          Lihat Peta Interaktif (POC)
        </router-link>

        <button
          @click="handleLogout"
          :disabled="isLoggingOut"
          class="text-body-sm rounded-btn cursor-pointer border border-slate-200 bg-slate-100 px-5 py-2.5 font-medium text-slate-800 transition-all hover:bg-slate-200 disabled:opacity-50"
        >
          <span v-if="isLoggingOut">Memproses...</span>
          <span v-else>Keluar (Logout)</span>
        </button>
      </div>
    </div>
  </div>
</template>
