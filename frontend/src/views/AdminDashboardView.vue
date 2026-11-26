<script setup lang="ts">
// Title and subtitle live in route `meta` (router/index.ts), seeded by AdminLayout. This view owns
// only its content; AdminLayout supplies the page h1 and the white card around it.
import { computed, onMounted, ref, type Component } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import AlertBanner from '../components/common/AlertBanner.vue';
import {
  ADMIN_NAV,
  isAdminNavGroup,
  isAdminNavRoleAllowed,
  type AdminNavLink,
} from '../config/adminNav';
import { useAuditStore } from '../stores/audit.store';
import { useAuthStore } from '../stores/auth';
import { useDashboardStore, type DashboardCounts } from '../stores/dashboard.store';
import { useUsersStore } from '../stores/users.store';
import { describeActivity } from '../utils/dashboardActivity';
import { formatRelativeTime } from '../utils/relativeTime';

const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const auditStore = useAuditStore();
const usersStore = useUsersStore();

const SECURITY_WINDOW_DAYS = 7;

const access = computed(() => ({
  isAdmin: authStore.isAdmin,
  canEditData: authStore.canEditData,
}));

function formatCount(value: number): string {
  return value.toLocaleString('id-ID');
}

// --- Pintasan ---------------------------------------------------------------------------------

/** Count line per top-level nav entry, keyed by its `dataTest`. Entries without a count get none. */
const COUNT_LINE: Readonly<Record<string, (counts: DashboardCounts) => string>> = {
  'nav-data': (c) => `${formatCount(c.indicators)} indikator`,
  'nav-cerita': (c) => `${formatCount(c.pages)} topik`,
  'nav-peta': (c) => `${formatCount(c.spatialPoints)} titik`,
  'nav-publikasi': (c) => `${formatCount(c.publications)} publikasi`,
  'nav-rukun-tetangga': (c) => `${formatCount(c.rtLeaders)} ketua RT`,
};

interface Shortcut {
  key: string;
  label: string;
  to: string;
  icon: Component;
  badge?: string;
  count: string | null;
}

function allowed(entry: AdminNavLink | { roles: AdminNavLink['roles'] }): boolean {
  return isAdminNavRoleAllowed(entry.roles, access.value);
}

const shortcuts = computed<Shortcut[]>(() => {
  const counts = dashboardStore.dashboard?.counts ?? null;
  const result: Shortcut[] = [];
  for (const entry of ADMIN_NAV) {
    // The Beranda entry is this page itself.
    if (entry.dataTest === 'nav-beranda') continue;

    if (isAdminNavGroup(entry)) {
      if (!allowed(entry)) continue;
      for (const item of entry.items) {
        if (!allowed(item)) continue;
        result.push({
          key: item.dataTest,
          label: item.label,
          to: item.to,
          icon: item.icon,
          badge: item.badge,
          count: null,
        });
      }
      continue;
    }

    if (!allowed(entry)) continue;
    const countLine = COUNT_LINE[entry.dataTest];
    result.push({
      key: entry.dataTest,
      label: entry.label,
      to: entry.to,
      icon: entry.icon,
      badge: entry.badge,
      count: counts && countLine ? countLine(counts) : null,
    });
  }
  return result;
});

// --- Perlu perhatian ---------------------------------------------------------------------------

const dashboard = computed(() => dashboardStore.dashboard);
const health = computed(() => dashboard.value?.health ?? null);
const staleIndicators = computed(() => {
  const stale = health.value?.staleIndicators;
  return stale && stale.count > 0 ? stale : null;
});
const pagesWithoutHighlights = computed(() => health.value?.pagesWithoutHighlights ?? []);
const rtWithoutCoordinates = computed(() => health.value?.rtLeadersWithoutCoordinates ?? 0);
const rtWithConflicts = computed(() => health.value?.rtLeadersWithIntegrityConflicts ?? 0);
const hasAttention = computed(
  () =>
    staleIndicators.value !== null ||
    pagesWithoutHighlights.value.length > 0 ||
    rtWithoutCoordinates.value > 0 ||
    rtWithConflicts.value > 0,
);

function highlightsLink(slug: string): RouteLocationRaw {
  // AdminCeritaView opens the page's structure from `?halaman=<slug>`.
  return { path: '/admin/cerita', query: { halaman: slug } };
}

// --- Perubahan terbaru -------------------------------------------------------------------------

const recentChanges = computed(() => dashboard.value?.recentChanges ?? []);

// --- Keamanan (Admin only) ---------------------------------------------------------------------

/** True while the security figures are being fetched. Editors never reach this path. */
const securityPending = ref(false);

