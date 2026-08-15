<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import TurnstileWidget from '../components/auth/TurnstileWidget.vue'
import { getCsrfToken } from '../utils/csrf'
import { useAuthStore } from '../stores/auth'
import bgImage from '../assets/img/background_laman_depan_kelurahan.png'
import logoBalikpapan from '../assets/img/logo_balikpapan.png'

const router = useRouter()
const authStore = useAuthStore()

const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)

const newPassword = ref('')
const confirmPassword = ref('')
const turnstileToken = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const isPasswordTouched = ref(false)
const isConfirmTouched = ref(false)

const passwordError = computed(() => {
  if (!isPasswordTouched.value) return ''
  if (!newPassword.value) return 'Kata sandi baru wajib diisi'
  if (newPassword.value.length < 8) return 'Kata sandi minimal 8 karakter (Standar NIST)'
  if (newPassword.value.length > 128) return 'Kata sandi maksimal 128 karakter'
  return ''
})

const confirmError = computed(() => {
  if (!isConfirmTouched.value) return ''
  if (!confirmPassword.value) return 'Konfirmasi kata sandi wajib diisi'
  if (confirmPassword.value !== newPassword.value) return 'Konfirmasi kata sandi tidak cocok'
  return ''
})

const isFormValid = computed(() => {
  return (
    newPassword.value &&
    confirmPassword.value &&
    !passwordError.value &&
    !confirmError.value &&
    newPassword.value === confirmPassword.value
  )
})

function resetTurnstile() {
  turnstileRef.value?.reset()
  turnstileToken.value = ''
}

async function handleSetupPassword() {
  isPasswordTouched.value = true
  isConfirmTouched.value = true

  if (!isFormValid.value) return

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const csrfToken = await getCsrfToken()
    const response = await fetch('/api/auth/first-login-password', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        ...(authStore.setupToken ? { Authorization: `Bearer ${authStore.setupToken}` } : {}),
      },
      body: JSON.stringify({
        setupToken: authStore.setupToken,
        newPassword: newPassword.value,
        turnstileToken: turnstileToken.value,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      errorMessage.value = data.error || 'Gagal memperbarui kata sandi. Silakan coba lagi.'
      resetTurnstile()
      return
    }

    if (data.user && data.accessToken) {
      authStore.setAuth(data.user, data.accessToken)
    }

    successMessage.value = 'Kata sandi berhasil disiapkan! Mengalihkan ke portal...'
    setTimeout(() => {
      router.push('/')
    }, 1000)
  } catch {
    errorMessage.value = 'Terjadi kesalahan jaringan. Silakan coba lagi.'
    resetTurnstile()
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="relative min-h-screen bg-slate-900 font-sans flex items-center justify-center p-4">
    <!-- Background Image with Overlay -->
    <div
      class="absolute inset-0 bg-cover bg-center opacity-30"
      :style="{ backgroundImage: `url(${bgImage})` }"
    ></div>
    <div class="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-slate-950/90"></div>

    <!-- Main Container -->
    <div class="relative w-full max-w-md bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl p-8">
      <!-- Header -->
      <div class="text-center mb-6">
        <img :src="logoBalikpapan" alt="Logo Balikpapan" class="h-16 mx-auto mb-3 drop-shadow-md" />
        <h1 class="text-2xl font-bold text-white tracking-wide">Pengaturan Kata Sandi Pertama</h1>
        <p class="text-slate-400 text-sm mt-1">
          Akun Anda memerlukan pembuatan kata sandi baru sebelum dapat melanjutkan.
        </p>
      </div>

      <!-- Alert Error -->
      <div
        v-if="errorMessage"
        class="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg flex items-center gap-2"
      >
        <span>⚠️</span>
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Alert Success -->
      <div
        v-if="successMessage"
        class="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-lg flex items-center gap-2"
      >
        <span>✅</span>
        <span>{{ successMessage }}</span>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSetupPassword" class="space-y-4">
        <!-- New Password -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Kata Sandi Baru
          </label>
          <input
            v-model="newPassword"
            type="password"
            placeholder="Minimal 8 karakter"
            @input="isPasswordTouched = true"
            class="w-full px-4 py-2.5 bg-slate-900/70 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          <p v-if="passwordError" class="text-red-400 text-xs mt-1">{{ passwordError }}</p>
        </div>

        <!-- Confirm Password -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Konfirmasi Kata Sandi Baru
          </label>
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="Ulangi kata sandi baru"
            @input="isConfirmTouched = true"
            class="w-full px-4 py-2.5 bg-slate-900/70 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          <p v-if="confirmError" class="text-red-400 text-xs mt-1">{{ confirmError }}</p>
        </div>

        <!-- Turnstile Widget -->
        <div class="my-4 flex justify-center">
          <TurnstileWidget
            ref="turnstileRef"
            @verify="(token) => (turnstileToken = token)"
            @expire="() => (turnstileToken = '')"
          />
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="isLoading || !isFormValid || !turnstileToken"
          class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition transform duration-150 active:scale-[0.98]"
        >
          <span v-if="isLoading" class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Memproses...
          </span>
          <span v-else>Simpan & Lanjutkan</span>
        </button>
      </form>
    </div>
  </div>
</template>
