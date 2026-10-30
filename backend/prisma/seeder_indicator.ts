import prisma from '../src/utils/prisma.js';
import { buildAuditLog, AUDIT_ACTIONS } from '../src/services/audit.service.js';

interface CategoryConfig {
  slug: string;
  name: string;
}

const CATEGORIES: CategoryConfig[] = [
  { slug: 'kependudukan', name: 'Kependudukan' },
  { slug: 'pendidikan', name: 'Pendidikan' },
  { slug: 'kesehatan', name: 'Kesehatan' },
  { slug: 'ekonomi-dan-ketertiban', name: 'Ekonomi & Ketertiban' },
  { slug: 'pemerintahan-dan-kelembagaan', name: 'Pemerintahan & Kelembagaan' },
  { slug: 'geografis-dan-tata-ruang', name: 'Geografis & Tata Ruang' },
  { slug: 'infrastruktur-dan-perumahan', name: 'Infrastruktur & Perumahan' },
  { slug: 'persampahan-dan-bank-sampah-unit', name: 'Persampahan & Bank Sampah Unit' },
];

interface SeedIndicatorDef {
  slug: string;
  label: string;
  devValue: string;
  unit: string | null;
  periodCurrent: string;
  sortOrder: number;
  source: string;
}

const CATEGORY_INDICATORS: Record<string, SeedIndicatorDef[]> = {
  kependudukan: [
    {
      slug: 'kependudukan-penduduk',
      label: 'Penduduk',
      devValue: '53.098',
      unit: 'jiwa',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'Registrasi Penduduk Kelurahan Manggar',
    },
    {
      slug: 'kependudukan-rukun-tetangga',
      label: 'Rukun Tetangga',
      devValue: '100',
      unit: 'RT',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'Profil Wilayah Kelurahan Manggar',
    },
    {
      slug: 'kependudukan-kepadatan',
      label: 'Kepadatan Penduduk',
      devValue: '2',
      unit: 'jiwa/km²',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'BPS Kota Balikpapan',
    },
    {
      slug: 'kependudukan-rasio-kelamin',
      label: 'Rasio Laki-laki & Perempuan',
      devValue: '1.06',
      unit: ': 1',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'BPS Kota Balikpapan',
    },
  ],
  pendidikan: [
    {
      slug: 'pendidikan-rasio-guru-murid',
      label: 'Rasio Guru-Murid',
      devValue: '1.18',
      unit: ': 1',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'Data Pokok Pendidikan (Dapodik)',
    },
    {
      slug: 'pendidikan-angka-partisipasi-sekolah',
      label: 'Angka Partisipasi Sekolah',
      devValue: '98.5',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'Dinas Pendidikan Kota Balikpapan',
    },
    {
      slug: 'pendidikan-jumlah-sekolah',
      label: 'Sarana Pendidikan',
      devValue: '24',
      unit: 'unit',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'Profil Wilayah Kelurahan Manggar',
    },
    {
      slug: 'pendidikan-tingkat-kelulusan',
      label: 'Tingkat Kelulusan',
      devValue: '99.8',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'Dinas Pendidikan Kota Balikpapan',
    },
  ],
  kesehatan: [
    {
      slug: 'kesehatan-posyandu-aktif',
      label: 'Posyandu Aktif',
      devValue: '28',
      unit: 'unit',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'Puskesmas Manggar',
    },
    {
      slug: 'kesehatan-cakupan-imunisasi',
      label: 'Cakupan Imunisasi Dasar',
      devValue: '95.2',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'Puskesmas Manggar',
    },
    {
      slug: 'kesehatan-tenaga-medis',
      label: 'Tenaga Medis & Paramedis',
      devValue: '45',
      unit: 'orang',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'Dinas Kesehatan Kota Balikpapan',
    },
    {
      slug: 'kesehatan-sarana-kesehatan',
      label: 'Fasilitas Kesehatan',
      devValue: '8',
      unit: 'unit',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'Profil Wilayah Kelurahan Manggar',
    },
  ],
  'ekonomi-dan-ketertiban': [
    {
      slug: 'ekonomi-dan-ketertiban-sentra-umkm',
      label: 'Sentra UMKM Mandiri',
      devValue: '342',
      unit: 'unit usaha',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'Profil Perekonomian Kelurahan Manggar',
    },
    {
      slug: 'ekonomi-dan-ketertiban-tingkat-pengangguran',
      label: 'Tingkat Pengangguran Terbuka',
      devValue: '5.4',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'BPS Kota Balikpapan',
    },
    {
      slug: 'ekonomi-dan-ketertiban-pos-keamanan',
      label: 'Pos Keamanan Lingkungan',
      devValue: '42',
      unit: 'pos',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'Seksi Ketenteraman dan Ketertiban Manggar',
    },
    {
      slug: 'ekonomi-dan-ketertiban-keluarga-sejahtera',
      label: 'Keluarga Sejahtera',
      devValue: '12450',
      unit: 'KK',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'Pendataan Keluarga Kelurahan Manggar',
    },
  ],
  'pemerintahan-dan-kelembagaan': [
    {
      slug: 'pemerintahan-dan-kelembagaan-aparatur-kelurahan',
      label: 'Aparatur Kelurahan',
      devValue: '18',
      unit: 'orang',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'Kantor Kelurahan Manggar',
    },
    {
      slug: 'pemerintahan-dan-kelembagaan-jumlah-rt',
      label: 'Rukun Tetangga (RT)',
      devValue: '100',
      unit: 'RT',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'Bagian Pemerintahan Kelurahan Manggar',
    },
    {
      slug: 'pemerintahan-dan-kelembagaan-lembaga-kemasyarakatan',
      label: 'Lembaga Kemasyarakatan',
      devValue: '12',
      unit: 'lembaga',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'Profil Wilayah Kelurahan Manggar',
    },
    {
      slug: 'pemerintahan-dan-kelembagaan-pos-pelayanan',
      label: 'Pos Pelayanan Terpadu',
      devValue: '35',
      unit: 'pos',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'Kantor Kelurahan Manggar',
    },
  ],
  'geografis-dan-tata-ruang': [
    {
      slug: 'geografis-dan-tata-ruang-luas-wilayah',
      label: 'Luas Wilayah',
      devValue: '35.4',
      unit: 'km²',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'Bappeda Litbang Kota Balikpapan',
    },
    {
      slug: 'geografis-dan-tata-ruang-ruang-terbuka-hijau',
      label: 'Ruang Terbuka Hijau',
      devValue: '28.5',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'Tata Ruang Kota Balikpapan',
    },
    {
      slug: 'geografis-dan-tata-ruang-panjang-pantai',
      label: 'Panjang Garis Pantai',
      devValue: '12.8',
      unit: 'km',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'Dinas Kelautan dan Perikanan',
    },
    {
      slug: 'geografis-dan-tata-ruang-kawasan-pemukiman',
      label: 'Kawasan Pemukiman',
      devValue: '45.2',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'Bappeda Litbang Kota Balikpapan',
    },
  ],
  'infrastruktur-dan-perumahan': [
    {
      slug: 'infrastruktur-dan-perumahan-cakupan-air-bersih',
      label: 'Cakupan Air Bersih',
      devValue: '86.4',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'PTMB Kota Balikpapan',
    },
    {
      slug: 'infrastruktur-dan-perumahan-sanitasi-layak',
      label: 'Akses Sanitasi Layak',
      devValue: '91.2',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'Dinas Perumahan dan Permukiman',
    },
    {
      slug: 'infrastruktur-dan-perumahan-panjang-jalan',
      label: 'Jalan Lingkungan Beraspal/Beton',
      devValue: '78.5',
      unit: 'km',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'Dinas PU Kota Balikpapan',
    },
    {
      slug: 'infrastruktur-dan-perumahan-rumah-layak-huni',
      label: 'Rumah Layak Huni',
      devValue: '94.8',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'Pendataan Perumahan Manggar',
    },
  ],
  'persampahan-dan-bank-sampah-unit': [
    {
      slug: 'persampahan-dan-bank-sampah-unit-bank-sampah',
      label: 'Bank Sampah Unit Aktif',
      devValue: '48',
      unit: 'unit',
      periodCurrent: '2024',
      sortOrder: 1,
      source: 'Dinas Lingkungan Hidup Balikpapan',
    },
    {
      slug: 'persampahan-dan-bank-sampah-unit-sampah-terkelola',
      label: 'Sampah Terkelola Harian',
      devValue: '12.5',
      unit: 'ton/hari',
      periodCurrent: '2024',
      sortOrder: 2,
      source: 'Forum Bank Sampah Manggar',
    },
    {
      slug: 'persampahan-dan-bank-sampah-unit-nasabah',
      label: 'Nasabah Bank Sampah',
      devValue: '1850',
      unit: 'orang',
      periodCurrent: '2024',
      sortOrder: 3,
      source: 'Forum Bank Sampah Manggar',
    },
    {
      slug: 'persampahan-dan-bank-sampah-unit-reduksi-sampah',
      label: 'Tingkat Reduksi Sampah',
      devValue: '26.4',
      unit: '%',
      periodCurrent: '2024',
      sortOrder: 4,
      source: 'Program Eco Boba Manggar',
    },
  ],
};

