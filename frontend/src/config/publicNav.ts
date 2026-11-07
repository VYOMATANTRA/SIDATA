import type { Router } from 'vue-router';

export interface NavItem {
  label: string;
  to: string;
}

/**
 * Canonical navigation items for public site chrome (navbar drawers, etc.).
 * Guarantees that public navigation across views (HomeView, Tentang layouts, etc.)
 * remains synchronized per docs/SPEC.md §8.
 */
export const DEFAULT_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Beranda', to: '/' },
  { label: 'Publikasi', to: '/publikasi' },
  { label: 'Peta', to: '/peta' },
  { label: 'Ketua RT', to: '/ketua-rt' },
  { label: 'Permintaan Data', to: '/permintaan-data' },
  { label: 'Tentang', to: '/tentang/kelurahan-manggar' },
];

/**
 * Checks whether a destination route is registered in the router.
 * If router is not available (e.g. isolated test environments), returns true.
 */
export function isRouteAvailable(router: Router | undefined | null, to: string): boolean {
  if (!router) return true;
  return router.resolve(to).matched.length > 0;
}

/**
 * Filters the canonical navigation items to only those whose routes exist in the router.
 */
export function getAvailableNavItems(router: Router | undefined | null): NavItem[] {
  return DEFAULT_NAV_ITEMS.filter((item) => isRouteAvailable(router, item.to));
}

/**
 * Determines whether a navigation item is considered active for the current path.
 * - Exact match for home ('/')
 * - Prefix match for '/tentang' so /tentang/desa-cantik and /tentang/vyomatantra
 *   also highlight the 'Tentang' nav item
 * - Exact or prefix match for other section routes
 */
export function isNavItemActive(itemTo: string, currentPath: string): boolean {
  if (itemTo === '/') {
    return currentPath === '/';
  }
  if (itemTo.startsWith('/tentang')) {
    return currentPath.startsWith('/tentang');
  }
  return currentPath === itemTo || currentPath.startsWith(`${itemTo}/`);
}
