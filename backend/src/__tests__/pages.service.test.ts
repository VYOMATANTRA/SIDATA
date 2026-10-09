import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  getPages,
  getPageBySlug,
  createPage,
  deletePage,
  reorderPages,
  PageServiceError,
} from '../services/pages.service.js';
import type { AuditActor, AuditRequestContext } from '../services/audit.service.js';
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
  let originalTransaction: typeof prisma.$transaction;
  let originalContentBlockCount: typeof prisma.contentBlock.count;
  let originalPageDelete: typeof prisma.page.delete;
  let originalPageUpdate: typeof prisma.page.update;
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
    originalTransaction = prisma.$transaction;
    originalContentBlockCount = prisma.contentBlock.count;
    originalPageDelete = prisma.page.delete;
    originalPageUpdate = prisma.page.update;
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
    prisma.$transaction = originalTransaction;
    prisma.contentBlock.count = originalContentBlockCount;
    prisma.page.delete = originalPageDelete;
    prisma.page.update = originalPageUpdate;
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

  describe('createPage', () => {
    const actor: AuditActor = { id: 'user-1', email: 'editor@manggar.go.id', role: 'editor' };
    const context: AuditRequestContext = { ipAddress: '127.0.0.1', userAgent: 'test-agent' };

    it('rejects empty title string (400)', async () => {
      await assert.rejects(
        createPage({ title: '' }, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects whitespace-only title (400)', async () => {
      await assert.rejects(
        createPage({ title: '   ' }, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects title containing HTML script tag (XSS defense) (400)', async () => {
      await assert.rejects(
        createPage({ title: '<script>alert("xss")</script>' }, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 400 &&
          err.message.includes('tag HTML'),
      );
    });

    it('rejects title containing HTML formatting tag (XSS defense) (400)', async () => {
      await assert.rejects(
        createPage({ title: 'Profil <b>Kelurahan</b>' }, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 400 &&
          err.message.includes('tag HTML'),
      );
    });

    it('rejects title containing control characters (400)', async () => {
      await assert.rejects(
        createPage({ title: 'Profil\x00Kelurahan' }, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects title exceeding 255 characters (400)', async () => {
      await assert.rejects(
        createPage({ title: 'a'.repeat(256) }, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects payload with prototype pollution (__proto__) (400)', async () => {
      const malicious = JSON.parse('{"title":"Test","__proto__":{"polluted":true}}');
      await assert.rejects(
        createPage(malicious, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects invalid slug format (uppercase, special chars, backslash) (400)', async () => {
      for (const badSlug of ['Kependudukan', 'a_b', 'a/b', 'a\\b', 'a%20b', '../x']) {
        await assert.rejects(
          createPage({ title: 'Valid Title', slug: badSlug }, actor, context),
          (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
        );
      }
    });

    it('rejects reserved slug keyword "reorder" (400)', async () => {
      await assert.rejects(
        createPage({ title: 'Reorder Page', slug: 'reorder' }, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 400 &&
          err.message.includes('kata kunci terproteksi'),
      );
    });

    it('rejects reserved slug keyword "admin" (400)', async () => {
      await assert.rejects(
        createPage({ title: 'Admin Page', slug: 'admin' }, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 400 &&
          err.message.includes('kata kunci terproteksi'),
      );
    });

    it('rejects negative sortOrder (400)', async () => {
      await assert.rejects(
        createPage({ title: 'Valid Title', sortOrder: -1 }, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects non-integer sortOrder (400)', async () => {
      await assert.rejects(
        createPage({ title: 'Valid Title', sortOrder: 1.5 }, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('throws 409 Conflict when page with slug already exists', async () => {
      stubFindUnique(async () => summaryRow());

      await assert.rejects(
        createPage({ title: 'Kependudukan', slug: 'kependudukan' }, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 409 &&
          err.message.includes('sudah digunakan'),
      );
    });

    it('catches Prisma P2002 race condition on slug and converts to 409 Conflict', async () => {
      stubFindUnique(async () => null);
      const p2002 = new Error('Unique constraint failed on the fields: (`slug`)');
      (p2002 as unknown as { code: string }).code = 'P2002';

      prisma.$transaction = (async () => {
        throw p2002;
      }) as unknown as typeof prisma.$transaction;

      await assert.rejects(
        createPage({ title: 'Kependudukan', slug: 'kependudukan' }, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 409 &&
          err.message.includes('sudah digunakan'),
      );
    });

    it('rolls back and throws error when audit log creation fails inside transaction', async () => {
      stubFindUnique(async () => null);
      const auditBoom = new Error('Audit service unavailable');

      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            create: async () => summaryRow({ id: 'p-new', slug: 'new-page' }),
            aggregate: async () => ({ _max: { sortOrder: 5 } }),
          },
          auditLog: {
            create: async () => {
              throw auditBoom;
            },
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      await assert.rejects(
        createPage({ title: 'New Page', slug: 'new-page' }, actor, context),
        (err: unknown) => err === auditBoom,
      );
    });

    it('successfully creates page with explicit slug and sortOrder, writing audit log in tx (Happy Path)', async () => {
      stubFindUnique(async () => null);
      let createdRowData: unknown = null;
      let auditLogData: unknown = null;

      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            create: async (args: { data: Record<string, unknown> }) => {
              createdRowData = args.data;
              return summaryRow({
                id: 'p-new',
                slug: args.data.slug,
                title: args.data.title,
                sortOrder: args.data.sortOrder,
              });
            },
          },
          auditLog: {
            create: async (args: { data: Record<string, unknown> }) => {
              auditLogData = args.data;
              return { id: 'audit-1' };
            },
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const page = await createPage(
        { title: 'Inovasi Desa', slug: 'inovasi-desa', sortOrder: 9 },
        actor,
        context,
      );

      assert.deepStrictEqual(page, {
        id: 'p-new',
        slug: 'inovasi-desa',
        title: 'Inovasi Desa',
        sortOrder: 9,
        chapterCount: 0,
      });
      assert.deepStrictEqual(createdRowData, {
        title: 'Inovasi Desa',
        slug: 'inovasi-desa',
        sortOrder: 9,
      });
      assert.ok(auditLogData);
      assert.equal((auditLogData as { action: string }).action, 'page.created');
      assert.equal((auditLogData as { severity: string }).severity, 'info');
      assert.equal((auditLogData as { actorId: string }).actorId, 'user-1');
    });

    it('auto-derives slug from title when slug is omitted (Happy Path)', async () => {
      stubFindUnique(async () => null);
      let createdSlug: string | undefined;

      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            create: async (args: { data: { slug: string; title: string; sortOrder: number } }) => {
              createdSlug = args.data.slug;
              return summaryRow({ id: 'p-new', ...args.data });
            },
            aggregate: async () => ({ _max: { sortOrder: 7 } }),
          },
          auditLog: {
            create: async () => ({ id: 'audit-1' }),
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const page = await createPage({ title: 'Profil Wilayah Manggar' }, actor, context);
      assert.equal(page.slug, 'profil-wilayah-manggar');
      assert.equal(createdSlug, 'profil-wilayah-manggar');
    });

    it('auto-assigns sortOrder to (max + 1) when sortOrder is omitted (Happy Path)', async () => {
      stubFindUnique(async () => null);
      let assignedSortOrder: number | undefined;

      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            create: async (args: { data: { slug: string; title: string; sortOrder: number } }) => {
              assignedSortOrder = args.data.sortOrder;
              return summaryRow({ id: 'p-new', ...args.data });
            },
            aggregate: async () => ({ _max: { sortOrder: 7 } }),
          },
          auditLog: {
            create: async () => ({ id: 'audit-1' }),
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const page = await createPage({ title: 'Halaman Baru' }, actor, context);
      assert.equal(page.sortOrder, 8);
      assert.equal(assignedSortOrder, 8);
    });
  });

  describe('deletePage', () => {
    const actor: AuditActor = { id: 'user-1', email: 'editor@manggar.go.id', role: 'editor' };
    const context: AuditRequestContext = { ipAddress: '127.0.0.1', userAgent: 'test-agent' };

    it('rejects invalid slug format (uppercase, special chars, whitespace, empty, backslash) (400)', async () => {
      for (const badSlug of ['', '   ', 'Kependudukan', 'a_b', 'a/b', 'a\\b', '-a', 'a-']) {
        await assert.rejects(
          deletePage(badSlug, actor, context),
          (err: unknown) =>
            err instanceof PageServiceError &&
            err.statusCode === 400 &&
            err.message.includes('Slug'),
        );
      }
    });

    it('throws 404 Not Found when page does not exist', async () => {
      stubFindUnique(async () => null);

      await assert.rejects(
        deletePage('halaman-tiada', actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 404 &&
          err.message.includes('tidak ditemukan'),
      );
    });

    it('throws 409 Conflict when page contains sections with attached content_blocks', async () => {
      stubFindUnique(async () => summaryRow({ id: 'p-1', slug: 'kependudukan' }));
      prisma.contentBlock.count = (async () => 3) as unknown as typeof prisma.contentBlock.count;

      await assert.rejects(
        deletePage('kependudukan', actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 409 &&
          err.message.includes('tidak dapat dihapus') &&
          err.message.includes('blok konten'),
      );
    });

    it('catches Prisma P2003 foreign key restriction race condition and converts to 409 Conflict', async () => {
      stubFindUnique(async () => summaryRow({ id: 'p-1', slug: 'kependudukan' }));
      prisma.contentBlock.count = (async () => 0) as unknown as typeof prisma.contentBlock.count;

      const p2003 = new Error('Foreign key constraint failed on the field: (`section_id`)');
      (p2003 as unknown as { code: string }).code = 'P2003';

      prisma.$transaction = (async () => {
        throw p2003;
      }) as unknown as typeof prisma.$transaction;

      await assert.rejects(
        deletePage('kependudukan', actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 409 &&
          err.message.includes('tidak dapat dihapus') &&
          err.message.includes('blok konten'),
      );
    });

    it('catches Prisma P2025 record not found race condition and converts to 404 Not Found', async () => {
      stubFindUnique(async () => summaryRow({ id: 'p-1', slug: 'kependudukan' }));
      prisma.contentBlock.count = (async () => 0) as unknown as typeof prisma.contentBlock.count;

      const p2025 = new Error('Record to delete does not exist.');
      (p2025 as unknown as { code: string }).code = 'P2025';

      prisma.$transaction = (async () => {
        throw p2025;
      }) as unknown as typeof prisma.$transaction;

      await assert.rejects(
        deletePage('kependudukan', actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 404 &&
          err.message.includes('tidak ditemukan'),
      );
    });

    it('rolls back and throws error when audit log creation fails inside transaction', async () => {
      stubFindUnique(async () => summaryRow({ id: 'p-1', slug: 'kependudukan' }));
      prisma.contentBlock.count = (async () => 0) as unknown as typeof prisma.contentBlock.count;

      const auditBoom = new Error('Audit service unavailable');

      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            delete: async () => summaryRow({ id: 'p-1', slug: 'kependudukan' }),
          },
          auditLog: {
            create: async () => {
              throw auditBoom;
            },
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      await assert.rejects(
        deletePage('kependudukan', actor, context),
        (err: unknown) => err === auditBoom,
      );
    });

    it('successfully deletes page, cascades empty chapters/sections, writes warning audit log in tx (Happy Path)', async () => {
      stubFindUnique(async () =>
        summaryRow({ id: 'p-1', slug: 'kependudukan', title: 'Kependudukan', sortOrder: 0 }),
      );
      prisma.contentBlock.count = (async () => 0) as unknown as typeof prisma.contentBlock.count;

      let deletedWhere: unknown = null;
      let auditLogData: unknown = null;

      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            delete: async (args: { where: { id: string } }) => {
              deletedWhere = args.where;
              return summaryRow({
                id: 'p-1',
                slug: 'kependudukan',
                title: 'Kependudukan',
                sortOrder: 0,
              });
            },
          },
          auditLog: {
            create: async (args: { data: Record<string, unknown> }) => {
              auditLogData = args.data;
              return { id: 'audit-del-1' };
            },
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const result = await deletePage('kependudukan', actor, context);

      assert.deepStrictEqual(result, {
        id: 'p-1',
        slug: 'kependudukan',
        title: 'Kependudukan',
        sortOrder: 0,
      });
      assert.deepStrictEqual(deletedWhere, { id: 'p-1' });
      assert.ok(auditLogData);
      assert.equal((auditLogData as { action: string }).action, 'page.deleted');
      assert.equal((auditLogData as { severity: string }).severity, 'warning');
      assert.equal((auditLogData as { actorId: string }).actorId, 'user-1');
    });
  });

  describe('reorderPages', () => {
    const actor: AuditActor = { id: 'user-1', email: 'editor@manggar.go.id', role: 'editor' };
    const context: AuditRequestContext = { ipAddress: '127.0.0.1', userAgent: 'test-agent' };

    it('rejects payload with prototype pollution (__proto__) (400)', async () => {
      const polluted = JSON.parse('{"__proto__": {"admin": true}}');
      await assert.rejects(
        reorderPages(polluted, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects null, non-object, and non-array payload (400)', async () => {
      for (const bad of [null, undefined, 'bad', 123, true]) {
        await assert.rejects(
          reorderPages(bad, actor, context),
          (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
        );
      }
    });

    it('rejects empty items array (400)', async () => {
      for (const bad of [[], { items: [] }]) {
        await assert.rejects(
          reorderPages(bad, actor, context),
          (err: unknown) =>
            err instanceof PageServiceError &&
            err.statusCode === 400 &&
            err.message.includes('kosong'),
        );
      }
    });

    it('rejects non-array items property (400)', async () => {
      await assert.rejects(
        reorderPages({ items: 'not-an-array' }, actor, context),
        (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
      );
    });

    it('rejects item missing id or sortOrder (400)', async () => {
      const badItems = [
        [{ sortOrder: 0 }],
        [{ id: '' }],
        [{ id: '   ', sortOrder: 0 }],
        [{ id: 'p1' }],
      ];
      for (const items of badItems) {
        await assert.rejects(
          reorderPages(items, actor, context),
          (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
        );
      }
    });

    it('rejects negative or non-integer sortOrder (400)', async () => {
      for (const sortOrder of [-1, 1.5, NaN, Infinity, '1']) {
        await assert.rejects(
          reorderPages([{ id: 'p1', sortOrder }], actor, context),
          (err: unknown) => err instanceof PageServiceError && err.statusCode === 400,
        );
      }
    });

    it('rejects duplicate page IDs in reorder payload (400)', async () => {
      const duplicatePayload = [
        { id: 'p1', sortOrder: 0 },
        { id: 'p1', sortOrder: 1 },
      ];
      await assert.rejects(
        reorderPages(duplicatePayload, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 400 &&
          err.message.includes('duplikat'),
      );
    });

    it('throws 404 when one or more page IDs do not exist in the database', async () => {
      stubFindMany(async () => [summaryRow({ id: 'p1', sortOrder: 0 })]);

      const payload = [
        { id: 'p1', sortOrder: 1 },
        { id: 'p-not-exist', sortOrder: 0 },
      ];

      await assert.rejects(
        reorderPages(payload, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 404 &&
          err.message.includes('tidak ditemukan'),
      );
    });

    it('catches Prisma P2025 record vanishing race condition and converts to 404 Not Found', async () => {
      stubFindMany(async () => [
        summaryRow({ id: 'p1', sortOrder: 0 }),
        summaryRow({ id: 'p2', sortOrder: 1 }),
      ]);

      const p2025 = new Error('Record to update not found.');
      (p2025 as unknown as { code: string }).code = 'P2025';

      prisma.$transaction = (async () => {
        throw p2025;
      }) as unknown as typeof prisma.$transaction;

      const payload = [
        { id: 'p1', sortOrder: 1 },
        { id: 'p2', sortOrder: 0 },
      ];

      await assert.rejects(
        reorderPages(payload, actor, context),
        (err: unknown) =>
          err instanceof PageServiceError &&
          err.statusCode === 404 &&
          err.message.includes('tidak ditemukan'),
      );
    });

    it('performs no-op: returns 200 without DB updates or audit log if requested order matches existing order exactly', async () => {
      stubFindMany(async () => [
        summaryRow({ id: 'p1', sortOrder: 0 }),
        summaryRow({ id: 'p2', sortOrder: 1 }),
      ]);

      let transactionCalled = false;
      prisma.$transaction = (async () => {
        transactionCalled = true;
      }) as unknown as typeof prisma.$transaction;

      const payload = [
        { id: 'p1', sortOrder: 0 },
        { id: 'p2', sortOrder: 1 },
      ];

      const result = await reorderPages(payload, actor, context);
      assert.equal(transactionCalled, false, 'Transaction must not run when order is unchanged');
      assert.equal(result.length, 2);
    });

    it('executes database updates in deterministic order (id ascending) to prevent InnoDB deadlocks (1213)', async () => {
      stubFindMany(async () => [
        summaryRow({ id: 'p-zebra', sortOrder: 0 }),
        summaryRow({ id: 'p-alpha', sortOrder: 1 }),
      ]);

      const updatedIdsOrder: string[] = [];
      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            update: async (args: { where: { id: string } }) => {
              updatedIdsOrder.push(args.where.id);
              return summaryRow({ id: args.where.id });
            },
            findMany: async () => [
              summaryRow({ id: 'p-alpha', sortOrder: 0 }),
              summaryRow({ id: 'p-zebra', sortOrder: 1 }),
            ],
          },
          auditLog: {
            create: async () => ({ id: 'audit-reorder-1' }),
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      // Request submitted in reverse ID order: zebra first, then alpha
      const payload = [
        { id: 'p-zebra', sortOrder: 1 },
        { id: 'p-alpha', sortOrder: 0 },
      ];

      await reorderPages(payload, actor, context);

      // Lock acquisition order must be strictly deterministic: alpha then zebra
      assert.deepStrictEqual(
        updatedIdsOrder,
        ['p-alpha', 'p-zebra'],
        'Updates in transaction must be ordered by id ascending to prevent cycle lock deadlocks',
      );
    });

    it('rolls back transaction and makes zero updates if any page update fails or audit write fails', async () => {
      stubFindMany(async () => [
        summaryRow({ id: 'p1', sortOrder: 0 }),
        summaryRow({ id: 'p2', sortOrder: 1 }),
      ]);

      const auditBoom = new Error('Audit storage failure');
      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            update: async () => summaryRow({ id: 'p1', sortOrder: 1 }),
          },
          auditLog: {
            create: async () => {
              throw auditBoom;
            },
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const payload = [
        { id: 'p1', sortOrder: 1 },
        { id: 'p2', sortOrder: 0 },
      ];

      await assert.rejects(
        reorderPages(payload, actor, context),
        (err: unknown) => err === auditBoom,
      );
    });

    it('successfully reorders pages, updates DB, and writes info audit log in tx (Happy Path)', async () => {
      stubFindMany(async () => [
        summaryRow({ id: 'p1', sortOrder: 0, _count: { chapters: 2 } }),
        summaryRow({ id: 'p2', sortOrder: 1, _count: { chapters: 4 } }),
      ]);

      const updatedCalls: Array<{ where: { id: string }; data: { sortOrder: number } }> = [];
      let auditLogData: unknown = null;

      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            update: async (args: { where: { id: string }; data: { sortOrder: number } }) => {
              updatedCalls.push(args);
              return summaryRow({ id: args.where.id, sortOrder: args.data.sortOrder });
            },
            findMany: async () => [
              summaryRow({ id: 'p2', sortOrder: 0, _count: { chapters: 4 } }),
              summaryRow({ id: 'p1', sortOrder: 1, _count: { chapters: 2 } }),
            ],
          },
          auditLog: {
            create: async (args: { data: Record<string, unknown> }) => {
              auditLogData = args.data;
              return { id: 'audit-reorder-success' };
            },
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const payload = [
        { id: 'p1', sortOrder: 1 },
        { id: 'p2', sortOrder: 0 },
      ];

      const result = await reorderPages(payload, actor, context);

      assert.equal(result.length, 2);
      assert.deepStrictEqual(
        result.map((p) => p.id),
        ['p2', 'p1'],
      );
      assert.deepStrictEqual(
        result.map((p) => p.sortOrder),
        [0, 1],
      );
      assert.equal(updatedCalls.length, 2);
      assert.ok(auditLogData);
      assert.equal((auditLogData as { action: string }).action, 'page.reordered');
      assert.equal((auditLogData as { severity: string }).severity, 'info');
      assert.equal((auditLogData as { actorId: string }).actorId, 'user-1');
    });
  });
});
