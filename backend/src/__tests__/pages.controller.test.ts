import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import type { Request } from 'express';
import {
  listPages,
  getPage,
  createPageHandler,
  deletePageHandler,
  PAGE_SLUG_PATTERN,
} from '../controllers/pages.controller.js';
import prisma from '../utils/prisma.js';
import { CERITA_PAGES } from '../../prisma/ceritaPages.js';
import { fakeRes } from './helpers/fakeRes.js';

const INTERNAL_ERROR = { error: 'Terjadi kesalahan internal server' };
const INVALID_SLUG = { error: 'Slug halaman tidak valid' };
const NOT_FOUND = { error: 'Halaman tidak ditemukan' };

const CREATED = new Date('2026-10-01T00:00:00.000Z');
const UPDATED = new Date('2026-10-09T08:15:00.000Z');

const reqWithSlug = (slug: unknown) => ({ params: { slug } }) as unknown as Request;

const pageRow = (slug = 'kependudukan') => ({
  id: 'page-1',
  slug,
  title: 'Kependudukan',
  sortOrder: 0,
  createdAt: CREATED,
  updatedAt: UPDATED,
  chapters: [
    {
      id: 'ch-1',
      pageId: 'page-1',
      slug: 'jumlah-penduduk',
      number: null,
      title: 'Jumlah Penduduk',
      sortOrder: 0,
      createdAt: CREATED,
      updatedAt: UPDATED,
      sections: [
        {
          id: 'sec-1',
          chapterId: 'ch-1',
          slug: 'ringkasan',
          title: null,
          sortOrder: 0,
          createdAt: CREATED,
          updatedAt: UPDATED,
        },
      ],
    },
  ],
});

const expectedPageDto = (slug = 'kependudukan') => ({
  id: 'page-1',
  slug,
  title: 'Kependudukan',
  sortOrder: 0,
  chapters: [
    {
      id: 'ch-1',
      slug: 'jumlah-penduduk',
      number: null,
      title: 'Jumlah Penduduk',
      sortOrder: 0,
      sections: [{ id: 'sec-1', slug: 'ringkasan', title: null, sortOrder: 0 }],
    },
  ],
  createdAt: CREATED.toISOString(),
  updatedAt: UPDATED.toISOString(),
});

