import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { getPages, getPageBySlug } from '../services/pages.service.js';
import prisma from '../utils/prisma.js';

const EXPECTED_FIND_MANY_ARGS = {
  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  include: { _count: { select: { chapters: true } } },
};

const expectedFindUniqueArgs = (slug: string) => ({
  where: { slug },
  include: {
    chapters: {
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { sections: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    },
  },
});

const FIXED_CREATED = new Date('2026-10-01T00:00:00.000Z');
// Non-zero time and milliseconds so a lossy date conversion would show up.
const FIXED_UPDATED = new Date(Date.UTC(2026, 9, 9, 7, 45, 30, 123));

const summaryRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'page-1',
  slug: 'kependudukan',
  title: 'Kependudukan',
  sortOrder: 0,
  createdAt: FIXED_CREATED,
  updatedAt: FIXED_UPDATED,
  _count: { chapters: 6 },
  ...overrides,
});

const sectionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sec-1',
  chapterId: 'ch-1',
  slug: 'ringkasan',
  title: 'Ringkasan',
  sortOrder: 0,
  createdAt: FIXED_CREATED,
  updatedAt: FIXED_UPDATED,
  ...overrides,
});

const chapterRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ch-1',
  pageId: 'page-1',
  slug: 'jumlah-penduduk',
  number: null,
  title: 'Jumlah Penduduk',
  sortOrder: 0,
  createdAt: FIXED_CREATED,
  updatedAt: FIXED_UPDATED,
  sections: [] as unknown[],
  ...overrides,
});

const detailRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'page-1',
  slug: 'kependudukan',
  title: 'Kependudukan',
  sortOrder: 0,
  createdAt: FIXED_CREATED,
  updatedAt: FIXED_UPDATED,
  chapters: [] as unknown[],
  ...overrides,
});

