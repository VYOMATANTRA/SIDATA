import { nextTick } from 'vue';
import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouterScrollBehavior,
} from 'vue-router';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings.store';
import { ADMIN_NAV, isAdminNavGroup, type AdminNavRole } from '../config/adminNav';

declare module 'vue-router' {
  interface RouteMeta {
    /** `'public'` mounts the route inside `PublicLayout` (header, single `<main>`, footer). */
    layout?: 'public';
    /** The public header overlays this route's hero: transparent at the top, navy once scrolled. */
    headerOverlay?: boolean;
  }
}

export function metaForRoles(roles: AdminNavRole[]): {
  requiresAuth: true;
  requiresAdmin: boolean;
  requiresEditor: boolean;
} {
  const allowsEditor = roles.includes('editor');
  // SPEC §3: Admin can do everything Editor can, so any route open to Editor is also open to
  // Admin. Both flags are always emitted explicitly, and requiresEditor stays true on Admin-only
  // routes as well (since authStore.canEditData is isAdmin || isEditor) so a child route never
  // weakens the parent /admin shell's baseline editor/admin gate.
  return {
    requiresAuth: true,
    requiresAdmin: !allowsEditor,
    requiresEditor: true,
  };
}

const adminNavLinks = ADMIN_NAV.flatMap((entry) =>
  isAdminNavGroup(entry) ? entry.items : [entry],
);
export const rolesByPath = new Map(adminNavLinks.map((item) => [item.to, item.roles]));

/**
 * Looks up the roles ADMIN_NAV declares for a path. Defaults fail-closed to `['admin']` at runtime
 * so a renamed nav path never crashes router module initialization (which would break public
 * pages too) or silently widens access to editors; `adminNavRouteSync.spec.ts` asserts in CI that
 * every admin route and `ADMIN_NAV` stay in sync.
 */
export function rolesFor(path: string): AdminNavRole[] {
  return rolesByPath.get(path) ?? ['admin'];
}

/**
 * Scroll policy for every route (public and admin):
 * - back/forward restores the saved position;
 * - a hash that resolves to an element scrolls to it, clearing the sticky header by the element's
 *   own computed `scroll-margin-top` (vue-router positions with getBoundingClientRect, which
 *   ignores that CSS). `.public-shell [id]` sets it from `--public-header-height`, so public pages
 *   clear the header with no hardcoded number, and admin pages (no such rule) get 0;
 * - a path change otherwise resets to the top;
 * - query-only changes keep the position (views use them to sync filters).
 * Always `behavior: 'auto'` (never smooth, so reduced-motion needs no special case). Waits one tick
 * so the new route component has rendered before measuring.
 */
