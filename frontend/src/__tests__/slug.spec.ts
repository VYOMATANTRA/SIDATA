import { describe, expect, it } from 'vitest';
import { slugifyLabel, uniqueSlug } from '../utils/slug';

describe('slugifyLabel', () => {
  it('turns a label into kebab-case', () => {
    expect(slugifyLabel('Total Penduduk', 'indikator')).toBe('total-penduduk');
    expect(slugifyLabel('  Jumlah  KK (2026) ', 'indikator')).toBe('jumlah-kk-2026');
  });

  it('folds diacritics to ASCII', () => {
    expect(slugifyLabel('Pendidikan Ibu Kota Ñandú', 'tabel')).toBe('pendidikan-ibu-kota-nandu');
  });

  it('collapses symbols and never leaves leading or trailing hyphens', () => {
    expect(slugifyLabel('--Persen %/ Penduduk!!', 'indikator')).toBe('persen-penduduk');
  });

  it('falls back when nothing usable remains', () => {
    expect(slugifyLabel('%%% ###', 'indikator')).toBe('indikator');
    expect(slugifyLabel('', 'tabel')).toBe('tabel');
  });

  it('stays within the backend limit with room for a collision suffix', () => {
    const slug = slugifyLabel('a '.repeat(200), 'indikator');
    expect(slug.length).toBeLessThanOrEqual(90);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe('uniqueSlug', () => {
  it('keeps the base when it is free', () => {
    expect(uniqueSlug('total-penduduk', new Set(['jumlah-kk']))).toBe('total-penduduk');
  });

  it('adds the first free numeric suffix on a clash', () => {
    const taken = new Set(['total-penduduk', 'total-penduduk-2']);
    expect(uniqueSlug('total-penduduk', taken)).toBe('total-penduduk-3');
  });
});
