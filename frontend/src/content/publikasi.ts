export interface PublicationItem {
  category: string;
  title: string;
  description: string;
  href?: string;
  /** Strict boolean — download CTAs require `=== true` plus an https href. */
  isAvailableOnline: boolean;
  /**
   * Optional citation drawn from docs/CONTENT_SOURCES.md. Omitted when no
   * verified source title is available yet.
   */
  source?: string;
}

/**
 * Canonical publication catalog. Frontend CMS defaults import this list;
 * backend DEFAULT_CONTENT_BLOCKS keeps a mirrored copy — see the sync test in
 * contentBlocks.service.test / publikasiCatalog.sync.test.
 */
export const PUBLICATIONS: PublicationItem[] = [
  {
    category: 'Prodeskel',
    title: 'Publikasi Prodeskel',
    description: 'Dokumen dan publikasi resmi Kelurahan Manggar dari sistem Prodeskel.',
    isAvailableOnline: false,
    // CONTENT_SOURCES: Profil Kelurahan Manggar 2026.pdf reproduces 2025 Prodeskel-form data.
    source: 'Profil Kelurahan Manggar 2026.pdf (data formulir Prodeskel 2025)',
  },
  {
    category: 'Infografis',
    title: 'Infografis Kelurahan Manggar',
    description:
      'Ringkasan data kependudukan dan statistik Kelurahan Manggar dalam bentuk visual infografis.',
    isAvailableOnline: false,
    // CONTENT_SOURCES: Infografis / Data Kependudukan 2026.xlsx
    source: 'Data Kependudukan 2026.xlsx',
  },
  {
    category: 'Lingkungan',
    title: 'Booklet Eco Boba',
    description:
      'Dokumentasi pelatihan pengolahan limbah kemasan plastik menjadi bahan isian bantal (cushion filling) dalam program Eco Boba.',
    isAvailableOnline: false,
    // CONTENT_SOURCES: Publikasi / Booklet Pelatihan BSU.pdf
    source: 'Booklet Pelatihan BSU.pdf',
  },
  {
    category: 'Statistik',
    title: 'Manggar dalam Angka 2026',
    description:
      'Kompilasi data statistik sektoral, demografi, dan geografi Kelurahan Manggar. Dokumen fisik telah tercetak; unduhan versi digital (PDF) belum dirilis ke publik.',
    isAvailableOnline: false,
    // CONTENT_SOURCES: Publikasi / Manggar Dalam Angka 2026.pdf
    source: 'Manggar Dalam Angka 2026.pdf',
  },
];

/**
 * A publication is downloadable only when CMS marks it available online and the
 * href is an https URL (defense in depth with the contentBlocks schema).
 */
export function isDownloadable(item: PublicationItem): boolean {
  return (
    item.isAvailableOnline === true &&
    typeof item.href === 'string' &&
    item.href.startsWith('https://')
  );
}

export function hasPublicPublication(list: PublicationItem[] = PUBLICATIONS): boolean {
  return list.some(isDownloadable);
}
