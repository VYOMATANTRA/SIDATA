import prisma from '../src/utils/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
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
import { RT_LEADERS_DATA } from '../src/data/rtLeadersData.js';
import { OFFICIAL_RT_LEADERS } from '../src/data/officialRtLeaders.js';
import {
  parseSeedPointTombstones,
  RT_SEED_POINT_TOMBSTONES_KEY,
  seedOfficialRtLeaderSlots,
  seedRtLeaders,
} from './seedRtLeaders.js';
import { cleanLegacySampleRtData } from '../src/services/legacySampleRtCleanup.service.js';

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

  const isProduction = process.env.NODE_ENV === 'production';

  // Every environment starts with the 100 official RT names from the Monografi.
  // The source publishes no phone, address, or machine-readable coordinates, so
  // those fields start empty and are filled through the CMS. `update: {}` keeps
  // editor corrections intact on re-seed.
  if (!isProduction) {
    await cleanLegacySampleRtData('seed', {
      ...(process.env.NODE_ENV ? { nodeEnv: process.env.NODE_ENV } : {}),
    });

    // The legacy cleanup leaves placeholder names behind; replace only those,
    // never a name an editor has already corrected.
    for (const leader of OFFICIAL_RT_LEADERS) {
      await prisma.rtLeader.updateMany({
        where: {
          rtNumber: leader.rtNumber,
          name: { startsWith: 'Ketua RT ' },
          phone: { in: ['—', ''] },
        },
        data: { name: leader.name, phone: '', phoneIsWhatsapp: false, alamat: null },
      });
    }
  }

  await seedOfficialRtLeaderSlots(prisma, OFFICIAL_RT_LEADERS);

  // Development keeps the synthetic map points so the Peta page has something to
  // render; the leaders themselves stay the official names above.
  if (!isProduction) {
    const tombstoneSetting = await prisma.systemSetting.findUnique({
      where: { key: RT_SEED_POINT_TOMBSTONES_KEY },
    });
    const skippedPointIds = parseSeedPointTombstones(tombstoneSetting?.value);
    await seedRtLeaders(prisma, RT_LEADERS_DATA, { skippedPointIds });

    // Development map coordinates are synthetic, so the sample notice stays on.
    await prisma.systemSetting.upsert({
      where: { key: 'maps.rt_leaders_sample_roster' },
      create: { key: 'maps.rt_leaders_sample_roster', value: 'true' },
      update: {},
    });

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
  } else {
    // Production names are official; no synthetic points or contacts are created.
    await prisma.systemSetting.upsert({
      where: { key: 'maps.rt_leaders_sample_roster' },
      create: { key: 'maps.rt_leaders_sample_roster', value: 'false' },
      update: {},
    });
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
        metadata: block.metadata === null ? Prisma.DbNull : block.metadata,
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
    totalRtLeaders: await prisma.rtLeader.count(),
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
