<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

async function handleLogout() {
  try {
    const csrfRes = await fetch('/api/auth/csrf-token')
    const csrfData = await csrfRes.json()
    const csrfToken = csrfData.csrfToken || ''

    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'x-csrf-token': csrfToken,
      },
    })
  } catch {
    // Ignore error on logout
  } finally {
    router.push('/login')
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
      
      <div class="pt-6">
        <button
          @click="handleLogout"
          class="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-xl transition-all shadow-md cursor-pointer"
        >
          Keluar (Logout)
        </button>
      </div>
    </div>
  </div>
</template>
