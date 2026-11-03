import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '../../generated/prisma/client.js';
import { isLegacyPlaceholder } from '../../prisma/seeder_indicator.js';

describe('seeder_indicator isLegacyPlaceholder', () => {
  it('correctly identifies legacy placeholder candidates for penduduk', () => {
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pendidikan-penduduk',
        label: 'Penduduk',
        valueCurrent: '53098',
      }),
      true,
    );
    assert.equal(
      isLegacyPlaceholder({
        slug: 'kesehatan-penduduk',
        label: 'Penduduk',
        valueCurrent: '53.098',
      }),
      true,
    );
  });

  it('rejects legitimate custom, zero-valued, or edited penduduk indicators with different labels or values', () => {
    // Repurposed label
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pendidikan-penduduk',
        label: 'Jumlah Siswa Putus Sekolah',
        valueCurrent: '53098',
      }),
      false,
    );
    // Legitimate 0 value must NOT be treated as legacy placeholder
    assert.equal(
      isLegacyPlaceholder({
        slug: 'ekonomi-dan-ketertiban-penduduk',
        label: 'Penduduk',
        valueCurrent: '0',
      }),
      false,
    );
    // Custom non-placeholder value
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pendidikan-penduduk',
        label: 'Penduduk',
        valueCurrent: '1250',
      }),
      false,
    );
  });

  it('correctly identifies legacy placeholder candidates for rukun-tetangga', () => {
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pendidikan-rukun-tetangga',
        label: 'Rukun Tetangga',
        valueCurrent: '100',
      }),
      true,
    );
    // Legitimate 0 value must NOT be treated as legacy placeholder
    assert.equal(
      isLegacyPlaceholder({
        slug: 'kesehatan-rukun-tetangga',
        label: 'Rukun Tetangga',
        valueCurrent: '0',
      }),
      false,
    );
    // Non-placeholder value
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pendidikan-rukun-tetangga',
        label: 'Rukun Tetangga',
        valueCurrent: '42',
      }),
      false,
    );
  });

  it('correctly identifies legacy placeholder candidates for kepadatan', () => {
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pemerintahan-dan-kelembagaan-kepadatan',
        label: 'Kepadatan Penduduk',
        valueCurrent: '2',
      }),
      true,
    );
    // Legitimate 0 value must NOT be treated as legacy placeholder
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pemerintahan-dan-kelembagaan-kepadatan',
        label: 'Kepadatan Penduduk',
        valueCurrent: '0',
      }),
      false,
    );
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pemerintahan-dan-kelembagaan-kepadatan',
        label: 'Kepadatan Penduduk',
        valueCurrent: '15',
      }),
      false,
    );
  });

  it('correctly identifies legacy placeholder candidates for rasio-kelamin', () => {
    assert.equal(
      isLegacyPlaceholder({
        slug: 'geografis-dan-tata-ruang-rasio-kelamin',
        label: 'Rasio Laki-laki & Perempuan',
        valueCurrent: '1.06',
      }),
      true,
    );
    // Legitimate 0 value must NOT be treated as legacy placeholder
    assert.equal(
      isLegacyPlaceholder({
        slug: 'geografis-dan-tata-ruang-rasio-kelamin',
        label: 'Rasio Laki-laki & Perempuan',
        valueCurrent: '0',
      }),
      false,
    );
    assert.equal(
      isLegacyPlaceholder({
        slug: 'geografis-dan-tata-ruang-rasio-kelamin',
        label: 'Rasio Laki-laki & Perempuan',
        valueCurrent: '0.95',
      }),
      false,
    );
  });

  it('safely returns false for unrecognized slugs or malformed values', () => {
    assert.equal(
      isLegacyPlaceholder({
        slug: 'custom-indicator-slug',
        label: 'Penduduk',
        valueCurrent: '53098',
      }),
      false,
    );
    assert.equal(
      isLegacyPlaceholder({
        slug: 'pendidikan-penduduk',
        label: 'Penduduk',
        valueCurrent: 'not-a-number',
      }),
      false,
    );
  });

  it('verifies that Prisma.Decimal.equals treats scale-formatted strings as identical', () => {
    const dbValue = new Prisma.Decimal('53098.0000');
    const seederValue = '53098';
    assert.equal(dbValue.equals(seederValue), true);
    assert.equal(!new Prisma.Decimal(dbValue).equals(seederValue), false);
  });
});
