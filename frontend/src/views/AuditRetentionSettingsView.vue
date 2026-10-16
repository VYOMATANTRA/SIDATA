<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  useAuditRetentionStore,
  validateRetentionPolicy,
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
  return store.isSaving || store.isLoading || validationError.value !== null;
});

function formatDurationLabel(days: number): string {
  if (days === 0) return 'Selamanya (Keep Forever)';
  if (days % 365 === 0) return `${days / 365} Tahun (${days} hari)`;
  if (days % 30 === 0) return `${days / 30} Bulan (${days} hari)`;
  return `${days} Hari`;
}

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
    syncFormFromStore();
  },
  { deep: true },
);

onMounted(async () => {
  await store.fetchRetention();
  syncFormFromStore();
});

async function handleSubmit() {
  if (validationError.value) return;
  await store.updateRetention({ ...form.value });
}

function handleReset() {
  syncFormFromStore();
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
    <!-- Skip to Content Link per docs/ACCESSIBILITY.md §3 (2.4.1) -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      Lewati ke konten utama
    </a>

    <!-- Main Landmark -->
    <main id="main-content" class="max-w-4xl mx-auto space-y-8">
      <!-- Breadcrumb & Navigation -->
      <nav aria-label="Breadcrumb" class="flex items-center gap-2 text-sm text-slate-400">
        <RouterLink
          to="/"
          class="hover:text-slate-200 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
        >
          Beranda
        </RouterLink>
        <span aria-hidden="true" class="text-slate-600">&gt;</span>
        <RouterLink
          to="/users"
          class="hover:text-slate-200 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
        >
          Admin Portal
        </RouterLink>
        <span aria-hidden="true" class="text-slate-600">&gt;</span>
        <span class="text-slate-200 font-medium" aria-current="page">Retensi Audit</span>
      </nav>

      <!-- Page Header -->
      <header class="border-b border-slate-800 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Pengaturan Retensi Audit Log
            </h1>
            <span
              class="text-xs px-2.5 py-1 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 rounded-full uppercase tracking-wider font-semibold"
            >
              Admin Only
            </span>
          </div>
          <p class="text-slate-400 text-sm mt-1 max-w-2xl leading-relaxed">
            Atur masa penyimpanan log audit sistem berdasarkan tingkat keparahan (*severity*).
            Perubahan kebijakan retensi akan dicatat pada riwayat audit sebagai kejadian berkepentingan tinggi (*critical*).
          </p>
        </div>

        <RouterLink
          to="/users"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-medium rounded-lg border border-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          &larr; Kembali ke Manajemen Pengguna
        </RouterLink>
      </header>

      <!-- Feedback Banners -->
      <!-- Success Banner -->
      <div
        v-if="store.successMessage"
        data-test="success-banner"
        role="status"
        aria-live="polite"
        class="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-emerald-300 flex items-start gap-3 text-sm"
      >
        <svg class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
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
        class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-rose-300 flex items-start gap-3 text-sm"
      >
        <svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <p class="font-semibold text-rose-200">Terjadi Kesalahan</p>
          <p class="mt-0.5 leading-relaxed text-rose-300/90">{{ store.error }}</p>
        </div>
      </div>

      <!-- Form Container Card -->
      <section class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl space-y-6">
        <!-- Explanatory note matching SPEC §3 -->
        <div class="rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 text-xs leading-relaxed text-slate-400 space-y-1.5">
          <p class="font-medium text-slate-300 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-indigo-400 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ketentuan Kebijakan Retensi (SPEC §3):
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Nilai dinyatakan dalam <strong>hari utuh (whole days)</strong> antara 0 hingga {{ MAX_RETENTION_DAYS.toLocaleString() }} hari (maks. 100 tahun).</li>
            <li>Nilai <strong>0</strong> berarti <em>Simpan Selamanya (Keep Forever / Infinite)</em>.</li>
            <li>Aturan hierarki keamanan: <strong>critical &ge; warning &ge; info</strong> (dengan menganggap 0 sebagai tak hingga). Kejadian berkategori lebih parah tidak boleh dihapus lebih cepat dari kejadian yang lebih ringan.</li>
          </ul>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- 1. Info Severity Input -->
          <div class="space-y-2">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label for="retention-info" class="text-sm font-semibold text-slate-200">
                Retensi Log Info (Hari)
              </label>
              <span
                data-test="badge-info"
                class="text-xs font-medium px-2.5 py-0.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 self-start sm:self-auto"
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
              class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm font-mono"
            />
          </div>

          <!-- 2. Warning Severity Input -->
          <div class="space-y-2">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label for="retention-warning" class="text-sm font-semibold text-slate-200">
                Retensi Log Warning (Hari)
              </label>
              <span
                data-test="badge-warning"
                class="text-xs font-medium px-2.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 self-start sm:self-auto"
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
              class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm font-mono"
            />
          </div>

          <!-- 3. Critical Severity Input -->
          <div class="space-y-2">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label for="retention-critical" class="text-sm font-semibold text-slate-200">
                Retensi Log Critical (Hari)
              </label>
              <span
                data-test="badge-critical"
                class="text-xs font-medium px-2.5 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 self-start sm:self-auto"
              >
                {{ formatDurationLabel(form.critical) }}
              </span>
            </div>
            <p id="desc-critical" class="text-xs text-slate-400">
              Log eskalasi hak istimewa, reset kredensial, perubahan kebijakan retensi, dan aksi admin tingkat tinggi.
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
              class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm font-mono"
            />
          </div>

          <!-- Client-Side Validation Error Message -->
          <div
            v-if="validationError"
            data-test="client-validation-error"
            role="alert"
            class="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 leading-relaxed"
          >
            <svg class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ validationError }}</span>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              data-test="reset-btn"
              @click="handleReset"
              :disabled="store.isSaving || !isFormDirty"
              class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-sm font-medium rounded-lg transition"
            >
              Reset ke Semula
            </button>

            <button
              type="submit"
              data-test="submit-btn"
              :disabled="isSubmitDisabled"
              class="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/20 transition active:scale-95"
            >
              <svg
                v-if="store.isSaving"
                class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>{{ store.isSaving ? 'Menyimpan...' : 'Simpan Pengaturan' }}</span>
            </button>
          </div>
        </form>
      </section>
    </main>
  </div>
</template>
