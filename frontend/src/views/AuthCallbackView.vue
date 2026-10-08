<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const statusMessage = ref('Memproses autentikasi Google...')
const errorMessage = ref('')

// OAuth failures never reach this view: GOOGLE_OAUTH_FAILURE_REDIRECT points at /login (see
// .env.example), which is where LoginView.vue handles the ?error=/?reason= query
// params. This view is only ever reached via the success redirect, so it just needs to
// finish the same silent-refresh flow the app already runs on every boot.
onMounted(async () => {
  const success = await authStore.initAuth()

  if (!success) {
    errorMessage.value = 'Sesi Google tidak ditemukan atau kedaluwarsa.'
    return
  }

  statusMessage.value = 'Login berhasil! Mengalihkan...'
  setTimeout(() => {
    router.push('/')
  }, 600)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50 p-4">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center border border-slate-100">
      <div v-if="errorMessage" class="space-y-4">
        <div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p class="text-rose-600 text-sm font-medium">{{ errorMessage }}</p>
        <button
          class="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
          @click="router.push('/login')"
        >
          Kembali ke Halaman Login
        </button>
      </div>

      <div v-else class="space-y-4">
        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p class="text-slate-600 font-medium text-sm">{{ statusMessage }}</p>
      </div>
    </div>
  </div>
</template>
