import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AdminDashboardView from '../views/AdminDashboardView.vue';
import { useAuthStore } from '../stores/auth';

const DASHBOARD = {
  counts: {
    indicators: 12,
    indicatorTables: 4,
    pages: 3,
    publications: 2,
    rtLeaders: 40,
    spatialPoints: 55,
  },
  health: {
    staleIndicators: {
      count: 7,
      items: [{ id: 'i-1', label: 'Jumlah penduduk', pageSlug: 'kependudukan' }],
    },
    rtLeadersWithoutCoordinates: 2,
    rtLeadersWithIntegrityConflicts: 1,
  },
  recentChanges: [
    {
      action: 'indicator.updated',
      targetType: 'indicator',
      targetLabel: 'Jumlah penduduk',
      actorName: 'andi',
      createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
  ],
};

const HEALTHY_DASHBOARD = {
  counts: DASHBOARD.counts,
  health: {
    staleIndicators: { count: 0, items: [] },
    rtLeadersWithoutCoordinates: 0,
    rtLeadersWithIntegrityConflicts: 0,
  },
  recentChanges: [],
};

const SUMMARY = {
  since: '2026-11-19T00:00:00.000Z',
  counts: { info: 30, warning: 4, critical: 2 },
  openCritical: 1,
};

const USERS = [
  { id: 'u-1', email: 'a@example.com', deletedAt: null },
  { id: 'u-2', email: 'b@example.com', deletedAt: null },
  { id: 'u-3', email: 'c@example.com', deletedAt: '2026-01-01T00:00:00.000Z' },
];

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function installFetch(
  options: { dashboard?: unknown; summaryFails?: boolean } = {},
): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/api/dashboard')) {
      return jsonResponse({ dashboard: options.dashboard ?? DASHBOARD });
    }
    if (url.includes('/api/audit-logs/summary')) {
      return options.summaryFails
        ? jsonResponse({ error: 'Terjadi kesalahan internal server' }, false, 500)
        : jsonResponse(SUMMARY);
    }
    if (url.startsWith('/api/users')) {
      return jsonResponse({ users: USERS });
    }
    return jsonResponse({});
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function requestedPaths(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/admin', component: { template: '<div>Beranda</div>' } },
      { path: '/data', component: { template: '<div>Data</div>' } },
      { path: '/admin/cerita', component: { template: '<div>Cerita</div>' } },
      { path: '/admin/peta', component: { template: '<div>Peta</div>' } },
      { path: '/admin/publikasi', component: { template: '<div>Publikasi</div>' } },
      { path: '/admin/rukun-tetangga', component: { template: '<div>RT</div>' } },
      { path: '/users', component: { template: '<div>Users</div>' } },
      { path: '/audit-logs', component: { template: '<div>Audit</div>' } },
      { path: '/admin/sistem/templat-kalimat', component: { template: '<div>Templat</div>' } },
      { path: '/admin/sistem/konfigurasi', component: { template: '<div>Konfigurasi</div>' } },
    ],
  });
}

