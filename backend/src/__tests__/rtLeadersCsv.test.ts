import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRtLeadersCsv, RT_LEADERS_CSV_HEADER } from '../utils/rtLeadersCsv.js';
import { OFFICIAL_RT_LEADERS } from '../data/officialRtLeaders.js';

const header = RT_LEADERS_CSV_HEADER.join(',');

describe('parseRtLeadersCsv', () => {
  it('parses a valid row and preserves leading zeroes as text', () => {
    const result = parseRtLeadersCsv(
      `${header}\n7,Sujarwo,08123456789,true,Jl. Mulawarman 7,-1.2,116.9`,
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.rows[0], {
      rowNumber: 2,
      rtNumber: 7,
      name: 'Sujarwo',
      phone: '08123456789',
      phoneIsWhatsapp: true,
      alamat: 'Jl. Mulawarman 7',
      latitude: -1.2,
      longitude: 116.9,
    });
  });

  it('supports quoted commas and escaped quotes', () => {
    const result = parseRtLeadersCsv(`${header}\n1,"Nama, ""Lengkap""",0812,false,"Jl. A, RT 1",,`);
    assert.equal(result.rows[0]?.name, 'Nama, "Lengkap"');
    assert.equal(result.rows[0]?.alamat, 'Jl. A, RT 1');
  });

  it('treats blank optional cells as preserve-existing', () => {
    const result = parseRtLeadersCsv(`${header}\n3,,,,,,`);
    assert.deepEqual(result.rows[0], { rowNumber: 2, rtNumber: 3 });
  });

  it('rejects bad headers, duplicates, invalid RTs, and half coordinates', () => {
    const badHeader = parseRtLeadersCsv('rt,name\n1,A');
    assert.equal(badHeader.errors[0]?.field, 'header');

    const result = parseRtLeadersCsv(`${header}\n0,A,,,,,\n1,A,,,,,\n1,B,,,,,\n2,C,,,,-1.2,`);
    assert.equal(result.errors.filter((error) => error.field === 'rtNumber').length, 2);
    assert.equal(
      result.errors.some((error) => error.field === 'coordinates'),
      true,
    );
  });

  it('rejects out-of-range coordinates', () => {
    const result = parseRtLeadersCsv(`${header}\n1,A,,,,91,116`);
    assert.equal(
      result.errors.some((error) => error.field === 'latitude'),
      true,
    );
  });
});

describe('OFFICIAL_RT_LEADERS', () => {
  it('covers RT 1–100 once, from the Monografi roster', () => {
    assert.equal(OFFICIAL_RT_LEADERS.length, 100);
    assert.deepEqual(
      OFFICIAL_RT_LEADERS.map((row) => row.rtNumber),
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    assert.equal(OFFICIAL_RT_LEADERS[0]?.name, 'Sujarwo');
    assert.equal(OFFICIAL_RT_LEADERS[99]?.name, 'Lamara');
  });
});
