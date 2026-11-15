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
  /** Optional number of pages (1–100000), shown as "N Halaman". */
  pageCount?: number;
  /** Optional publication date, `YYYY-MM` or `YYYY-MM-DD`; only the month and year are shown. */
  publishedAt?: string;
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

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const PUBLISHED_AT = /^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/;

/**
 * `YYYY-MM` or `YYYY-MM-DD` that names a real date: the day must exist in that month. Identical to the
 * backend rule (`isValidPublishedAt` in backend/src/services/contentBlocks.service.ts).
 */
export function isValidPublishedAt(value: string): boolean {
  const match = PUBLISHED_AT.exec(value);
  if (!match) return false;
  if (match[3] === undefined) return true;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Day 0 of the following month (passed as a 1-based month) is the last day of this month.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The stored page count as a number, or null when absent or outside 1–100000. */
export function pageCountValue(pageCount?: number): number | null {
  if (typeof pageCount !== 'number' || !Number.isInteger(pageCount)) return null;
  if (pageCount < 1 || pageCount > 100000) return null;
  return pageCount;
}

/** "12 Halaman", or null when the stored count is absent or outside 1–100000. */
export function formatPageCount(pageCount?: number): string | null {
  const value = pageCountValue(pageCount);
  return value === null ? null : `${value} Halaman`;
}

/** "Maret 2026" from `YYYY-MM` or `YYYY-MM-DD` (the day is not shown), or null when invalid. */
export function formatPublishedAt(publishedAt?: string): string | null {
  if (typeof publishedAt !== 'string' || !isValidPublishedAt(publishedAt.trim())) return null;
  const match = PUBLISHED_AT.exec(publishedAt.trim());
  if (!match) return null;
  return `${MONTHS_ID[Number(match[2]) - 1]} ${match[1]}`;
}

/** "12 Halaman, Diterbitkan Maret 2026"; a missing part is left out, and no part gives "". */
export function publicationMetaLine(item: PublicationItem): string {
  const parts: string[] = [];
  const pages = formatPageCount(item.pageCount);
  if (pages) parts.push(pages);
  const published = formatPublishedAt(item.publishedAt);
  if (published) parts.push(`Diterbitkan ${published}`);
  return parts.join(', ');
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
