import { expectIndicators, indicatorBars } from './helpers.js';
import type { StorySeed } from './types.js';

const SOURCE = 'Prodeskel Kelurahan Manggar 2025';
const W = 'wajib-belajar-9-tahun-jumlah-penduduk-usia-7-15-tahun';
const K = 'kelembagaan-pendidikan-jumlah-';

/** Written as stored. Rasio Guru-Murid quotes counts only: the implied ratios look implausible. */
export const PENDIDIKAN_STORY: StorySeed = {
  page: 'pendidikan',
  sections: [
    {
      chapter: 'tingkat-pendidikan',
      section: 'pendidikan-terakhir',
      title: 'Dari bangku SMA hingga sarjana',
      body: [
        'Ijazah SMA/sederajat adalah pendidikan terakhir yang paling banyak tercatat: **14.765 jiwa (27,8 persen)** penduduk Manggar. Setelah itu tamat SD (6.225) dan SMP (5.793).',
        'Di jenjang pendidikan tinggi tercatat 2.666 lulusan S1, 1.109 lulusan D3, dan 100 lulusan S2.',
        'Kelompok terbesar, 18.511 jiwa (34,9 persen), tercatat tidak atau belum sekolah. Kelompok ini mencakup anak-anak yang belum mencapai usia sekolah.',
      ].join('\n\n'),
      expect: [{ table: 'penduduk-berdasarkan-pendidikan-terakhir', sum: 53098 }],
      figure: (ctx) => ({
        kind: 'chart',
        tableId: ctx.tableId('penduduk-berdasarkan-pendidikan-terakhir'),
        chartType: 'bar',
        series: 'by_sex',
        title: 'Penduduk menurut pendidikan terakhir, 2025',
        source: SOURCE,
      }),
    },
    {
      chapter: 'wajib-belajar-9-tahun',
      section: 'wajib-belajar-9-tahun',
      title: 'Hampir semua anak 7–15 tahun bersekolah',
      body: [
        'Di Manggar ada **8.592 anak usia 7–15 tahun**, usia wajib belajar sembilan tahun. Sebanyak 8.567 di antaranya masih bersekolah, atau 99,7 persen.',
        'Tinggal 25 anak yang tercatat tidak bersekolah. Jumlah yang kecil ini layak ditelusuri satu per satu agar tidak ada yang tertinggal.',
      ].join('\n\n'),
      expect: expectIndicators([
        [W, 8592],
        [`${W}-yang-masih-sekolah`, 8567],
        [`${W}-yang-tidak-sekolah`, 25],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Anak usia 7–15 tahun menurut status sekolah, 2025',
          source: SOURCE,
          unit: 'anak',
          items: [
            ['Masih sekolah', `${W}-yang-masih-sekolah`],
            ['Tidak sekolah', `${W}-yang-tidak-sekolah`],
          ],
        }),
    },
    {
      chapter: 'kelembagaan-pendidikan',
      section: 'kelembagaan-pendidikan-masyarakat',
      title: 'Belajar di luar bangku sekolah',
      body: [
        'Manggar memiliki 1 perpustakaan kelurahan dan 2 taman bacaan. Tidak tercatat kelompok belajar Paket A, B, maupun C di kelurahan ini.',
        'Meski begitu, **177 warga tercatat mengikuti ujian kesetaraan**: 15 peserta Paket A, 39 Paket B, dan 123 Paket C. Ada pula 115 peserta kursus keterampilan.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${K}perpustakaan-desa-kelurahan`, 1],
        [`${K}taman-bacaan-desa-kelurahan`, 2],
        [`${K}peserta-ujian-paket-a`, 15],
        [`${K}peserta-ujian-paket-b`, 39],
        [`${K}peserta-ujian-paket-c`, 123],
        [`${K}peserta-kursus-keterampilan`, 115],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Peserta ujian kesetaraan dan kursus, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['Ujian Paket A', `${K}peserta-ujian-paket-a`],
            ['Ujian Paket B', `${K}peserta-ujian-paket-b`],
            ['Ujian Paket C', `${K}peserta-ujian-paket-c`],
            ['Kursus keterampilan', `${K}peserta-kursus-keterampilan`],
          ],
        }),
    },
    {
      chapter: 'rasio-guru-murid',
      section: 'rasio-guru-dan-murid',
      title: 'Guru dan siswa di setiap jenjang',
      body: [
        'Data mencatat 45 guru dan 650 siswa TK/kelompok bermain, 75 guru dan **6.233 siswa SD**, 20 guru dan 5.606 siswa SLTP, serta 35 guru dan 2.400 siswa SLTA.',
        'Tidak ada SLB, guru maupun siswa, yang tercatat di Manggar.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['rasio-guru-murid-jumlah-guru-tk-dan-kelompok-bermain-anak', 45],
        ['rasio-guru-murid-jumlah-siswa-tk-dan-kelompok-bermain-anak', 650],
        ['rasio-guru-murid-jumlah-guru-sd-dan-sederajat', 75],
        ['rasio-guru-murid-jumlah-siswa-sd-dan-sederajat', 6233],
        ['rasio-guru-murid-jumlah-guru-sltp-dan-sederajat', 20],
        ['rasio-guru-murid-jumlah-siswa-sltp-dan-sederajat', 5606],
        ['rasio-guru-murid-jumlah-guru-slta-sederajat', 35],
        ['rasio-guru-murid-jumlah-siswa-slta-sederajat', 2400],
        ['rasio-guru-murid-jumlah-siswa-slb', 0],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Guru dan siswa menurut jenjang, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['Guru TK/KB', 'rasio-guru-murid-jumlah-guru-tk-dan-kelompok-bermain-anak'],
            ['Siswa TK/KB', 'rasio-guru-murid-jumlah-siswa-tk-dan-kelompok-bermain-anak'],
            ['Guru SD', 'rasio-guru-murid-jumlah-guru-sd-dan-sederajat'],
            ['Siswa SD', 'rasio-guru-murid-jumlah-siswa-sd-dan-sederajat'],
            ['Guru SLTP', 'rasio-guru-murid-jumlah-guru-sltp-dan-sederajat'],
            ['Siswa SLTP', 'rasio-guru-murid-jumlah-siswa-sltp-dan-sederajat'],
            ['Guru SLTA', 'rasio-guru-murid-jumlah-guru-slta-sederajat'],
            ['Siswa SLTA', 'rasio-guru-murid-jumlah-siswa-slta-sederajat'],
          ],
        }),
    },
  ],
};
