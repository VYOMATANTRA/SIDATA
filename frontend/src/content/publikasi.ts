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
  /** Optional file format label (e.g. 'PDF', 'XLSX') */
  fileType?: string;
  /** Optional file size in bytes */
  fileSizeBytes?: number;
  /** An uploaded PDF/DOCX (media purpose `publikasi-document`); served by `/api/media/<id>/download`. */
  documentAssetId?: string;
  /** Cover photo (media purpose `publikasi-cover`); shown from its thumbnail. */
  coverAssetId?: string;
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

const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mediaId(value: unknown): string | null {
  return typeof value === 'string' && MEDIA_ID.test(value) ? value.toLowerCase() : null;
}

/**
 * Where a resident downloads the publication: the uploaded file, else an https link, else null.
 * Only an item the CMS marks available online has one (defense in depth with the contentBlocks
 * schema); a malformed file id never reaches a URL.
 */
export function publicationDownloadHref(item: PublicationItem): string | null {
  if (item.isAvailableOnline !== true) return null;
  const documentId = mediaId(item.documentAssetId);
  if (documentId) return `/api/media/${documentId}/download`;
  if (typeof item.href === 'string' && item.href.startsWith('https://')) return item.href;
  return null;
}

/** Thumbnail address of the cover photo, or null. */
export function publicationCoverSrc(item: PublicationItem): string | null {
  const id = mediaId(item.coverAssetId);
  return id ? `/api/media/${id}?variant=thumbnail` : null;
}

export function isDownloadable(item: PublicationItem): boolean {
  return publicationDownloadHref(item) !== null;
}

export function hasPublicPublication(list: PublicationItem[] = PUBLICATIONS): boolean {
  return list.some(isDownloadable);
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
