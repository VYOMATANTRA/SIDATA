/**
 * Element ids on the Cerita management screen that other code has to find again: to hand
 * keyboard focus back after a move, an add, a dialog or a return to the list. Kept in one place so
 * the components that render them and the view that focuses them cannot drift apart.
 */
export const ceritaIds = {
  search: 'cerita-cari',
  sortToggle: 'cerita-urutkan',
  selectAll: 'cerita-pilih-semua',
  bulkDelete: 'cerita-hapus-terpilih',
  addPage: 'cerita-tambah-halaman',
  cardEdit: (slug: string): string => `cerita-kartu-${slug}-ubah`,
  cardDelete: (slug: string): string => `cerita-kartu-${slug}-hapus`,
  cardUp: (slug: string): string => `cerita-kartu-${slug}-naik`,
  cardDown: (slug: string): string => `cerita-kartu-${slug}-turun`,
  cardCheckbox: (slug: string): string => `cerita-kartu-${slug}-pilih`,
  backToList: 'cerita-kembali-ke-daftar',
  /** The "Info cerita" row of the structure tree: opens the headline and byline dialog. */
  pageDetails: 'cerita-info',
  addChapter: 'cerita-tambah-bab',
  chapterRename: (id: string): string => `cerita-bab-${id}-ubah`,
  chapterUp: (id: string): string => `cerita-bab-${id}-naik`,
  chapterDown: (id: string): string => `cerita-bab-${id}-turun`,
  chapterDelete: (id: string): string => `cerita-bab-${id}-hapus`,
  addSection: (chapterId: string): string => `cerita-bab-${chapterId}-tambah-bagian`,
  sectionRename: (id: string): string => `cerita-bagian-${id}-ubah`,
  sectionUp: (id: string): string => `cerita-bagian-${id}-naik`,
  sectionDown: (id: string): string => `cerita-bagian-${id}-turun`,
  sectionDelete: (id: string): string => `cerita-bagian-${id}-hapus`,
  /** Tree rows: the chapter toggle and the section button (focus returns to these). */
  treeChapter: (id: string): string => `cerita-pohon-bab-${id}`,
  treeSection: (id: string): string => `cerita-pohon-bagian-${id}`,
  /** Centre column: the section heading (focus after add, duplicate and selection). */
  sectionHeading: 'cerita-bagian-judul',
  sectionDuplicate: 'cerita-bagian-duplikat',
  sectionPrev: 'cerita-bagian-sebelumnya',
  sectionNext: 'cerita-bagian-berikutnya',
  /** Chapter overview (centre column when a chapter is selected). */
  overviewLabel: 'cerita-ringkasan-bab',
  overviewTitleField: 'cerita-ringkasan-judul',
  overviewTitleSave: 'cerita-ringkasan-judul-simpan',
  overviewChapterUp: 'cerita-ringkasan-bab-naik',
  overviewChapterDown: 'cerita-ringkasan-bab-turun',
  overviewChapterDelete: 'cerita-ringkasan-bab-hapus',
  overviewList: 'cerita-ringkasan-daftar',
  overviewAddHeading: 'cerita-ringkasan-tambah-judul',
  /** Section card: the title button (focus target) and the ⋯ menu summary. */
  overviewCardTitle: (id: string): string => `cerita-ringkasan-bagian-${id}`,
  overviewCardMenu: (id: string): string => `cerita-ringkasan-menu-${id}`,
  overviewCardUp: (id: string): string => `cerita-ringkasan-bagian-${id}-naik`,
  overviewCardDown: (id: string): string => `cerita-ringkasan-bagian-${id}-turun`,
  overviewCardMove: (id: string): string => `cerita-ringkasan-bagian-${id}-pindah`,
  overviewCardDuplicate: (id: string): string => `cerita-ringkasan-bagian-${id}-duplikat`,
  overviewCardDelete: (id: string): string => `cerita-ringkasan-bagian-${id}-hapus`,
} as const;
