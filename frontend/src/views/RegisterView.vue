<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import GoogleLoginButton from '../components/auth/GoogleLoginButton.vue'
import TurnstileWidget from '../components/auth/TurnstileWidget.vue'
import OtpVerificationModal from '../components/auth/OtpVerificationModal.vue'
import { getCsrfToken } from '../utils/csrf'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const turnstileToken = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const isOtpModalOpen = ref(false)
const registeredEmail = ref('')

async function handleRegister() {
  if (!email.value || !password.value) {
    errorMessage.value = 'Email dan password wajib diisi'
    return
  }

  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Konfirmasi password tidak cocok'
    return
  }

  if (password.value.length < 8) {
    errorMessage.value = 'Password minimal 8 karakter'
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const csrfToken = await getCsrfToken()
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        turnstileToken: turnstileToken.value,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      errorMessage.value = data.error || 'Registrasi gagal. Silakan coba lagi.'
      return
    }

    if (data.requiresOtp) {
      registeredEmail.value = data.email || email.value
      isOtpModalOpen.value = true
      successMessage.value = 'Kode OTP verifikasi telah dikirim ke email Anda!'
    } else {
      successMessage.value = 'Registrasi berhasil!'
      setTimeout(() => {
        router.push('/login')
      }, 1000)
    }
  } catch {
    errorMessage.value = 'Terjadi kesalahan jaringan. Silakan coba lagi.'
  } finally {
    isLoading.value = false
  }
}

function onOtpVerified(data?: unknown) {
  isOtpModalOpen.value = false
  if (data && typeof data === 'object') {
    const payload = data as { user?: { id: string; email: string; role: string }; accessToken?: string }
    if (payload.user && payload.accessToken) {
      authStore.setAuth(payload.user, payload.accessToken)
    }
  }
  successMessage.value = 'Email berhasil diverifikasi! Mengalihkan ke aplikasi...'
  setTimeout(() => {
    router.push('/')
  }, 1000)
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-12">
    <div class="w-full max-w-md bg-slate-800/90 border border-slate-700/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl text-slate-100">
      <div class="text-center mb-8">
        <div class="inline-flex p-3 bg-blue-500/10 text-blue-400 rounded-2xl mb-3 border border-blue-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-white tracking-tight">Buat Akun SIDATA</h2>
        <p class="text-sm text-slate-400 mt-1">Sistem Informasi Data Terpadu Kelurahan Manggar</p>
      </div>

      <div v-if="errorMessage" class="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm text-center">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm text-center">
        {{ successMessage }}
      </div>

      <!-- Google OAuth Button -->
      <div class="mb-6">
        <GoogleLoginButton />
      </div>

      <div class="relative flex items-center justify-center mb-6">
        <div class="border-t border-slate-700 w-full"></div>
        <span class="bg-slate-800 px-3 text-xs text-slate-400 uppercase font-semibold tracking-wider">atau dengan email</span>
        <div class="border-t border-slate-700 w-full"></div>
      </div>

      <form class="space-y-4" @submit.prevent="handleRegister">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Email</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="nama@email.com"
            class="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Password</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="Minimal 8 karakter"
            class="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Konfirmasi Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            placeholder="Ketik ulang password"
            class="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
          />
        </div>

        <!-- Cloudflare Turnstile Anti-Bot Widget -->
        <TurnstileWidget @verify="(token) => (turnstileToken = token)" />

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 disabled:opacity-50 transition-all cursor-pointer text-sm"
        >
          <span v-if="isLoading">Memproses Registrasi...</span>
          <span v-else>Daftar & Kirim Kode OTP</span>
        </button>
      </form>

      <div class="mt-6 text-center text-sm text-slate-400">
        Sudah memiliki akun?
        <router-link to="/login" class="text-blue-400 font-semibold hover:underline">Masuk ke Sistem</router-link>
      </div>
    </div>

    <!-- OTP Verification Modal -->
    <OtpVerificationModal
      :is-open="isOtpModalOpen"
      :email="registeredEmail"
      @verified="onOtpVerified"
      @close="isOtpModalOpen = false"
    />
  </div>
</template>
