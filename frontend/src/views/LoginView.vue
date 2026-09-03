<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import GoogleLoginButton from '../components/auth/GoogleLoginButton.vue';
import TurnstileWidget from '../components/auth/TurnstileWidget.vue';
import OtpVerificationModal from '../components/auth/OtpVerificationModal.vue';
import { getCsrfToken } from '../utils/csrf';
import { useAuthStore } from '../stores/auth';
import bgImage from '../assets/img/background_laman_depan_kelurahan.png';
import logoBalikpapan from '../assets/img/logo_balikpapan.png';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null);

const email = ref('');
const password = ref('');
const turnstileToken = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const serverEmailError = ref('');
const serverPasswordError = ref('');

const isEmailTouched = ref(false);
const isPasswordTouched = ref(false);

const isOtpModalOpen = ref(false);
const unverifiedEmail = ref('');

const emailError = computed(() => {
  if (serverEmailError.value) return serverEmailError.value;
  if (!isEmailTouched.value) return '';
  if (!email.value.trim()) return 'Email wajib diisi';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.value.trim()))
    return 'Format email tidak valid (contoh: nama@email.com)';
  return '';
});

const passwordError = computed(() => {
  if (serverPasswordError.value) return serverPasswordError.value;
  if (!isPasswordTouched.value) return '';
  if (!password.value) return 'Password wajib diisi';
  return '';
});

const isFormValid = computed(() => {
  return email.value.trim() && password.value && !emailError.value && !passwordError.value;
});

function onEmailInput() {
  isEmailTouched.value = true;
  serverEmailError.value = '';
}

function onPasswordInput() {
  isPasswordTouched.value = true;
  serverPasswordError.value = '';
}

function resetTurnstile() {
  turnstileRef.value?.reset();
  turnstileToken.value = '';
}

onMounted(() => {
  if (route.query.reason === 'setup_required') {
    errorMessage.value =
      'Sesi penyiapan kata sandi tidak ditemukan atau telah kedaluwarsa. Silakan masuk kembali untuk melanjutkan.'
    return
  }
  if (route.query.error === 'oauth_failed' || route.query.reason) {
    const reason = route.query.reason ? String(route.query.reason) : '';
    errorMessage.value = reason
      ? `Gagal masuk dengan Google (${reason}). Silakan coba lagi.`
      : 'Gagal masuk dengan Google. Silakan coba lagi.';
  }
});

async function handleLogin() {
  isEmailTouched.value = true;
  isPasswordTouched.value = true;
  serverEmailError.value = '';
  serverPasswordError.value = '';

  if (!isFormValid.value) {
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const csrfToken = await getCsrfToken();
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
        turnstileToken: turnstileToken.value,
      }),
    });

    const data = await response.json();

    if (response.status === 403 && data.requiresOtp) {
      unverifiedEmail.value = data.email || email.value.trim();
      isOtpModalOpen.value = true;
      errorMessage.value =
        data.error || 'Email Anda belum diverifikasi. Silakan masukkan kode OTP.';
      resetTurnstile();
      return;
    }

    if (data.status === 'REQUIRES_PASSWORD_CHANGE' || data.mustChangePassword) {
      authStore.setSetupAuth(data.setupToken)
      successMessage.value = 'Login berhasil! Silakan atur kata sandi baru Anda...'
      setTimeout(() => {
        router.push('/setup-password')
      }, 600)
      return
    }

    if (!response.ok) {
      const errText = data.error || 'Login gagal. Silakan periksa kredensial Anda.';
      if (
        response.status === 401 ||
        errText.toLowerCase().includes('password') ||
        errText.toLowerCase().includes('kredensial')
      ) {
        serverPasswordError.value = errText;
      } else if (errText.toLowerCase().includes('email')) {
        serverEmailError.value = errText;
      } else {
        errorMessage.value = errText;
      }
      resetTurnstile();
      return;
    }

    if (data.user && data.accessToken) {
      authStore.setAuth(data.user, data.accessToken);
    }

    successMessage.value = 'Login berhasil! Mengalihkan ke aplikasi...';
    setTimeout(() => {
      router.push('/');
    }, 800);
  } catch {
    errorMessage.value = 'Terjadi kesalahan jaringan. Silakan coba lagi.';
    resetTurnstile();
  } finally {
    isLoading.value = false;
  }
}

