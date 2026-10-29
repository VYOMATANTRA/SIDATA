<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  useAuditRetentionStore,
  validateRetentionPolicy,
  formatDurationLabel,
  MAX_RETENTION_DAYS,
  type AuditRetentionPolicy,
} from '../stores/auditRetention.store';

const store = useAuditRetentionStore();

// Local form state
const form = ref<AuditRetentionPolicy>({
  info: 0,
  warning: 0,
  critical: 0,
});

const isLoaded = ref(false);

const isFormDirty = computed(() => {
  return (
    form.value.info !== store.retention.info ||
    form.value.warning !== store.retention.warning ||
    form.value.critical !== store.retention.critical
  );
});

const validationError = computed(() => {
  return validateRetentionPolicy(form.value);
});

const isSubmitDisabled = computed(() => {
  return !isLoaded.value || store.isSaving || store.isLoading || validationError.value !== null;
});

function syncFormFromStore() {
  form.value = {
    info: store.retention.info,
    warning: store.retention.warning,
    critical: store.retention.critical,
  };
}

watch(
  () => store.retention,
  () => {
    if (isLoaded.value) {
      syncFormFromStore();
    }
  },
  { deep: true },
);

async function loadSettings() {
  const ok = await store.fetchRetention();
  if (ok) {
    isLoaded.value = true;
    syncFormFromStore();
  } else {
    isLoaded.value = false;
  }
}

onMounted(async () => {
  await loadSettings();
});

async function handleSubmit() {
  if (!isLoaded.value || validationError.value) return;
  await store.updateRetention({ ...form.value });
}

function handleReset() {
  if (isLoaded.value) {
    syncFormFromStore();
  }
}
</script>

