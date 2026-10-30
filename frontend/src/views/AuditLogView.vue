<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  ListBulletIcon,
  ExclamationTriangleIcon,
  UserIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/vue/24/outline';
import { useAuditStore, type AuditLogItem } from '../stores/audit.store';
import { setAdminHeader } from '../composables/useAdminHeader';

const auditStore = useAuditStore();

const searchQuery = ref('');
const severityFilter = ref<'' | 'info' | 'warning' | 'critical'>('');
const acknowledgingId = ref<string | null>(null);
const acknowledgeError = ref<string | null>(null);

/**
 * Indonesian labels for every action code audit.service.ts can emit, so the "Kejadian"
 * column reads as a sentence instead of a snake_case code. Unlisted codes fall back to
 * the raw action string.
 */
const ACTION_LABELS: Record<string, string> = {
  'user.created_by_admin': 'Pengguna dibuat oleh admin',
  'user.created_via_google': 'Pengguna dibuat via Google',
  'user.reactivated': 'Pengguna diaktifkan kembali',
  'user.deactivated': 'Pengguna dinonaktifkan',
  'user.role_changed': 'Ganti role user',
  'user.password_reset_by_admin': 'Reset password oleh admin',
  'profile.password_changed': 'Password profil diubah',
  'auth.login': 'Berhasil login',
  'auth.login_failed': 'Login gagal',
  'auth.logout': 'Logout',
  'auth.first_login_password_set': 'Password pertama kali disetel',
  'auth.refresh_token_mismatch': 'Token refresh tidak cocok',
  'auth.google_account_linked': 'Akun Google ditautkan',
  'auth.sessions_revoked': 'Sesi pengguna dicabut',
  'auth.oauth_state_mismatch': 'Status OAuth tidak cocok',
  'auth.email_verified': 'Email terverifikasi',
  'auth.otp_attempts_exceeded': 'Percobaan OTP melebihi batas',
  'settings.audit_retention_changed': 'Retensi log audit diubah',
  'settings.public_updated': 'Pengaturan publik diperbarui',
  'settings.weather_updated': 'Pengaturan cuaca diperbarui',
  'content_block.updated': 'Konten halaman diperbarui',
  'indicator.created': 'Indikator dibuat',
  'indicator.updated': 'Indikator diperbarui',
  'indicator.deleted': 'Indikator dihapus',
  'comparison_template.created': 'Templat kalimat dibuat',
  'comparison_template.updated': 'Templat kalimat diperbarui',
  'comparison_template.deleted': 'Templat kalimat dihapus',
  'comparison_template.keyword_warning_overridden': 'Peringatan kata kunci diabaikan',
  'indicator_table.created': 'Tabel indikator dibuat',
  'indicator_table.updated': 'Tabel indikator diperbarui',
  'indicator_table.deleted': 'Tabel indikator dihapus',
  'indicator_table_row.created': 'Baris tabel indikator dibuat',
  'indicator_table_row.updated': 'Baris tabel indikator diperbarui',
  'indicator_table_row.deleted': 'Baris tabel indikator dihapus',
  'audit.pruned': 'Log audit dipangkas',
};

function eventLabel(log: AuditLogItem): string {
  const base = ACTION_LABELS[log.action] || log.action;
  // Mirror the wireframe's "Ganti role user (Admin to Editor)" detail from the
  // before/after metadata recorded by users.service.ts.
  if (log.action === 'user.role_changed' && log.metadata) {
    const md = log.metadata as Record<string, unknown>;
    const from = typeof md.fromRoleName === 'string' ? md.fromRoleName : '';
    const to = typeof md.toRoleName === 'string' ? md.toRoleName : '';
    if (from && to) return `${base} (${from} to ${to})`;
  }
  return base;
}

const totalPages = computed(() => Math.max(1, Math.ceil(auditStore.total / auditStore.pageSize)));

