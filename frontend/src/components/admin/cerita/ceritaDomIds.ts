/**
 * Element ids on the Cerita management screen that other code has to find again: to hand
 * keyboard focus back after a move, an add or a dialog. Kept in one place so the panel that
 * renders them and the view that focuses them cannot drift apart.
 */
export const ceritaIds = {
  addPage: 'cerita-tambah-halaman',
  pageHeading: 'cerita-halaman-judul',
  pageSelect: (slug: string): string => `cerita-halaman-${slug}`,
  pageRename: 'cerita-halaman-ubah',
  pageDetails: 'cerita-halaman-judul-utama',
  pageUp: 'cerita-halaman-naik',
  pageDown: 'cerita-halaman-turun',
  pageDelete: 'cerita-halaman-hapus',
  addChapter: 'cerita-tambah-bab',
  chapterRename: (id: string): string => `cerita-bab-${id}-ubah`,
  chapterUp: (id: string): string => `cerita-bab-${id}-naik`,
  chapterDown: (id: string): string => `cerita-bab-${id}-turun`,
  chapterDelete: (id: string): string => `cerita-bab-${id}-hapus`,
  addSection: (chapterId: string): string => `cerita-bab-${chapterId}-tambah-bagian`,
  sectionOpen: (id: string): string => `cerita-bagian-${id}-isi`,
  sectionRename: (id: string): string => `cerita-bagian-${id}-ubah`,
  sectionUp: (id: string): string => `cerita-bagian-${id}-naik`,
  sectionDown: (id: string): string => `cerita-bagian-${id}-turun`,
  sectionDelete: (id: string): string => `cerita-bagian-${id}-hapus`,
} as const;