describe('pages.controller', () => {
  let originalFindMany: typeof prisma.page.findMany;
  let originalFindUnique: typeof prisma.page.findUnique;
  let originalTransaction: typeof prisma.$transaction;
  let originalContentBlockCount: typeof prisma.contentBlock.count;
  let originalConsoleError: typeof console.error;
  let findManyCalls: unknown[][];
  let findUniqueCalls: unknown[][];
  let consoleErrorCalls: unknown[][];

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
    originalConsoleError = console.error;
    findManyCalls = [];
    findUniqueCalls = [];
    consoleErrorCalls = [];
    console.error = (...args: unknown[]) => {
      consoleErrorCalls.push(args);
    };
    // Default: record and fail loudly, so an un-stubbed DB hit is never silent.
    stubFindMany(async () => {
      throw new Error('unexpected prisma.page.findMany call');
    });
    stubFindUnique(async () => {
      throw new Error('unexpected prisma.page.findUnique call');
    });
  });

  afterEach(() => {
    prisma.page.findMany = originalFindMany;
    prisma.page.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
    prisma.contentBlock.count = originalContentBlockCount;
    console.error = originalConsoleError;
  });

  describe('PAGE_SLUG_PATTERN', () => {
    it('is exactly /^[a-z0-9]+(?:-[a-z0-9]+)*$/ with no flags', () => {
      assert.equal(PAGE_SLUG_PATTERN.source, '^[a-z0-9]+(?:-[a-z0-9]+)*$');
      assert.equal(PAGE_SLUG_PATTERN.flags, '');
    });

    for (const slug of ['a', '1', 'a1', 'a-b', 'a-b-c-1', '2-1', 'pemerintahan-dan-kelembagaan']) {
      it(`accepts ${JSON.stringify(slug)}`, () => {
        assert.equal(PAGE_SLUG_PATTERN.test(slug), true);
      });
    }

    for (const slug of [
      '',
      ' ',
      'A',
      'Kependudukan',
      'a_b',
      '-a',
      'a-',
      'a--b',
      'a b',
      'a.b',
      '../x',
      'a/b',
      '%2e%2e',
      'a%20b',
      'ké',
      'a\n',
      '\na',
      ' a',
      'a ',
      '-',
    ]) {
      it(`rejects ${JSON.stringify(slug)}`, () => {
        assert.equal(PAGE_SLUG_PATTERN.test(slug), false);
      });
    }

    it('matches every page slug in CERITA_PAGES', () => {
      for (const page of CERITA_PAGES) {
        assert.match(page.slug, PAGE_SLUG_PATTERN, `page slug ${page.slug}`);
      }
    });

    it('matches every chapter slug in CERITA_PAGES', () => {
      for (const page of CERITA_PAGES) {
        for (const chapter of page.chapters) {
          assert.match(chapter.slug, PAGE_SLUG_PATTERN, `${page.slug}/${chapter.slug}`);
        }
      }
    });
  });

  describe('listPages', () => {
    it('returns 200 with { pages, total } built from the service DTOs', async () => {
      stubFindMany(async () => [
        {
          id: 'p1',
          slug: 'kependudukan',
          title: 'Kependudukan',
          sortOrder: 0,
          createdAt: CREATED,
          updatedAt: UPDATED,
          _count: { chapters: 6 },
        },
        {
          id: 'p2',
          slug: 'pendidikan',
          title: 'Pendidikan',
          sortOrder: 1,
          createdAt: CREATED,
          updatedAt: UPDATED,
          _count: { chapters: 4 },
        },
      ]);
      const res = fakeRes();

      await listPages({} as Request, res);

      assert.equal(res.status, 200);
      assert.deepStrictEqual(res.body, {
        pages: [
          { id: 'p1', slug: 'kependudukan', title: 'Kependudukan', sortOrder: 0, chapterCount: 6 },
          { id: 'p2', slug: 'pendidikan', title: 'Pendidikan', sortOrder: 1, chapterCount: 4 },
        ],
        total: 2,
      });
      assert.equal(findManyCalls.length, 1);
      assert.equal(findUniqueCalls.length, 0);
      assert.equal(consoleErrorCalls.length, 0);
    });

    it('returns the controller response object', async () => {
      stubFindMany(async () => []);
      const res = fakeRes();

      const returned = await listPages({} as Request, res);

      assert.equal(returned, res);
    });

    it('returns 200 with pages [] and total 0 for an empty table', async () => {
      stubFindMany(async () => []);
      const res = fakeRes();

      await listPages({} as Request, res);

      assert.equal(res.status, 200);
      assert.deepStrictEqual(res.body, { pages: [], total: 0 });
    });

    it('total always equals pages.length', async () => {
      const rows = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        slug: `s${i}`,
        title: `T${i}`,
        sortOrder: i,
        createdAt: CREATED,
        updatedAt: UPDATED,
        _count: { chapters: 1 },
      }));
      stubFindMany(async () => rows);
      const res = fakeRes();

      await listPages({} as Request, res);

      const body = res.body as { pages: unknown[]; total: number };
      assert.equal(body.total, 8);
      assert.equal(body.pages.length, body.total);
    });

    it('returns 500 with the generic error body and does not leak the error', async () => {
      const boom = new Error('SECRET_DB_HOST mysql://root:hunter2@db');
      stubFindMany(async () => {
        throw boom;
      });
      const res = fakeRes();

      await listPages({} as Request, res);

      assert.equal(res.status, 500);
      assert.deepStrictEqual(res.body, INTERNAL_ERROR);
      const serialized = JSON.stringify(res.body);
      assert.equal(serialized.includes('SECRET_DB_HOST'), false);
      assert.equal(serialized.includes('hunter2'), false);
      assert.equal(serialized.includes('stack'), false);
    });

    it('logs the failure via console.error with the exact message and the error', async () => {
      const boom = new Error('db down');
      stubFindMany(async () => {
        throw boom;
      });
      const res = fakeRes();

      await listPages({} as Request, res);

      assert.equal(consoleErrorCalls.length, 1);
      assert.deepStrictEqual(consoleErrorCalls[0], ['Error saat mengambil daftar halaman:', boom]);
    });

    it('returns 500 for a non-Error rejection too', async () => {
      stubFindMany(async () => {
        throw 'plain string failure';
      });
      const res = fakeRes();

      await listPages({} as Request, res);

      assert.equal(res.status, 500);
      assert.deepStrictEqual(res.body, INTERNAL_ERROR);
    });
  });

  describe('getPage', () => {
    it('returns 200 with { page } as the service PageDetailDTO', async () => {
      stubFindUnique(async () => pageRow());
      const res = fakeRes();

      await getPage(reqWithSlug('kependudukan'), res);

      assert.equal(res.status, 200);
      assert.deepStrictEqual(res.body, { page: expectedPageDto() });
      assert.equal(consoleErrorCalls.length, 0);
    });

    it('returns the controller response object', async () => {
      stubFindUnique(async () => pageRow());
      const res = fakeRes();

      const returned = await getPage(reqWithSlug('kependudukan'), res);

      assert.equal(returned, res);
    });

    it('calls findUnique exactly once with the full contract args', async () => {
      stubFindUnique(async () => pageRow());
      const res = fakeRes();

      await getPage(reqWithSlug('kependudukan'), res);

      assert.equal(findUniqueCalls.length, 1);
      assert.deepStrictEqual(findUniqueCalls[0]![0], {
        where: { slug: 'kependudukan' },
        include: {
          chapters: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            include: { sections: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
          },
        },
      });
      assert.equal(findManyCalls.length, 0);
    });

    it('returns 404 when the page does not exist', async () => {
      stubFindUnique(async () => null);
      const res = fakeRes();

      await getPage(reqWithSlug('tidak-ada'), res);

      assert.equal(res.status, 404);
      assert.deepStrictEqual(res.body, NOT_FOUND);
      assert.equal(findUniqueCalls.length, 1);
      assert.equal(consoleErrorCalls.length, 0);
    });

    it('returns 500 with the generic error body and does not leak the error', async () => {
      const boom = new Error('SECRET_DB_HOST mysql://root:hunter2@db');
      stubFindUnique(async () => {
        throw boom;
      });
      const res = fakeRes();

      await getPage(reqWithSlug('kependudukan'), res);

      assert.equal(res.status, 500);
      assert.deepStrictEqual(res.body, INTERNAL_ERROR);
      const serialized = JSON.stringify(res.body);
      assert.equal(serialized.includes('SECRET_DB_HOST'), false);
      assert.equal(serialized.includes('hunter2'), false);
      assert.equal(serialized.includes('stack'), false);
    });

    it('logs the failure via console.error with the exact message and the error', async () => {
      const boom = new Error('db down');
      stubFindUnique(async () => {
        throw boom;
      });
      const res = fakeRes();

      await getPage(reqWithSlug('kependudukan'), res);

      assert.equal(consoleErrorCalls.length, 1);
      assert.deepStrictEqual(consoleErrorCalls[0], ['Error saat mengambil detail halaman:', boom]);
    });

    describe('slug validation (400, prisma never called)', () => {
      const invalid: Array<[string, unknown]> = [
        ['empty string', ''],
        ['single space', ' '],
        ['whitespace only', '   \t'],
        ['uppercase', 'Kependudukan'],
        ['underscore', 'a_b'],
        ['leading hyphen', '-a'],
        ['trailing hyphen', 'a-'],
        ['double hyphen', 'a--b'],
        ['lone hyphen', '-'],
        ['inner space', 'a b'],
        ['leading space', ' kependudukan'],
        ['trailing space', 'kependudukan '],
        ['dot', 'a.b'],
        ['path traversal', '../x'],
        ['slash', 'a/b'],
        ['encoded dots', '%2e%2e'],
        ['encoded space', 'a%20b'],
        ['non-ascii', 'ké'],
        ['trailing newline', 'a\n'],
        ['leading newline', '\na'],
        ['null byte', 'a\u0000'],
        ['array', ['a', 'b']],
        ['single-element array', ['kependudukan']],
        ['undefined', undefined],
        ['null', null],
        ['number', 123],
        ['object', { slug: 'kependudukan' }],
      ];

      for (const [label, slug] of invalid) {
        it(`rejects ${label}`, async () => {
          const res = fakeRes();

          await getPage(reqWithSlug(slug), res);

          assert.equal(res.status, 400);
          assert.deepStrictEqual(res.body, INVALID_SLUG);
          assert.equal(findUniqueCalls.length, 0);
          assert.equal(findManyCalls.length, 0);
        });
      }

      it('rejects a request with no params.slug at all', async () => {
        const res = fakeRes();

        await getPage({ params: {} } as unknown as Request, res);

        assert.equal(res.status, 400);
        assert.deepStrictEqual(res.body, INVALID_SLUG);
        assert.equal(findUniqueCalls.length, 0);
      });
    });

    describe('valid slugs reach prisma with the exact param', () => {
      const valid = [
        'a',
        '1',
        'a1',
        'a-b-c-1',
        'pemerintahan-dan-kelembagaan',
        'persampahan-dan-bank-sampah-unit',
        ...CERITA_PAGES.map((p) => p.slug),
      ];

      for (const slug of valid) {
        it(`passes ${JSON.stringify(slug)} through`, async () => {
          stubFindUnique(async () => null);
          const res = fakeRes();

          await getPage(reqWithSlug(slug), res);

          assert.equal(findUniqueCalls.length, 1);
          const args = findUniqueCalls[0]![0] as { where: { slug: string } };
          assert.deepStrictEqual(args.where, { slug });
          assert.equal(res.status, 404);
        });
      }

      it('passes a 10_000-char slug (valid by pattern) through untouched', async () => {
        const slug = 'a'.repeat(10_000);
        stubFindUnique(async () => null);
        const res = fakeRes();

        await getPage(reqWithSlug(slug), res);

        assert.equal(findUniqueCalls.length, 1);
        const args = findUniqueCalls[0]![0] as { where: { slug: string } };
        assert.equal(args.where.slug, slug);
        assert.equal(args.where.slug.length, 10_000);
        assert.equal(res.status, 404);
        assert.deepStrictEqual(res.body, NOT_FOUND);
      });
    });
  });

  describe('createPageHandler', () => {
    it('returns 400 when body is not an object or null', async () => {
      const res = fakeRes();
      await createPageHandler({ body: null, user: { id: 'u1', role: 'editor' } } as never, res);
      assert.equal(res.status, 400);
    });

    it('returns 400 when title is missing or empty', async () => {
      const res = fakeRes();
      await createPageHandler(
        { body: { title: '   ' }, user: { id: 'u1', role: 'editor' } } as never,
        res,
      );
      assert.equal(res.status, 400);
    });

    it('returns 401 when req.user is missing', async () => {
      const res = fakeRes();
      await createPageHandler({ body: { title: 'Valid' } } as never, res);
      assert.equal(res.status, 401);
    });

    it('returns 409 when service throws 409 Conflict', async () => {
      stubFindUnique(async () => pageRow());
      const res = fakeRes();
      await createPageHandler(
        {
          body: { title: 'Kependudukan', slug: 'kependudukan' },
          user: { id: 'u1', role: 'editor' },
        } as never,
        res,
      );
      assert.equal(res.status, 409);
    });

    it('returns 500 without leaking error details when unhandled exception occurs', async () => {
      stubFindUnique(async () => {
        throw new Error('db failure');
      });
      const res = fakeRes();
      await createPageHandler(
        {
          body: { title: 'New Page', slug: 'new-page' },
          user: { id: 'u1', role: 'editor' },
        } as never,
        res,
      );
      assert.equal(res.status, 500);
      assert.deepStrictEqual(res.body, INTERNAL_ERROR);
    });

    it('returns 201 with created page on valid input (Happy Path)', async () => {
      stubFindUnique(async () => null);
      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            create: async () => pageRow('inovasi-desa'),
            aggregate: async () => ({ _max: { sortOrder: 7 } }),
          },
          auditLog: {
            create: async () => ({ id: 'audit-1' }),
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const res = fakeRes();
      await createPageHandler(
        {
          body: { title: 'Inovasi Desa' },
          user: { id: 'u1', email: 'editor@manggar.go.id', role: 'editor' },
          ip: '127.0.0.1',
          get: () => 'test-agent',
        } as never,
        res,
      );

      assert.equal(res.status, 201);
      assert.deepStrictEqual(res.body, {
        page: {
          id: 'page-1',
          slug: 'inovasi-desa',
          title: 'Kependudukan',
          sortOrder: 0,
          chapterCount: 0,
        },
      });
    });
  });

  describe('deletePageHandler', () => {
    it('returns 401 when req.user is missing', async () => {
      const res = fakeRes();
      await deletePageHandler({ params: { slug: 'kependudukan' } } as never, res);
      assert.equal(res.status, 401);
    });

    it('returns 400 when req.params.slug is missing or invalid', async () => {
      for (const badSlug of ['', 'Kependudukan', 'a_b', 'bad\\slug']) {
        const res = fakeRes();
        await deletePageHandler(
          { params: { slug: badSlug }, user: { id: 'u1', role: 'editor' } } as never,
          res,
        );
        assert.equal(res.status, 400);
      }
    });

    it('returns 404 when service throws 404 Not Found', async () => {
      stubFindUnique(async () => null);
      const res = fakeRes();
      await deletePageHandler(
        { params: { slug: 'tidak-ada' }, user: { id: 'u1', role: 'editor' } } as never,
        res,
      );
      assert.equal(res.status, 404);
      assert.deepStrictEqual(res.body, { error: 'Halaman tidak ditemukan' });
    });

    it('returns 409 when service throws 409 Conflict', async () => {
      stubFindUnique(async () => pageRow('kependudukan'));
      prisma.contentBlock.count = (async () => 1) as unknown as typeof prisma.contentBlock.count;
      const res = fakeRes();
      await deletePageHandler(
        { params: { slug: 'kependudukan' }, user: { id: 'u1', role: 'editor' } } as never,
        res,
      );
      assert.equal(res.status, 409);
    });

    it('returns 500 without leaking error details when unhandled exception occurs', async () => {
      stubFindUnique(async () => {
        throw new Error('db failure');
      });
      const res = fakeRes();
      await deletePageHandler(
        { params: { slug: 'kependudukan' }, user: { id: 'u1', role: 'editor' } } as never,
        res,
      );
      assert.equal(res.status, 500);
      assert.deepStrictEqual(res.body, INTERNAL_ERROR);
    });

    it('returns 200 with deleted page on valid request (Happy Path)', async () => {
      stubFindUnique(async () => pageRow('kependudukan'));
      prisma.contentBlock.count = (async () => 0) as unknown as typeof prisma.contentBlock.count;
      prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          page: {
            delete: async () => pageRow('kependudukan'),
          },
          auditLog: {
            create: async () => ({ id: 'audit-del-1' }),
          },
        };
        return fn(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      const res = fakeRes();
      await deletePageHandler(
        {
          params: { slug: 'kependudukan' },
          user: { id: 'u1', email: 'editor@manggar.go.id', role: 'editor' },
          ip: '127.0.0.1',
          get: () => 'test-agent',
        } as never,
        res,
      );

      assert.equal(res.status, 200);
      assert.deepStrictEqual(res.body, {
        message: 'Halaman berhasil dihapus',
        page: {
          id: 'page-1',
          slug: 'kependudukan',
          title: 'Kependudukan',
          sortOrder: 0,
        },
      });
    });
  });
});