/**
 * Client-side search over the loaded page (same pattern as UserManagement's search) —
 * the API's `action` filter is an exact match, not a substring, so free-text search
 * narrows what is already on screen rather than issuing a query the backend can't honor.
 */
const visibleLogs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return auditStore.logs;
  return auditStore.logs.filter(
    (l) =>
      eventLabel(l).toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      (l.actorEmail || '').toLowerCase().includes(q) ||
      (l.targetLabel || '').toLowerCase().includes(q),
  );
});

const totalLogCount = computed(() => {
  const c = auditStore.summary?.counts;
  return c ? c.info + c.warning + c.critical : 0;
});

// Wireframe asks for WITA; render the instant in that zone so label and clock agree.
const WITA = 'Asia/Makassar';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: WITA,
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: WITA,
  }).format(new Date(iso));
  return `${time} WITA`;
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'Kritis';
    case 'warning':
      return 'Peringatan';
    default:
      return 'Info';
  }
}

function severityClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-600 text-white border-transparent';
    case 'warning':
      return 'bg-amber-600 text-white border-transparent';
    default:
      return 'bg-emerald-600 text-white border-transparent';
  }
}

function targetText(log: AuditLogItem): string {
  if (log.targetType === 'user' && log.targetId) {
    const id = `#${log.targetId.substring(0, 8)}`;
    return log.targetLabel ? `User ID: ${id} (${log.targetLabel})` : `User ID: ${id}`;
  }
  if (log.targetLabel) return log.targetLabel;
  return log.targetType || '-';
}

