import type { StatCardIconName, StatItem } from '../components/common/StatCard.vue';

// TODO(#<issue>): move to CMS
export const RT_COUNT = 100;

// TODO(#<issue>): move to CMS
export const KECAMATAN = 'Balikpapan Timur';

// TODO(#<issue>): move to CMS
export const KOTA = 'Kota Balikpapan';

// TODO(#<issue>): move to CMS
export const LANDSCAPE = 'Pesisir & Dataran';

export interface BatasWilayahItem {
  arah: string;
  wilayah: string;
}

// TODO(#<issue>): move to CMS
export const BATAS_WILAYAH: BatasWilayahItem[] = [
  { arah: 'Sebelah Utara', wilayah: 'Kelurahan Karang Joang' },
  { arah: 'Sebelah Timur', wilayah: 'Kelurahan Manggar Baru' },
  { arah: 'Sebelah Selatan', wilayah: 'Selat Makassar' },
  { arah: 'Sebelah Barat', wilayah: 'Kelurahan Sepinggan dan Sepinggan Baru' },
];

export interface SotkMember {
  role: string;
  officialName: string | null;
  duties: string | null;
}

// TODO(#<issue>): move to CMS
export const SOTK_MEMBERS: SotkMember[] = [
  {
    role: 'Lurah',
    officialName: 'Munir Achmad, S.E.',
    duties: null,
  },
  {
    role: 'Sekretaris Lurah',
    officialName: 'Munjiah Puspitawaty. M, S.E',
    duties: null,
  },
  {
    role: 'Kasi Trantib L-H',
    officialName: 'Nanang Sri Ruriyanto, S.Sos.',
    duties: null,
  },
  {
    role: 'Kasi Pemerintahan dan Pelayanan Publik',
    officialName: 'Hasiba, S.A.P',
    duties: null,
  },
  {
    role: 'Kasi Pemberdayaan Masyarakat',
    officialName: 'Marthen Solly, S.ST',
    duties: null,
  },
];

export const LURAH_OFFICIAL: SotkMember | undefined = SOTK_MEMBERS.find((m) => m.role === 'Lurah');

// TODO(#<issue>): move to CMS
export const SOTK_SOURCE_CITATION =
  'Sumber nama dan jabatan: Monografi Kelurahan Manggar 2026, Data Personil (PDF viewer halaman 8–9). Rincian tugas resmi belum tersedia pada sumber yang dirujuk.';

// TODO(#<issue>): move to CMS
export const BOUNDARY_SOURCE_CITATION =
  'Batas wilayah: Manggar Dalam Angka 2026, Tabel 1.1.2 (printed p. 18, PDF viewer p. 19).';

export type { StatCardIconName, StatItem };
