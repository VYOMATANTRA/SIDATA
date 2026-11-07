/**
 * Synthetic payloads only. Never copy real Ketua RT names, phone numbers or coordinates here
 * (AGENTS.md: production data must not enter the repository).
 */
const CENTER = { lat: -1.2251, lon: 116.9438 };
const STAMP = '2026-01-01T00:00:00.000Z';

const RAW_POINTS = [
  {
    id: 'e2e-rt-1',
    name: 'Ketua RT 01 (uji)',
    type: 'ketua_rt',
    dLat: 0.002,
    dLon: -0.003,
    rts: [1],
  },
  {
    id: 'e2e-rt-2',
    name: 'Ketua RT 02 (uji)',
    type: 'ketua_rt',
    dLat: -0.004,
    dLon: 0.002,
    rts: [2],
  },
  {
    id: 'e2e-rt-3',
    name: 'Ketua RT 03 (uji)',
    type: 'ketua_rt',
    dLat: 0.006,
    dLon: 0.005,
    rts: [3],
  },
  {
    id: 'e2e-bsu-1',
    name: 'Bank Sampah Uji',
    type: 'bank_sampah',
    dLat: -0.007,
    dLon: -0.006,
    rts: [1, 2],
  },
  {
    id: 'e2e-fu-1',
    name: 'Fasilitas Uji',
    type: 'fasilitas_umum',
    dLat: 0,
    dLon: 0.008,
    rts: [] as number[],
  },
];

export const MAP_POINTS = RAW_POINTS.map((p) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  latitude: CENTER.lat + p.dLat,
  longitude: CENTER.lon + p.dLon,
  metadata: null,
  rts: p.rts,
  rtLeader: null,
  createdAt: STAMP,
  updatedAt: STAMP,
}));

export const MAP_SUMMARY = {
  totalPoints: MAP_POINTS.length,
  pointsByType: { ketua_rt: 3, bank_sampah: 1, fasilitas_umum: 1 },
  totalRtLeaders: 100,
  rtLeadersWithCoordinates: 3,
  rtLeadersWithoutCoordinates: 97,
  rtLeadersWithIntegrityConflicts: 0,
};

export const PUBLIC_SETTINGS = {
  appName: 'SIDATA',
  institutionName: 'Kelurahan Manggar',
  tagline: 'Sistem Informasi Data Terpadu',
  administrativeArea: 'Balikpapan Timur',
  contactPhone: '',
  contactWhatsapp: '',
  contactEmail: '',
  contactAddress: '',
  defaultCoordinates: { lat: CENTER.lat, lon: CENTER.lon, zoom: 14 },
  weatherAdm4: '64.71.04.1001',
};
