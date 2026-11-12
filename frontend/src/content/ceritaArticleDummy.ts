import type { CeritaArticle } from '../types/ceritaArticle';
import photo from '@/assets/img/background_laman_depan_kelurahan.webp';

/**
 * DUMMY CONTENT for the article template, copied from the Figma mockup of the Pendidikan page so
 * the layout can be reviewed. It is NOT sourced data: figures, quote and captions are mockup text.
 * It is only reachable in development (`/cerita/contoh`) and must never be shown to residents.
 * Wave 4 replaces it with content built from the backend.
 */
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
      blocks: [
        {
          kind: 'prose',
          id: 'p1',
          paragraphs: [
            'Terdapat kabanggan tersendiri di Kelurahan Manggar, yaitu keberhasilannya menyandang status 0 buta aksara. Capaian ini merupakan modal yang sangat berharga untuk membangun kualitas sumber daya manusia yang baik sehingga masyarakat dapat berpartisipasi aktif dalam berbagai bidang, seperti pendidikan, ekonomi, maupun pembangunan daerah.',
            'Hal ini berlanding lurus dengan tingginya kesadaran orangtua untuk menyekolahkan anak-anak mereka. Tercatat, dari 8.592 anak usia wajib belajar (7-15 tahun), sebanyak 99,7% atau 8.567 anak masih aktif bersekolah. Ini menjadi fondasi kuat untuk mendukung kemajuan sumber daya manusia di Kelurahan Manggar di masa mendatang.',
          ],
        },
        {
          kind: 'bars',
          id: 'b1',
          title: 'Tingkat Pendidikan Penduduk',
          items: [
            { id: 'sd', label: 'Tamat SD', value: 3200 },
            { id: 'slta', label: 'Tamat SLTA (SMA)', value: 4100 },
            { id: 'smp', label: 'Tamat SMP', value: 2600 },
            { id: 'pt', label: 'Tamat Perguruan Tinggi', value: 1400 },
          ],
        },
        {
          kind: 'quote',
          id: 'q1',
          text: 'Pendidikan adalah senjata paling ampuh yang bisa kamu gunakan untuk mengubah dunia.',
          attribution: 'By Nelson Mandela',
        },
        {
          kind: 'prose',
          id: 'p2',
          paragraphs: [
            'Keberhasilan pendidikan tidak lepas dari peran tenaga pengajar disini. Di Kelurahan Manggar, tercatat ada total 175 guru yang mendidik 14.889 siswa di berbagai jenjang, mulai dari TK hingga SMA/sederajat.',
          ],
        },
        {
          kind: 'figure',
          id: 'f1',
          src: photo,
          alt: 'Foto contoh sekolah',
          caption: 'SDN 006 Kelurahan Manggar',
          credit: 'Tim Inovasi Sosial VYOMATANTRA',
        },
      ],
    },
  ],
};
