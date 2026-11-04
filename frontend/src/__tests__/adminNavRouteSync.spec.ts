import { describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import router, { metaForRoles, requestedNavPaths, rolesByPath, rolesFor } from '../router/index';
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
 * runtime and this unit test suite enforces 1:1 synchronization in CI.
 */
describe('router/index.ts — ADMIN_NAV route synchronization and role guards', () => {
  it('every path looked up via rolesFor() in router/index.ts exists in ADMIN_NAV', () => {
    expect(requestedNavPaths.length).toBeGreaterThan(0);
    for (const path of requestedNavPaths) {
      expect(
        rolesByPath.has(path),
        `router/index.ts called rolesFor("${path}"), which has no matching entry in ADMIN_NAV`,
      ).toBe(true);
    }

    const allNavPaths = ADMIN_NAV.flatMap((entry) =>
      isAdminNavGroup(entry) ? entry.items.map((item) => item.to) : [entry.to],
    );
    for (const navPath of allNavPaths) {
      expect(
        requestedNavPaths.includes(navPath),
        `ADMIN_NAV entry "${navPath}" is not wired via rolesFor() in router/index.ts`,
      ).toBe(true);
    }
  });

  it('does not crash app module load if a nav path is renamed, failing closed to ["admin"] while flagging the mismatch', async () => {
    expect(rolesFor('/non-existent-nav-path')).toEqual(['admin']);

    vi.resetModules();
    vi.doMock('../config/adminNav', async () => {
      const actual =
        await vi.importActual<typeof import('../config/adminNav')>('../config/adminNav');
      return {
        ...actual,
        ADMIN_NAV: actual.ADMIN_NAV.filter((entry) => !actual.isAdminNavGroup(entry)),
      };
    });

    const mockedRouterModule = await import('../router/index');
    expect(mockedRouterModule.default).toBeDefined();
    const missingPaths = mockedRouterModule.requestedNavPaths.filter(
      (p) => !mockedRouterModule.rolesByPath.has(p),
    );
    expect(missingPaths).toContain('/users');

    vi.doUnmock('../config/adminNav');
    vi.resetModules();
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
    // Even if a nav item lists only ['editor'], SPEC §3 says Admin can do everything Editor can.
    expect(metaForRoles(['editor'])).toEqual({
      requiresAuth: true,
      requiresAdmin: false,
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
