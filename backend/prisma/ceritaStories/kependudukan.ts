import type { StorySeed } from './types.js';

/**
 * Story for the Kependudukan page. Every number comes from the Prodeskel 2025 tables already in
 * the database (checked by `expect` before anything is written); the 2025 total also matches
 * Manggar Dalam Angka 2026, Tabel 3.1.1. No cause, trend or motive is claimed beyond the tables.
 */
const SOURCE = 'Prodeskel Kelurahan Manggar 2025';

const OCCUPATION_SECTORS: { slug: string; label: string; skipRow?: string }[] = [
  { slug: 'mata-pencaharian-sektor-industri-menengah-dan-besar', label: 'Industri' },
  {
    slug: 'mata-pencaharian-sektor-jasa',
    label: 'Jasa',
    skipRow: 'Tidak mempunyai mata pencaharian tetap',
  },
  { slug: 'mata-pencaharian-sektor-perdagangan', label: 'Perdagangan' },
  { slug: 'mata-pencaharian-sektor-perikanan', label: 'Perikanan' },
  { slug: 'mata-pencaharian-sektor-pertanian', label: 'Pertanian' },
  { slug: 'mata-pencaharian-sektor-perkebunan', label: 'Perkebunan' },
  { slug: 'mata-pencaharian-sektor-kehutanan', label: 'Kehutanan' },
  { slug: 'mata-pencaharian-sektor-pertambangan-dan-bahan-galian-c', label: 'Pertambangan' },
  { slug: 'mata-pencaharian-sektor-peternakan', label: 'Peternakan' },
];

