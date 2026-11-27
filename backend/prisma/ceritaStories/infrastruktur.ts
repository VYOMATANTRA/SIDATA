import { expectIndicators, indicatorBars } from './helpers.js';
import type { StorySeed } from './types.js';

const SOURCE = 'Prodeskel Kelurahan Manggar 2025';
const D = 'perumahan-rumah-dinding-';
const L = 'perumahan-rumah-lantai-';
const A = 'perumahan-rumah-atap-';

/**
 * Written as stored. The wall, floor and roof counts cover different numbers of houses (7.359,
 * 503 and 499), so each section describes shares within its own category only. Air Bersih dan
 * Sanitasi has no data of its own.
 */
export const INFRASTRUKTUR_STORY: StorySeed = {
  page: 'infrastruktur-dan-perumahan',
  sections: [
    {
      chapter: 'perumahan',
      section: 'rumah-menurut-dinding',
      title: 'Dinding rumah: tembok dan kayu',
      body: [
        'Dari **7.359 rumah** pada catatan dinding, 4.235 rumah (57,5 persen) berdinding tembok dan 3.124 rumah (42,5 persen) berdinding kayu.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${D}tembok`, 4235],
        [`${D}kayu`, 3124],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Rumah menurut bahan dinding, 2025',
          source: SOURCE,
          unit: 'rumah',
          items: [
            ['Tembok', `${D}tembok`],
            ['Kayu', `${D}kayu`],
          ],
        }),
    },
    {
      chapter: 'perumahan',
      section: 'rumah-menurut-lantai',
      title: 'Lantai rumah',
      body: [
        'Pada catatan lantai, **keramik** adalah yang terbanyak: 233 dari 503 rumah (46 persen). Lantai semen tercatat pada 160 rumah dan lantai kayu pada 104 rumah.',
        'Hanya 6 rumah yang masih berlantai tanah.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${L}keramik`, 233],
        [`${L}semen`, 160],
        [`${L}kayu`, 104],
        [`${L}tanah`, 6],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Rumah menurut bahan lantai, 2025',
          source: SOURCE,
          unit: 'rumah',
          items: [
            ['Keramik', `${L}keramik`],
            ['Semen', `${L}semen`],
            ['Kayu', `${L}kayu`],
            ['Tanah', `${L}tanah`],
          ],
        }),
    },
    {
      chapter: 'perumahan',
      section: 'rumah-menurut-atap',
      title: 'Atap rumah',
      body: [
        'Atap **seng** paling umum: 439 dari 499 rumah pada catatan atap (88 persen). Atap genteng tercatat pada 28 rumah, daun lontar/gebang/enau pada 17, dan asbes pada 9.',
        'Atap kayu tercatat pada 4 rumah, serta masing-masing 1 rumah beratap beton dan bambu.',
      ].join('\n\n'),
      expect: expectIndicators([
        [`${A}seng`, 439],
        [`${A}genteng`, 28],
        [`${A}daun-lontar-gebang-enau`, 17],
        [`${A}asbes`, 9],
        [`${A}kayu`, 4],
        [`${A}beton`, 1],
        [`${A}bambu`, 1],
      ]),
      figure: (ctx) =>
        indicatorBars(ctx, {
          title: 'Rumah menurut bahan atap, 2025',
          source: SOURCE,
          unit: 'rumah',
          items: [
            ['Seng', `${A}seng`],
            ['Genteng', `${A}genteng`],
            ['Daun lontar/gebang/enau', `${A}daun-lontar-gebang-enau`],
            ['Asbes', `${A}asbes`],
            ['Kayu', `${A}kayu`],
            ['Beton', `${A}beton`],
            ['Bambu', `${A}bambu`],
          ],
        }),
    },
  ],
};