function sevenDaysAgoIso(): string {
  return new Date(Date.now() - SECURITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function loadSecurity() {
  securityPending.value = true;
  try {
    // Both calls catch their own failures into store state, so this never rejects.
    await Promise.all([auditStore.fetchSummary(sevenDaysAgoIso()), usersStore.fetchUsers()]);
  } finally {
    securityPending.value = false;
  }
}

const securityTiles = computed(() => {
  const summary = auditStore.summary;
  if (!summary || auditStore.summaryError) return null;
  const activeUsers = usersStore.error
    ? null
    : usersStore.users.filter((user) => !user.deletedAt).length;
  return {
    // Optional reads: a malformed summary body shows zeros instead of crashing the whole page.
    openCritical: summary.openCritical ?? 0,
    critical: summary.counts?.critical ?? 0,
    warning: summary.counts?.warning ?? 0,
    info: summary.counts?.info ?? 0,
    activeUsers,
  };
});

onMounted(() => {
  void dashboardStore.fetchDashboard();
  if (authStore.isAdmin) {
    void loadSecurity();
  }
});
</script>

<template>
  <div class="space-y-8">
    <AlertBanner
      v-if="dashboardStore.error"
      :message="dashboardStore.error"
      :kind="dashboardStore.errorKind ?? undefined"
      @retry="dashboardStore.fetchDashboard()"
    />

    <!-- Pintasan -->
    <section aria-labelledby="dashboard-shortcuts-heading" class="space-y-3">
      <h2 id="dashboard-shortcuts-heading" class="text-lg font-semibold text-slate-900">
        Pintasan
      </h2>
      <ul
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-test="dashboard-shortcuts"
      >
        <li v-for="shortcut in shortcuts" :key="shortcut.key">
          <RouterLink
            :to="shortcut.to"
            :data-test="`shortcut-${shortcut.key}`"
            class="border-border hover:border-brand-indigo hover:bg-surface-muted focus-visible:ring-focus-ring focus-visible:ring-offset-surface rounded-card flex min-h-11 items-start gap-3 border bg-white p-4 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <component
              :is="shortcut.icon"
              class="text-brand-indigo mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold break-words text-slate-900">{{
                shortcut.label
              }}</span>
              <span v-if="shortcut.count" class="mt-1 block text-sm text-slate-600">{{
                shortcut.count
              }}</span>
              <span v-if="shortcut.badge" class="mt-1 block text-xs text-slate-500">{{
                shortcut.badge
              }}</span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- Perlu perhatian -->
    <section aria-labelledby="dashboard-attention-heading" class="space-y-3">
      <h2 id="dashboard-attention-heading" class="text-lg font-semibold text-slate-900">
        Perlu perhatian
      </h2>

      <div v-if="dashboardStore.loading && !dashboard" class="space-y-2" aria-busy="true">
        <p class="text-sm text-slate-600">Memuat…</p>
        <div class="h-10 animate-pulse rounded bg-slate-100" aria-hidden="true" />
        <div class="h-10 animate-pulse rounded bg-slate-100" aria-hidden="true" />
      </div>

      <ul v-else-if="dashboard && hasAttention" class="space-y-3 text-sm">
        <li v-if="staleIndicators">
          <RouterLink
            to="/data"
            class="text-brand-indigo focus-visible:ring-focus-ring font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            {{ formatCount(staleIndicators.count) }} indikator ditandai usang
          </RouterLink>
          <ul class="mt-1 ml-4 list-disc space-y-1">
            <li v-for="item in staleIndicators.items" :key="item.id">
              <RouterLink
                to="/data"
                class="text-brand-indigo focus-visible:ring-focus-ring underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                {{ item.label }}
              </RouterLink>
            </li>
          </ul>
          <p
            v-if="staleIndicators.count > staleIndicators.items.length"
            class="mt-1 ml-4 text-slate-600"
          >
            dan {{ staleIndicators.count - staleIndicators.items.length }} lainnya
          </p>
        </li>

        <li v-for="page in pagesWithoutHighlights" :key="page.slug">
          <RouterLink
            :to="highlightsLink(page.slug)"
            class="text-brand-indigo focus-visible:ring-focus-ring underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Belum ada statistik unggulan: {{ page.title }}
          </RouterLink>
        </li>

        <li v-if="rtWithoutCoordinates > 0">
          <RouterLink
            to="/admin/rukun-tetangga"
            class="text-brand-indigo focus-visible:ring-focus-ring underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            {{ formatCount(rtWithoutCoordinates) }} ketua RT belum memiliki koordinat
          </RouterLink>
        </li>

        <li v-if="rtWithConflicts > 0">
          <RouterLink
            to="/admin/rukun-tetangga"
            class="text-brand-indigo focus-visible:ring-focus-ring underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            {{ formatCount(rtWithConflicts) }} ketua RT memiliki konflik data
          </RouterLink>
        </li>
      </ul>

      <p v-else-if="dashboard" class="text-sm text-slate-700">Semua data dalam kondisi baik.</p>
    </section>

    <!-- Perubahan terbaru -->
    <section aria-labelledby="dashboard-activity-heading" class="space-y-3">
      <h2 id="dashboard-activity-heading" class="text-lg font-semibold text-slate-900">
        Perubahan terbaru
      </h2>

      <ol v-if="recentChanges.length" class="divide-border divide-y">
        <li
          v-for="(change, index) in recentChanges"
          :key="`${change.createdAt}-${index}`"
          class="py-3"
        >
          <p class="text-sm break-words text-slate-800">{{ describeActivity(change) }}</p>
          <time :datetime="change.createdAt" class="text-xs text-slate-500">
            {{ formatRelativeTime(change.createdAt) }}
          </time>
        </li>
      </ol>

      <p v-else-if="dashboard" class="text-sm text-slate-600">Belum ada perubahan.</p>
    </section>

    <!-- Keamanan: Admin only. Rendered with v-if so Editors never see the markup or fetch it. -->
    <section
      v-if="authStore.isAdmin"
      aria-labelledby="dashboard-security-heading"
      class="space-y-3"
    >
      <h2 id="dashboard-security-heading" class="text-lg font-semibold text-slate-900">Keamanan</h2>

      <AlertBanner
        v-if="auditStore.summaryError"
        :message="auditStore.summaryError"
        :kind="auditStore.summaryErrorKind ?? undefined"
        :busy="securityPending"
        @retry="loadSecurity"
      />
      <AlertBanner
        v-if="usersStore.error"
        :message="usersStore.error"
        :kind="usersStore.errorKind ?? undefined"
        :busy="securityPending"
        @retry="loadSecurity"
      />

      <div v-if="securityPending && !securityTiles" class="space-y-2" aria-busy="true">
        <p class="text-sm text-slate-600">Memuat…</p>
        <div class="rounded-card h-24 animate-pulse bg-slate-100" aria-hidden="true" />
      </div>

      <template v-else-if="securityTiles">
        <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <div
            class="rounded-card border border-white/10 bg-linear-to-br from-red-500 to-rose-600 p-5 text-white shadow-lg shadow-red-600/25"
          >
            <dt class="text-sm font-medium text-white/85">Kritis belum ditangani</dt>
            <dd class="mt-2 text-3xl font-bold">{{ formatCount(securityTiles.openCritical) }}</dd>
          </div>
          <div
            class="rounded-card from-brand-navy to-brand-navy-deep shadow-brand-navy/20 border border-white/10 bg-linear-to-br p-5 text-white shadow-lg"
          >
            <dt class="text-sm font-medium text-white/80">Kritis</dt>
            <dd class="mt-2 text-3xl font-bold">{{ formatCount(securityTiles.critical) }}</dd>
            <dd class="mt-1 text-xs text-white/70">{{ SECURITY_WINDOW_DAYS }} hari terakhir</dd>
          </div>
          <div
            class="rounded-card from-brand-navy to-brand-navy-deep shadow-brand-navy/20 border border-white/10 bg-linear-to-br p-5 text-white shadow-lg"
          >
            <dt class="text-sm font-medium text-white/80">Peringatan</dt>
            <dd class="mt-2 text-3xl font-bold">{{ formatCount(securityTiles.warning) }}</dd>
            <dd class="mt-1 text-xs text-white/70">{{ SECURITY_WINDOW_DAYS }} hari terakhir</dd>
          </div>
          <div
            class="rounded-card from-brand-navy to-brand-navy-deep shadow-brand-navy/20 border border-white/10 bg-linear-to-br p-5 text-white shadow-lg"
          >
            <dt class="text-sm font-medium text-white/80">Info</dt>
            <dd class="mt-2 text-3xl font-bold">{{ formatCount(securityTiles.info) }}</dd>
            <dd class="mt-1 text-xs text-white/70">{{ SECURITY_WINDOW_DAYS }} hari terakhir</dd>
          </div>
          <div
            class="rounded-card from-brand-indigo to-brand-violet shadow-brand-indigo/25 border border-white/10 bg-linear-to-br p-5 text-white shadow-lg"
          >
            <dt class="text-sm font-medium text-white/80">Pengguna aktif</dt>
            <dd class="mt-2 text-3xl font-bold">
              {{
                securityTiles.activeUsers === null ? '—' : formatCount(securityTiles.activeUsers)
              }}
            </dd>
          </div>
        </dl>
        <p>
          <RouterLink
            to="/audit-logs"
            class="text-brand-indigo focus-visible:ring-focus-ring font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Buka log sistem
          </RouterLink>
        </p>
      </template>
    </section>
  </div>
</template>
