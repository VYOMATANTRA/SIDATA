import { expectIndicators, indicatorBars } from './helpers.js';
import type { StorySeed } from './types.js';

const SOURCE = 'Prodeskel Kelurahan Manggar 2025';
const K = 'kesejahteraan-keluarga-';
const T = 'aset-sarana-produksi-';
const TL = `${T}memiliki-tanah-antara-`;

/** Written as stored; Pengangguran's categories cover only part of the stated labour force. */
export const EKONOMI_STORY: StorySeed = {
  page: 'ekonomi-dan-ketertiban',
  sections: [
    {
      chapter: 'kesejahteraan-keluarga',
      section: 'kesejahteraan-keluarga',
      title: 'Tahap kesejahteraan keluarga',
      body: [
        'Dalam pendataan tahap kesejahteraan keluarga, **15.345 keluarga** tercatat di Manggar. Sebanyak 4.199 keluarga berada di tahap Sejahtera III Plus dan 4.245 di Sejahtera III, sehingga lebih dari separuh (55 persen) berada di dua tahap tertinggi.',
        'Sejahtera II menjadi tahap terbesar dengan 5.934 keluarga. Di ujung bawah, 147 keluarga masih prasejahtera dan 820 keluarga berada di Sejahtera I.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${K}total-jumlah-kepala-keluarga`, 15345],
        [`${K}jumlah-keluarga-prasejahtera`, 147],
        [`${K}jumlah-keluarga-sejahtera-1`, 820],
        [`${K}jumlah-keluarga-sejahtera-2`, 5934],
        [`${K}jumlah-keluarga-sejahtera-3`, 4245],
        [`${K}jumlah-keluarga-sejahtera-3-plus`, 4199],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Keluarga menurut tahap kesejahteraan, 2025',
          source: SOURCE,
          unit: 'keluarga',
          items: [
            ['Prasejahtera', `${K}jumlah-keluarga-prasejahtera`],
            ['Sejahtera I', `${K}jumlah-keluarga-sejahtera-1`],
            ['Sejahtera II', `${K}jumlah-keluarga-sejahtera-2`],
            ['Sejahtera III', `${K}jumlah-keluarga-sejahtera-3`],
            ['Sejahtera III Plus', `${K}jumlah-keluarga-sejahtera-3-plus`],
          ],
        }),
    },
    {
      chapter: 'aset-sarana-produksi',
      section: 'aset-tanah',
      title: 'Tanah yang kecil, tanah yang tidak ada',
      body: [
        'Dari **9.873 orang** dalam pendataan aset tanah, 1.235 orang (12,5 persen) tidak memiliki tanah sama sekali.',
        'Yang memiliki tanah umumnya berukuran kecil: 6.456 orang, dua dari tiga, memiliki tanah 0,1–0,3 hektare. Hanya 9 orang yang memiliki lebih dari 1 hektare.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${T}jumlah-total-penduduk`, 9873],
        [`${T}tidak-memiliki-tanah`, 1235],
        [`${TL}0-1-0-2-ha`, 3778],
        [`${TL}0-21-0-3-ha`, 2678],
        [`${TL}1-0-5-0-ha`, 5],
        [`${TL}5-0-10-ha`, 3],
        [`${T}memiliki-tanah-lebih-dari-10-ha`, 1],
      ]),
      figure: (ctx) => {
        const v = (suffix: string) => ctx.indicator(`${TL}${suffix}`);
        return {
          kind: 'diagram',
          title: 'Penduduk menurut luas kepemilikan tanah, 2025',
          source: SOURCE,
          bars: {
            unit: 'orang',
            items: [
              { label: 'Tidak memiliki', value: ctx.indicator(`${T}tidak-memiliki-tanah`) },
              { label: '0,1–0,2 ha', value: v('0-1-0-2-ha') },
              { label: '0,21–0,3 ha', value: v('0-21-0-3-ha') },
              { label: '0,31–0,5 ha', value: v('0-31-0-4-ha') + v('0-41-0-5-ha') },
              {
                label: '0,51–1,0 ha',
                value:
                  v('0-51-0-6-ha') +
                  v('0-61-0-7-ha') +
                  v('0-71-0-8-ha') +
                  v('0-81-0-9-ha') +
                  v('0-91-1-0-ha'),
              },
              {
                label: 'Lebih dari 1 ha',
                value:
                  v('1-0-5-0-ha') +
                  v('5-0-10-ha') +
                  ctx.indicator(`${T}memiliki-tanah-lebih-dari-10-ha`),
              },
            ],
          },
        };
      },
    },
    {
      chapter: 'pengangguran',
      section: 'pengangguran',
      title: 'Bekerja, belajar, atau mengurus rumah',
      body: [
        'Angkatan kerja usia 18–56 tahun di Manggar tercatat **30.726 orang**. Rincian yang tersedia mencakup 15.815 orang di antaranya.',
        'Dari rincian itu, 11.694 orang bekerja penuh dan 1.674 bekerja tidak tentu. Sebanyak 1.243 orang masih bersekolah dan tidak bekerja, 1.031 orang adalah ibu rumah tangga, dan 69 orang penyandang disabilitas tidak bekerja, sementara 104 penyandang disabilitas bekerja.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['pengangguran-jumlah-angkatan-kerja-penduduk-usia-18-56-tahun', 30726],
        ['pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-bekerja-penuh', 11694],
        ['pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-bekerja-tidak-tentu', 1674],
        ['pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-masih-sekolah-dan-tidak-beker', 1243],
        ['pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-menjadi-ibu-rumah-tangga', 1031],
        ['pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-cacat-dan-tidak-bekerja', 69],
        ['pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-cacat-dan-bekerja', 104],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Penduduk usia 18–56 tahun menurut kegiatan, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            ['Bekerja penuh', 'pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-bekerja-penuh'],
            [
              'Bekerja tidak tentu',
              'pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-bekerja-tidak-tentu',
            ],
            [
              'Sekolah, tidak bekerja',
              'pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-masih-sekolah-dan-tidak-beker',
            ],
            [
              'Ibu rumah tangga',
              'pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-menjadi-ibu-rumah-tangga',
            ],
            [
              'Disabilitas, bekerja',
              'pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-cacat-dan-bekerja',
            ],
            [
              'Disabilitas, tidak bekerja',
              'pengangguran-jumlah-penduduk-usia-18-56-tahun-yang-cacat-dan-tidak-bekerja',
            ],
          ],
        }),
    },
    {
      chapter: 'aset-sarana-produksi',
      section: 'aset-sarana-produksi',
      title: 'Alat produksi yang dimiliki warga',
      body: [
        'Kepemilikan alat produksi paling banyak tercatat pada industri migas: **91 pemilik**. Sektor perikanan tercatat 32 pemilik kapal penangkap ikan dan 12 pemilik alat pengolahan hasil perikanan.',
        'Selain itu ada 17 pemilik alat pengolahan hasil perkebunan, 14 hasil peternakan, 12 industri jasa dan perdagangan, 2 pemilik traktor, serta masing-masing 1 pemilik penggilingan padi dan pabrik pengolahan hasil pertanian.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['aset-sarana-produksi-memiliki-alat-produksi-dan-pengolahan-hasil-migas', 91],
        ['aset-sarana-produksi-memiliki-kapal-penangkap-ikan', 32],
        ['aset-sarana-produksi-memiliki-alat-pengolahan-hasil-perikanan', 12],
        ['aset-sarana-produksi-memiliki-alat-pengolahan-hasil-perkebunan', 17],
        ['aset-sarana-produksi-memiliki-alat-pengolahan-hasil-peternakan', 14],
        ['aset-sarana-produksi-memiliki-traktor', 2],
        ['aset-sarana-produksi-memiliki-penggilingan-padi', 1],
        ['aset-sarana-produksi-memiliki-pabrik-pengolahan-hasil-pertanian', 1],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Pemilik alat dan sarana produksi, 2025',
          source: SOURCE,
          unit: 'orang',
          items: [
            [
              'Alat industri migas',
              'aset-sarana-produksi-memiliki-alat-produksi-dan-pengolahan-hasil-migas',
            ],
            ['Kapal penangkap ikan', 'aset-sarana-produksi-memiliki-kapal-penangkap-ikan'],
            [
              'Alat olah hasil kebun',
              'aset-sarana-produksi-memiliki-alat-pengolahan-hasil-perkebunan',
            ],
            [
              'Alat olah hasil ternak',
              'aset-sarana-produksi-memiliki-alat-pengolahan-hasil-peternakan',
            ],
            [
              'Alat olah hasil ikan',
              'aset-sarana-produksi-memiliki-alat-pengolahan-hasil-perikanan',
            ],
            [
              'Industri jasa dan dagang',
              'aset-sarana-produksi-memiliki-alat-produksi-dan-pengolah-hasil-industri-jasa',
            ],
            ['Traktor', 'aset-sarana-produksi-memiliki-traktor'],
          ],
        }),
    },
    {
      chapter: 'aset-sarana-produksi',
      section: 'aset-sarana-transportasi-umum',
      title: 'Ojek sebagai transportasi umum',
      body: 'Satu-satunya sarana transportasi umum yang tercatat di Manggar adalah **ojek, sebanyak 65 unit**.',
      expect: expectIndicators([['aset-sarana-produksi-memiliki-ojek-65-unit', 65]]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Sarana transportasi umum, 2025',
          source: SOURCE,
          unit: 'unit',
          items: [['Ojek', 'aset-sarana-produksi-memiliki-ojek-65-unit']],
        }),
    },
    {
      chapter: 'keamanan',
      section: 'pelembagaan-sistem-keamanan-lingkungan-semesta',
      title: 'Menjaga lingkungan bersama',
      body: [
        'Sistem keamanan lingkungan di Manggar berjalan di **100 RT**, dengan 100 pos jaga induk dan 200 anggota Hansip dan Linmas. Tercatat 1 kegiatan pembinaan siskamling, dan tidak ada kelompok satuan pengamanan (SATPAM) swasta.',
        'Pada 2025 tidak ada kasus pencurian, perkelahian, maupun pembunuhan yang tercatat.',
      ].join('\n\n'),
      expect: expectIndicators([
        ['keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-rt-atau-sebutan-l', 100],
        ['keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-pos-jaga-induk-de', 100],
        ['keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-anggota-hansip-da', 200],
        ['keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-pembinaan-siskaml', 1],
        ['keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-kelompok-satuan-p', 0],
        ['keamanan-pencurian-kasus-pencurian-dan-perampokan-yang-terjadi-tahun-ini', 0],
        ['keamanan-perkelahian-kasus-perkelahian-yang-terjadi-pada-tahun-ini', 0],
        ['keamanan-pembunuhan-jumlah-kasus-pembunuhan-pada-tahun-ini', 0],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Sistem keamanan lingkungan, 2025',
          source: SOURCE,
          unit: 'unit/orang',
          items: [
            [
              'RT dengan siskamling',
              'keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-rt-atau-sebutan-l',
            ],
            [
              'Pos jaga induk',
              'keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-pos-jaga-induk-de',
            ],
            [
              'Anggota Hansip dan Linmas',
              'keamanan-pelembagaan-sistem-keamanan-lingkungan-semesta-jumlah-anggota-hansip-da',
            ],
          ],
        }),
    },
  ],
};