export const scrollBehavior: RouterScrollBehavior = async (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  savedPosition,
) => {
  if (savedPosition) return savedPosition;
  await nextTick();
  if (to.hash) {
    let id = to.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // keep the raw id
    }
    const el = document.getElementById(id);
    if (el) {
      const top = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      return { el, top, behavior: 'auto' };
    }
  }
  if (to.path !== from.path) return { top: 0, left: 0, behavior: 'auto' };
  return false;
};

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior,
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { layout: 'public', headerOverlay: true, title: 'Beranda' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: 'Masuk' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { title: 'Daftar' },
    },
    {
      path: '/setup-password',
      name: 'setup-password',
      component: () => import('../views/SetupPassword.vue'),
      meta: { title: 'Penyiapan Kata Sandi' },
    },
    {
      path: '/admin',
      name: 'admin-shell',
      component: () => import('../layouts/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresEditor: true },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('../views/AdminDashboardView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/admin')),
            title: 'Beranda',
            subtitle: 'Ringkasan aktivitas dan pintasan menuju modul admin.',
            breadcrumb: [],
          },
        },
        {
          path: '/users',
          name: 'user-management',
          component: () => import('../views/UserManagement.vue'),
          meta: {
            ...metaForRoles(rolesFor('/users')),
            title: 'Manajemen Pengguna',
            subtitle: 'Kelola akun pengguna sistem, hak akses, dan status aktivasi.',
            breadcrumb: ['Sistem', 'Akun pengguna'],
          },
        },
        {
          path: 'cerita',
          name: 'admin-cerita',
          component: () => import('../views/AdminCeritaView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/admin/cerita')),
            title: 'Cerita',
            subtitle: 'Kelola daftar halaman Cerita, bab, dan urutannya.',
            breadcrumb: ['Cerita'],
          },
        },
        {
          path: 'peta',
          name: 'admin-peta',
          component: () => import('../views/AdminPetaView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/admin/peta')),
            title: 'Peta',
            subtitle: 'Kelola titik spasial, cakupan RT, dan data Ketua RT.',
            breadcrumb: ['Peta'],
          },
        },
        {
          path: 'publikasi',
          name: 'admin-publikasi',
          component: () => import('../views/AdminPublikasiView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/admin/publikasi')),
            title: 'Publikasi',
            subtitle: 'Kelola materi publikasi, infografis, dan dokumen terkait.',
            breadcrumb: ['Publikasi'],
          },
        },
        {
          path: 'rukun-tetangga',
          name: 'admin-rukun-tetangga',
          component: () => import('../views/AdminRukunTetanggaView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/admin/rukun-tetangga')),
            title: 'Rukun Tetangga',
            subtitle: 'Kelola data 100 Ketua RT: nama, kontak, dan alamat.',
            breadcrumb: ['Rukun Tetangga'],
          },
        },
        {
          path: 'sistem/templat-kalimat',
          name: 'admin-templat-kalimat',
          component: () => import('../views/AdminTemplatKalimatView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/admin/sistem/templat-kalimat')),
            title: 'Templat kalimat',
            subtitle: 'Kelola templat kalimat perbandingan tier-1 (SPEC §5).',
            breadcrumb: ['Sistem', 'Templat kalimat'],
          },
        },
        {
          path: 'sistem/konfigurasi',
          name: 'admin-konfigurasi-sistem',
          component: () => import('../views/AdminKonfigurasiSistemView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/admin/sistem/konfigurasi')),
            title: 'Konfigurasi sistem',
            subtitle: 'Pengaturan portal publik dan konfigurasi cuaca operasional.',
            breadcrumb: ['Sistem', 'Konfigurasi sistem'],
          },
        },
        {
          path: '/data',
          name: 'data-management',
          component: () => import('../views/DataManagementView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/data')),
            title: 'Data',
            subtitle:
              'Kelola angka indikator skalar dan empat tabel matriks. Angka dimasukkan manual; impor massal belum tersedia.',
            breadcrumb: ['Data'],
          },
        },
        {
          path: '/audit-logs',
          name: 'audit-log-viewer',
          component: () => import('../views/AuditLogView.vue'),
          meta: {
            ...metaForRoles(rolesFor('/audit-logs')),
            title: 'Log Sistem dan Audit Trail',
            subtitle:
              'Pantau seluruh aktivitas yang terjadi di sistem, mulai dari autentikasi hingga riwayat konfigurasi admin.',
            breadcrumb: ['Sistem', 'Log sistem'],
          },
        },
        {
          // Reached today via the "Retensi Audit" link inside UserManagement.vue, not a direct
          // sidebar item (SPEC §3 Sistem group has no separate retention entry). Still mounted
          // in the shell so the sidebar persists when an admin follows that link, with its own
          // explicit Admin-only role requirement (SPEC §3) rather than borrowing /users's roles.
          path: '/settings/audit-retention',
          name: 'audit-retention-settings',
          component: () => import('../views/AuditRetentionSettingsView.vue'),
          meta: {
            ...metaForRoles(['admin']),
            title: 'Pengaturan Retensi Audit',
            subtitle:
              'Atur masa penyimpanan log audit sistem berdasarkan tingkat keparahan (severity).',
            // Declares which sidebar item this child page belongs to, since its own path
            // doesn't match any ADMIN_NAV `to` (naive path-prefix matching would be unsafe here —
            // most ADMIN_NAV entries are /admin/* siblings, so prefix matching against '/admin'
            // would wrongly also light up Beranda). AdminSidebar.vue reads this to highlight
            // "Akun pengguna" and keep the Sistem group expanded while on this page.
            navActiveFor: '/users',
            breadcrumb: ['Sistem', { label: 'Akun pengguna', to: '/users' }, 'Retensi Audit'],
          },
        },
      ],
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true, title: 'Dasbor' },
    },
    {
      path: '/cerita/:slug',
      name: 'cerita-page',
      component: () => import('../views/CeritaPageView.vue'),
      meta: { layout: 'public', title: 'Cerita' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
      meta: { title: 'Autentikasi' },
    },
    {
      path: '/tentang',
      redirect: '/tentang/kelurahan-manggar',
    },
    {
      path: '/tentang/kelurahan-manggar',
      name: 'tentang-kelurahan-manggar',
      component: () => import('../views/TentangKelurahanManggarView.vue'),
      meta: { layout: 'public', title: 'Tentang Kelurahan Manggar' },
    },
    {
      path: '/tentang/desa-cantik',
      name: 'tentang-desa-cantik',
      component: () => import('../views/TentangDesaCantikView.vue'),
      meta: { layout: 'public', title: 'Program Desa Cantik' },
    },
    {
      path: '/tentang/vyomatantra',
      name: 'tentang-vyomatantra',
      component: () => import('../views/TentangVyomatantraView.vue'),
      meta: { layout: 'public', title: 'Inovasi Sosial VYOMATANTRA' },
    },
    {
      path: '/permintaan-data',
      name: 'permintaan-data',
      component: () => import('../views/PermintaanDataView.vue'),
      meta: { layout: 'public', title: 'Permintaan Data' },
    },
    {
      path: '/ketua-rt',
      name: 'ketua-rt',
      component: () => import('../views/KetuaRtView.vue'),
      meta: { layout: 'public', title: 'Ketua RT' },
    },
    {
      path: '/peta',
      name: 'peta',
      component: () => import('../views/PetaView.vue'),
      meta: { layout: 'public', title: 'Peta' },
    },
    {
      path: '/publikasi',
      name: 'publikasi',
      component: () => import('../views/PublikasiView.vue'),
      meta: { layout: 'public', title: 'Publikasi' },
    },
  ],
});

router.beforeEach(async (to) => {
  const pinia = getActivePinia();
  if (!pinia) return;

  const settingsStore = useSettingsStore(pinia);
  settingsStore.fetchPublicSettings();

  const authStore = useAuthStore(pinia);

  if (to.name === 'setup-password') {
    if (!authStore.setupToken && !authStore.mustChangePassword) {
      return { name: 'login', query: { reason: 'setup_required' } };
    }
  }

  if (!authStore.isAuthenticated && to.name !== 'setup-password' && !authStore.mustChangePassword) {
    await authStore.initAuth();
  }

  if (authStore.mustChangePassword && to.name !== 'setup-password') {
    return { name: 'setup-password' };
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' };
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'home' };
  }

  if (to.meta.requiresEditor && !authStore.canEditData) {
    return { name: 'home' };
  }

  if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
    return { name: 'home' };
  }
});

router.afterEach((to) => {
  const pinia = getActivePinia();
  if (!pinia) return;

  const settingsStore = useSettingsStore(pinia);
  const title = typeof to.meta.title === 'string' ? to.meta.title : undefined;
  settingsStore.updateDocumentTitle(title);
});

export default router;
