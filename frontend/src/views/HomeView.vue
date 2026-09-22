<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getCsrfToken } from '../utils/csrf'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const isLoggingOut = ref(false)
const logoutError = ref('')

async function handleLogout() {
  isLoggingOut.value = true
  logoutError.value = ''

  try {
    const csrfToken = await getCsrfToken()

    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'x-csrf-token': csrfToken,
      },
    })

    if (!response.ok) {
      logoutError.value = 'Gagal keluar dari sesi. Silakan coba lagi.'
      return
    }

    authStore.clearAuth()
    router.push('/login')
  } catch {
    logoutError.value = 'Terjadi kesalahan jaringan saat keluar. Silakan coba lagi.'
  } finally {
    isLoggingOut.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
    <div class="space-y-4">
      <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight">Login Berhasil</h1>
      <p class="text-slate-500 text-sm">Selamat datang di Sistem Informasi Data Terpadu Kelurahan Manggar</p>

      <div v-if="logoutError" class="text-rose-600 text-sm font-medium">{{ logoutError }}</div>

      <div class="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <router-link
          to="/mockup/button"
          class="px-5 py-2.5 bg-brand-navy hover:bg-brand-navy-deep text-white font-medium text-sm rounded-btn transition-all shadow-md cursor-pointer flex items-center gap-2"
        >
          <span>❖ Lihat Mockup Button</span>
        </router-link>

        <button
          @click="handleLogout"
          :disabled="isLoggingOut"
          class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-medium text-sm rounded-btn transition-all cursor-pointer disabled:opacity-50"
        >
          <span v-if="isLoggingOut">Memproses...</span>
          <span v-else>Keluar (Logout)</span>
        </button>
      </div>
    </div>
  </div>
</template>
