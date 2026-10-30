import { describe, it, expect, vi } from 'vitest';

/**
 * Regression test for router/index.ts's `rolesFor` helper (SPEC §3: "Visibility derives from one
 * role-to-items map shared with the route guards, so nav and routes can't disagree"). A route's
 * `meta.requiresAdmin`/`requiresEditor` is looked up by copying a path string from adminNav.ts's
 * `to` field; if that string ever drifts out of sync with adminNav.ts, the lookup must fail loudly
 * (throw at module load) rather than silently falling back to a guessed role set.
 *
 * This file is isolated from the rest of the suite (Vitest gives each test file its own module
 * registry) so `vi.resetModules()`/`vi.doMock()` here cannot affect router.spec.ts or any other
 * spec that imports the real, unmocked router/index.ts.
 */
describe('router/index.ts — rolesFor fail-fast behavior', () => {
  it('throws at module load if a route path is missing from ADMIN_NAV', async () => {
    vi.resetModules();
    vi.doMock('../config/adminNav', async () => {
      const actual =
        await vi.importActual<typeof import('../config/adminNav')>('../config/adminNav');
      return {
        ...actual,
        // Drop the Sistem group entirely, simulating a path renamed in adminNav.ts (e.g. '/users'
        // moved to '/admin/users') without the literal in router/index.ts being updated to match.
        ADMIN_NAV: actual.ADMIN_NAV.filter((entry) => !actual.isAdminNavGroup(entry)),
      };
    });

    await expect(import('../router/index')).rejects.toThrow(
      /no ADMIN_NAV entry with to: "\/users"/,
    );

    vi.doUnmock('../config/adminNav');
    vi.resetModules();
  });

  it('loads without error when ADMIN_NAV paths match the router (current state)', async () => {
    vi.resetModules();
    await expect(import('../router/index')).resolves.toBeDefined();
  });
});
