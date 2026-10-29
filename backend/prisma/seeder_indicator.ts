import prisma from '../src/utils/prisma.js';

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

async function main() {
  console.log('Memulai proses seeding indikator...');

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

    // 4. Seeding 4 Indikator utama sesuai spesifikasi Figma/user:
    //    - 53.098 penduduk
    //    - 100 rukun tetangga
    //    - 2 jiwa/km^2 kepadatan penduduk
    //    - 1,06:1 rasio laki-laki & perempuan
    const indicatorsData = [
      {
        slug: `${category.slug}-penduduk`,
        label: 'Penduduk',
        valueCurrent: '53.098',
        unit: null,
        periodCurrent: '2024',
        sortOrder: 1,
        source: 'Registrasi Penduduk Kelurahan Manggar',
      },
      {
        slug: `${category.slug}-rukun-tetangga`,
        label: 'Rukun Tetangga',
        valueCurrent: '100',
        unit: null,
        periodCurrent: '2024',
        sortOrder: 2,
        source: 'Profil Wilayah Kelurahan Manggar',
      },
      {
        slug: `${category.slug}-kepadatan`,
        label: 'Kepadatan Penduduk',
        valueCurrent: '2',
        unit: 'jiwa/km²',
        periodCurrent: '2024',
        sortOrder: 3,
        source: 'BPS Kota Balikpapan',
      },
      {
        slug: `${category.slug}-rasio-kelamin`,
        label: 'Rasio Laki-laki & Perempuan',
        valueCurrent: '1.06',
        unit: ': 1',
        periodCurrent: '2024',
        sortOrder: 4,
        source: 'BPS Kota Balikpapan',
      },
    ];

    for (const ind of indicatorsData) {
      await prisma.indicator.upsert({
        where: { slug: ind.slug },
        update: {
          sectionId: section.id,
          label: ind.label,
          valueCurrent: ind.valueCurrent,
          unit: ind.unit,
          periodCurrent: ind.periodCurrent,
          sortOrder: ind.sortOrder,
          source: ind.source,
        },
        create: {
          sectionId: section.id,
          slug: ind.slug,
          label: ind.label,
          valueCurrent: ind.valueCurrent,
          unit: ind.unit,
          periodCurrent: ind.periodCurrent,
          sortOrder: ind.sortOrder,
          source: ind.source,
        },
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