const LEGACY_FAKE_SLUGS: string[] = [
  'pendidikan-penduduk',
  'pendidikan-rukun-tetangga',
  'pendidikan-kepadatan',
  'pendidikan-rasio-kelamin',
  'kesehatan-penduduk',
  'kesehatan-rukun-tetangga',
  'kesehatan-kepadatan',
  'kesehatan-rasio-kelamin',
  'ekonomi-dan-ketertiban-penduduk',
  'ekonomi-dan-ketertiban-rukun-tetangga',
  'ekonomi-dan-ketertiban-kepadatan',
  'ekonomi-dan-ketertiban-rasio-kelamin',
  'pemerintahan-dan-kelembagaan-penduduk',
  'pemerintahan-dan-kelembagaan-rukun-tetangga',
  'pemerintahan-dan-kelembagaan-kepadatan',
  'pemerintahan-dan-kelembagaan-rasio-kelamin',
  'geografis-dan-tata-ruang-penduduk',
  'geografis-dan-tata-ruang-rukun-tetangga',
  'geografis-dan-tata-ruang-kepadatan',
  'geografis-dan-tata-ruang-rasio-kelamin',
  'infrastruktur-dan-perumahan-penduduk',
  'infrastruktur-dan-perumahan-rukun-tetangga',
  'infrastruktur-dan-perumahan-kepadatan',
  'infrastruktur-dan-perumahan-rasio-kelamin',
  'persampahan-dan-bank-sampah-unit-penduduk',
  'persampahan-dan-bank-sampah-unit-rukun-tetangga',
  'persampahan-dan-bank-sampah-unit-kepadatan',
  'persampahan-dan-bank-sampah-unit-rasio-kelamin',
];

