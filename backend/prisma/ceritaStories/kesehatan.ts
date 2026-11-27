import { expectIndicators, indicatorBars } from './helpers.js';
import type { StorySeed } from './types.js';

const SOURCE = 'Prodeskel Kelurahan Manggar 2025';
const P = 'jumlah-penderita-sakit-wabah-penyakit-';
const H = 'ibu-hamil-';

/**
 * Written as stored. Several Kesehatan values look unreliable (round placeholders, counts that
 * disagree across chapters); the prose quotes each figure on its own and never combines them.
 * Kebiasaan Berobat is left out: its values are not credible.
 */
export const KESEHATAN_STORY: StorySeed = {
  page: 'kesehatan',
  sections: [
    {
      chapter: 'jumlah-penderita-sakit',
      section: 'wabah-penyakit',
      title: 'Penyakit yang paling sering tercatat',
      body: [
        'Penyakit yang paling banyak tercatat di Manggar adalah **ISPA, dengan 5.177 penderita**, sekitar 89 persen dari seluruh kasus yang dicatat.',
        'Di bawahnya ada diare (465 penderita) dan demam berdarah dengue (85). Demam tifoid dan pneumonia masing-masing 51 penderita, serta malaria dan kusta masing-masing 1.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${P}ispa`, 5177],
        [`${P}diare`, 465],
        [`${P}dbd`, 85],
        [`${P}demam-tifoid`, 51],
        [`${P}pneumonia`, 51],
        [`${P}malaria`, 1],
        [`${P}kusta`, 1],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Penderita penyakit menurut jenis, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['ISPA', `${P}ispa`],
            ['Diare', `${P}diare`],
            ['DBD', `${P}dbd`],
            ['Demam tifoid', `${P}demam-tifoid`],
            ['Pneumonia', `${P}pneumonia`],
            ['Malaria', `${P}malaria`],
            ['Kusta', `${P}kusta`],
          ],
        }),
    },
    {
      chapter: 'ibu-hamil',
      section: 'kualitas-ibu-hamil',
      title: 'Ibu hamil dan tempat memeriksakan kehamilan',
      body: [
        'Pada 2025 tercatat **1.736 ibu hamil** di Manggar. Posyandu menjadi tempat periksa yang paling banyak tercatat (977), disusul bidan praktik (532), puskesmas (456), rumah sakit (239), dan dokter praktik (122). Tidak ada yang tercatat memeriksakan kehamilan ke dukun terlatih.',
        'Angka per tempat tidak untuk dijumlahkan, karena satu ibu dapat tercatat di lebih dari satu tempat. Tidak ada kematian ibu hamil maupun ibu nifas yang tercatat.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${H}jumlah-ibu-hamil`, 1736],
        [`${H}jumlah-ibu-hamil-periksa-di-posyandu`, 977],
        [`${H}jumlah-ibu-hamil-periksa-di-bidan-praktek`, 532],
        [`${H}jumlah-ibu-hamil-periksa-di-puskesmas`, 456],
        [`${H}jumlah-ibu-hamil-periksa-di-rumah-sakit`, 239],
        [`${H}jumlah-ibu-hamil-periksa-di-dokter-praktek`, 122],
        [`${H}jumlah-ibu-hamil-periksa-di-dukun-terlatih`, 0],
        [`${H}jumlah-kematian-ibu-hamil`, 0],
        [`${H}jumlah-kematian-ibu-nifas`, 0],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Ibu hamil menurut tempat periksa, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['Posyandu', `${H}jumlah-ibu-hamil-periksa-di-posyandu`],
            ['Bidan praktik', `${H}jumlah-ibu-hamil-periksa-di-bidan-praktek`],
            ['Puskesmas', `${H}jumlah-ibu-hamil-periksa-di-puskesmas`],
            ['Rumah sakit', `${H}jumlah-ibu-hamil-periksa-di-rumah-sakit`],
            ['Dokter praktik', `${H}jumlah-ibu-hamil-periksa-di-dokter-praktek`],
          ],
        }),
    },
    {
      chapter: 'bayi',
      section: 'kualitas-bayi',
      title: '836 bayi lahir, semuanya hidup',
      body: [
        'Tercatat **836 bayi lahir** di Manggar pada 2025, seluruhnya lahir hidup.',
        'Tidak ada bayi lahir mati dan tidak ada kematian bayi pada usia 0–1 bulan maupun 1–12 bulan yang tercatat.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['bayi-jumlah-bayi-lahir', 836],
        ['bayi-jumlah-bayi-lahir-hidup', 836],
        ['bayi-jumlah-bayi-lahir-mati', 0],
        ['bayi-jumlah-bayi-mati-usia-0-1-bulan', 0],
        ['bayi-jumlah-bayi-mati-usia-1-12-bulan', 0],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Kelahiran bayi, 2025',
          source: SOURCE,
          unit: 'bayi',
          items: [
            ['Bayi lahir', 'bayi-jumlah-bayi-lahir'],
            ['Lahir hidup', 'bayi-jumlah-bayi-lahir-hidup'],
            ['Lahir mati', 'bayi-jumlah-bayi-lahir-mati'],
          ],
        }),
    },
    {
      chapter: 'persalinan',
      section: 'tempat-persalinan',
      title: 'Tempat bersalin di Manggar',
      body: [
        'Fasilitas persalinan yang tercatat di Manggar adalah **20 rumah praktik bidan**, 2 praktik dokter, dan 1 puskesmas.',
        'Tidak tercatat rumah sakit umum, rumah bersalin, polindes, balai kesehatan ibu dan anak, maupun rumah dukun di kelurahan ini.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['persalinan-tempat-persalinan-rumah-praktek-bidan', 20],
        ['persalinan-tempat-praktek-dokter', 2],
        ['persalinan-tempat-persalinan-puskesmas', 1],
        ['persalinan-tempat-persalinan-rumah-sakit-umum', 0],
        ['persalinan-tempat-persalinan-rumah-dukun', 0],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Fasilitas persalinan, 2025',
          source: SOURCE,
          unit: 'unit',
          items: [
            ['Rumah praktik bidan', 'persalinan-tempat-persalinan-rumah-praktek-bidan'],
            ['Praktik dokter', 'persalinan-tempat-praktek-dokter'],
            ['Puskesmas', 'persalinan-tempat-persalinan-puskesmas'],
          ],
        }),
    },
    {
      chapter: 'persalinan',
      section: 'pertolongan-persalinan',
      title: 'Siapa yang menolong persalinan',
      body: [
        'Dari **235 persalinan** pada bagian ini, 108 ditolong bidan (46 persen), 67 oleh perawat, dan 45 oleh dokter. Sebanyak 220 persalinan, atau 94 persen, ditolong tenaga kesehatan.',
        'Sebanyak 13 persalinan ditolong dukun bersalin dan 2 oleh keluarga.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['persalinan-jumlah-persalinan-ditolong-bidan', 108],
        ['persalinan-jumlah-persalinan-ditolong-perawat', 67],
        ['persalinan-jumlah-persalinan-ditolong-dokter', 45],
        ['persalinan-jumlah-persalinan-ditolong-dukun-bersalin', 13],
        ['persalinan-jumlah-persalinan-ditolong-keluarga', 2],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Persalinan menurut penolong, 2025',
          source: SOURCE,
          unit: 'tindakan',
          items: [
            ['Bidan', 'persalinan-jumlah-persalinan-ditolong-bidan'],
            ['Perawat', 'persalinan-jumlah-persalinan-ditolong-perawat'],
            ['Dokter', 'persalinan-jumlah-persalinan-ditolong-dokter'],
            ['Dukun bersalin', 'persalinan-jumlah-persalinan-ditolong-dukun-bersalin'],
            ['Keluarga', 'persalinan-jumlah-persalinan-ditolong-keluarga'],
          ],
        }),
    },
    {
      chapter: 'cakupan-imunisasi',
      section: 'cakupan-imunisasi',
      title: 'Imunisasi campak pada bayi 9 bulan',
      body: [
        'Dari **768 bayi berusia 9 bulan**, 610 telah mendapat imunisasi campak, atau sekitar 79 persen. Kira-kira empat dari lima bayi sudah terlindungi.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['cakupan-imunisasi-jumlah-bayi-usia-9-bulan', 768],
        ['cakupan-imunisasi-jumlah-bayi-9-bulan-yang-imunisasi-campak', 610],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Bayi 9 bulan dan imunisasi campak, 2025',
          source: SOURCE,
          unit: 'bayi',
          items: [
            ['Bayi usia 9 bulan', 'cakupan-imunisasi-jumlah-bayi-usia-9-bulan'],
            [
              'Sudah imunisasi campak',
              'cakupan-imunisasi-jumlah-bayi-9-bulan-yang-imunisasi-campak',
            ],
          ],
        }),
    },
    {
      chapter: 'pus-kb',
      section: 'pasangan-usia-subur',
      title: 'Pasangan usia subur dan perempuan muda',
      body: [
        'Tercatat **8.873 pasangan usia subur** dan 14.639 perempuan usia subur (15–49 tahun) di Manggar. Remaja putri usia 10–19 tahun berjumlah 4.551.',
        'Sebanyak 724 perempuan tercatat menikah pada usia kurang dari 16 tahun.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['pus-kb-jumlah-pasangan-usia-subur', 8873],
        ['pus-kb-jumlah-perempuan-usia-subur-15-49-tahun', 14639],
        ['pus-kb-jumlah-remaja-putri-usia-10-19-tahun', 4551],
        ['pus-kb-jumlah-wanita-kawin-muda-usia-kurang-dari-16-tahun', 724],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Pasangan usia subur dan perempuan muda, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['Perempuan usia subur (15–49)', 'pus-kb-jumlah-perempuan-usia-subur-15-49-tahun'],
            ['Pasangan usia subur', 'pus-kb-jumlah-pasangan-usia-subur'],
            ['Remaja putri (10–19)', 'pus-kb-jumlah-remaja-putri-usia-10-19-tahun'],
            [
              'Menikah sebelum usia 16',
              'pus-kb-jumlah-wanita-kawin-muda-usia-kurang-dari-16-tahun',
            ],
          ],
        }),
    },
    {
      chapter: 'pus-kb',
      section: 'keluarga-berencana',
      title: 'Cara ber-KB yang dipilih warga',
      body: [
        'Alat kontrasepsi **suntik** paling banyak dipakai (2.733 pengguna), disusul spiral (1.376), pil (1.281), kondom (500), dan tubektomi (437).',
        'Metode lain jauh lebih jarang: KB kalender 50, vasektomi 25, dan obat tradisional 22. Sebanyak 4.384 pasangan usia subur tercatat tidak menggunakan metode KB.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['pus-kb-jumlah-pengguna-alat-kontrasepsi-suntik', 2733],
        ['pus-kb-jumlah-pengguna-metode-kontrasepsi-spiral', 1376],
        ['pus-kb-jumlah-pengguna-metode-kontrasepsi-pil', 1281],
        ['pus-kb-jumlah-pengguna-alat-kontrasepsi-kondom', 500],
        ['pus-kb-jumlah-pengguna-metode-kontrasepsi-tubektomi', 437],
        ['pus-kb-jumlah-pengguna-metode-kb-kelender-kb-alamiah', 50],
        ['pus-kb-jumlah-pengguna-metode-vasektomi', 25],
        ['pus-kb-jumlah-pengguna-metode-kb-obat-tradisional', 22],
        ['pus-kb-jumlah-pus-yang-tidak-menggunakan-metode-kb', 4384],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Pengguna metode KB, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['Suntik', 'pus-kb-jumlah-pengguna-alat-kontrasepsi-suntik'],
            ['Spiral', 'pus-kb-jumlah-pengguna-metode-kontrasepsi-spiral'],
            ['Pil', 'pus-kb-jumlah-pengguna-metode-kontrasepsi-pil'],
            ['Kondom', 'pus-kb-jumlah-pengguna-alat-kontrasepsi-kondom'],
            ['Tubektomi', 'pus-kb-jumlah-pengguna-metode-kontrasepsi-tubektomi'],
            ['KB kalender', 'pus-kb-jumlah-pengguna-metode-kb-kelender-kb-alamiah'],
            ['Vasektomi', 'pus-kb-jumlah-pengguna-metode-vasektomi'],
            ['Obat tradisional', 'pus-kb-jumlah-pengguna-metode-kb-obat-tradisional'],
          ],
        }),
    },
    {
      chapter: 'air-bersih',
      section: 'cakupan-pemenuhan-kebutuhan-air-bersih',
      title: 'Dari mana air bersih berasal',
      body: [
        'Sumber air yang paling banyak tercatat adalah **sumur gali (10.000 keluarga)**, lalu penampung air hujan (7.500). Pelanggan PAM, pengguna sumur pompa, dan pengguna perpipaan air kran masing-masing tercatat 5.000 keluarga.',
        'Sebanyak 100 keluarga masih menggunakan air sungai dan 10 keluarga hidran umum. Tidak ada keluarga yang tercatat tanpa akses air minum dari sumber-sumber tersebut.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['air-bersih-jumlah-keluarga-menggunakan-sumur-gali', 10000],
        ['air-bersih-jumlah-keluarga-menggunakan-penampung-air-hujan', 7500],
        ['air-bersih-jumlah-keluarga-pelanggan-pam', 5000],
        ['air-bersih-jumlah-keluarga-menggunakan-sumur-pompa', 5000],
        ['air-bersih-jumlah-keluarga-menggunakan-perpipaan-air-kran', 5000],
        ['air-bersih-jumlah-keluarga-menggunakan-air-sungai', 100],
        ['air-bersih-jumlah-keluarga-menggunakan-hidran-umum', 10],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Keluarga menurut sumber air, 2025',
          source: SOURCE,
          unit: 'keluarga',
          items: [
            ['Sumur gali', 'air-bersih-jumlah-keluarga-menggunakan-sumur-gali'],
            ['Penampung air hujan', 'air-bersih-jumlah-keluarga-menggunakan-penampung-air-hujan'],
            ['Pelanggan PAM', 'air-bersih-jumlah-keluarga-pelanggan-pam'],
            ['Sumur pompa', 'air-bersih-jumlah-keluarga-menggunakan-sumur-pompa'],
            ['Perpipaan air kran', 'air-bersih-jumlah-keluarga-menggunakan-perpipaan-air-kran'],
            ['Air sungai', 'air-bersih-jumlah-keluarga-menggunakan-air-sungai'],
            ['Hidran umum', 'air-bersih-jumlah-keluarga-menggunakan-hidran-umum'],
          ],
        }),
    },
    {
      chapter: 'phbs',
      section: 'kebiasaan-buang-air-besar',
      title: 'Jamban di rumah warga',
      body: [
        'Sebanyak **10.000 keluarga** tercatat memiliki WC yang sehat. Sebanyak 250 keluarga memiliki WC yang kurang memenuhi standar kesehatan dan 450 keluarga memakai fasilitas MCK umum.',
        'Tidak ada keluarga yang tercatat biasa buang air besar di sungai, parit, kebun, atau hutan.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['phbs-jumlah-keluarga-memiliki-wc-yang-sehat', 10000],
        ['phbs-jumlah-keluarga-memiliki-wc-yang-kurang-memenuhi-standar-kesehatan', 250],
        ['phbs-jumlah-keluarga-yang-menggunakan-fasilitas-mck-umum', 450],
        ['phbs-jumlah-keluarga-biasa-buang-air-besar-di-sungai-parit-kebun-hutan', 0],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Keluarga menurut fasilitas buang air besar, 2025',
          source: SOURCE,
          unit: 'keluarga',
          items: [
            ['WC sehat', 'phbs-jumlah-keluarga-memiliki-wc-yang-sehat'],
            [
              'WC kurang memenuhi standar',
              'phbs-jumlah-keluarga-memiliki-wc-yang-kurang-memenuhi-standar-kesehatan',
            ],
            ['MCK umum', 'phbs-jumlah-keluarga-yang-menggunakan-fasilitas-mck-umum'],
          ],
        }),
    },
    {
      chapter: 'phbs',
      section: 'pola-makan',
      title: 'Berapa kali warga makan dalam sehari',
      body: [
        'Dari 10.000 penduduk yang tercatat pada bagian ini, **9.500 (95 persen) makan tiga kali sehari**.',
        'Sebanyak 250 makan dua kali sehari, 100 hanya sekali, dan 100 lebih dari tiga kali. Ada 50 orang yang tercatat belum tentu makan satu kali dalam sehari.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['phbs-kebiasaan-penduduk-makan-sehari-3-kali', 9500],
        ['phbs-kebiasaan-penduduk-makan-sehari-2-kali', 250],
        ['phbs-kebiasaan-penduduk-makan-dlm-sehari-1-kali', 100],
        ['phbs-kebiasaan-penduduk-makan-sehari-lebih-dari-3-kali', 100],
        ['phbs-penduduk-yang-belum-tentu-sehari-makan-1-kali', 50],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Penduduk menurut kebiasaan makan sehari, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['3 kali sehari', 'phbs-kebiasaan-penduduk-makan-sehari-3-kali'],
            ['2 kali sehari', 'phbs-kebiasaan-penduduk-makan-sehari-2-kali'],
            ['1 kali sehari', 'phbs-kebiasaan-penduduk-makan-dlm-sehari-1-kali'],
            ['Lebih dari 3 kali', 'phbs-kebiasaan-penduduk-makan-sehari-lebih-dari-3-kali'],
            ['Belum tentu 1 kali', 'phbs-penduduk-yang-belum-tentu-sehari-makan-1-kali'],
          ],
        }),
    },
    {
      chapter: 'gizi-balita',
      section: 'status-gizi-balita',
      title: 'Status gizi balita',
      body: [
        'Manggar memiliki **2.965 balita**. Sebanyak 1.397 tercatat bergizi baik, 180 bergizi lebih, 123 bergizi kurang, dan 7 bergizi buruk.',
        'Sebanyak 1.258 balita tidak masuk ke salah satu dari empat kategori tersebut dalam data ini.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['gizi-balita-jumlah-balita', 2965],
        ['gizi-balita-jumlah-balita-bergizi-baik', 1397],
        ['gizi-balita-jumlah-balita-bergizi-lebih', 180],
        ['gizi-balita-jumlah-balita-bergizi-kurang', 123],
        ['gizi-balita-jumlah-balita-bergizi-buruk', 7],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Balita menurut status gizi, 2025',
          source: SOURCE,
          unit: 'balita',
          items: [
            ['Gizi baik', 'gizi-balita-jumlah-balita-bergizi-baik'],
            ['Gizi lebih', 'gizi-balita-jumlah-balita-bergizi-lebih'],
            ['Gizi kurang', 'gizi-balita-jumlah-balita-bergizi-kurang'],
            ['Gizi buruk', 'gizi-balita-jumlah-balita-bergizi-buruk'],
          ],
        }),
    },
    {
      chapter: 'sarana-kesehatan',
      section: 'perkembangan-sarana-dan-prasarana-kesehatan-masyarakat',
      title: 'Sarana dan penggerak kesehatan warga',
      body: [
        'Kesehatan masyarakat Manggar ditopang **100 posyandu** dengan 100 kader posyandu aktif, ditambah 500 kader kesehatan lainnya.',
        'Tercatat pula 34 dasawisma, 450 MCK umum, 100 kegiatan pemberantasan sarang nyamuk, dan 50 kegiatan pengobatan gratis.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['sarana-kesehatan-jumlah-posyandu', 100],
        ['sarana-kesehatan-jumlah-kader-posyandu-aktif', 100],
        ['sarana-kesehatan-jumlah-kader-kesehatan-lainnya', 500],
        ['sarana-kesehatan-jumlah-dasawisma', 34],
        ['sarana-kesehatan-jumlah-mck-umum', 450],
        ['sarana-kesehatan-jumlah-kegiatan-pemberantasan-sarang-nyamuk-psn', 100],
        ['sarana-kesehatan-jumlah-kegiatan-pengobatan-gratis', 50],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Sarana dan kegiatan kesehatan masyarakat, 2025',
          source: SOURCE,
          unit: 'unit',
          items: [
            ['Posyandu', 'sarana-kesehatan-jumlah-posyandu'],
            ['Kader posyandu aktif', 'sarana-kesehatan-jumlah-kader-posyandu-aktif'],
            ['Kader kesehatan lainnya', 'sarana-kesehatan-jumlah-kader-kesehatan-lainnya'],
            ['MCK umum', 'sarana-kesehatan-jumlah-mck-umum'],
            ['Dasawisma', 'sarana-kesehatan-jumlah-dasawisma'],
            ['Kegiatan PSN', 'sarana-kesehatan-jumlah-kegiatan-pemberantasan-sarang-nyamuk-psn'],
            ['Pengobatan gratis', 'sarana-kesehatan-jumlah-kegiatan-pengobatan-gratis'],
          ],
        }),
    },
  ],
};