<template>
  <!-- AdminLayout supplies the page's skip link, <main>, <h1>, and breadcrumb; this view
       keeps its own dark panel styling, demoted to <h2>. -->
  <div class="space-y-8 rounded-2xl bg-slate-950 p-6 font-sans text-slate-100 md:p-10">
    <div class="mx-auto max-w-4xl space-y-8">
      <!-- Page Header -->
      <div
        class="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center"
      >
        <div>
          <div class="flex items-center gap-3">
            <h2 class="text-2xl font-extrabold tracking-tight text-white md:text-3xl">
              Pengaturan Retensi Audit Log
            </h2>
            <span
              class="rounded-full border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold tracking-wider text-indigo-300 uppercase"
            >
              Admin Only
            </span>
          </div>
          <p class="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
            Atur masa penyimpanan log audit sistem berdasarkan tingkat keparahan
            (<em>severity</em>). Perubahan kebijakan retensi akan dicatat pada riwayat audit sebagai
            kejadian berkepentingan tinggi (<em>critical</em>).
          </p>
        </div>

        <RouterLink
          to="/users"
          class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
        >
          &larr; Kembali ke Manajemen Pengguna
        </RouterLink>
      </div>

      <!-- Feedback Banners -->
      <!-- Success Banner -->
      <div
        v-if="store.successMessage"
        data-test="success-banner"
        role="status"
        aria-live="polite"
        class="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-300"
      >
        <svg
          class="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <div class="flex-1">
          <p class="font-semibold text-emerald-200">{{ store.successMessage }}</p>
        </div>
      </div>

      <!-- Server Error Banner -->
      <div
        v-if="store.error"
        data-test="server-error-banner"
        role="alert"
        aria-live="assertive"
        class="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300"
      >
        <svg
          class="mt-0.5 h-5 w-5 shrink-0 text-rose-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div class="flex-1">
          <p class="font-semibold text-rose-200">Terjadi Kesalahan</p>
          <p class="mt-0.5 leading-relaxed text-rose-300/90">{{ store.error }}</p>
          <button
            v-if="!isLoaded"
            type="button"
            data-test="retry-btn"
            @click="loadSettings"
            :disabled="store.isLoading"
            class="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-700/50 bg-rose-900/60 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-900 disabled:opacity-50"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{{ store.isLoading ? 'Memuat ulang...' : 'Coba Lagi' }}</span>
          </button>
        </div>
      </div>

      <!-- Form Container Card -->
      <section
        class="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl md:p-8"
      >
        <!-- Explanatory note matching SPEC §3 -->
        <div
          class="space-y-1.5 rounded-xl border border-slate-800/80 bg-slate-950/70 p-4 text-xs leading-relaxed text-slate-400"
        >
          <p class="flex items-center gap-1.5 font-medium text-slate-300">
            <svg
              class="inline h-4 w-4 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Ketentuan Kebijakan Retensi (SPEC §3):
          </p>
          <ul class="list-disc space-y-1 pl-5">
            <li>
              Nilai dinyatakan dalam <strong>hari utuh (whole days)</strong> antara 0 hingga
              {{ MAX_RETENTION_DAYS.toLocaleString() }} hari (maks. 100 tahun).
            </li>
            <li>
              Nilai <strong>0</strong> berarti <em>Simpan Selamanya (Keep Forever / Infinite)</em>.
            </li>
            <li>
              Aturan hierarki keamanan: <strong>critical &ge; warning &ge; info</strong> (dengan
              menganggap 0 sebagai tak hingga). Kejadian berkategori lebih parah tidak boleh dihapus
              lebih cepat dari kejadian yang lebih ringan.
            </li>
          </ul>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- 1. Info Severity Input -->
          <div class="space-y-2">
            <div class="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
              <label for="retention-info" class="text-sm font-semibold text-slate-200">
                Retensi Log Info (Hari)
              </label>
              <span
                data-test="badge-info"
                class="self-start rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300 sm:self-auto"
              >
                {{ formatDurationLabel(form.info) }}
              </span>
            </div>
            <p id="desc-info" class="text-xs text-slate-400">
              Log aktivitas umum seperti login sukses, logout, atau pembacaan data publik.
            </p>
            <input
              id="retention-info"
              v-model.number="form.info"
              type="number"
              min="0"
              :max="MAX_RETENTION_DAYS"
              step="1"
              aria-describedby="desc-info"
              :aria-invalid="validationError !== null"
              required
              class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <!-- 2. Warning Severity Input -->
          <div class="space-y-2">
            <div class="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
              <label for="retention-warning" class="text-sm font-semibold text-slate-200">
                Retensi Log Warning (Hari)
              </label>
              <span
                data-test="badge-warning"
                class="self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 sm:self-auto"
              >
                {{ formatDurationLabel(form.warning) }}
              </span>
            </div>
            <p id="desc-warning" class="text-xs text-slate-400">
              Log peringatan seperti kegagalan autentikasi berulang atau anomali input data.
            </p>
            <input
              id="retention-warning"
              v-model.number="form.warning"
              type="number"
              min="0"
              :max="MAX_RETENTION_DAYS"
              step="1"
              aria-describedby="desc-warning"
              :aria-invalid="validationError !== null"
              required
              class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <!-- 3. Critical Severity Input -->
          <div class="space-y-2">
            <div class="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
              <label for="retention-critical" class="text-sm font-semibold text-slate-200">
                Retensi Log Critical (Hari)
              </label>
              <span
                data-test="badge-critical"
                class="self-start rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-300 sm:self-auto"
              >
                {{ formatDurationLabel(form.critical) }}
              </span>
            </div>
            <p id="desc-critical" class="text-xs text-slate-400">
              Log eskalasi hak istimewa, reset kredensial, perubahan kebijakan retensi, dan aksi
              admin tingkat tinggi.
            </p>
            <input
              id="retention-critical"
              v-model.number="form.critical"
              type="number"
              min="0"
              :max="MAX_RETENTION_DAYS"
              step="1"
              aria-describedby="desc-critical"
              :aria-invalid="validationError !== null"
              required
              class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <!-- Client-Side Validation Error Message -->
          <div
            v-if="validationError"
            data-test="client-validation-error"
            role="alert"
            class="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs leading-relaxed text-rose-300"
          >
            <svg
              class="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{{ validationError }}</span>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              data-test="reset-btn"
              @click="handleReset"
              :disabled="store.isSaving || !isFormDirty"
              class="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset ke Semula
            </button>

            <button
              type="submit"
              data-test="submit-btn"
              :disabled="isSubmitDisabled"
              class="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              <svg
                v-if="store.isSaving"
                class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>{{ store.isSaving ? 'Menyimpan...' : 'Simpan Pengaturan' }}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>
