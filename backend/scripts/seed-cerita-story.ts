/**
 * Dev-only: writes a Cerita page's story (section titles, prose and figures) into the local DB
 * through the same services the CMS uses, so validation, locking and audit rows all apply.
 *
 *   set -a && . ../.env && set +a
 *   npm run seed:cerita -- --page kependudukan [--force]
 *
 * Without --force, a section that already has prose or a figure keeps it. A section is skipped
 * when the stored table figures no longer match the numbers its prose quotes.
 */
import prisma from '../src/utils/prisma.js';
import { createSection, reorderSections } from '../src/services/sections.service.js';
import { putSectionText } from '../src/services/sectionText.service.js';
import { putSectionFigure } from '../src/services/sectionFigure.service.js';
import { figureSlugForSection } from '../src/utils/sectionFigure.js';
import { CERITA_STORIES } from '../prisma/ceritaStories/index.js';
import type {
  StoryContext,
  StoryExpectation,
  StoryTableRow,
} from '../prisma/ceritaStories/types.js';

const ACTOR = { email: 'system@sidata.internal', role: 'system' };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function mismatch(e: StoryExpectation, rows: StoryTableRow[]): string | null {
  if (e.table === undefined) return 'harapan tanpa tabel';
  const pool = e.row !== undefined ? rows.filter((r) => r.label === e.row) : rows;
  if (pool.length === 0) return `baris "${e.row}" tidak ada di ${e.table}`;
  const n = (k: 'male' | 'female' | 'total') => pool.reduce((s, r) => s + (r[k] ?? 0), 0);
  if (e.sum !== undefined) {
    const got = n('male') + n('female') + n('total');
    if (got !== e.sum) return `${e.table}: jumlah ${got}, teks menyebut ${e.sum}`;
  }
  for (const k of ['male', 'female', 'total'] as const) {
    const want = e[k];
    if (want !== undefined && n(k) !== want)
      return `${e.table}: ${k} ${n(k)}, teks menyebut ${want}`;
  }
  return null;
}

