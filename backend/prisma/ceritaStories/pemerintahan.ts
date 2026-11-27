import { expectIndicators, indicatorBars } from './helpers.js';
import type { StorySeed } from './types.js';

const SOURCE = 'Prodeskel Kelurahan Manggar 2025';
const I = 'pemerintahan-kelurahan-a-inventaris-dan-alat-tulis-kantor-';
const L = 'lembaga-kemasyarakatan-';

/** Pembinaan sections are text-only except Pusat: their values are one-off counts. */
export const PEMERINTAHAN_STORY: StorySeed = {
  page: 'pemerintahan-dan-kelembagaan',
  sections: [
    {
      chapter: 'pemerintahan-kelurahan',
      section: 'a-inventaris-dan-alat-tulis-kantor',
      title: 'Isi kantor kelurahan',
      body: [
        'Pelayanan warga berjalan dari satu gedung kantor dengan satu ruang pelayanan dan sambungan internet.',
        'Inventarisnya mencatat 80 kursi, 14 meja, 5 lemari, 8 komputer, 2 laptop, 5 printer, dan 8 kamera CCTV, serta satu kendaraan dinas lurah dan satu papan informasi.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${I}kursi`, 80],
        [`${I}meja`, 14],
        [`${I}komputer`, 8],
        [`${I}cctv`, 8],
        [`${I}laptop`, 2],
        [`${I}printer`, 5],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Inventaris kantor kelurahan, 2025',
          source: SOURCE,
          unit: 'unit',
          items: [
            ['Kursi', `${I}kursi`],
            ['Meja', `${I}meja`],
            ['Lemari', `${I}lemari`],
            ['Komputer', `${I}komputer`],
            ['Laptop', `${I}laptop`],
            ['Printer', `${I}printer`],
            ['CCTV', `${I}cctv`],
          ],
        }),
    },
    {
      chapter: 'lembaga-kemasyarakatan',
      section: 'ringkasan-lembaga',
      title: 'Lembaga yang menggerakkan warga',
      body: [
        'Enam kelompok lembaga kemasyarakatan mencatat **20 jenis kegiatan** di Manggar.',
        'Organisasi perempuan lain mencatat jumlah terbanyak (8 jenis kegiatan), disusul PKK (4), serta LPMK dan kelompok tani/nelayan (masing-masing 3). Rukun Tetangga dan Karang Taruna masing-masing mencatat 1 jenis kegiatan.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${L}lpmd-lpmk-atau-sebutan-lain-lpmd-lpmk-jumlah-kegiatan`, 3],
        [`${L}pkk-pkk-jumlah-kegiatan`, 4],
        [`${L}rukun-tetangga-rukun-tetangga-jumlah-kegiatan`, 1],
        [`${L}karang-taruna-karang-taruna-jumlah-kegiatan`, 1],
        [`${L}kelompok-tani-nelayan-kelompok-tani-nelayan-jumlah-kegiat`, 3],
        [`${L}organisasi-perempuan-lain-organisasi-perempuan-lain-jumla`, 8],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Jenis kegiatan lembaga kemasyarakatan, 2025',
          source: SOURCE,
          unit: 'jenis',
          items: [
            ['LPMK', `${L}lpmd-lpmk-atau-sebutan-lain-lpmd-lpmk-jumlah-kegiatan`],
            ['PKK', `${L}pkk-pkk-jumlah-kegiatan`],
            ['Rukun Tetangga', `${L}rukun-tetangga-rukun-tetangga-jumlah-kegiatan`],
            ['Karang Taruna', `${L}karang-taruna-karang-taruna-jumlah-kegiatan`],
            [
              'Kelompok tani/nelayan',
              `${L}kelompok-tani-nelayan-kelompok-tani-nelayan-jumlah-kegiat`,
            ],
            [
              'Organisasi perempuan lain',
              `${L}organisasi-perempuan-lain-organisasi-perempuan-lain-jumla`,
            ],
          ],
        }),
    },
    {
      chapter: 'pertanggungjawaban-dan-pembinaan',
      section: 'pertanggungjawaban-kepala-desa-lurah',
      title: 'Lurah melapor kepada masyarakat',
      body: 'Kelurahan mencatat **2 jenis informasi** yang disampaikan lurah kepada masyarakat tentang penyelenggaraan tugas, wewenang, hak, dan kewajibannya.',
      expect: expectIndicators([
        ['pertanggungjawaban-dan-pembinaan-pertanggungjawaban-kepala-desa-lurah-jumlah-inf', 2],
      ]),
    },
    {
      chapter: 'pertanggungjawaban-dan-pembinaan',
      section: 'jenis-pembinaan-pemerintah-pusat-kepada-pemerintahan-desa-dan-kelurahan',
      title: 'Pembinaan dari pemerintah pusat',
      body: [
        'Pemerintah pusat membina kelurahan melalui **4 jenis kegiatan percepatan pembangunan**, 3 kegiatan pendidikan dan pelatihan, serta 2 kegiatan bimbingan, supervisi, dan konsultasi.',
        'Tercatat pula 2 kegiatan penelitian dan pengkajian, dan 2 kali pemberian penghargaan atas prestasi penyelenggaraan pemerintahan.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemerin', 2],
        ['pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-2', 3],
        ['pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-3', 2],
        ['pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-4', 4],
        ['pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-5', 2],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Pembinaan pemerintah pusat kepada kelurahan, 2025',
          source: SOURCE,
          unit: 'kegiatan',
          items: [
            [
              'Percepatan pembangunan',
              'pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-4',
            ],
            [
              'Pendidikan dan pelatihan',
              'pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-2',
            ],
            [
              'Bimbingan dan konsultasi',
              'pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemerin',
            ],
            [
              'Penelitian dan pengkajian',
              'pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-3',
            ],
            [
              'Penghargaan',
              'pertanggungjawaban-dan-pembinaan-jenis-pembinaan-pemerintah-pusat-kepada-pemer-5',
            ],
          ],
        }),
    },
    {
      chapter: 'pertanggungjawaban-dan-pembinaan',
      section: 'pembinaan-pemerintah-provinsi-kepada-pemerintahan-desa-dan-kelurahan',
      title: 'Pembinaan dari pemerintah provinsi',
      body: 'Pemerintah provinsi tercatat melakukan **3 bentuk pembinaan**: pedoman pelaksanaan tugas pembantuan, fasilitasi keberadaan lembaga adat, serta fasilitasi pedoman administrasi, tata naskah, dan pelaporan bagi lurah. Masing-masing tercatat satu kali.',
      expect: expectIndicators([
        ['pertanggungjawaban-dan-pembinaan-pembinaan-pemerintah-provinsi-kepada-pemerintah', 1],
        ['pertanggungjawaban-dan-pembinaan-pembinaan-pemerintah-provinsi-kepada-pemerint-2', 1],
        ['pertanggungjawaban-dan-pembinaan-pembinaan-pemerintah-provinsi-kepada-pemerint-3', 1],
      ]),
    },
    {
      chapter: 'pertanggungjawaban-dan-pembinaan',
      section: 'pembinaan-dan-pengawasan-camat-kepada-desa-kelurahan',
      title: 'Pendampingan dari kecamatan',
      body: [
        'Camat tercatat memfasilitasi kelurahan dalam **15 bidang**, masing-masing satu kali pada 2025.',
        'Bidang tersebut antara lain administrasi tata pemerintahan, penyediaan data dan profil kelurahan, ketenteraman dan ketertiban umum, pemberdayaan masyarakat, serta penguatan lembaga kemasyarakatan.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['pertanggungjawaban-dan-pembinaan-pembinaan-dan-pengawasan-camat-kepada-desa-kelu', 1],
        ['pertanggungjawaban-dan-pembinaan-pembinaan-dan-pengawasan-camat-kepada-desa-ke-5', 1],
        ['pertanggungjawaban-dan-pembinaan-pembinaan-dan-pengawasan-camat-kepada-desa-k-15', 1],
      ]),
    },
  ],
};
