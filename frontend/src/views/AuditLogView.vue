<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  ShieldCheckIcon,
  FunnelIcon,
  XMarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/vue/24/outline'
import { useAuditStore, type AuditLogItem } from '../stores/audit.store'

const auditStore = useAuditStore()

const expandedId = ref<string | null>(null)
const acknowledgingId = ref<string | null>(null)
const acknowledgeError = ref<string | null>(null)

const filterForm = ref({
  severity: '' as '' | 'info' | 'warning' | 'critical',
  outcome: '' as '' | 'success' | 'failure',
  acknowledged: '' as '' | 'true' | 'false',
  action: '',
  from: '',
  to: '',
})

const totalPages = computed(() => Math.max(1, Math.ceil(auditStore.total / auditStore.pageSize)))

const pageRangeLabel = computed(
  () => `Halaman ${auditStore.page} dari ${totalPages.value} — ${auditStore.total} entri`,
)

const hasActiveFilters = computed(() => {
  const f = auditStore.filters
  return !!(f.severity || f.outcome || f.acknowledged !== null || f.action || f.from || f.to)
})

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(iso),
  )
}

function severityClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    case 'warning':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    default:
      return 'bg-sky-500/10 text-sky-400 border-sky-500/30'
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'Critical'
    case 'warning':
      return 'Warning'
    default:
      return 'Info'
  }
}

function isOpenCritical(log: AuditLogItem): boolean {
  return log.severity === 'critical' && log.acknowledgedAt == null
}

function targetLabel(log: AuditLogItem): string {
  return log.targetLabel || log.targetId || '-'
}

