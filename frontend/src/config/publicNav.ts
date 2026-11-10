import type { Router } from 'vue-router';

export interface NavItem {
  label: string;
  to: string;
}

/**
 * Canonical navigation items for footer Sumber Daya section per SPEC §8.
 */
export const FOOTER_RESOURCE_LINKS: readonly NavItem[] = [
  { label: 'Publikasi', to: '/publikasi' },
  { label: 'Peta', to: '/peta' },
  { label: 'Permintaan Data', to: '/permintaan-data' },
  { label: 'Ketua RT', to: '/ketua-rt' },
];

/**
 * Canonical navigation items for footer Cerita Statistik section per SPEC §8.
 */
export const FOOTER_STORY_LINKS: readonly NavItem[] = [
  { label: 'Demografi Kependudukan', to: '/cerita/kependudukan' },
  { label: 'Pendidikan', to: '/cerita/pendidikan' },
  { label: 'Kesehatan', to: '/cerita/kesehatan' },
  { label: 'Pemerintahan & Kelembagaan', to: '/cerita/pemerintahan-dan-kelembagaan' },
  { label: 'Ekonomi & Ketertiban', to: '/cerita/ekonomi-dan-ketertiban' },
  { label: 'Geografis & Tata Ruang', to: '/cerita/geografis-dan-tata-ruang' },
  { label: 'Infrastruktur & Perumahan', to: '/cerita/infrastruktur-dan-perumahan' },
  { label: 'Persampahan & Bank Sampah Unit', to: '/cerita/persampahan-dan-bank-sampah-unit' },
];

/**
 * Canonical navigation items for footer Tentang section per SPEC §8.
 */
export const FOOTER_ABOUT_LINKS: readonly NavItem[] = [
  { label: 'Kelurahan Manggar', to: '/tentang/kelurahan-manggar' },
  { label: 'Program Desa/Kelurahan Cantik', to: '/tentang/desa-cantik' },
  { label: 'Inovasi Sosial VYOMATANTRA', to: '/tentang/vyomatantra' },
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
 * Normalizes a URL path for comparison: decodes URI components and strips trailing slashes
 * (except root `/`).
 */
function normalizePath(p: string): string {
  let decoded = p;
  try {
    decoded = decodeURI(p);
  } catch {
    // keep raw
  }
  if (decoded.length > 1 && decoded.endsWith('/')) {
    decoded = decoded.replace(/\/+$/, '');
  }
  return decoded;
}

/**
 * Base path matching shared by public navigation active checks:
 * - Exact match for home ('/')
 * - Equal or nested (`startsWith(to + '/')`) for other routes
 * Handles trailing slashes and URI-encoded slugs consistently.
 */
export function matchesPath(to: string, currentPath: string): boolean {
  const normTo = normalizePath(to);
  const normCurrent = normalizePath(currentPath);
  if (normTo === '/') {
    return normCurrent === '/';
  }
  return normCurrent === normTo || normCurrent.startsWith(`${normTo}/`);
}

/** Identifier of a public navigation group (SPEC §8). */
export type NavGroupId = 'cerita' | 'sumber-daya' | 'tentang';

export interface NavGroup {
  id: NavGroupId;
  label: string;
  items: NavItem[];
}

/** Standalone link above the groups in the public menu. */
export const NAV_HOME_ITEM: NavItem = { label: 'Beranda', to: '/' };

/**
 * A destination is active only for its own path (or a nested path below it). The three Tentang
 * pages are distinct destinations here, so only the page the visitor is on is marked, not all of them.
 */
export function isDestinationActive(to: string, currentPath: string): boolean {
  return matchesPath(to, currentPath);
}

export function isNavGroupActive(group: NavGroup, currentPath: string): boolean {
  return group.items.some((item) => isDestinationActive(item.to, currentPath));
}

/**
 * Cerita topics from the page hierarchy, in `sortOrder`. Returns the deterministic
 * `FOOTER_STORY_LINKS` when the hierarchy has not loaded (or is empty), so the menu never renders
 * an empty Cerita group.
 */
export function buildCeritaItems(
  pages: ReadonlyArray<{ slug: string; title: string; sortOrder: number }> | null | undefined,
): NavItem[] {
  if (!pages || pages.length === 0) return [...FOOTER_STORY_LINKS];
  return [...pages]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((page) => ({ label: page.title, to: `/cerita/${encodeURIComponent(page.slug)}` }));
}

/**
 * The public menu's groups: Cerita (from the hierarchy), Sumber Daya and Tentang (SPEC §8). Links
 * whose route is not registered are dropped, and a group left empty is omitted.
 */
export function buildPublicNavGroups(
  router: Router | undefined | null,
  ceritaItems: readonly NavItem[],
): NavGroup[] {
  const groups: NavGroup[] = [
    { id: 'cerita', label: 'Cerita', items: [...ceritaItems] },
    { id: 'sumber-daya', label: 'Sumber Daya', items: [...FOOTER_RESOURCE_LINKS] },
    { id: 'tentang', label: 'Tentang', items: [...FOOTER_ABOUT_LINKS] },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isRouteAvailable(router, item.to)),
    }))
    .filter((group) => group.items.length > 0);
}
