<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const statusMessage = ref('Memproses autentikasi Google...');
const errorMessage = ref('');

// OAuth failures never reach this view: GOOGLE_OAUTH_FAILURE_REDIRECT points at /login (see
// backend/.env.example), which is where LoginView.vue handles the ?error=/?reason= query
// params. This view is only ever reached via the success redirect, so it just needs to
// finish the same silent-refresh flow the app already runs on every boot.
onMounted(async () => {
  const success = await authStore.initAuth();

  if (!success) {
    errorMessage.value = 'Sesi Google tidak ditemukan atau kedaluwarsa.';
    return;
  }

  statusMessage.value = 'Login berhasil! Mengalihkan...';
  setTimeout(() => {
    router.push('/');
  }, 600);
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
    <div
      class="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-lg"
    >
      <div v-if="errorMessage" class="space-y-4">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <p class="text-sm font-medium text-rose-600">{{ errorMessage }}</p>
        <button
          class="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          @click="router.push('/login')"
        >
          Kembali ke Halaman Login
        </button>
      </div>

      <div v-else class="space-y-4">
        <div
          class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
        ></div>
        <p class="text-sm font-medium text-slate-600">{{ statusMessage }}</p>
      </div>
    </div>
  </div>
</template>
