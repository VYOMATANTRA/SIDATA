import type { CeritaArticle } from '../types/ceritaArticle';
import photoA from '@/assets/img/landing-page/pendidikan.webp';
import photoB from '@/assets/img/landing-page/persampahan.webp';
import photoC from '@/assets/img/landing-page/kesehatan.webp';
import photoD from '@/assets/img/background_laman_depan_kelurahan.webp';

/**
 * DUMMY CONTENT for the article template, adapted from the Figma mockup of the Pendidikan page and
 * the wireframe's four figure types, so the layout can be reviewed. It is NOT sourced data: text,
 * numbers, captions and credits are mockup text. It is only reachable in development
 * (`/cerita/contoh`) and must never be shown to residents. Stored content is shown by the
 * live reader, not through this template.
 */
const credit = 'Tim Inovasi Sosial VYOMATANTRA';

export const dummyPendidikanArticle: CeritaArticle = {
  title: 'Pendidikan',
  headline: 'Bebas Buta Aksara dan Potret Pendidikan Manggar',
  byline: {
    author: 'Tim Inovasi Sosial Vyomatantra',
    affiliation: 'dan Kolaborasi Cinta Statistik',
  },
  chapters: [
    {
      id: 'dummy-c1',
      slug: 'tingkat-pendidikan',
      number: '01',
      title: 'Tingkat Pendidikan',
      sections: [
        {
          id: 'dummy-s1',
          heading: 'Bebas buta aksara',
          paragraphs: [
            'Terdapat kebanggaan tersendiri di Kelurahan Manggar, yaitu keberhasilannya menyandang status 0 buta aksara. Capaian ini merupakan modal yang sangat berharga untuk membangun kualitas sumber daya manusia yang baik.',
            'Hal ini berbanding lurus dengan tingginya kesadaran orangtua untuk menyekolahkan anak-anak mereka. Tercatat, dari 8.592 anak usia wajib belajar (7-15 tahun), sebanyak 99,7% atau 8.567 anak masih aktif bersekolah.',
          ],
          figure: {
            kind: 'photo',
            photo: {
              id: 'ph1',
              src: photoA,
              alt: 'Foto contoh sekolah',
              caption: 'SDN 006 Kelurahan Manggar',
              credit,
            },
          },
        },
        {
          id: 'dummy-s2',
          heading: 'Peran tenaga pengajar',
          paragraphs: [
            'Keberhasilan pendidikan tidak lepas dari peran tenaga pengajar. Di Kelurahan Manggar, tercatat ada total 175 guru yang mendidik 14.889 siswa di berbagai jenjang, mulai dari TK hingga SMA/sederajat.',
          ],
          figure: {
            kind: 'photos',
            photos: [
              { id: 'g1', src: photoB, alt: 'Foto contoh 1', caption: 'Foto 1', credit },
              { id: 'g2', src: photoC, alt: 'Foto contoh 2', caption: 'Foto 2', credit },
            ],
          },
        },
      ],
    },
    {
      id: 'dummy-c2',
      slug: 'wajib-belajar-9-tahun',
      number: '02',
      title: 'Wajib Belajar 9 Tahun',
      sections: [
        {
          id: 'dummy-s3',
          heading: 'Kegiatan belajar',
          paragraphs: [
            'Teks contoh. Isi sebenarnya akan diambil dari konten Cerita yang disimpan di backend.',
          ],
          figure: {
            kind: 'photos',
            photos: [
              { id: 'c1', src: photoA, alt: 'Foto contoh 1', caption: 'Foto 1', credit },
              { id: 'c2', src: photoB, alt: 'Foto contoh 2', caption: 'Foto 2', credit },
              { id: 'c3', src: photoC, alt: 'Foto contoh 3', caption: 'Foto 3', credit },
              { id: 'c4', src: photoD, alt: 'Foto contoh 4', caption: 'Foto 4', credit },
            ],
          },
        },
        {
          id: 'dummy-s4',
          heading: 'Tingkat pendidikan penduduk',
          paragraphs: ['Teks contoh untuk bagian dengan diagram.'],
          figure: {
            kind: 'diagram',
            title: 'Tingkat Pendidikan Penduduk (contoh)',
            bars: {
              items: [
                { id: 'sd', label: 'Tamat SD', value: 3200 },
                { id: 'slta', label: 'Tamat SLTA (SMA)', value: 4100 },
                { id: 'smp', label: 'Tamat SMP', value: 2600 },
                { id: 'pt', label: 'Tamat Perguruan Tinggi', value: 1400 },
              ],
            },
            source: 'Data contoh',
          },
        },
      ],
    },
  ],
};
