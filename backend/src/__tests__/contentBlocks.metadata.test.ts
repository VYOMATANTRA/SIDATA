import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateBlockMetadata } from '../services/contentBlocks.service.js';

describe('content block metadata schema stripping', () => {
  it('drops unknown sambutan and highlight keys, including nested item keys', () => {
    const sambutan = validateBlockMetadata('landing-sambutan-lurah', {
      authorName: 'Nama',
      unexpected: 'should not persist',
    });
    assert.deepEqual(sambutan, { authorName: 'Nama' });

    const highlight = validateBlockMetadata('landing-highlights', {
      items: [{ title: 'Judul', desc: 'Deskripsi', injected: 'x' }],
      extra: true,
    });
    assert.deepEqual(highlight, { items: [{ title: 'Judul', desc: 'Deskripsi' }] });
  });

  it('drops unknown boundary, SOTK, and profile keys at both levels', () => {
    const profil = validateBlockMetadata('tentang-kelurahan-profil', {
      rtCount: 100,
      lurahName: 'Munir',
      batasWilayah: [{ arah: 'Utara', wilayah: 'Karang Joang', injected: 'x' }],
      sotkMembers: [{ role: 'Lurah', officialName: 'Munir', duties: null, injected: 'x' }],
      unexpected: 'should not persist',
    });
    assert.deepEqual(profil, {
      rtCount: 100,
      lurahName: 'Munir',
      batasWilayah: [{ arah: 'Utara', wilayah: 'Karang Joang' }],
      sotkMembers: [{ role: 'Lurah', officialName: 'Munir', duties: null }],
    });
  });
});
