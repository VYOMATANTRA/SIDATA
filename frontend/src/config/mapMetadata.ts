import type { SpatialPointType } from '../types/maps';

/**
 * Metadata keys never shown in the map drawer. `Kode` is the idempotency key of
 * `npm run import:bsu`, not content for visitors.
 */
export const HIDDEN_METADATA_KEYS: readonly string[] = ['Kode'];

/**
 * MySQL JSON does not preserve key order (it re-sorts shortest-first), so the
 * drawer imposes display order itself. Keys not listed here follow, in the
 * order received.
 */
export const METADATA_ORDER: Partial<Record<SpatialPointType, readonly string[]>> = {
  bank_sampah: [
    'RT',
    'Alamat',
    'Tahun berdiri',
    'Pengelola',
    'Telepon',
    'Status',
    'Jumlah pengurus',
    'Nasabah terdaftar',
    'Nasabah aktif',
    'Nasabah aktif 3 bulan terakhir',
    'SK kepengurusan',
    'AD/ART',
    'Jadwal layanan rutin',
    'Rapat pengurus',
    'Relawan aktif',
    'Frekuensi layanan',
    'Jenis sampah diterima',
    'Volume per bulan',
    'Terjual ke pengepul',
    'Lama simpan sebelum dijual',
    'Luas gudang',
    'Timbangan',
    'Kendaraan operasional',
    'Tempat pemilahan memadai',
    'Pendapatan kotor per bulan',
    'Pengeluaran per bulan',
    'Surplus per bulan',
    'Sumber dana',
    'Pembukuan keuangan',
    'Target pengumpulan',
    'Sosialisasi',
    'Mitra kerja',
    'Didaur ulang',
    'Waktu melayani nasabah',
    'Jual ke pengepul',
    'Kendala',
    'Harapan',
    'Sumber',
  ],
};

export function orderMetadataEntries(
  type: SpatialPointType,
  metadata: Record<string, unknown> | null | undefined,
): [string, unknown][] {
  if (!metadata) return [];
  const entries = Object.entries(metadata).filter(
    ([key, val]) =>
      !HIDDEN_METADATA_KEYS.includes(key) && val !== null && val !== undefined && val !== '',
  );
  const order = METADATA_ORDER[type] ?? [];
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  // Array.prototype.sort is stable, so unlisted keys keep their received order.
  return entries.sort((a, b) => rank(a[0]) - rank(b[0]));
}
