import { EKONOMI_STORY } from './ekonomi.js';
import { INFRASTRUKTUR_STORY } from './infrastruktur.js';
import { KEPENDUDUKAN_STORY } from './kependudukan.js';
import { KESEHATAN_STORY } from './kesehatan.js';
import { PEMERINTAHAN_STORY } from './pemerintahan.js';
import { PENDIDIKAN_STORY } from './pendidikan.js';
import { PERSAMPAHAN_STORY } from './persampahan.js';
import type { StorySeed } from './types.js';

/** Stories by page slug. A new page adds one file here and one line below. */
export const CERITA_STORIES: Record<string, StorySeed> = {
  kependudukan: KEPENDUDUKAN_STORY,
  pendidikan: PENDIDIKAN_STORY,
  kesehatan: KESEHATAN_STORY,
  'ekonomi-dan-ketertiban': EKONOMI_STORY,
  'pemerintahan-dan-kelembagaan': PEMERINTAHAN_STORY,
  'infrastruktur-dan-perumahan': INFRASTRUKTUR_STORY,
  'persampahan-dan-bank-sampah-unit': PERSAMPAHAN_STORY,
};