function onOtpVerified(data?: unknown) {
  isOtpModalOpen.value = false;
  if (data && typeof data === 'object') {
    const payload = data as {
      user?: { id: string; email: string; role: string };
      accessToken?: string;
    };
    if (payload.user && payload.accessToken) {
      authStore.setAuth(payload.user, payload.accessToken);
    }
  }
  successMessage.value = 'Email terverifikasi & login berhasil! Mengalihkan...';
  setTimeout(() => {
    router.push('/');
  }, 800);
}
</script>

<template>
  <div
    class="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-4 py-12"
    :style="{ backgroundImage: `url(${bgImage})` }"
  >
    <!-- Background overlay for high contrast readability -->
    <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"></div>

    <div
      class="relative z-10 w-full max-w-[720px] rounded-[10px] border-2 border-[#0A2353] bg-white p-10 text-slate-800 shadow-2xl md:p-14"
    >
      <div class="mb-8 text-center">
        <!-- Logo Kota Balikpapan -->
        <img
          :src="logoBalikpapan"
          alt="Logo Kota Balikpapan"
          class="mx-auto mb-4 h-24 w-20 object-contain"
        />

        <h2 class="text-3xl font-extrabold tracking-tight text-[#0A2353]">Login</h2>
        <p class="mt-2 text-sm font-medium text-slate-600">
          Silahkan masuk ke akun anda terlebih dahulu
        </p>
      </div>

      <div
        v-if="errorMessage"
        class="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-sm font-medium text-rose-700"
      >
        {{ errorMessage }}
      </div>

      <div
        v-if="successMessage"
        class="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700"
      >
        {{ successMessage }}
      </div>

      <form class="mx-auto max-w-[598px] space-y-6" @submit.prevent="handleLogin">
        <div>
          <label
            class="mb-2 block text-sm font-semibold transition-colors"
            :class="emailError ? 'text-rose-600' : 'text-[#0A2353]'"
            >Email</label
          >
          <input
            v-model="email"
            type="email"
            required
            placeholder="Masukkan email anda"
            @blur="isEmailTouched = true"
            @input="onEmailInput"
            class="h-[46px] w-full rounded-[9px] border-2 bg-white px-4 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:outline-none"
            :class="
              emailError
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : 'border-slate-900 focus:border-[#0A2353] focus:ring-2 focus:ring-[#0A2353]/20'
            "
          />
          <div
            v-if="emailError"
            class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 shrink-0 text-rose-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span>{{ emailError }}</span>
          </div>
        </div>

        <div>
          <label
            class="mb-2 block text-sm font-semibold transition-colors"
            :class="passwordError ? 'text-rose-600' : 'text-[#0A2353]'"
            >Password</label
          >
          <input
            v-model="password"
            type="password"
            required
            placeholder="Masukkan password anda"
            @blur="isPasswordTouched = true"
            @input="onPasswordInput"
            class="h-[46px] w-full rounded-[9px] border-2 bg-white px-4 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:outline-none"
            :class="
              passwordError
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : 'border-slate-900 focus:border-[#0A2353] focus:ring-2 focus:ring-[#0A2353]/20'
            "
          />
          <div
            v-if="passwordError"
            class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 shrink-0 text-rose-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span>{{ passwordError }}</span>
          </div>
        </div>

        <!-- Cloudflare Turnstile Anti-Bot Widget -->
        <TurnstileWidget ref="turnstileRef" @verify="(token) => (turnstileToken = token)" />

        <button
          type="submit"
          :disabled="isLoading"
          class="h-[48px] w-full cursor-pointer rounded-[9px] bg-[#0A2353] text-base font-bold tracking-wide text-white shadow-lg shadow-[#0A2353]/20 transition-all hover:bg-[#07193c] disabled:opacity-50"
        >
          <span v-if="isLoading">Memproses...</span>
          <span v-else>Masuk ke Aplikasi</span>
        </button>
      </form>

      <!-- Divider with 'Atau' text -->
      <div class="relative mx-auto my-6 flex max-w-[598px] items-center justify-center">
        <div class="w-full border-t border-slate-200"></div>
        <span class="bg-white px-4 text-xs font-bold tracking-wider text-slate-500 uppercase"
          >Atau</span
        >
        <div class="w-full border-t border-slate-200"></div>
      </div>

      <!-- Google OAuth Button -->
      <div class="mx-auto mb-6 max-w-[598px]">
        <GoogleLoginButton />
      </div>

      <div class="mt-8 text-center text-sm font-medium text-slate-600">
        Belum memiliki akun?
        <router-link to="/register" class="ml-1 font-bold text-[#0A2353] hover:underline"
          >Daftar Akun Baru</router-link
        >
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
