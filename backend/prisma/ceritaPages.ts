/**
 * Seed data for the 8 Cerita pages and their chapters (docs/SPEC.md §2). Lives in its own
 * module, not inline in seed.ts, so tests can import it without running the seed.
 *
 * `sortOrder` values are 0-based and contiguous within their parent. Chapter `number` is only
 * set where SPEC.md §2 numbers the chapters (Pemerintahan, Infrastruktur).
 *
 * Not spelled out in SPEC.md §2, so best-guess and open to editor revision:
 * - Pemerintahan chapter 2.6 (Sosial Kemasyarakatan): §2 only says the page "also hosts" it.
 * - Persampahan chapters: §2 describes the page's content but lists no chapters.
 */
export interface CeritaChapterSeed {
  slug: string;
  number?: string;
  title: string;
}

export interface CeritaPageSeed {
  slug: string;
  title: string;
  chapters: CeritaChapterSeed[];
}

export const CERITA_PAGES: readonly CeritaPageSeed[] = [
  {
    slug: 'kependudukan',
    title: 'Kependudukan',
    chapters: [
      { slug: 'jumlah-penduduk', title: 'Jumlah Penduduk' },
      { slug: 'jumlah-keluarga', title: 'Jumlah Keluarga' },
      { slug: 'piramida-usia', title: 'Piramida Usia' },
      { slug: 'suku-etnis', title: 'Suku/Etnis' },
      { slug: 'agama-jenis-kelamin', title: 'Agama menurut Jenis Kelamin' },
      { slug: 'mata-pencaharian', title: 'Mata Pencaharian' },
    ],
  },
  {
    slug: 'pendidikan',
    title: 'Pendidikan',
    chapters: [
      { slug: 'tingkat-pendidikan', title: 'Tingkat Pendidikan' },
      { slug: 'wajib-belajar-9-tahun', title: 'Wajib Belajar 9 Tahun' },
      { slug: 'rasio-guru-murid', title: 'Rasio Guru-Murid' },
      { slug: 'kelembagaan-pendidikan', title: 'Kelembagaan Pendidikan' },
    ],
  },
  {
    slug: 'kesehatan',
    title: 'Kesehatan',
    chapters: [
      { slug: 'ibu-hamil', title: 'Ibu Hamil' },
      { slug: 'bayi', title: 'Bayi' },
      { slug: 'persalinan', title: 'Persalinan' },
      { slug: 'cakupan-imunisasi', title: 'Cakupan Imunisasi' },
      { slug: 'pus-kb', title: 'PUS & KB' },
      { slug: 'air-bersih', title: 'Air Bersih' },
      { slug: 'phbs', title: 'PHBS' },
      { slug: 'gizi-balita', title: 'Gizi Balita' },
      { slug: 'jumlah-penderita-sakit', title: 'Jumlah Penderita Sakit' },
      { slug: 'sarana-kesehatan', title: 'Sarana Kesehatan' },
    ],
  },
  {
    slug: 'ekonomi-dan-ketertiban',
    title: 'Ekonomi dan Ketertiban',
    chapters: [
      { slug: 'pengangguran', title: 'Pengangguran' },
      { slug: 'kesejahteraan-keluarga', title: 'Kesejahteraan Keluarga' },
      { slug: 'aset-sarana-produksi', title: 'Aset Sarana Produksi' },
      { slug: 'keamanan', title: 'Keamanan' },
    ],
  },
  {
    slug: 'geografis-dan-tata-ruang',
    title: 'Geografis dan Tata Ruang',
    chapters: [
      { slug: 'geografis', title: 'Geografis' },
      { slug: 'penggunaan-lahan', title: 'Penggunaan Lahan' },
      { slug: 'sumber-daya', title: 'Sumber Daya' },
    ],
  },
  {
    slug: 'pemerintahan-dan-kelembagaan',
    title: 'Pemerintahan & Kelembagaan',
    chapters: [
      { slug: 'wilayah-administrasi', number: '2.1', title: 'Wilayah Administrasi' },
      { slug: 'aparatur-pemerintahan', number: '2.2', title: 'Aparatur Pemerintahan' },
      { slug: 'pemerintahan-kelurahan', number: '2.3', title: 'Pemerintahan Kelurahan' },
      { slug: 'lembaga-kemasyarakatan', number: '2.4', title: 'Lembaga Kemasyarakatan' },
      {
        slug: 'pertanggungjawaban-dan-pembinaan',
        number: '2.5',
        title: 'Pertanggungjawaban dan Pembinaan',
      },
      { slug: 'sosial-kemasyarakatan', number: '2.6', title: 'Sosial Kemasyarakatan' },
    ],
  },
  {
    slug: 'infrastruktur-dan-perumahan',
    title: 'Infrastruktur & Perumahan',
    chapters: [
      { slug: 'air-bersih-dan-sanitasi', number: '6.1', title: 'Air Bersih dan Sanitasi' },
      { slug: 'perumahan', number: '6.2', title: 'Perumahan' },
    ],
  },
  {
    slug: 'persampahan-dan-bank-sampah-unit',
    title: 'Persampahan & Bank Sampah Unit',
    chapters: [
      { slug: 'bank-sampah-unit', title: 'Bank Sampah Unit' },
      { slug: 'program-eco-boba', title: 'Program Eco Boba' },
      { slug: 'booklet-eco-boba', title: 'Booklet Eco Boba' },
    ],
  },
];