async function mountDashboard(role: 'editor' | 'admin') {
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  authStore.user = { id: 'u1', email: 'u@example.com', role };
  authStore.accessToken = 'token';

  const router = createTestRouter();
  await router.push('/admin');
  await router.isReady();

  const wrapper = mount(AdminDashboardView, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('AdminDashboardView.vue', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows the four sections with h2 headings and no Keamanan block for Editor', async () => {
    const fetchMock = installFetch();
    const wrapper = await mountDashboard('editor');

    const headings = wrapper.findAll('h2').map((h) => h.text());
    expect(headings).toEqual(['Pintasan', 'Perlu perhatian', 'Perubahan terbaru']);
    expect(wrapper.find('[data-test="dashboard-security"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Keamanan');

    const paths = requestedPaths(fetchMock);
    expect(paths.some((p) => p.includes('/api/dashboard'))).toBe(true);
    expect(paths.some((p) => p.includes('/api/audit-logs'))).toBe(false);
    expect(paths.some((p) => p.startsWith('/api/users'))).toBe(false);
    wrapper.unmount();
  });

  it('shows the Keamanan block and fetches admin-only data for Admin', async () => {
    const fetchMock = installFetch();
    const wrapper = await mountDashboard('admin');

    expect(wrapper.findAll('h2').map((h) => h.text())).toContain('Keamanan');
    const paths = requestedPaths(fetchMock);
    expect(paths.some((p) => p.includes('/api/audit-logs/summary?since='))).toBe(true);
    expect(paths.some((p) => p.startsWith('/api/users'))).toBe(true);

    // Two active users (one soft-deleted account is not counted).
    expect(wrapper.text()).toContain('Pengguna aktif');
    const tile = wrapper.find('dl').text();
    expect(tile).toContain('Kritis belum ditangani');
    expect(tile).toContain('2');
    wrapper.unmount();
  });

  it('filters shortcuts by role and skips Beranda', async () => {
    installFetch();
    const editor = await mountDashboard('editor');
    expect(editor.find('[data-test="shortcut-nav-data"]').exists()).toBe(true);
    expect(editor.find('[data-test="shortcut-nav-rukun-tetangga"]').exists()).toBe(true);
    expect(editor.find('[data-test="shortcut-nav-beranda"]').exists()).toBe(false);
    expect(editor.find('[data-test="shortcut-nav-sistem-log"]').exists()).toBe(false);
    expect(editor.find('[data-test="shortcut-nav-sistem-akun-pengguna"]').exists()).toBe(false);
    editor.unmount();

    installFetch();
    const admin = await mountDashboard('admin');
    expect(admin.find('[data-test="shortcut-nav-sistem-log"]').exists()).toBe(true);
    expect(admin.find('[data-test="shortcut-nav-sistem-akun-pengguna"]').exists()).toBe(true);
    expect(admin.find('[data-test="shortcut-nav-beranda"]').exists()).toBe(false);
    admin.unmount();
  });

  it('shows per-module counts on the shortcut cards', async () => {
    installFetch();
    const wrapper = await mountDashboard('editor');

    expect(wrapper.find('[data-test="shortcut-nav-data"]').text()).toContain('12 indikator');
    expect(wrapper.find('[data-test="shortcut-nav-cerita"]').text()).toContain('3 topik');
    expect(wrapper.find('[data-test="shortcut-nav-peta"]').text()).toContain('55 titik');
    expect(wrapper.find('[data-test="shortcut-nav-publikasi"]').text()).toContain('2 publikasi');
    expect(wrapper.find('[data-test="shortcut-nav-rukun-tetangga"]').text()).toContain(
      '40 ketua RT',
    );
    wrapper.unmount();
  });

  it('lists attention items as links, with the highlights link opening that topic', async () => {
    installFetch();
    const wrapper = await mountDashboard('editor');

    expect(wrapper.text()).toContain('7 indikator ditandai usang');
    expect(wrapper.text()).toContain('dan 6 lainnya');
    expect(wrapper.text()).toContain('2 ketua RT belum memiliki koordinat');
    expect(wrapper.text()).toContain('1 ketua RT memiliki konflik data');
    expect(wrapper.text()).not.toContain('Semua data dalam kondisi baik.');

    expect(wrapper.text()).not.toContain('Belum ada statistik unggulan');
    wrapper.unmount();
  });

  it('shows the all-healthy message when nothing needs attention', async () => {
    installFetch({ dashboard: HEALTHY_DASHBOARD });
    const wrapper = await mountDashboard('editor');

    expect(wrapper.text()).toContain('Semua data dalam kondisi baik.');
    expect(wrapper.text()).toContain('Belum ada perubahan.');
    wrapper.unmount();
  });

  it('shows the empty activity message and the recent change rows', async () => {
    installFetch();
    const wrapper = await mountDashboard('editor');

    const rows = wrapper.findAll('ol li');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('andi memperbarui Jumlah penduduk');
    expect(rows[0]?.find('time').attributes('datetime')).toBeTruthy();
    wrapper.unmount();

    installFetch({ dashboard: HEALTHY_DASHBOARD });
    const empty = await mountDashboard('editor');
    expect(empty.find('ol').exists()).toBe(false);
    expect(empty.text()).toContain('Belum ada perubahan.');
    empty.unmount();
  });

  it('shows a banner for a failed security load without hiding the rest of the page', async () => {
    installFetch({ summaryFails: true });
    const wrapper = await mountDashboard('admin');

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.find('dl').exists()).toBe(false);
    expect(wrapper.find('[data-test="shortcut-nav-data"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
