import prisma from '../src/utils/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
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
      devValue: '53098',
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

export function isLegacyPlaceholder(candidate: {
  slug: string;
  label: string;
  valueCurrent: Prisma.Decimal | string;
}): boolean {
  try {
    const dec = new Prisma.Decimal(candidate.valueCurrent);
    if (candidate.slug.endsWith('-penduduk')) {
      return candidate.label === 'Penduduk' && (dec.equals('53098') || dec.equals('53.098'));
    }
    if (candidate.slug.endsWith('-rukun-tetangga')) {
      return candidate.label === 'Rukun Tetangga' && dec.equals('100');
    }
    if (candidate.slug.endsWith('-kepadatan')) {
      return candidate.label === 'Kepadatan Penduduk' && dec.equals('2');
    }
    if (candidate.slug.endsWith('-rasio-kelamin')) {
      return candidate.label === 'Rasio Laki-laki & Perempuan' && dec.equals('1.06');
    }
  } catch {
    return false;
  }
  return false;
}

async function main() {
  const env = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (env === 'production') {
    throw new Error(
      'seeder_indicator.ts tidak diizinkan pada environment production (NODE_ENV=production).',
    );
  }

  const isDevMock = process.env.DEV_MOCK_INDICATORS === 'true' || process.argv.includes('--dev');
  const isReset = process.env.RESET_INDICATORS === 'true' || process.argv.includes('--reset');

  console.log(
    `Memulai proses seeding indikator (Mode: ${isDevMock ? 'Dev Mock Figures (--dev)' : 'Honest Empty (No mock data)'}, Reset: ${isReset})...`,
  );

  // 0. Bersihkan indikator legacy buatan seeder lama yang salah sasaran di halaman non-kependudukan.
  // SPEC §3: Hanya hapus jika row masih dalam state seeded (tidak pernah diubah oleh editor)
  // dan catat log audit indicator.deleted dalam transaksi yang sama.
  const legacyCandidates = await prisma.indicator.findMany({
    where: { slug: { in: LEGACY_FAKE_SLUGS } },
  });

  for (const candidate of legacyCandidates) {
    const isUntouched = candidate.createdAt.getTime() === candidate.updatedAt.getTime();
    const isPlaceholder = isLegacyPlaceholder(candidate);
    const editorAudit = await prisma.auditLog.findFirst({
      where: {
        targetType: 'indicator',
        targetId: candidate.id,
        actorRole: { not: 'system' },
      },
    });

    if (!isPlaceholder || !isUntouched || editorAudit) {
      console.warn(
        `[SKIP CLEANUP] Indikator legacy ${candidate.slug} dilewati karena bukan placeholder asli atau telah diedit oleh non-system user.`,
      );
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.indicator.delete({ where: { id: candidate.id } });
      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.INDICATOR_DELETED,
          actor: { email: 'system@sidata.internal', role: 'system' },
          target: { type: 'indicator', id: candidate.id, label: candidate.slug },
          metadata: {
            source: 'seeder_indicator_cleanup',
            slug: candidate.slug,
            reason: 'legacy_fake_indicator_cleanup',
          },
        },
        tx,
      );
    });
    console.log(`✓ Indikator legacy ${candidate.slug} berhasil dihapus dengan baris audit.`);
  }

  for (const [index, category] of CATEGORIES.entries()) {
    // 1. Dapatkan atau buat Page
    let page = await prisma.page.findUnique({
      where: { slug: category.slug },
      include: {
        chapters: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!page && category.slug === 'persampahan-dan-bank-sampah-unit') {
      page = await prisma.page.findUnique({
        where: { slug: 'persampahan' },
        include: {
          chapters: {
            orderBy: { sortOrder: 'asc' },
          },
        },
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
        include: {
          chapters: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    }

    // 2. Dapatkan atau buat Chapter
    let chapter = page.chapters.find((c) => c.slug === 'ringkasan-statistik') ?? page.chapters[0];
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

    // 4. Seeding indikator per kategori
    // Tanpa --dev, jangan buat indikator jika belum ada data riil yang bersumber valid.
    // Kartu Cerita memiliki empty state "Data belum tersedia", sehingga tidak adanya baris adalah default yang jujur.
    if (!isDevMock) {
      continue;
    }

    const indicatorDefs = CATEGORY_INDICATORS[category.slug] || [];

    for (const def of indicatorDefs) {
      const existing = await prisma.indicator.findUnique({
        where: { slug: def.slug },
      });

      const valueCurrent = def.devValue;
      const targetSource = isDevMock ? 'Data contoh (dev)' : def.source;

      if (existing) {
        const hasValueChanged = !new Prisma.Decimal(existing.valueCurrent).equals(valueCurrent);
        const hasSourceChanged = existing.source !== targetSource;
        if (isReset && (hasValueChanged || hasSourceChanged)) {
          // SPEC §3: Hanya reset jika belum pernah diubah oleh editor / non-system user.
          // Cek berdasarkan keberadaan log audit non-system agar subsequent --reset tidak terkunci permanen oleh pergeseran updatedAt.
          const editorAudit = await prisma.auditLog.findFirst({
            where: {
              targetType: 'indicator',
              targetId: existing.id,
              OR: [
                { actorRole: { not: 'system' } },
                { actorEmail: { not: 'system@sidata.internal' } },
              ],
            },
          });
          const isTouchedByEditor = Boolean(editorAudit);

          if (isTouchedByEditor) {
            console.warn(
              `[SKIP RESET] Indikator ${existing.slug} dilewati dari --reset karena telah diedit oleh editor.`,
            );
            continue;
          }

          await prisma.$transaction(async (tx) => {
            const updated = await tx.indicator.update({
              where: { id: existing.id },
              data: {
                valueCurrent,
                source: targetSource,
              },
            });
            await buildAuditLog(
              {
                action: AUDIT_ACTIONS.INDICATOR_UPDATED,
                actor: { email: 'system@sidata.internal', role: 'system' },
                target: { type: 'indicator', id: updated.id, label: updated.slug },
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
            source: targetSource,
          },
        });

        // Tulis baris audit per SPEC §3
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_CREATED,
            actor: { email: 'system@sidata.internal', role: 'system' },
            target: { type: 'indicator', id: created.id, label: created.slug },
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

const isMainModule = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('seeder_indicator.ts') ||
    process.argv[1].endsWith('seeder_indicator.js')),
);

if (isMainModule) {
  main()
    .catch((e) => {
      console.error('Error saat seeding indikator:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
