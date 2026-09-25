<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TurnstileWidget from '../components/auth/TurnstileWidget.vue';
import { getCsrfToken } from '../utils/csrf';
import { useAuthStore } from '../stores/auth';
import bgImage from '../assets/img/background_laman_depan_kelurahan.png';
import logoBalikpapan from '../assets/img/logo_balikpapan.png';

const router = useRouter();
const authStore = useAuthStore();

onMounted(() => {
  if (!authStore.setupToken && !authStore.mustChangePassword) {
    router.replace({ name: 'login', query: { reason: 'setup_required' } });
  }
});

const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null);

const newPassword = ref('');
const confirmPassword = ref('');
const turnstileToken = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const serverPasswordError = ref('');

const isPasswordTouched = ref(false);
const isConfirmTouched = ref(false);

const COMMON_WEAK_PASSWORDS = [
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'qwertyui',
  'qwerty123',
  'indonesia',
  'admin1234',
];

function isWeakPassword(pwd: string, mail: string): boolean {
  const lower = pwd.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.includes(lower)) return true;
  if (mail) {
    const parts = mail.split('@');
    const prefix = (parts[0] || '').toLowerCase();
    if (prefix && prefix.length >= 3 && lower.includes(prefix)) return true;
  }
  return false;
}

const passwordError = computed(() => {
  if (serverPasswordError.value) return serverPasswordError.value;
  if (!isPasswordTouched.value) return '';
  if (!newPassword.value) return 'Kata sandi baru wajib diisi';
  if (newPassword.value.length < 8) return 'Kata sandi minimal harus 8 karakter.';
  if (newPassword.value.length > 128) return 'Kata sandi terlalu panjang (maksimal 128 karakter).';
  if (isWeakPassword(newPassword.value, authStore.user?.email || ''))
    return 'Kata sandi terlalu lemah atau umum digunakan.';
  return '';
});

const confirmError = computed(() => {
  if (!isConfirmTouched.value) return '';
  if (!confirmPassword.value) return 'Konfirmasi kata sandi wajib diisi';
  if (confirmPassword.value !== newPassword.value) return 'Konfirmasi kata sandi tidak cocok';
  return '';
});

const isFormValid = computed(() => {
  return (
    newPassword.value &&
    confirmPassword.value &&
    newPassword.value.length >= 8 &&
    newPassword.value.length <= 128 &&
    !isWeakPassword(newPassword.value, authStore.user?.email || '') &&
    newPassword.value === confirmPassword.value &&
    !passwordError.value &&
    !confirmError.value
  );
});

function onPasswordInput() {
  isPasswordTouched.value = true;
  serverPasswordError.value = '';
}

function resetTurnstile() {
  turnstileRef.value?.reset();
  turnstileToken.value = '';
}

async function handleSetupPassword() {
  isPasswordTouched.value = true;
  isConfirmTouched.value = true;
  serverPasswordError.value = '';

  if (!isFormValid.value) return;

  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const csrfToken = await getCsrfToken();
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
    });

    const data = await response.json();

    if (!response.ok) {
      const errText = data.error || 'Gagal memperbarui kata sandi. Silakan coba lagi.';
      if (response.status === 401 || response.status === 403) {
        errorMessage.value = `${errText} Mengalihkan ke halaman login...`;
        authStore.clearAuth();
        setTimeout(() => {
          router.push({ name: 'login', query: { reason: 'setup_required' } });
        }, 2000);
      } else if (
        errText.toLowerCase().includes('password') ||
        errText.toLowerCase().includes('sandi')
      ) {
        serverPasswordError.value = errText;
      } else {
        errorMessage.value = errText;
      }
      resetTurnstile();
      return;
    }

    if (data.user && data.accessToken) {
      authStore.setAuth(data.user, data.accessToken);
    }

    successMessage.value = 'Kata sandi berhasil disiapkan! Mengalihkan ke portal...';
    setTimeout(() => {
      router.push('/');
    }, 1000);
  } catch {
    errorMessage.value = 'Terjadi kesalahan jaringan. Silakan coba lagi.';
    resetTurnstile();
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center bg-slate-900 p-4 font-sans">
    <!-- Background Image with Overlay -->
    <div
      class="absolute inset-0 bg-cover bg-center opacity-30"
      :style="{ backgroundImage: `url(${bgImage})` }"
    ></div>
    <div
      class="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-slate-950/90"
    ></div>

    <!-- Main Container -->
    <div
      class="relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-800/80 p-8 shadow-2xl backdrop-blur-xl"
    >
      <!-- Header -->
      <div class="mb-6 text-center">
        <img :src="logoBalikpapan" alt="Logo Balikpapan" class="mx-auto mb-3 h-16 drop-shadow-md" />
        <h1 class="text-2xl font-bold tracking-wide text-white">Pengaturan Kata Sandi Pertama</h1>
        <p class="mt-1 text-sm text-slate-400">
          Akun Anda memerlukan pembuatan kata sandi baru sebelum dapat melanjutkan.
        </p>
      </div>

      <!-- Alert Error -->
      <div
        v-if="errorMessage"
        class="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
      >
        <span>⚠️</span>
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Alert Success -->
      <div
        v-if="successMessage"
        class="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400"
      >
        <span>✅</span>
        <span>{{ successMessage }}</span>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSetupPassword" class="space-y-4">
        <!-- New Password -->
        <div>
          <label
            class="mb-1 block text-xs font-semibold tracking-wider uppercase transition-colors"
            :class="passwordError ? 'text-rose-400' : 'text-slate-300'"
          >
            Kata Sandi Baru
          </label>
          <input
            v-model="newPassword"
            type="password"
            required
            placeholder="Minimal 8 karakter"
            @blur="isPasswordTouched = true"
            @input="onPasswordInput"
            class="w-full rounded-lg border-2 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-white placeholder-slate-500 transition focus:outline-none"
            :class="
              passwordError
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : 'border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
            "
          />
          <div
            v-if="passwordError"
            class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 shrink-0 text-rose-400"
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

        <!-- Confirm Password -->
        <div>
          <label
            class="mb-1 block text-xs font-semibold tracking-wider uppercase transition-colors"
            :class="confirmError ? 'text-rose-400' : 'text-slate-300'"
          >
            Konfirmasi Kata Sandi Baru
          </label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            placeholder="Ulangi kata sandi baru"
            @blur="isConfirmTouched = true"
            @input="isConfirmTouched = true"
            class="w-full rounded-lg border-2 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-white placeholder-slate-500 transition focus:outline-none"
            :class="
              confirmError
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : 'border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
            "
          />
          <div
            v-if="confirmError"
            class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 shrink-0 text-rose-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span>{{ confirmError }}</span>
          </div>
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
          class="w-full rounded-lg px-4 py-3 text-sm font-semibold tracking-wide shadow-lg transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          :class="
            isLoading || !isFormValid || !turnstileToken
              ? 'bg-slate-700 text-slate-400 shadow-none'
              : 'cursor-pointer bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-indigo-500/20 hover:from-indigo-500 hover:to-blue-500'
          "
        >
          <span v-if="isLoading" class="flex items-center justify-center gap-2">
            <svg class="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
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
