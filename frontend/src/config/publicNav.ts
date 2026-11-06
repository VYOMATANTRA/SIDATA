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
