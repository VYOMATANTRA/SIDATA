import prisma from '../src/utils/prisma.js';
import {
  AUDIT_RETENTION_KEYS,
  PUBLIC_SETTING_KEYS,
  DEFAULT_PUBLIC_SETTINGS,
  WEATHER_CONFIG_KEYS,
  DEFAULT_WEATHER_CONFIG_SETTINGS,
} from '../src/services/settings.service.js';
import { DEFAULT_CONTENT_BLOCKS } from '../src/services/contentBlocks.service.js';
import { DEFAULT_COMPARISON_TEMPLATES } from '../src/services/comparisonTemplates.service.js';
import { CERITA_PAGES } from './ceritaPages.js';
import { RT_LEADERS_DATA } from './rtLeadersData.js';
import { seedRtLeaders } from './seedRtLeaders.js';

async function main() {
  console.log('Memulai proses seeding...');

  const roleUser = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
    },
  });

  const roleAdmin = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
    },
  });

  const roleEditor = await prisma.role.upsert({
    where: { name: 'editor' },
    update: {},
    create: {
      name: 'editor',
    },
  });

  // Seed all 100 RT Leaders and their 1:1 Spatial Points (in non-production environments only).
  // `update: {}` throughout: seeding must never overwrite a correction an editor
  // has already made (SPEC §2). Re-running the seed only fills in missing rows.
  // In production, the operational roster must be loaded from an official import (SPEC §10),
  // never populated with placeholder synthetic data.
  if (process.env.NODE_ENV !== 'production') {
    const legacySamplePoint = await prisma.spatialPoint.findUnique({
      where: { id: '00000000-0000-0000-0000-000000000001' },
    });
    if (legacySamplePoint) {
      if (
        legacySamplePoint.type === 'ketua_rt' &&
        legacySamplePoint.name.includes('Pos RT 01') &&
        legacySamplePoint.latitude === -1.2235 &&
        legacySamplePoint.longitude === 116.9521
      ) {
        // Automatically remove untouched legacy sample point so RT 1 does not have conflicting points
        await prisma.spatialPointRt.deleteMany({
          where: { pointId: '00000000-0000-0000-0000-000000000001' },
        });
        await prisma.spatialPoint.deleteMany({
          where: { id: '00000000-0000-0000-0000-000000000001' },
        });
      } else {
        console.warn(
          '⚠️  Titik sample lama ketua_rt terdeteksi. Jalankan `npm run dev:cleanup-sample-rt` untuk membersihkan data lama.',
        );
      }
    }

    await seedRtLeaders(prisma, RT_LEADERS_DATA);

    const pointBankSampah = await prisma.spatialPoint.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Bank Sampah Sejahtera Manggar',
        type: 'bank_sampah',
        latitude: -1.225,
        longitude: 116.955,
        metadata: {
          jadwal: 'Sabtu & Minggu 09.00 - 15.00 WITA',
          pengelola: 'Ibu Rahmawati',
        },
      },
    });

    // Bank Sampah covers RT 1, RT 2, RT 3
    for (const rtNum of [1, 2, 3]) {
      await prisma.spatialPointRt.upsert({
        where: {
          pointId_rtNumber: {
            pointId: pointBankSampah.id,
            rtNumber: rtNum,
          },
        },
        update: {},
        create: {
          pointId: pointBankSampah.id,
          rtNumber: rtNum,
        },
      });
    }
  }

  // Audit log retention defaults to "0" (keep forever) for every severity — a fresh install
  // must never silently delete evidence; an admin has to opt into pruning via
  // PATCH /api/settings/audit-retention. See docs/SPEC.md §3 and backend/scripts/prune-audit-logs.ts.
  for (const key of Object.values(AUDIT_RETENTION_KEYS)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: '0' },
    });
  }

  // Seed default public settings (portal identity, contact, spatial config)
  const publicSeedMap: Record<string, string> = {
    [PUBLIC_SETTING_KEYS.appName]: DEFAULT_PUBLIC_SETTINGS.appName,
    [PUBLIC_SETTING_KEYS.institutionName]: DEFAULT_PUBLIC_SETTINGS.institutionName,
    [PUBLIC_SETTING_KEYS.tagline]: DEFAULT_PUBLIC_SETTINGS.tagline,
    [PUBLIC_SETTING_KEYS.administrativeArea]: DEFAULT_PUBLIC_SETTINGS.administrativeArea,
    [PUBLIC_SETTING_KEYS.contactPhone]: DEFAULT_PUBLIC_SETTINGS.contactPhone,
    [PUBLIC_SETTING_KEYS.contactWhatsapp]: DEFAULT_PUBLIC_SETTINGS.contactWhatsapp,
    [PUBLIC_SETTING_KEYS.contactEmail]: DEFAULT_PUBLIC_SETTINGS.contactEmail,
    [PUBLIC_SETTING_KEYS.contactAddress]: DEFAULT_PUBLIC_SETTINGS.contactAddress,
    [PUBLIC_SETTING_KEYS.defaultCoordinates]: JSON.stringify(
      DEFAULT_PUBLIC_SETTINGS.defaultCoordinates,
    ),
    [PUBLIC_SETTING_KEYS.weatherAdm4]: DEFAULT_PUBLIC_SETTINGS.weatherAdm4,
  };

  for (const [key, value] of Object.entries(publicSeedMap)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // Seed default operational weather settings (tuning knobs & API base URL)
  const weatherSeedMap: Record<string, string> = {
    [WEATHER_CONFIG_KEYS.bmkgBaseUrl]: DEFAULT_WEATHER_CONFIG_SETTINGS.bmkgBaseUrl,
    [WEATHER_CONFIG_KEYS.cacheTtlMs]: String(DEFAULT_WEATHER_CONFIG_SETTINGS.cacheTtlMs),
    [WEATHER_CONFIG_KEYS.staleRetryMs]: String(DEFAULT_WEATHER_CONFIG_SETTINGS.staleRetryMs),
    [WEATHER_CONFIG_KEYS.fetchTimeoutMs]: String(DEFAULT_WEATHER_CONFIG_SETTINGS.fetchTimeoutMs),
  };

  for (const [key, value] of Object.entries(weatherSeedMap)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // Seed default content blocks (Hero, Sambutan Lurah, Highlights) per docs/SPEC.md §7 & §8
  for (const block of DEFAULT_CONTENT_BLOCKS) {
    await prisma.contentBlock.upsert({
      where: { slug: block.slug },
      update: {},
      create: {
        slug: block.slug,
        type: block.type,
        title: block.title,
        body: block.body,
        metadata: block.metadata,
      },
    });
  }

  // Starter tier-1 comparison templates (docs/SPEC.md §5). `update: {}` keeps re-runs from
  // overwriting wording an admin has since edited. Written straight through Prisma like the
  // other seeds, so they carry no audit row and never trip the trend-keyword warning.
  for (const template of DEFAULT_COMPARISON_TEMPLATES) {
    await prisma.comparisonTemplate.upsert({
      where: { slug: template.slug },
      update: {},
      create: {
        slug: template.slug,
        label: template.label,
        body: template.body,
        trendNaik: template.trendNaik,
        trendTurun: template.trendTurun,
        trendTetap: template.trendTetap,
      },
    });
  }

  // Cerita pages and their chapters (docs/SPEC.md §2). `update: {}` keeps re-runs from
  // clobbering titles or ordering an editor has since changed. Sections are not seeded — they
  // arrive with the content work that attaches indicators/prose to them.
  for (const [pageIndex, page] of CERITA_PAGES.entries()) {
    const seededPage = await prisma.page.upsert({
      where: { slug: page.slug },
      update: {},
      create: { slug: page.slug, title: page.title, sortOrder: pageIndex },
    });

    for (const [chapterIndex, chapter] of page.chapters.entries()) {
      await prisma.chapter.upsert({
        where: { pageId_slug: { pageId: seededPage.id, slug: chapter.slug } },
        update: {},
        create: {
          pageId: seededPage.id,
          slug: chapter.slug,
          number: chapter.number ?? null,
          title: chapter.title,
          sortOrder: chapterIndex,
        },
      });
    }
  }

  console.log('seeding selesai');
  console.log({
    roleUser,
    roleEditor,
    roleAdmin,
    totalRtLeaders: RT_LEADERS_DATA.length,
    seededBlocks: DEFAULT_CONTENT_BLOCKS.map((b) => b.slug),
    seededComparisonTemplates: DEFAULT_COMPARISON_TEMPLATES.map((t) => t.slug),
  });
}

main()
  .catch((e) => {
    console.error('Error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
