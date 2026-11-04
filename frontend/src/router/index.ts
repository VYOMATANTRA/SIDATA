import { createRouter, createWebHistory } from 'vue-router';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings.store';
import { ADMIN_NAV, isAdminNavGroup, type AdminNavRole } from '../config/adminNav';

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
  const allowsAdmin = roles.includes('admin') || allowsEditor;
  return {
    requiresAuth: true,
    requiresAdmin: allowsAdmin && !allowsEditor,
    requiresEditor: allowsEditor || allowsAdmin,
  };
}

const adminNavLinks = ADMIN_NAV.flatMap((entry) =>
  isAdminNavGroup(entry) ? entry.items : [entry],
);
export const rolesByPath = new Map(adminNavLinks.map((item) => [item.to, item.roles]));
export const requestedNavPaths: string[] = [];

/**
 * Looks up the roles ADMIN_NAV declares for a path. Defaults fail-closed to `['admin']` at runtime
 * so a renamed nav path never crashes router module initialization (which would break public
 * pages too) or silently widens access to editors; `adminNavRouteSync.spec.ts` asserts in CI that
 * every path passed to `rolesFor` exists in `ADMIN_NAV`.
 */
export function rolesFor(path: string): AdminNavRole[] {
  requestedNavPaths.push(path);
  return rolesByPath.get(path) ?? ['admin'];
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { title: 'Beranda' },
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
            // Declares which sidebar item this child page belongs to, since its own path
            // doesn't match any ADMIN_NAV `to` (naive path-prefix matching would be unsafe here —
            // most ADMIN_NAV entries are /admin/* siblings, so prefix matching against '/admin'
            // would wrongly also light up Beranda). AdminSidebar.vue reads this to highlight
            // "Akun pengguna" and keep the Sistem group expanded while on this page.
            navActiveFor: '/users',
            breadcrumb: ['Sistem', 'Akun pengguna', 'Retensi Audit'],
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
      meta: { title: 'Cerita' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
      meta: { title: 'Autentikasi' },
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