describe('pages.service', () => {
  let originalFindMany: typeof prisma.page.findMany;
  let originalFindUnique: typeof prisma.page.findUnique;
  let findManyCalls: unknown[][];
  let findUniqueCalls: unknown[][];

  const stubFindMany = (impl: () => Promise<unknown>) => {
    prisma.page.findMany = (async (...args: unknown[]) => {
      findManyCalls.push(args);
      return impl();
    }) as unknown as typeof prisma.page.findMany;
  };

  const stubFindUnique = (impl: () => Promise<unknown>) => {
    prisma.page.findUnique = (async (...args: unknown[]) => {
      findUniqueCalls.push(args);
      return impl();
    }) as unknown as typeof prisma.page.findUnique;
  };

  beforeEach(() => {
    originalFindMany = prisma.page.findMany;
    originalFindUnique = prisma.page.findUnique;
    findManyCalls = [];
    findUniqueCalls = [];
    // Fail loudly if a test hits a method it did not stub.
    prisma.page.findMany = (async () => {
      throw new Error('unexpected prisma.page.findMany call');
    }) as unknown as typeof prisma.page.findMany;
    prisma.page.findUnique = (async () => {
      throw new Error('unexpected prisma.page.findUnique call');
    }) as unknown as typeof prisma.page.findUnique;
  });

  afterEach(() => {
    prisma.page.findMany = originalFindMany;
    prisma.page.findUnique = originalFindUnique;
  });

  describe('getPages', () => {
    it('calls prisma.page.findMany exactly once with the exact orderBy/include args', async () => {
      stubFindMany(async () => []);

      await getPages();

      assert.equal(findManyCalls.length, 1);
      assert.equal(findManyCalls[0]!.length, 1);
      assert.deepStrictEqual(findManyCalls[0]![0], EXPECTED_FIND_MANY_ARGS);
    });

    it('never calls findUnique', async () => {
      stubFindMany(async () => [summaryRow()]);

      await getPages();

      assert.equal(findUniqueCalls.length, 0);
    });

    it('returns [] for an empty table', async () => {
      stubFindMany(async () => []);

      const result = await getPages();

      assert.deepStrictEqual(result, []);
    });

    it('maps a row to exactly {id, slug, title, sortOrder, chapterCount}', async () => {
      stubFindMany(async () => [summaryRow()]);

      const result = await getPages();

      assert.deepStrictEqual(result, [
        {
          id: 'page-1',
          slug: 'kependudukan',
          title: 'Kependudukan',
          sortOrder: 0,
          chapterCount: 6,
        },
      ]);
    });

    it('does not leak createdAt, updatedAt, _count or unknown extra fields', async () => {
      stubFindMany(async () => [summaryRow({ extraneous: 'secret', pageSecret: 42 })]);

      const [row] = await getPages();
      assert.ok(row);

      assert.deepStrictEqual(Object.keys(row).sort(), [
        'chapterCount',
        'id',
        'slug',
        'sortOrder',
        'title',
      ]);
      assert.equal('createdAt' in row, false);
      assert.equal('updatedAt' in row, false);
      assert.equal('_count' in row, false);
      assert.equal('extraneous' in row, false);
    });

    it('takes chapterCount from _count.chapters, including 0', async () => {
      stubFindMany(async () => [
        summaryRow({ id: 'p0', _count: { chapters: 0 } }),
        summaryRow({ id: 'p10', slug: 'kesehatan', _count: { chapters: 10 } }),
      ]);

      const result = await getPages();

      assert.deepStrictEqual(
        result.map((p) => p.chapterCount),
        [0, 10],
      );
    });

    it('preserves the order returned by prisma (does not re-sort)', async () => {
      stubFindMany(async () => [
        summaryRow({ id: 'c', slug: 'c', sortOrder: 5 }),
        summaryRow({ id: 'a', slug: 'a', sortOrder: 1 }),
        summaryRow({ id: 'b', slug: 'b', sortOrder: 3 }),
      ]);

      const result = await getPages();

      assert.deepStrictEqual(
        result.map((p) => p.id),
        ['c', 'a', 'b'],
      );
      assert.deepStrictEqual(
        result.map((p) => p.sortOrder),
        [5, 1, 3],
      );
    });

    it('maps every row of a multi-row result', async () => {
      const rows = Array.from({ length: 8 }, (_, i) =>
        summaryRow({
          id: `p${i}`,
          slug: `s${i}`,
          title: `T${i}`,
          sortOrder: i,
          _count: { chapters: i },
        }),
      );
      stubFindMany(async () => rows);

      const result = await getPages();

      assert.deepStrictEqual(
        result,
        rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          sortOrder: r.sortOrder,
          chapterCount: r._count.chapters,
        })),
      );
    });

    it('propagates a prisma rejection unchanged (same error instance)', async () => {
      const boom = new Error('db down');
      stubFindMany(async () => {
        throw boom;
      });

      await assert.rejects(getPages(), (err) => err === boom);
      assert.equal(findManyCalls.length, 1);
    });
  });

  describe('getPageBySlug', () => {
    it('calls prisma.page.findUnique exactly once with the exact where/include args', async () => {
      stubFindUnique(async () => null);

      await getPageBySlug('kependudukan');

      assert.equal(findUniqueCalls.length, 1);
      assert.equal(findUniqueCalls[0]!.length, 1);
      assert.deepStrictEqual(findUniqueCalls[0]![0], expectedFindUniqueArgs('kependudukan'));
    });

    it('never calls findMany', async () => {
      stubFindUnique(async () => null);

      await getPageBySlug('kependudukan');

      assert.equal(findManyCalls.length, 0);
    });

    it('returns null when prisma returns null', async () => {
      stubFindUnique(async () => null);

      const result = await getPageBySlug('tidak-ada');

      assert.equal(result, null);
    });

    for (const slug of ['', ' ', 'Kependudukan', 'a_b', '../x', 'ké', 'a\n', 'x'.repeat(10_000)]) {
      it(`passes the slug through untouched: ${JSON.stringify(slug.slice(0, 20))} (len ${slug.length})`, async () => {
        stubFindUnique(async () => null);

        await getPageBySlug(slug);

        assert.equal(findUniqueCalls.length, 1);
        assert.deepStrictEqual(findUniqueCalls[0]![0], expectedFindUniqueArgs(slug));
      });
    }

    it('maps a full page/chapter/section tree to the exact DTO shape', async () => {
      stubFindUnique(async () =>
        detailRow({
          id: 'page-6',
          slug: 'pemerintahan-dan-kelembagaan',
          title: 'Pemerintahan & Kelembagaan',
          sortOrder: 5,
          chapters: [
            chapterRow({
              id: 'ch-21',
              pageId: 'page-6',
              slug: 'wilayah-administrasi',
              number: '2.1',
              title: 'Wilayah Administrasi',
              sortOrder: 0,
              sections: [
                sectionRow({
                  id: 's-1',
                  chapterId: 'ch-21',
                  slug: 'luas',
                  title: 'Luas',
                  sortOrder: 0,
                }),
                sectionRow({
                  id: 's-2',
                  chapterId: 'ch-21',
                  slug: 'batas',
                  title: null,
                  sortOrder: 1,
                }),
              ],
            }),
          ],
        }),
      );

      const result = await getPageBySlug('pemerintahan-dan-kelembagaan');

      assert.deepStrictEqual(result, {
        id: 'page-6',
        slug: 'pemerintahan-dan-kelembagaan',
        title: 'Pemerintahan & Kelembagaan',
        sortOrder: 5,
        chapters: [
          {
            id: 'ch-21',
            slug: 'wilayah-administrasi',
            number: '2.1',
            title: 'Wilayah Administrasi',
            sortOrder: 0,
            sections: [
              { id: 's-1', slug: 'luas', title: 'Luas', sortOrder: 0 },
              { id: 's-2', slug: 'batas', title: null, sortOrder: 1 },
            ],
          },
        ],
        createdAt: FIXED_CREATED.toISOString(),
        updatedAt: FIXED_UPDATED.toISOString(),
      });
    });

    it('enforces key allow-lists at page, chapter and section level', async () => {
      stubFindUnique(async () =>
        detailRow({
          leaked: 'page',
          chapters: [
            chapterRow({
              leaked: 'chapter',
              sections: [sectionRow({ leaked: 'section' })],
            }),
          ],
        }),
      );

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      assert.deepStrictEqual(Object.keys(result).sort(), [
        'chapters',
        'createdAt',
        'id',
        'slug',
        'sortOrder',
        'title',
        'updatedAt',
      ]);
      const [chapter] = result.chapters;
      assert.ok(chapter);
      assert.deepStrictEqual(Object.keys(chapter).sort(), [
        'id',
        'number',
        'sections',
        'slug',
        'sortOrder',
        'title',
      ]);
      const [section] = chapter.sections;
      assert.ok(section);
      assert.deepStrictEqual(Object.keys(section).sort(), ['id', 'slug', 'sortOrder', 'title']);

      // Explicitly: no pageId/chapterId/timestamps on children.
      for (const key of ['pageId', 'createdAt', 'updatedAt', 'leaked']) {
        assert.equal(key in chapter, false, `chapter must not expose ${key}`);
      }
      for (const key of ['chapterId', 'createdAt', 'updatedAt', 'leaked']) {
        assert.equal(key in section, false, `section must not expose ${key}`);
      }
    });

    it('converts page createdAt/updatedAt to ISO strings via toISOString', async () => {
      const created = new Date('2025-12-31T23:59:59.999Z');
      // A Date whose local-time rendering (WITA, UTC+8) would differ from UTC.
      const updated = new Date('2026-01-01T07:30:00+08:00');
      stubFindUnique(async () => detailRow({ createdAt: created, updatedAt: updated }));

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      assert.equal(typeof result.createdAt, 'string');
      assert.equal(typeof result.updatedAt, 'string');
      assert.equal(result.createdAt, '2025-12-31T23:59:59.999Z');
      assert.equal(result.updatedAt, '2025-12-31T23:30:00.000Z');
      assert.equal(result.updatedAt, updated.toISOString());
    });

    it('passes null chapter number through as null (not undefined, not omitted)', async () => {
      stubFindUnique(async () => detailRow({ chapters: [chapterRow({ number: null })] }));

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      assert.ok('number' in result.chapters[0]!);
      assert.equal(result.chapters[0]!.number, null);
    });

    it('passes null section title through as null (not undefined, not omitted)', async () => {
      stubFindUnique(async () =>
        detailRow({ chapters: [chapterRow({ sections: [sectionRow({ title: null })] })] }),
      );

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      const [section] = result.chapters[0]!.sections;
      assert.ok(section);
      assert.ok('title' in section);
      assert.equal(section.title, null);
    });

    it('returns chapters: [] for a page with zero chapters', async () => {
      stubFindUnique(async () => detailRow({ chapters: [] }));

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      assert.deepStrictEqual(result.chapters, []);
    });

    it('returns sections: [] for a chapter with zero sections', async () => {
      stubFindUnique(async () => detailRow({ chapters: [chapterRow({ sections: [] })] }));

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      assert.deepStrictEqual(result.chapters[0]!.sections, []);
    });

    it('preserves chapter and section order as returned by prisma (no re-sort)', async () => {
      stubFindUnique(async () =>
        detailRow({
          chapters: [
            chapterRow({
              id: 'ch-b',
              slug: 'b',
              sortOrder: 9,
              sections: [
                sectionRow({ id: 's-z', slug: 'z', sortOrder: 7 }),
                sectionRow({ id: 's-x', slug: 'x', sortOrder: 2 }),
                sectionRow({ id: 's-y', slug: 'y', sortOrder: 4 }),
              ],
            }),
            chapterRow({ id: 'ch-a', slug: 'a', sortOrder: 1, sections: [] }),
            chapterRow({
              id: 'ch-c',
              slug: 'c',
              sortOrder: 3,
              sections: [sectionRow({ id: 's-only', slug: 'only', sortOrder: 0 })],
            }),
          ],
        }),
      );

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      assert.deepStrictEqual(
        result.chapters.map((c) => c.id),
        ['ch-b', 'ch-a', 'ch-c'],
      );
      assert.deepStrictEqual(
        result.chapters.map((c) => c.sortOrder),
        [9, 1, 3],
      );
      assert.deepStrictEqual(
        result.chapters[0]!.sections.map((s) => s.id),
        ['s-z', 's-x', 's-y'],
      );
      assert.deepStrictEqual(
        result.chapters.map((c) => c.sections.length),
        [3, 0, 1],
      );
    });

    it('keeps sections attached to the right chapter across multiple chapters', async () => {
      stubFindUnique(async () =>
        detailRow({
          chapters: [
            chapterRow({
              id: 'ch-1',
              slug: 'one',
              sections: [sectionRow({ id: 's-1a', slug: 'a' })],
            }),
            chapterRow({
              id: 'ch-2',
              slug: 'two',
              number: '6.2',
              sections: [
                sectionRow({ id: 's-2a', slug: 'a' }),
                sectionRow({ id: 's-2b', slug: 'b' }),
              ],
            }),
          ],
        }),
      );

      const result = await getPageBySlug('kependudukan');
      assert.ok(result);

      assert.deepStrictEqual(
        result.chapters.map((c) => [c.id, c.number, c.sections.map((s) => s.id)]),
        [
          ['ch-1', null, ['s-1a']],
          ['ch-2', '6.2', ['s-2a', 's-2b']],
        ],
      );
    });

    it('propagates a prisma rejection unchanged (same error instance)', async () => {
      const boom = new Error('connection reset');
      stubFindUnique(async () => {
        throw boom;
      });

      await assert.rejects(getPageBySlug('kependudukan'), (err) => err === boom);
      assert.equal(findUniqueCalls.length, 1);
    });
  });
});
