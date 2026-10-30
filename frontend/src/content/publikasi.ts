export interface PublicationItem {
  category: string;
  title: string;
  description: string;
  href?: string;
  isAvailableOnline: boolean;
}

export const PUBLICATIONS: PublicationItem[] = [
  {
    category: 'Prodeskel',
    title: 'Publikasi Prodeskel',
    description: 'Dokumen dan publikasi resmi Kelurahan Manggar dari sistem Prodeskel.',
    isAvailableOnline: false,
  },
  {
    category: 'Infografis',
    title: 'Infografis Kelurahan Manggar',
    description:
      'Ringkasan data kependudukan dan statistik Kelurahan Manggar dalam bentuk visual infografis.',
    isAvailableOnline: false,
  },
  {
    category: 'Lingkungan',
    title: 'Booklet Eco Boba',
    description:
      'Dokumentasi pelatihan pengolahan limbah kemasan plastik menjadi bahan isian bantal (cushion filling) dalam program Eco Boba.',
    isAvailableOnline: false,
  },
  {
    category: 'Statistik',
    title: 'Manggar dalam Angka 2026',
    description:
      'Kompilasi data statistik sektoral, demografi, dan geografi Kelurahan Manggar. Dokumen fisik telah tercetak; unduhan versi digital (PDF) belum dirilis ke publik.',
    isAvailableOnline: false,
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