async function main() {
  const isDevMock = process.env.DEV_MOCK_INDICATORS === 'true' || process.argv.includes('--dev');
  const isReset = process.env.RESET_INDICATORS === 'true' || process.argv.includes('--reset');
  console.log(
    `Memulai proses seeding indikator (Mode: ${isDevMock ? 'Dev Mock Figures' : 'Mock to 0'}, Reset: ${isReset})...`,
  );

  // 0. Bersihkan indikator legacy buatan seeder lama yang salah sasaran di halaman non-kependudukan
  const cleaned = await prisma.indicator.deleteMany({
    where: { slug: { in: LEGACY_FAKE_SLUGS } },
  });
  if (cleaned.count > 0) {
    console.log(`✓ Berhasil membersihkan ${cleaned.count} indikator legacy buatan seeder lama.`);
  }

  for (const [index, category] of CATEGORIES.entries()) {
    // 1. Dapatkan atau buat Page
    let page = await prisma.page.findUnique({
      where: { slug: category.slug },
      include: { chapters: true },
    });

    if (!page && category.slug === 'persampahan-dan-bank-sampah-unit') {
      page = await prisma.page.findUnique({
        where: { slug: 'persampahan' },
        include: { chapters: true },
      });
    }

    if (!page) {
      page = await prisma.page.create({
        data: {
          slug: category.slug,
          title: category.name,
          sortOrder: index,
          chapters: {
            create: {
              slug: 'ringkasan-statistik',
              title: 'Ringkasan Statistik',
              sortOrder: 0,
            },
          },
        },
        include: { chapters: true },
      });
    }

    // 2. Dapatkan atau buat Chapter
    let chapter = page.chapters[0];
    if (!chapter) {
      chapter = await prisma.chapter.create({
        data: {
          pageId: page.id,
          slug: 'ringkasan-statistik',
          title: 'Ringkasan Statistik',
          sortOrder: 0,
        },
      });
    }

    // 3. Dapatkan atau buat Section untuk indikator
    const section = await prisma.section.upsert({
      where: {
        chapterId_slug: {
          chapterId: chapter.id,
          slug: 'ringkasan-statistik',
        },
      },
      update: {},
      create: {
        chapterId: chapter.id,
        slug: 'ringkasan-statistik',
        title: 'Ringkasan Statistik',
        sortOrder: 0,
      },
    });

    // 4. Seeding indikator per kategori dengan data spesifik
    const indicatorDefs = CATEGORY_INDICATORS[category.slug] || [];

    for (const def of indicatorDefs) {
      const existing = await prisma.indicator.findUnique({
        where: { slug: def.slug },
      });

      // Gunakan nilai 0 secara default, atau angka dev mock jika flag eksplisit diaktifkan
      const valueCurrent = isDevMock ? def.devValue : '0';

      if (existing) {
        if (isReset && existing.valueCurrent.toString() !== valueCurrent) {
          await prisma.$transaction(async (tx) => {
            const updated = await tx.indicator.update({
              where: { id: existing.id },
              data: { valueCurrent },
            });
            await buildAuditLog(
              {
                action: AUDIT_ACTIONS.INDICATOR_UPDATED,
                actor: { email: 'system@sidata.internal', role: 'system' },
                target: { type: 'indicator', id: updated.id, label: updated.label },
                metadata: {
                  source: 'seeder_indicator_reset',
                  slug: updated.slug,
                  previousValue: existing.valueCurrent.toString(),
                  valueCurrent,
                  isDevMock,
                },
              },
              tx,
            );
          });
        }
        // Biarkan data yang sudah ada (update: {}) agar tidak menimpa hasil kerja editor
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const created = await tx.indicator.create({
          data: {
            sectionId: section.id,
            slug: def.slug,
            label: def.label,
            valueCurrent,
            unit: def.unit,
            periodCurrent: def.periodCurrent,
            sortOrder: def.sortOrder,
            source: def.source,
          },
        });

        // Tulis baris audit per SPEC §3
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_CREATED,
            actor: { email: 'system@sidata.internal', role: 'system' },
            target: { type: 'indicator', id: created.id, label: created.label },
            metadata: {
              source: 'seeder_indicator',
              slug: created.slug,
              valueCurrent,
              periodCurrent: created.periodCurrent,
              isDevMock,
            },
          },
          tx,
        );
      });
    }

    console.log(`✓ Indikator kategori ${category.name} (${category.slug}) berhasil di-seed`);
  }

  console.log('Seeding indikator selesai.');
}

main()
  .catch((e) => {
    console.error('Error saat seeding indikator:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
