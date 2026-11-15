import { describe, expect, it } from 'vitest';
import { CERITA_COVERS, ceritaCoverFor } from '../content/ceritaCovers';

describe('ceritaCovers', () => {
  it('has one photo for each of the eight Cerita category slugs', () => {
    expect(Object.keys(CERITA_COVERS).sort()).toEqual(
      [
        'ekonomi-dan-ketertiban',
        'geografis-dan-tata-ruang',
        'infrastruktur-dan-perumahan',
        'kependudukan',
        'kesehatan',
        'pemerintahan-dan-kelembagaan',
        'pendidikan',
        'persampahan-dan-bank-sampah-unit',
      ].sort(),
    );
  });

  it('returns the photo of a known slug and null for any other page', () => {
    expect(ceritaCoverFor('kesehatan')).toBe(CERITA_COVERS.kesehatan);
    expect(ceritaCoverFor('halaman-baru')).toBeNull();
    // A prototype key is not a cover.
    expect(ceritaCoverFor('constructor')).toBeNull();
  });
});