function capitalize(value: string | null): string {
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isOpenCritical(log: AuditLogItem): boolean {
  return log.severity === 'critical' && log.acknowledgedAt == null;
}

function applySeverity() {
  auditStore.applyFilters({ severity: severityFilter.value });
}

async function handleAcknowledge(log: AuditLogItem) {
  acknowledgingId.value = log.id;
  acknowledgeError.value = null;
  try {
    await auditStore.acknowledgeLog(log.id);
  } catch (err: unknown) {
    acknowledgeError.value =
      err instanceof Error ? err.message : 'Gagal meng-acknowledge audit log.';
  } finally {
    acknowledgingId.value = null;
  }
}

onMounted(async () => {
  setAdminHeader(
    'Log Sistem dan Audit Trail',
    'Pantau seluruh aktivitas yang terjadi di sistem, mulai dari autentikasi hingga riwayat konfigurasi admin.',
  );
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await Promise.all([
    auditStore.fetchLogs(),
    auditStore.fetchSummary(oneMonthAgo),
    auditStore.fetchAdminActionCount(24),
  ]);
});
</script>

<template>
  <div>
    <div class="space-y-6">
      <!--
        AdminLayout's header already renders the page's <h1> and subtitle (set via
        setAdminHeader in onMounted below) — this view only owns its own content.
      -->

      <!-- Stat Cards -->
      <section aria-label="Ringkasan log audit">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <!-- Total Log -->
          <div
            class="rounded-card from-brand-navy to-brand-navy-deep shadow-brand-navy/20 border border-white/10 bg-linear-to-br p-5 text-white shadow-lg"
          >
            <div class="flex items-start justify-between">
              <span class="text-sm font-medium text-white/80">Total Log</span>
              <span class="rounded-xl bg-white/10 p-2">
                <ListBulletIcon class="text-brand-cyan h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            <p class="mt-2 text-3xl font-bold">{{ totalLogCount }}</p>
            <p class="mt-1 text-xs text-white/70">Dalam Sebulan</p>
          </div>

          <!-- Kejadian Kritis -->
          <div
            class="rounded-card border border-white/10 bg-linear-to-br from-red-500 to-rose-600 p-5 text-white shadow-lg shadow-red-600/25"
          >
            <div class="flex items-start justify-between">
              <span class="text-sm font-medium text-white/80">Kejadian Kritis</span>
              <span class="rounded-xl bg-white/15 p-2">
                <ExclamationTriangleIcon class="h-5 w-5 text-white" aria-hidden="true" />
              </span>
            </div>
            <p class="mt-2 text-3xl font-bold">{{ auditStore.summary?.openCritical ?? 0 }}</p>
            <p class="mt-1 text-xs text-white/75">Butuh Review</p>
          </div>

          <!-- Aksi Admin -->
          <div
            class="rounded-card from-brand-indigo to-brand-violet shadow-brand-indigo/25 border border-white/10 bg-linear-to-br p-5 text-white shadow-lg"
          >
            <div class="flex items-start justify-between">
              <span class="text-sm font-medium text-white/80">Aksi Admin</span>
              <span class="rounded-xl bg-white/15 p-2">
                <UserIcon class="h-5 w-5 text-white" aria-hidden="true" />
              </span>
            </div>
            <p class="mt-2 text-3xl font-bold">{{ auditStore.adminActionCount }}</p>
            <p class="mt-1 text-xs text-white/75">24 Jam Terakhir</p>
          </div>
        </div>
      </section>

      <!-- Toolbar: Search + Severity Filter. The fieldset groups both controls under one
           label so AT announces them as a "Filter log audit" group, not loose inputs. -->
      <fieldset class="flex flex-col justify-end gap-3 sm:flex-row sm:items-center">
        <legend class="sr-only">Filter log audit</legend>
        <div class="relative w-full sm:w-64">
          <label for="audit-search" class="sr-only">Cari log audit</label>
          <MagnifyingGlassIcon
            class="absolute top-2.5 left-2 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="audit-search"
            v-model="searchQuery"
            type="search"
            placeholder="Cari"
            class="rounded-btn focus:border-brand-navy focus:ring-brand-navy w-full border border-slate-300 bg-white py-2 pr-3 pl-8 text-sm text-slate-900 placeholder-slate-400 transition focus:ring-1 focus:outline-none"
          />
        </div>

        <div>
          <label for="severity-filter" class="sr-only">Tingkat Keparahan</label>
          <select
            id="severity-filter"
            v-model="severityFilter"
            @change="applySeverity"
            class="rounded-btn focus:border-brand-navy focus:ring-brand-navy border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-1 focus:outline-none"
          >
            <option value="">Semua Keparahan</option>
            <option value="info">Info</option>
            <option value="warning">Peringatan</option>
            <option value="critical">Kritis</option>
          </select>
        </div>
      </fieldset>

      <!-- Error States -->
      <div
        v-if="auditStore.error"
        class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        role="alert"
      >
        {{ auditStore.error }}
      </div>
      <div
        v-if="auditStore.summaryError"
        class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        role="alert"
      >
        Ringkasan tidak tersedia: {{ auditStore.summaryError }}
      </div>
      <div
        v-if="acknowledgeError"
        class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        role="alert"
      >
        {{ acknowledgeError }}
      </div>

      <!-- Table -->
      <div class="rounded-card overflow-hidden border border-slate-200 bg-white shadow-xs">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              Daftar log sistem dan audit trail, diurutkan dari yang terbaru. Setiap baris memuat
              waktu, kejadian, nama aktor, role, target, tingkat keparahan, dan aksi.
            </caption>
            <thead>
              <tr class="bg-brand-navy text-xs font-semibold tracking-wider text-white uppercase">
                <th scope="col" class="px-4 py-3">Waktu</th>
                <th scope="col" class="px-4 py-3">Kejadian</th>
                <th scope="col" class="px-4 py-3">Nama</th>
                <th scope="col" class="px-4 py-3">Role</th>
                <th scope="col" class="px-4 py-3">Target</th>
                <th scope="col" class="px-4 py-3">Tingkat Keparahan</th>
                <th scope="col" class="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <template v-if="auditStore.loading && !auditStore.logs.length">
                <tr>
                  <td colspan="7" class="px-4 py-12 text-center text-slate-500">
                    <div class="flex items-center justify-center gap-2">
                      <svg
                        class="h-5 w-5 animate-spin text-slate-400"
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

              <template v-else-if="!visibleLogs.length">
                <tr>
                  <td colspan="7" class="px-4 py-12 text-center text-slate-500">
                    {{
                      auditStore.logs.length
                        ? 'Tidak ada log yang cocok dengan pencarian.'
                        : 'Tidak ada data log.'
                    }}
                  </td>
                </tr>
              </template>

              <tr
                v-for="log in visibleLogs"
                :key="log.id"
                class="align-top transition duration-150 hover:bg-slate-50"
              >
                <!-- Waktu -->
                <td class="px-4 py-3 whitespace-nowrap">
                  <div class="font-medium text-slate-900">{{ formatDate(log.createdAt) }}</div>
                  <div class="text-xs text-slate-500">{{ formatTime(log.createdAt) }}</div>
                </td>

                <!-- Kejadian -->
                <td class="px-4 py-3">{{ eventLabel(log) }}</td>

                <!-- Nama -->
                <td class="px-4 py-3 font-medium text-slate-800">{{ log.actorEmail || '-' }}</td>

                <!-- Role -->
                <td class="px-4 py-3">{{ capitalize(log.actorRole) }}</td>

                <!-- Target -->
                <td class="px-4 py-3">{{ targetText(log) }}</td>

                <!-- Tingkat Keparahan -->
                <td class="px-4 py-3">
                  <span
                    :class="[
                      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                      severityClasses(log.severity),
                    ]"
                  >
                    {{ severityLabel(log.severity) }}
                  </span>
                </td>

                <!-- Aksi -->
                <td class="px-4 py-3">
                  <button
                    v-if="isOpenCritical(log)"
                    type="button"
                    :disabled="acknowledgingId === log.id"
                    @click="handleAcknowledge(log)"
                    class="rounded-btn text-brand-navy border-brand-navy hover:bg-brand-navy inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-xs font-medium transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PencilSquareIcon class="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{{
                      acknowledgingId === log.id ? 'Memproses...' : 'Tandai Telah Dibaca'
                    }}</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination Footer -->
      <nav class="flex items-center justify-between" aria-label="Navigasi halaman log audit">
        <!-- Always-mounted polite live region: filter/page/search changes alter this text,
             so AT announces the new result count. The sr-only page span guarantees a page
             change is announced even when the visible row counts happen to match. -->
        <p role="status" aria-live="polite" class="text-sm text-slate-600">
          Menampilkan
          <span class="text-brand-navy font-bold">{{ visibleLogs.length }}</span>
          dari
          <span class="text-brand-navy font-bold">{{ auditStore.total }}</span>
          data
          <span class="sr-only"> , halaman {{ auditStore.page }} dari {{ totalPages }} </span>
        </p>
        <div class="flex items-center gap-2">
          <button
            v-if="auditStore.page > 1"
            type="button"
            :disabled="auditStore.loading"
            @click="auditStore.goToPage(auditStore.page - 1)"
            class="rounded-btn text-brand-navy border-brand-navy hover:bg-brand-navy inline-flex items-center gap-1.5 border bg-white px-4 py-2 text-xs font-medium transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeftIcon class="h-4 w-4" aria-hidden="true" />
            <span>Sebelumnya</span>
          </button>
          <button
            type="button"
            :disabled="auditStore.page >= totalPages || auditStore.loading"
            @click="auditStore.goToPage(auditStore.page + 1)"
            class="rounded-btn bg-brand-navy hover:text-brand-navy hover:border-brand-navy inline-flex items-center gap-1.5 border border-transparent px-4 py-2 text-xs font-medium text-white transition hover:bg-white disabled:cursor-not-allowed disabled:border-transparent disabled:bg-gray-300 disabled:text-gray-600"
          >
            <span>Selanjutnya</span>
            <ChevronRightIcon class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </div>
  </div>
</template>
