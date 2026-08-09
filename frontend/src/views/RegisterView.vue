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
  <div class="min-h-screen flex items-center justify-center bg-slate-900/90 px-4 py-12">
    <div
      class="w-full max-w-[720px] bg-white border-2 border-[#0A2353] rounded-[10px] p-10 md:p-14 shadow-2xl text-slate-800"
    >
      <div class="text-center mb-8">
        <!-- Logo / Icon Badge -->
        <div class="w-20 h-20 bg-[#0A2353]/5 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-[#0A2353]/10">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-[#0A2353]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>

        <h2 class="text-3xl font-extrabold text-[#0A2353] tracking-tight">Buat Akun SIDATA</h2>
        <p class="text-sm text-slate-600 mt-2 font-medium">Sistem Informasi Data Terpadu Kelurahan Manggar</p>
      </div>

      <div v-if="errorMessage" class="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm text-center font-medium">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm text-center font-medium">
        {{ successMessage }}
      </div>

      <form class="space-y-5 max-w-[598px] mx-auto" @submit.prevent="handleRegister">
        <div>
          <label class="block text-sm font-semibold text-[#0A2353] mb-2">Email</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="nama@email.com"
            class="w-full h-[46px] px-4 bg-white border-2 border-slate-900 rounded-[9px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0A2353] focus:ring-2 focus:ring-[#0A2353]/20 transition-all text-sm font-medium"
          />
        </div>

        <div>
          <label class="block text-sm font-semibold text-[#0A2353] mb-2">Password</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="Minimal 8 karakter"
            class="w-full h-[46px] px-4 bg-white border-2 border-slate-900 rounded-[9px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0A2353] focus:ring-2 focus:ring-[#0A2353]/20 transition-all text-sm font-medium"
          />
        </div>

        <div>
          <label class="block text-sm font-semibold text-[#0A2353] mb-2">Konfirmasi Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            placeholder="Ketik ulang password"
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
          <span v-if="isLoading">Memproses Registrasi...</span>
          <span v-else>Daftar & Kirim Kode OTP</span>
        </button>
      </form>

      <!-- Google OAuth Button -->
      <div class="mt-6 max-w-[598px] mx-auto">
        <GoogleLoginButton />
      </div>

      <div class="mt-8 text-center text-sm text-slate-600 font-medium">
        Sudah memiliki akun?
        <router-link to="/login" class="text-[#0A2353] font-bold hover:underline ml-1">Masuk ke Sistem</router-link>
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