export const KEPENDUDUKAN_STORY: StorySeed = {
  page: 'kependudukan',
  sections: [
    {
      chapter: 'jumlah-penduduk',
      section: 'ringkasan-penduduk',
      title: '53.098 jiwa di tepi Selat Makassar',
      body: [
        'Kelurahan Manggar berada di Kecamatan Balikpapan Timur, di pesisir yang menghadap Selat Makassar. Pada 2025 tercatat **53.098 jiwa** tinggal di sini, tersebar di 100 Rukun Tetangga.',
        'Laki-laki berjumlah 27.310 dan perempuan 25.788. Artinya ada sekitar 106 laki-laki untuk setiap 100 perempuan.',
        'Angka-angka ini adalah titik awal cerita: di balik setiap bilangan ada keluarga, pekerjaan, dan kebutuhan yang dibahas di bagian-bagian berikutnya.',
      ].join('\n\n'),
      expect: [
        { table: 'ringkasan-umum-penduduk', row: 'Total Penduduk', male: 27310, female: 25788 },
      ],
      figure: (ctx) => ({
        kind: 'chart',
        tableId: ctx.tableId('ringkasan-umum-penduduk'),
        chartType: 'column',
        series: 'by_sex',
        title: 'Ringkasan umum penduduk Manggar, 2025',
        source: SOURCE,
      }),
    },
    {
      chapter: 'jumlah-penduduk',
      section: 'status-perkawinan',
      title: 'Siapa yang menikah, siapa yang sendiri',
      body: [
        'Dari seluruh penduduk, **27.343 jiwa belum kawin** dan 22.921 berstatus kawin. Sebanyak 1.253 orang bercerai hidup.',
        'Perbedaan paling mencolok ada pada cerai mati: **1.267 perempuan** berbanding 314 laki-laki. Dari 1.581 penduduk yang pasangannya telah meninggal, sekitar empat dari lima adalah perempuan.',
      ].join('\n\n'),
      expect: [{ table: 'penduduk-berdasarkan-status-perkawinan', sum: 53098 }],
      figure: (ctx) => ({
        kind: 'chart',
        tableId: ctx.tableId('penduduk-berdasarkan-status-perkawinan'),
        chartType: 'bar',
        series: 'by_sex',
        title: 'Penduduk menurut status perkawinan, 2025',
        source: SOURCE,
      }),
    },
    {
      chapter: 'jumlah-penduduk',
      section: 'golongan-darah',
      title: 'Golongan darah yang belum diketahui',
      body: [
        'Golongan darah O paling banyak tercatat (7.498 jiwa), disusul B (3.685), A (3.458) dan AB (1.228).',
        'Namun **37.229 jiwa, sekitar 70 persen penduduk, tercatat tidak tahu golongan darahnya**. Informasi sesederhana ini penting saat keadaan darurat, dan masih banyak yang belum memilikinya.',
      ].join('\n\n'),
      expect: [{ table: 'penduduk-berdasarkan-golongan-darah', sum: 53098 }],
      figure: (ctx) => ({
        kind: 'chart',
        tableId: ctx.tableId('penduduk-berdasarkan-golongan-darah'),
        chartType: 'column',
        series: 'by_sex',
        title: 'Penduduk menurut golongan darah, 2025',
        source: SOURCE,
      }),
    },
    {
      chapter: 'jumlah-penduduk',
      section: 'penyandang-disabilitas',
      title: 'Warga penyandang disabilitas yang tercatat',
      body: [
        'Prodeskel mencatat **66 penyandang disabilitas** di Manggar: 46 laki-laki dan 20 perempuan. Ragam yang paling banyak tercatat adalah disabilitas mental (28 orang) dan fisik (19 orang).',
        'Angka ini hanya menggambarkan warga yang sudah tercatat. Pendataan yang lebih menyeluruh dapat mengubah gambarannya.',
      ].join('\n\n'),
      expect: [{ table: 'penduduk-penyandang-disabilitas', sum: 66 }],
      figure: (ctx) => ({
        kind: 'chart',
        tableId: ctx.tableId('penduduk-penyandang-disabilitas'),
        chartType: 'bar',
        series: 'by_sex',
        title: 'Penyandang disabilitas menurut ragam, 2025',
        source: SOURCE,
      }),
    },
    {
      chapter: 'jumlah-keluarga',
      section: 'jumlah-keluarga',
      title: '17.646 keluarga, satu dari lima dipimpin perempuan',
      body: [
        'Penduduk Manggar hidup dalam **17.646 kepala keluarga (KK)**. Sebanyak 14.154 KK dipimpin laki-laki dan 3.492 KK dipimpin perempuan.',
        'Dengan kata lain, hampir **satu dari lima keluarga** di Manggar dikepalai seorang perempuan.',
      ].join('\n\n'),
      expect: [
        {
          table: 'ringkasan-umum-penduduk',
          row: 'Kepala Keluarga (KK)',
          male: 14154,
          female: 3492,
        },
      ],
      figure: (ctx) => {
        const kk = ctx.rows('ringkasan-umum-penduduk').find((r) => r.label.startsWith('Kepala'));
        return {
          kind: 'diagram',
          title: 'Kepala keluarga menurut jenis kelamin, 2025',
          source: SOURCE,
          bars: {
            unit: 'KK',
            items: [
              { label: 'Dipimpin laki-laki', value: kk?.male ?? 0 },
              { label: 'Dipimpin perempuan', value: kk?.female ?? 0 },
            ],
          },
        };
      },
    },
    {
      chapter: 'piramida-usia',
      section: 'kelompok-usia',
      title: 'Kelurahan yang masih muda',
      body: [
        'Anak dan remaja usia 0–14 tahun berjumlah **14.608 jiwa (27,5 persen)**. Kelompok usia 15–64 tahun berjumlah 36.720 jiwa, dan penduduk 65 tahun ke atas 1.770 jiwa.',
        'Kelompok lima tahunan terbesar adalah usia 5–9 tahun (5.340 jiwa). Setiap 100 penduduk usia 15–64 tahun menanggung sekitar 45 penduduk di bawah 15 atau di atas 64 tahun.',
      ].join('\n\n'),
      expect: [{ table: 'penduduk-berdasarkan-kelompok-usia', sum: 53098 }],
      figure: (ctx) => ({
        kind: 'chart',
        tableId: ctx.tableId('penduduk-berdasarkan-kelompok-usia'),
        chartType: 'bar',
        series: 'by_sex',
        title: 'Piramida penduduk menurut kelompok usia, 2025',
        source: SOURCE,
      }),
    },
    {
      chapter: 'agama-jenis-kelamin',
      section: 'agama',
      title: 'Hidup berdampingan dalam keberagaman',
      body: [
        'Mayoritas penduduk memeluk Islam: **46.634 jiwa (87,8 persen)**. Di samping itu tercatat 5.101 pemeluk Kristen, 1.228 Katolik, 85 Hindu, 46 Buddha, 1 Konghucu, dan 3 penghayat kepercayaan.',
        'Beragam keyakinan ini hidup berdampingan di 100 RT yang sama.',
      ].join('\n\n'),
      expect: [{ table: 'penduduk-berdasarkan-agama', sum: 53098 }],
      figure: (ctx) => ({
        kind: 'chart',
        tableId: ctx.tableId('penduduk-berdasarkan-agama'),
        chartType: 'column',
        series: 'by_sex',
        title: 'Penduduk menurut agama, 2025',
        source: SOURCE,
      }),
    },
    {
      chapter: 'mata-pencaharian',
      section: 'mata-pencaharian',
      title: 'Dari kantor, pabrik, hingga laut',
      body: [
        'Pekerjaan terbesar yang tercatat ada di sektor industri menengah dan besar: **8.070 karyawan perusahaan swasta**. Sektor jasa mencakup 1.835 orang, antara lain 410 PNS, 338 TNI, 328 guru swasta, dan 207 anggota POLRI.',
        'Laut masih memberi nafkah: sektor perikanan mencatat 763 orang sebagai nelayan, buruh, dan pemilik usaha perikanan.',
        'Di sisi lain, **6.049 orang tercatat tidak memiliki mata pencaharian tetap**, angka yang menunjukkan masih adanya kebutuhan akan lapangan kerja.',
      ].join('\n\n'),
      expect: [
        { table: 'mata-pencaharian-sektor-industri-menengah-dan-besar', sum: 8070 },
        { table: 'mata-pencaharian-sektor-perikanan', sum: 763 },
        { table: 'mata-pencaharian-sektor-jasa', sum: 7884 },
      ],
      figure: (ctx) => {
        const items = OCCUPATION_SECTORS.map((s) => ({
          label: s.label,
          value: ctx
            .rows(s.slug)
            .filter((r) => r.label !== s.skipRow)
            .reduce((n, r) => n + (r.total ?? 0), 0),
        }));
        items.push({
          label: 'Tanpa mata pencaharian tetap',
          value: ctx
            .rows('mata-pencaharian-sektor-jasa')
            .filter((r) => r.label === 'Tidak mempunyai mata pencaharian tetap')
            .reduce((n, r) => n + (r.total ?? 0), 0),
        });
        return {
          kind: 'diagram',
          title: 'Penduduk menurut sektor mata pencaharian, 2025',
          source: SOURCE,
          bars: { unit: 'orang', items },
        };
      },
    },
  ],
};
