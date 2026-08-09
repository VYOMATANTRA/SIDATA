<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import GoogleLoginButton from '../components/auth/GoogleLoginButton.vue'
import TurnstileWidget from '../components/auth/TurnstileWidget.vue'
import OtpVerificationModal from '../components/auth/OtpVerificationModal.vue'
import { getCsrfToken } from '../utils/csrf'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const turnstileToken = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const isOtpModalOpen = ref(false)
const unverifiedEmail = ref('')

onMounted(() => {
  if (route.query.error === 'oauth_failed' || route.query.reason) {
    const reason = route.query.reason ? String(route.query.reason) : ''
    errorMessage.value = reason
      ? `Gagal masuk dengan Google (${reason}). Silakan coba lagi.`
      : 'Gagal masuk dengan Google. Silakan coba lagi.'
  }
})

async function handleLogin() {
  if (!email.value || !password.value) {
    errorMessage.value = 'Email dan password wajib diisi'
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const csrfToken = await getCsrfToken()
    const response = await fetch('/api/auth/login', {
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

    if (response.status === 403 && data.requiresOtp) {
      unverifiedEmail.value = data.email || email.value
      isOtpModalOpen.value = true
      errorMessage.value = data.error || 'Email Anda belum diverifikasi. Silakan masukkan kode OTP.'
      return
    }

    if (!response.ok) {
      errorMessage.value = data.error || 'Login gagal. Silakan periksa kredensial Anda.'
      return
    }

    if (data.user && data.accessToken) {
      authStore.setAuth(data.user, data.accessToken)
    }

    successMessage.value = 'Login berhasil! Mengalihkan ke aplikasi...'
    setTimeout(() => {
      router.push('/')
    }, 800)
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
  successMessage.value = 'Email terverifikasi & login berhasil! Mengalihkan...'
  setTimeout(() => {
    router.push('/')
  }, 800)
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-900/90 px-4 py-12">
    <div
      class="w-full max-w-[720px] bg-white border-2 border-[#0A2353] rounded-[10px] p-10 md:p-14 shadow-2xl text-slate-800"
    >
      <div class="text-center mb-8">
        <!-- Logo / Icon Badge -->
        <div class="w-20 h-20 bg-[#0A2353]/5 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-[#0A2353]/10">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-[#0A2353]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h2 class="text-3xl font-extrabold text-[#0A2353] tracking-tight">Login</h2>
        <p class="text-sm text-slate-600 mt-2 font-medium">Silahkan masuk ke akun anda terlebih dahulu</p>
      </div>

      <div v-if="errorMessage" class="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm text-center font-medium">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm text-center font-medium">
        {{ successMessage }}
      </div>

      <!-- Google OAuth Button -->
      <div class="mb-6 max-w-[598px] mx-auto">
        <GoogleLoginButton />
      </div>

      <div class="relative flex items-center justify-center mb-6 max-w-[598px] mx-auto">
        <div class="border-t border-slate-200 w-full"></div>
        <span class="bg-white px-3 text-xs text-slate-500 uppercase font-semibold tracking-wider">atau dengan email</span>
        <div class="border-t border-slate-200 w-full"></div>
      </div>

      <form class="space-y-6 max-w-[598px] mx-auto" @submit.prevent="handleLogin">
        <div>
          <label class="block text-sm font-semibold text-[#0A2353] mb-2">Email</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="Masukkan email anda"
            class="w-full h-[46px] px-4 bg-white border-2 border-slate-900 rounded-[9px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0A2353] focus:ring-2 focus:ring-[#0A2353]/20 transition-all text-sm font-medium"
          />
        </div>

        <div>
          <label class="block text-sm font-semibold text-[#0A2353] mb-2">Password</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="Masukkan password anda"
            class="w-full h-[46px] px-4 bg-white border-2 border-slate-900 rounded-[9px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0A2353] focus:ring-2 focus:ring-[#0A2353]/20 transition-all text-sm font-medium"
          />
        </div>

        <!-- Cloudflare Turnstile Anti-Bot Widget -->
        <TurnstileWidget @verify="(token) => (turnstileToken = token)" />

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full h-[48px] bg-[#0A2353] hover:bg-[#07193c] text-white font-bold rounded-[9px] shadow-lg shadow-[#0A2353]/20 disabled:opacity-50 transition-all cursor-pointer text-base tracking-wide"
        >
          <span v-if="isLoading">Memproses...</span>
          <span v-else>Masuk ke Aplikasi</span>
        </button>
      </form>

      <div class="mt-8 text-center text-sm text-slate-600 font-medium">
        Belum memiliki akun?
        <router-link to="/register" class="text-[#0A2353] font-bold hover:underline ml-1">Daftar Akun Baru</router-link>
      </div>
    </div>

    <!-- OTP Verification Modal -->
    <OtpVerificationModal
      :is-open="isOtpModalOpen"
      :email="unverifiedEmail"
      @verified="onOtpVerified"
      @close="isOtpModalOpen = false"
    />
  </div>
</template>