function toggleExpanded(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function applyFilters() {
  const f = filterForm.value
  auditStore.applyFilters({
    severity: f.severity,
    outcome: f.outcome,
    acknowledged: f.acknowledged === '' ? null : f.acknowledged === 'true',
    action: f.action,
    from: f.from,
    to: f.to,
  })
}

function clearFilters() {
  filterForm.value = { severity: '', outcome: '', acknowledged: '', action: '', from: '', to: '' }
  auditStore.resetFilters()
  auditStore.goToPage(1)
}

async function handleAcknowledge(log: AuditLogItem) {
  acknowledgingId.value = log.id
  acknowledgeError.value = null
  try {
    await auditStore.acknowledgeLog(log.id)
  } catch (err: unknown) {
    acknowledgeError.value =
      err instanceof Error ? err.message : 'Gagal meng-acknowledge audit log.'
  } finally {
    acknowledgingId.value = null
  }
}

onMounted(async () => {
  await Promise.all([auditStore.fetchLogs(), auditStore.fetchSummary()])
})
</script>

<template>
  <main class="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- Top Bar / Header -->
      <div
        class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6"
      >
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <ShieldCheckIcon class="w-8 h-8 text-indigo-400" aria-hidden="true" />
            <span>Log Audit</span>
            <span
              class="text-xs px-2.5 py-1 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 rounded-full uppercase tracking-wider font-semibold"
            >
              Admin Portal
            </span>
          </h1>
          <p class="text-slate-400 text-sm mt-1">
            Jejak aktivitas keamanan & administrasi sistem. Baris critical harus di-acknowledge
            oleh admin.
          </p>
        </div>
      </div>

      <!-- Summary Strip -->
      <div v-if="auditStore.summary" class="flex flex-wrap items-center gap-3" role="status">
        <span
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30"
        >
          Info: {{ auditStore.summary.counts.info }}
        </span>
        <span
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30"
        >
          Warning: {{ auditStore.summary.counts.warning }}
        </span>
        <span
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30"
        >
          Critical: {{ auditStore.summary.counts.critical }}
        </span>
        <span
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          :class="
            auditStore.summary.openCritical > 0
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          "
        >
          Critical terbuka: {{ auditStore.summary.openCritical }}
        </span>
        <span class="text-xs text-slate-500">
          (7 hari terakhir, {{ formatDate(auditStore.summary.since) }}–)
        </span>
      </div>

      <!-- Filters -->
      <form
        class="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4"
        @submit.prevent="applyFilters"
      >
        <fieldset class="flex items-center gap-2 text-slate-300">
          <legend class="sr-only">Filter log audit</legend>
          <FunnelIcon class="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span class="text-xs font-semibold uppercase tracking-wider">Filter</span>
        </fieldset>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label for="filter-severity" class="block text-xs font-semibold text-slate-300 mb-1">
              Tingkat
            </label>
            <select
              id="filter-severity"
              v-model="filterForm.severity"
              class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Semua</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label for="filter-outcome" class="block text-xs font-semibold text-slate-300 mb-1">
              Hasil
            </label>
            <select
              id="filter-outcome"
              v-model="filterForm.outcome"
              class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Semua</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </div>

          <div>
            <label for="filter-acknowledged" class="block text-xs font-semibold text-slate-300 mb-1">
              Status Acknowledge
            </label>
            <select
              id="filter-acknowledged"
              v-model="filterForm.acknowledged"
              class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Semua</option>
              <option value="false">Terbuka</option>
              <option value="true">Diakui</option>
            </select>
          </div>

          <div>
            <label for="filter-action" class="block text-xs font-semibold text-slate-300 mb-1">
              Aksi
            </label>
            <input
              id="filter-action"
              v-model="filterForm.action"
              type="text"
              placeholder="mis. auth.login_failed"
              class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label for="filter-from" class="block text-xs font-semibold text-slate-300 mb-1">
              Dari Tanggal
            </label>
            <input
              id="filter-from"
              v-model="filterForm.from"
              type="date"
              class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label for="filter-to" class="block text-xs font-semibold text-slate-300 mb-1">
              Sampai Tanggal
            </label>
            <input
              id="filter-to"
              v-model="filterForm.to"
              type="date"
              class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-3">
          <button
            type="button"
            :disabled="!hasActiveFilters"
            @click="clearFilters"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XMarkIcon class="w-4 h-4" aria-hidden="true" />
            <span>Reset Filter</span>
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
          >
            Terapkan Filter
          </button>
        </div>
      </form>

      <!-- Error State -->
      <div
        v-if="auditStore.error"
        class="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm"
        role="alert"
      >
        {{ auditStore.error }}
      </div>

      <!-- Acknowledge Error State -->
      <div
        v-if="acknowledgeError"
        class="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm"
        role="alert"
      >
        {{ acknowledgeError }}
      </div>

      <!-- Table Container -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <caption class="sr-only">
              Daftar log audit, diurutkan dari yang terbaru. Setiap baris memuat waktu, aksi,
              tingkat keparahan, hasil, aktor, target, dan status acknowledge.
            </caption>
            <thead>
              <tr
                class="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold text-xs uppercase tracking-wider"
              >
                <th scope="col" class="px-6 py-4">Waktu</th>
                <th scope="col" class="px-6 py-4">Aksi</th>
                <th scope="col" class="px-6 py-4">Tingkat</th>
                <th scope="col" class="px-6 py-4">Hasil</th>
                <th scope="col" class="px-6 py-4">Aktor</th>
                <th scope="col" class="px-6 py-4">Target</th>
                <th scope="col" class="px-6 py-4">Status</th>
                <th scope="col" class="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <template v-if="auditStore.loading && !auditStore.logs.length">
                <tr>
                  <td colspan="8" class="px-6 py-12 text-center text-slate-500">
                    <div class="flex justify-center items-center gap-2">
                      <svg
                        class="animate-spin h-5 w-5 text-indigo-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        ></circle>
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        ></path>
                      </svg>
                      <span>Memuat log audit...</span>
                    </div>
                  </td>
                </tr>
              </template>

              <template v-else-if="!auditStore.logs.length">
                <tr>
                  <td colspan="8" class="px-6 py-12 text-center text-slate-500">
                    Tidak ada log audit yang cocok dengan filter.
                  </td>
                </tr>
              </template>

              <template v-for="log in auditStore.logs" :key="log.id">
                <tr class="hover:bg-slate-800/40 transition duration-150">
                  <!-- Waktu -->
                  <td class="px-6 py-4 whitespace-nowrap text-slate-400">
                    {{ formatDate(log.createdAt) }}
                  </td>

                  <!-- Aksi -->
                  <td class="px-6 py-4 font-mono text-xs text-slate-200">{{ log.action }}</td>

                  <!-- Tingkat -->
                  <td class="px-6 py-4">
                    <span
                      :class="[
                        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border',
                        severityClasses(log.severity),
                      ]"
                    >
                      {{ severityLabel(log.severity) }}
                    </span>
                  </td>

                  <!-- Hasil -->
                  <td class="px-6 py-4">
                    <span
                      :class="
                        log.outcome === 'failure'
                          ? 'text-rose-400 font-semibold'
                          : 'text-emerald-400'
                      "
                    >
                      {{ log.outcome }}
                    </span>
                  </td>

                  <!-- Aktor -->
                  <td class="px-6 py-4">
                    <div class="text-white">{{ log.actorEmail || '-' }}</div>
                    <div v-if="log.actorRole" class="text-xs text-slate-500 capitalize">
                      {{ log.actorRole }}
                    </div>
                  </td>

                  <!-- Target -->
                  <td class="px-6 py-4">
                    <div v-if="log.targetType" class="text-xs text-slate-500 uppercase">
                      {{ log.targetType }}
                    </div>
                    <div class="text-slate-200">{{ targetLabel(log) }}</div>
                  </td>

                  <!-- Status Acknowledge -->
                  <td class="px-6 py-4">
                    <span
                      v-if="log.acknowledgedAt"
                      class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    >
                      Diakui {{ formatDate(log.acknowledgedAt) }}
                    </span>
                    <span
                      v-else-if="log.severity === 'critical'"
                      class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    >
                      Terbuka
                    </span>
                    <span v-else class="text-xs text-slate-500">—</span>
                  </td>

                  <!-- Aksi -->
                  <td class="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                    <button
                      v-if="isOpenCritical(log)"
                      type="button"
                      :disabled="acknowledgingId === log.id"
                      @click="handleAcknowledge(log)"
                      class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckIcon class="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{{ acknowledgingId === log.id ? 'Memproses...' : 'Acknowledge' }}</span>
                    </button>
                    <button
                      type="button"
                      :aria-expanded="expandedId === log.id"
                      :aria-label="
                        expandedId === log.id
                          ? 'Sembunyikan detail log audit'
                          : 'Tampilkan detail log audit'
                      "
                      @click="toggleExpanded(log.id)"
                      class="inline-flex items-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    >
                      <ChevronUpIcon v-if="expandedId === log.id" class="w-4 h-4" aria-hidden="true" />
                      <ChevronDownIcon v-else class="w-4 h-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>

                <!-- Expanded Detail Row -->
                <tr v-if="expandedId === log.id" class="bg-slate-950/60">
                  <td colspan="8" class="px-6 py-4">
                    <dl class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <dt class="text-slate-500 font-semibold uppercase tracking-wider mb-1">
                          Metadata
                        </dt>
                        <dd class="text-slate-300 font-mono whitespace-pre-wrap break-all">
                          {{ log.metadata ? JSON.stringify(log.metadata, null, 2) : '-' }}
                        </dd>
                      </div>
                      <div class="space-y-3">
                        <div>
                          <dt class="text-slate-500 font-semibold uppercase tracking-wider mb-1">
                            Alamat IP
                          </dt>
                          <dd class="text-slate-300 font-mono">{{ log.ipAddress || '-' }}</dd>
                        </div>
                        <div>
                          <dt class="text-slate-500 font-semibold uppercase tracking-wider mb-1">
                            User Agent
                          </dt>
                          <dd class="text-slate-300 font-mono break-all">
                            {{ log.userAgent || '-' }}
                          </dd>
                        </div>
                        <div v-if="log.targetId">
                          <dt class="text-slate-500 font-semibold uppercase tracking-wider mb-1">
                            Target ID
                          </dt>
                          <dd class="text-slate-300 font-mono break-all">{{ log.targetId }}</dd>
                        </div>
                      </div>
                    </dl>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination -->
      <nav
        v-if="auditStore.total > 0"
        class="flex items-center justify-between"
        aria-label="Navigasi halaman log audit"
      >
        <p class="text-xs text-slate-400">{{ pageRangeLabel }}</p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="auditStore.page <= 1 || auditStore.loading"
            @click="auditStore.goToPage(auditStore.page - 1)"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon class="w-4 h-4" aria-hidden="true" />
            <span>Sebelumnya</span>
          </button>
          <button
            type="button"
            :disabled="auditStore.page >= totalPages || auditStore.loading"
            @click="auditStore.goToPage(auditStore.page + 1)"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Berikutnya</span>
            <ChevronRightIcon class="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </div>
  </main>
</template>
