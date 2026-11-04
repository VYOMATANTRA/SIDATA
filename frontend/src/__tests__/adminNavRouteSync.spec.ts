import { describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import router, { metaForRoles, rolesByPath, rolesFor } from '../router/index';
import { ADMIN_NAV, isAdminNavGroup } from '../config/adminNav';
import { useAuthStore } from '../stores/auth';

/**
 * Regression tests for router/index.ts's `rolesFor` and `metaForRoles` helpers (SPEC §3 / §8:
 * "Visibility is driven by a single role-to-items map (`frontend/src/config/adminNav.ts`) that the
 * route guards also read from, so the sidebar and the guards cannot disagree about who can reach a
 * given page").
 *
 * Rather than throwing at module load time (which would crash the whole app — including public
 * pages — if a nav path were ever renamed), `rolesFor` defaults fail-closed to `['admin']` at
 * runtime and this unit test suite enforces 1:1 synchronization in CI by inspecting the route table.
 */
describe('router/index.ts — ADMIN_NAV route synchronization and role guards', () => {
  it('every ADMIN_NAV entry resolves to a registered admin route with matching role meta, and every admin child route maps to ADMIN_NAV', () => {
    const allNavLinks = ADMIN_NAV.flatMap((entry) =>
      isAdminNavGroup(entry) ? entry.items : [entry],
    );

    for (const link of allNavLinks) {
      const resolved = router.resolve(link.to);
      expect(
        resolved.matched.length,
        `ADMIN_NAV entry "${link.to}" did not match any route in router/index.ts`,
      ).toBeGreaterThan(0);

      const expectedMeta = metaForRoles(link.roles);
      expect(resolved.meta.requiresAuth).toBe(expectedMeta.requiresAuth);
      expect(resolved.meta.requiresAdmin).toBe(expectedMeta.requiresAdmin);
      expect(resolved.meta.requiresEditor).toBe(expectedMeta.requiresEditor);
      expect(typeof resolved.meta.title).toBe('string');
      expect(typeof resolved.meta.subtitle).toBe('string');
    }

    const adminShellRoute = router.getRoutes().find((r) => r.name === 'admin-shell');
    expect(adminShellRoute).toBeDefined();

    for (const child of adminShellRoute?.children ?? []) {
      const fullPath = child.path.startsWith('/')
        ? child.path
        : child.path
          ? `/admin/${child.path}`
          : '/admin';
      const navTarget =
        typeof child.meta?.navActiveFor === 'string' ? child.meta.navActiveFor : fullPath;
      expect(
        rolesByPath.has(navTarget),
        `Admin child route "${fullPath}" (navTarget "${navTarget}") has no matching entry in ADMIN_NAV`,
      ).toBe(true);
    }
  });

  it('rolesFor fails closed to ["admin"] when given an unknown path without throwing', () => {
    expect(rolesFor('/non-existent-nav-path')).toEqual(['admin']);
  });

  it('metaForRoles always emits explicit requiresAuth, requiresAdmin, and requiresEditor flags', () => {
    expect(metaForRoles(['admin'])).toEqual({
      requiresAuth: true,
      requiresAdmin: true,
      requiresEditor: true,
    });
    expect(metaForRoles(['editor', 'admin'])).toEqual({
      requiresAuth: true,
      requiresAdmin: false,
      requiresEditor: true,
    });
    // Even if a nav item lists only ['editor'], SPEC §3 says Admin can do everything Editor can,
    // and an empty list fails closed to admin-only.
    expect(metaForRoles(['editor'])).toEqual({
      requiresAuth: true,
      requiresAdmin: false,
      requiresEditor: true,
    });
    expect(metaForRoles([])).toEqual({
      requiresAuth: true,
      requiresAdmin: true,
      requiresEditor: true,
    });
  });

  it('rejects an authenticated editor on every admin-only route (including /settings/audit-retention) and allows an admin', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);

    const adminOnlyPaths = [
      '/users',
      '/audit-logs',
      '/settings/audit-retention',
      '/admin/sistem/templat-kalimat',
      '/admin/sistem/konfigurasi',
    ];

    // Editor must be rejected (redirected to home) on every admin-only route.
    authStore.setAuth({ id: 'ed-1', email: 'editor@manggar.go.id', role: 'editor' }, 'token');
    for (const path of adminOnlyPaths) {
      await router.push('/admin');
      await router.push(path);
      expect(
        router.currentRoute.value.name,
        `expected editor to be rejected from admin-only route "${path}"`,
      ).toBe('home');
    }

    // Admin must be allowed onto every admin-only route.
    authStore.setAuth({ id: 'ad-1', email: 'admin@manggar.go.id', role: 'admin' }, 'token');
    for (const path of adminOnlyPaths) {
      await router.push(path);
      expect(router.currentRoute.value.path).toBe(path);
    }
  });
});
