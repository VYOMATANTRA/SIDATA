import { describe, it, expect } from 'vitest';
import { orderMetadataEntries } from '../config/mapMetadata';

describe('orderMetadataEntries', () => {
  it('orders bank_sampah keys by the contract list and hides Kode', () => {
    // MySQL returns shortest keys first.
    const result = orderMetadataEntries('bank_sampah', {
      RT: '64',
      Kode: 'bsu-rt64',
      'AD/ART': 'Ada',
      Alamat: 'Jl. Contoh',
      Status: 'Aktif',
    });
    expect(result.map(([k]) => k)).toEqual(['RT', 'Alamat', 'Status', 'AD/ART']);
  });

  it('appends unknown keys after listed ones in received order', () => {
    const result = orderMetadataEntries('bank_sampah', {
      Zeta: '1',
      Alamat: 'x',
      Alfa: '2',
      RT: '1',
    });
    expect(result.map(([k]) => k)).toEqual(['RT', 'Alamat', 'Zeta', 'Alfa']);
  });

  it('drops empty values', () => {
    const result = orderMetadataEntries('bank_sampah', { RT: '1', Alamat: '', Status: null });
    expect(result.map(([k]) => k)).toEqual(['RT']);
  });

  it('keeps received order for other types', () => {
    const result = orderMetadataEntries('fasilitas_umum', { b: '1', a: '2' });
    expect(result.map(([k]) => k)).toEqual(['b', 'a']);
  });

  it('returns nothing for null metadata', () => {
    expect(orderMetadataEntries('bank_sampah', null)).toEqual([]);
  });
});
