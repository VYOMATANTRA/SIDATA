<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { getCsrfToken } from '../../utils/csrf'

const props = defineProps<{
  isOpen: boolean
  email: string
}>()

const emit = defineEmits<{
  (e: 'verified', data: unknown): void
  (e: 'close'): void
}>()

const digits = ref<string[]>(['', '', '', '', '', ''])
const inputRefs = ref<Array<HTMLInputElement | null>>([])
const isLoading = ref(false)
const isResending = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const countdown = ref(60)
let timer: ReturnType<typeof setInterval> | null = null

function startTimer() {
  countdown.value = 60
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    } else if (timer) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      digits.value = ['', '', '', '', '', '']
      errorMessage.value = ''
      successMessage.value = ''
      startTimer()
      setTimeout(() => {
        inputRefs.value[0]?.focus()
      }, 100)
    }
  },
)

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function handleInput(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  const val = target.value.replace(/\D/g, '')

  digits.value[index] = val.slice(-1)

  if (val && index < 5) {
    inputRefs.value[index + 1]?.focus()
  }

  if (digits.value.every((d) => d !== '')) {
    submitOtp()
  }
}

function handleKeyDown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    inputRefs.value[index - 1]?.focus()
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const pasted = event.clipboardData?.getData('text').replace(/\D/g, '') || ''
  if (!pasted) return

  const chars = pasted.slice(0, 6).split('')
  chars.forEach((char, i) => {
    digits.value[i] = char
  })

  const nextFocus = Math.min(chars.length, 5)
  inputRefs.value[nextFocus]?.focus()

  if (digits.value.every((d) => d !== '')) {
    submitOtp()
  }
}

async function submitOtp() {
  const otpCode = digits.value.join('')
  if (otpCode.length !== 6) {
    errorMessage.value = 'Kode OTP harus 6 digit angka'
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const csrfToken = await getCsrfToken()
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        email: props.email,
        otp: otpCode,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      errorMessage.value = data.error || 'Verifikasi gagal. Silakan periksa kode OTP Anda.'
      return
    }

    successMessage.value = 'Verifikasi berhasil! Mengalihkan...'
    setTimeout(() => {
      emit('verified', data)
    }, 800)
  } catch {
    errorMessage.value = 'Terjadi kesalahan jaringan saat verifikasi OTP'
  } finally {
    isLoading.value = false
  }
}

async function resendOtp() {
  if (countdown.value > 0 || isResending.value) return

  isResending.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const csrfToken = await getCsrfToken()
    const response = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ email: props.email }),
    })

    const data = await response.json()

    if (!response.ok) {
      errorMessage.value = data.error || 'Gagal mengirim ulang OTP.'
      return
    }

    successMessage.value = 'Kode OTP baru telah dikirim ke email Anda.'
    startTimer()
  } catch {
    errorMessage.value = 'Terjadi kesalahan jaringan saat mengirim ulang OTP'
  } finally {
    isResending.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
  >
    <div
      class="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 md:p-8 transition-all transform scale-100"
    >
      <div class="text-center mb-6">
        <div
          class="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 class="text-xl font-bold text-slate-800">Verifikasi Kode OTP</h3>
        <p class="text-sm text-slate-500 mt-1">
          Masukkan 6 digit kode yang dikirim ke <br />
          <span class="font-semibold text-slate-700">{{ email }}</span>
        </p>
      </div>

      <div
        v-if="errorMessage"
        class="mb-4 p-3 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl text-center"
      >
        {{ errorMessage }}
      </div>

      <div
        v-if="successMessage"
        class="mb-4 p-3 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl text-center"
      >
        {{ successMessage }}
      </div>

      <!-- 6 Digit Inputs -->
      <div class="flex justify-between gap-2 mb-6" @paste="handlePaste">
        <input
          v-for="(_, index) in digits"
          :key="index"
          :ref="(el) => (inputRefs[index] = el as HTMLInputElement)"
          v-model="digits[index]"
          type="text"
          inputmode="numeric"
          maxlength="1"
          class="w-12 h-14 text-center text-2xl font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all"
          @input="handleInput(index, $event)"
          @keydown="handleKeyDown(index, $event)"
        />
      </div>

      <button
        :disabled="isLoading || digits.some((d) => d === '')"
        class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        @click="submitOtp"
      >
        <span v-if="isLoading">Memverifikasi...</span>
        <span v-else>Verifikasi OTP</span>
      </button>

      <div class="mt-6 text-center text-sm text-slate-500">
        <p v-if="countdown > 0">
          Kirim ulang kode dalam <span class="font-semibold text-blue-600">{{ countdown }}s</span>
        </p>
        <button
          v-else
          :disabled="isResending"
          class="text-blue-600 font-semibold hover:underline disabled:opacity-50"
          @click="resendOtp"
        >
          <span v-if="isResending">Mengirim...</span>
          <span v-else>Kirim Ulang Kode OTP</span>
        </button>
      </div>

      <div class="mt-4 text-center">
        <button
          class="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          @click="emit('close')"
        >
          Batal / Kembali
        </button>
      </div>
    </div>
  </div>
</template>