async function main() {
  if ((process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    throw new Error('seed-cerita-story tidak diizinkan pada NODE_ENV=production.');
  }
  const pageSlug = arg('page');
  const force = process.argv.includes('--force');
  const story = pageSlug ? CERITA_STORIES[pageSlug] : undefined;
  if (!story) {
    throw new Error(`Gunakan --page <slug>. Tersedia: ${Object.keys(CERITA_STORIES).join(', ')}`);
  }

  const page = await prisma.page.findUnique({
    where: { slug: story.page },
    include: { chapters: true },
  });
  if (!page) throw new Error(`Halaman ${story.page} belum ada. Jalankan seed utama dulu.`);

  const tables = await prisma.indicatorTable.findMany({
    where: { section: { chapter: { pageId: page.id } } },
    include: { rows: { orderBy: { sortOrder: 'asc' } } },
  });
  const bySlug = new Map(tables.map((t) => [t.slug, t]));
  const indicators = await prisma.indicator.findMany({
    where: { section: { chapter: { pageId: page.id } } },
    select: { slug: true, valueCurrent: true },
  });
  const indBySlug = new Map(indicators.map((i) => [i.slug, Number(i.valueCurrent)]));
  const ctx: StoryContext = {
    points: () => [],
    tableId: (slug) => {
      const t = bySlug.get(slug);
      if (!t) throw new Error(`Tabel ${slug} tidak ada di halaman ${story.page}`);
      return t.id;
    },
    indicator: (slug) => {
      const v = indBySlug.get(slug);
      if (v === undefined) throw new Error(`Indikator ${slug} tidak ada di halaman ${story.page}`);
      return v;
    },
    rows: (slug) => {
      const t = bySlug.get(slug);
      if (!t) throw new Error(`Tabel ${slug} tidak ada di halaman ${story.page}`);
      return t.rows.map((r) => ({
        label: r.label,
        male: r.male,
        female: r.female,
        total: r.total,
      }));
    },
  };

  const spatial = await prisma.spatialPoint.findMany({
    where: { type: { in: ['bank_sampah', 'fasilitas_umum'] } },
    select: { type: true, name: true, metadata: true },
  });
  // Case-insensitive: survey columns are not consistently capitalised.
  const PERSONAL =
    /pengelola|telepon|telpon|phone|\bhp\b|no[._ ]?hp|whatsapp|\bwa\b|alamat|address|kontak|nama/i;
  ctx.points = (type) =>
    spatial
      .filter((p) => p.type === type)
      .map((p) => {
        const m: Record<string, unknown> = {
          name: p.name,
          ...((p.metadata as Record<string, unknown> | null) ?? {}),
        };
        for (const k of Object.keys(m)) if (k !== 'name' && PERSONAL.test(k)) delete m[k];
        return m;
      });

  for (const s of story.sections) {
    for (const e of s.expect ?? []) {
      if (e.indicator !== undefined ? e.value === undefined : e.table === undefined) {
        throw new Error(`Harapan tidak lengkap pada ${s.chapter}/${s.section}`);
      }
    }
  }

  const order = new Map<string, string[]>(); // chapterId -> story section ids, in story order

  for (const s of story.sections) {
    const tag = `${s.chapter}/${s.section}`;
    const chapter = page.chapters.find((c) => c.slug === s.chapter);
    if (!chapter) {
      console.warn(`- ${tag}: dilewati, bab tidak ada`);
      continue;
    }

    let problem: string | null = null;
    for (const e of s.expect ?? []) {
      if (e.indicator !== undefined) {
        const got = indBySlug.get(e.indicator);
        problem =
          got === undefined
            ? `indikator ${e.indicator} tidak ada`
            : got !== e.value
              ? `${e.indicator}: nilai ${got}, teks menyebut ${e.value}`
              : null;
      } else {
        const t = e.table ? bySlug.get(e.table) : undefined;
        problem = t && e.table ? mismatch(e, ctx.rows(e.table)) : `tabel ${e.table} tidak ada`;
      }
      if (problem) break;
    }
    if (problem) {
      console.warn(`- ${tag}: dilewati, data tidak cocok dengan teks (${problem})`);
      continue;
    }

    // A created section gets a slug generated from its title, so a rerun finds it by title too.
    // The slug wins over the title so a title shared with another section cannot hijack the match.
    let section =
      (await prisma.section.findUnique({
        where: { chapterId_slug: { chapterId: chapter.id, slug: s.section } },
      })) ??
      (await prisma.section.findFirst({
        where: { chapterId: chapter.id, title: s.title },
        orderBy: { sortOrder: 'asc' },
      }));
    if (section && (order.get(chapter.id) ?? []).includes(section.id)) {
      console.warn(`- ${tag}: dilewati, bagian ini sudah dipakai oleh bagian cerita lain`);
      continue;
    }
    const notes: string[] = [];
    if (!section) {
      const created = await createSection(chapter.id, { title: s.title }, ACTOR);
      section = await prisma.section.findUniqueOrThrow({ where: { id: created.section.id } });
      notes.push('bagian dibuat');
    }
    order.set(chapter.id, [...(order.get(chapter.id) ?? []), section.id]);

    const blocks = await prisma.contentBlock.findMany({ where: { sectionId: section.id } });
    const hasProse = blocks.some((b) => b.type === 'prose' && b.body.trim() !== '');
    const hasFigure = blocks.some((b) => b.slug === figureSlugForSection(section!.id));

    let token = section.updatedAt.toISOString();
    if (!hasProse || force) {
      const r = await putSectionText(
        section.id,
        {
          title: s.title,
          body: typeof s.body === 'function' ? s.body(ctx) : s.body,
          expectedUpdatedAt: token,
        },
        ACTOR,
      );
      token = r.section.updatedAt;
      notes.push('teks ditulis');
    } else {
      notes.push('teks sudah ada');
    }
    if (s.figure && (!hasFigure || force)) {
      await putSectionFigure(
        section.id,
        { expectedUpdatedAt: token, figure: s.figure(ctx) },
        ACTOR,
      );
      notes.push('figur ditulis');
    } else if (s.figure) {
      notes.push('figur sudah ada');
    }
    console.log(`✓ ${tag}: ${notes.join(', ')}`);
  }

  // Story sections first, in story order; any other sections keep their relative order after.
  for (const [chapterId, ids] of order) {
    const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
    const sections = await prisma.section.findMany({
      where: { chapterId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const rest = sections.filter((x) => !ids.includes(x.id));
    const items = [...ids, ...rest.map((x) => x.id)].map((id, sortOrder) => ({ id, sortOrder }));
    try {
      await reorderSections(
        chapterId,
        { expectedUpdatedAt: chapter.updatedAt.toISOString(), items },
        ACTOR,
      );
    } catch (e) {
      // Sections are already written and a rerun is safe: report and carry on.
      console.warn(`- urutan bab ${chapter.slug} gagal diubah: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log('Selesai.');
}

main()
  .catch((e) => {
    console.error('Error saat seed-cerita-story:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
