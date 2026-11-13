import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Router } from 'express';
import app from '../app.js';
import prisma from '../utils/prisma.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import * as rateLimit from '../middlewares/rateLimit.middleware.js';
import { generateAccessToken } from '../utils/jwt.js';
import * as pagesController from '../controllers/pages.controller.js';
import * as chaptersController from '../controllers/chapters.controller.js';
import * as sectionsController from '../controllers/sections.controller.js';
import * as contentBlocksController from '../controllers/contentBlocks.controller.js';
import {
  installFakeHierarchyDb,
  T0,
  type FakeHierarchyDb,
  type FakeHierarchyHandle,
} from './helpers/fakeHierarchyDb.js';

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

const loadRouter = async (file: string): Promise<Router> =>
  (await import(`../routes/${file}.js`)).default as Router;

const layersOf = (router: Router) =>
  (router as unknown as { stack: RouteLayer[] }).stack.filter((l) => l.route);

const T0_ISO = T0.toISOString();

interface Endpoint {
  name: string;
  method: 'PATCH' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  /** Body that passes CSRF/auth but fails service validation (400). */
  invalidBody?: unknown;
  router: string;
  path: string;
  limiter: 'pagesWriteLimiter' | 'contentBlocksWriteLimiter';
  handler: unknown;
}

const ENDPOINTS: Endpoint[] = [
  {
    name: 'PATCH page',
    method: 'PATCH',
    url: '/api/pages/kependudukan',
    invalidBody: {},
    router: 'pages.routes',
    path: '/:slug',
    limiter: 'pagesWriteLimiter',
    handler: pagesController.updatePageHandler,
  },
  {
    name: 'POST chapter',
    method: 'POST',
    url: '/api/pages/kependudukan/chapters',
    invalidBody: {},
    router: 'pages.routes',
    path: '/:slug/chapters',
    limiter: 'pagesWriteLimiter',
    handler: chaptersController.createChapterHandler,
  },
  {
    name: 'PUT chapter reorder',
    method: 'PUT',
    url: '/api/pages/kependudukan/chapters/reorder',
    invalidBody: {},
    router: 'pages.routes',
    path: '/:slug/chapters/reorder',
    limiter: 'pagesWriteLimiter',
    handler: chaptersController.reorderChaptersHandler,
  },
  {
    name: 'PATCH chapter',
    method: 'PATCH',
    url: '/api/chapters/ch-1',
    invalidBody: {},
    router: 'chapters.routes',
    path: '/:id',
    limiter: 'pagesWriteLimiter',
    handler: chaptersController.updateChapterHandler,
  },
  {
    name: 'DELETE chapter',
    method: 'DELETE',
    url: '/api/chapters/ch-1',
    router: 'chapters.routes',
    path: '/:id',
    limiter: 'pagesWriteLimiter',
    handler: chaptersController.deleteChapterHandler,
  },
  {
    name: 'POST section',
    method: 'POST',
    url: '/api/chapters/ch-1/sections',
    invalidBody: {},
    router: 'chapters.routes',
    path: '/:id/sections',
    limiter: 'pagesWriteLimiter',
    handler: sectionsController.createSectionHandler,
  },
  {
    name: 'PUT section reorder',
    method: 'PUT',
    url: '/api/chapters/ch-1/sections/reorder',
    invalidBody: {},
    router: 'chapters.routes',
    path: '/:id/sections/reorder',
    limiter: 'pagesWriteLimiter',
    handler: sectionsController.reorderSectionsHandler,
  },
  {
    name: 'PATCH section',
    method: 'PATCH',
    url: '/api/sections/sec-1',
    invalidBody: {},
    router: 'sections.routes',
    path: '/:id',
    limiter: 'pagesWriteLimiter',
    handler: sectionsController.updateSectionHandler,
  },
  {
    name: 'DELETE section',
    method: 'DELETE',
    url: '/api/sections/sec-1',
    router: 'sections.routes',
    path: '/:id',
    limiter: 'pagesWriteLimiter',
    handler: sectionsController.deleteSectionHandler,
  },
  {
    name: 'POST prose block',
    method: 'POST',
    url: '/api/sections/sec-1/content-blocks',
    invalidBody: {},
    router: 'sections.routes',
    path: '/:id/content-blocks',
    limiter: 'contentBlocksWriteLimiter',
    handler: sectionsController.createSectionBlockHandler,
  },
  {
    name: 'PUT prose block reorder',
    method: 'PUT',
    url: '/api/sections/sec-1/content-blocks/reorder',
    invalidBody: {},
    router: 'sections.routes',
    path: '/:id/content-blocks/reorder',
    limiter: 'contentBlocksWriteLimiter',
    handler: sectionsController.reorderSectionBlocksHandler,
  },
  {
    name: 'PUT section figure',
    method: 'PUT',
    url: '/api/sections/sec-1/figure',
    invalidBody: {},
    router: 'sections.routes',
    path: '/:id/figure',
    limiter: 'contentBlocksWriteLimiter',
    handler: sectionsController.putSectionFigureHandler,
  },
  {
    name: 'DELETE section figure',
    method: 'DELETE',
    url: '/api/sections/sec-1/figure',
    router: 'sections.routes',
    path: '/:id/figure',
    limiter: 'contentBlocksWriteLimiter',
    handler: sectionsController.deleteSectionFigureHandler,
  },
  {
    name: 'DELETE prose block',
    method: 'DELETE',
    url: '/api/content-blocks/pendahuluan',
    router: 'contentBlocks.routes',
    path: '/:slug',
    limiter: 'contentBlocksWriteLimiter',
    handler: contentBlocksController.deleteContentBlockHandler,
  },
];

describe('hierarchy authoring routes', () => {
  describe('router wiring', () => {
    for (const ep of ENDPOINTS) {
      it(`${ep.name}: apiLimiter, verifyToken, requireEditorOrAdmin, ${ep.limiter}, handler`, async () => {
        const router = await loadRouter(ep.router);
        const layer = layersOf(router).find(
          (l) => l.route!.path === ep.path && l.route!.methods[ep.method.toLowerCase()],
        );
        assert.ok(layer, `route ${ep.method} ${ep.path} missing in ${ep.router}`);
        assert.deepStrictEqual(
          layer.route!.stack.map((s) => s.handle),
          [
            (rateLimit as Record<string, unknown>).apiLimiter,
            verifyToken,
            requireEditorOrAdmin,
            (rateLimit as Record<string, unknown>)[ep.limiter],
            ep.handler,
          ],
        );
      });
    }

    it('registers the chapters-reorder route after the page-list reorder and the /:slug reads', async () => {
      const router = await loadRouter('pages.routes');
      const paths = layersOf(router).map(
        (l) => `${Object.keys(l.route!.methods).join(',')} ${l.route!.path}`,
      );
      assert.ok(paths.indexOf('put /reorder') < paths.indexOf('put /:slug/chapters/reorder'));
    });
  });

  describe('mounted in the app', () => {
    let server: Server;
    let baseUrl: string;
    let handle: FakeHierarchyHandle;
    let db: FakeHierarchyDb;
    let originalUserFindUnique: typeof prisma.user.findUnique;
    let roleName = 'editor';

    const getCsrf = async (): Promise<{ token: string; cookie: string }> => {
      const res = await fetch(`${baseUrl}/api/auth/csrf-token`);
      const cookie = res.headers.get('set-cookie') ?? '';
      const data = (await res.json()) as { csrfToken: string };
      return { token: data.csrfToken, cookie };
    };

    const tokenFor = (role: string) =>
      generateAccessToken({ id: `u-${role}`, email: `${role}@manggar.go.id`, role });

    const call = async (
      ep: Pick<Endpoint, 'method' | 'url'>,
      opts: { csrf?: boolean; role?: string | null; body?: unknown; query?: string } = {},
    ) => {
      const csrf = opts.csrf === false ? null : await getCsrf();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrf) {
        headers['x-csrf-token'] = csrf.token;
        headers['cookie'] = csrf.cookie;
      }
      if (opts.role) {
        roleName = opts.role;
        headers['Authorization'] = `Bearer ${tokenFor(opts.role)}`;
      }
      const hasBody = ep.method !== 'DELETE';
      return fetch(`${baseUrl}${ep.url}${opts.query ?? ''}`, {
        method: ep.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(opts.body ?? {}) } : {}),
      });
    };

    before(async () => {
      server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(async () => {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    });

    beforeEach(() => {
      handle = installFakeHierarchyDb();
      db = handle.db;
      db.addPage();
      db.addChapter({ id: 'ch-1' });
      db.addSection({ id: 'sec-1' });
      db.addBlock({ id: 'b1', slug: 'pendahuluan' });
      originalUserFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async (args: { where: { id?: string } }) => ({
        id: args.where.id,
        email: `${roleName}@manggar.go.id`,
        role: { name: roleName },
        deletedAt: null,
      })) as unknown as typeof prisma.user.findUnique;
    });

    afterEach(() => {
      handle.restore();
      prisma.user.findUnique = originalUserFindUnique;
    });

    for (const ep of ENDPOINTS) {
      describe(ep.name, () => {
        it('rejects a request without a CSRF token (403)', async () => {
          const res = await call(ep, { csrf: false, role: 'editor' });
          assert.equal(res.status, 403);
          assert.deepStrictEqual(await res.json(), { error: 'CSRF token tidak valid' });
        });

        it('rejects an unauthenticated request with valid CSRF (401)', async () => {
          const res = await call(ep, { role: null });
          assert.equal(res.status, 401);
          assert.deepStrictEqual(await res.json(), { error: 'Akses ditolak.' });
        });

        it('rejects the plain user role (403 Editor/Admin required)', async () => {
          const res = await call(ep, { role: 'user' });
          assert.equal(res.status, 403);
          assert.deepStrictEqual(await res.json(), {
            error: 'Akses ditolak. Membutuhkan hak akses Editor atau Admin.',
          });
        });

        for (const role of ['editor', 'admin']) {
          it(`lets ${role} through to validation (400 on an invalid payload)`, async () => {
            const res = await call(ep, { role, body: ep.invalidBody });
            assert.equal(res.status, 400);
            const body = (await res.json()) as { error: string };
            assert.equal(typeof body.error, 'string');
          });
        }
      });
    }

    it('creates, renames, reorders and deletes a chapter end to end with chained tokens', async () => {
      // create
      let res = await call(
        { method: 'POST', url: '/api/pages/kependudukan/chapters' },
        { role: 'editor', body: { title: 'Piramida Penduduk' } },
      );
      assert.equal(res.status, 201);
      const created = (await res.json()) as {
        chapter: { id: string; slug: string; updatedAt: string };
        page: { updatedAt: string };
      };
      assert.equal(created.chapter.slug, 'piramida-penduduk');

      // rename with the chapter token
      res = await call(
        { method: 'PATCH', url: `/api/chapters/${created.chapter.id}` },
        {
          role: 'editor',
          body: { title: 'Piramida Usia', expectedUpdatedAt: created.chapter.updatedAt },
        },
      );
      assert.equal(res.status, 200);

      // reorder with the page token returned by create
      res = await call(
        { method: 'PUT', url: '/api/pages/kependudukan/chapters/reorder' },
        {
          role: 'admin',
          body: {
            expectedUpdatedAt: created.page.updatedAt,
            items: [
              { id: 'ch-1', sortOrder: 1 },
              { id: created.chapter.id, sortOrder: 0 },
            ],
          },
        },
      );
      assert.equal(res.status, 200);
      const reordered = (await res.json()) as {
        chapters: Array<{ id: string; updatedAt: string }>;
        page: { updatedAt: string };
      };
      assert.equal(reordered.chapters[0]!.id, created.chapter.id);

      // delete the new (empty) chapter using its latest token via the query string
      const latest = reordered.chapters[0]!.updatedAt;
      res = await call(
        { method: 'DELETE', url: `/api/chapters/${created.chapter.id}` },
        { role: 'editor', query: `?expectedUpdatedAt=${encodeURIComponent(latest)}` },
      );
      assert.equal(res.status, 200);
      assert.equal(
        db.chapter.rows.some((c) => c.id === created.chapter.id),
        false,
      );
      assert.deepEqual(
        db.auditRows.map((r) => r.action),
        ['chapter.created', 'chapter.updated', 'chapter.reordered', 'chapter.deleted'],
      );
    });

    it('returns {error, code: STALE_WRITE, details} with 409 for a stale write', async () => {
      const res = await call(
        { method: 'PATCH', url: '/api/chapters/ch-1' },
        { role: 'editor', body: { title: 'X', expectedUpdatedAt: '2026-09-30T00:00:00.000Z' } },
      );
      assert.equal(res.status, 409);
      const body = (await res.json()) as { code: string; details: { currentUpdatedAt: string } };
      assert.equal(body.code, 'STALE_WRITE');
      assert.equal(body.details.currentUpdatedAt, T0_ISO);
    });

    it('returns 409 HAS_DEPENDENTS with counts for a blocked section delete', async () => {
      const res = await call(
        { method: 'DELETE', url: '/api/sections/sec-1' },
        { role: 'editor', query: `?expectedUpdatedAt=${encodeURIComponent(T0_ISO)}` },
      );
      assert.equal(res.status, 409);
      const body = (await res.json()) as {
        code: string;
        details: { dependencies: Record<string, number> };
      };
      assert.equal(body.code, 'HAS_DEPENDENTS');
      assert.deepEqual(body.details.dependencies, {
        contentBlocks: 1,
        figures: 0,
        indicators: 0,
        indicatorTables: 0,
      });
    });

    it('DELETE without expectedUpdatedAt in the query is a 400', async () => {
      const res = await call({ method: 'DELETE', url: '/api/sections/sec-1' }, { role: 'editor' });
      assert.equal(res.status, 400);
    });

    it('refuses to delete a standalone singleton block through the API (409 STANDALONE_BLOCK_PROTECTED)', async () => {
      db.addBlock({
        id: 'hero',
        sectionId: null,
        slug: 'landing-hero',
        type: 'hero',
        sortOrder: null,
      });
      const res = await call(
        { method: 'DELETE', url: '/api/content-blocks/landing-hero' },
        { role: 'admin', query: `?expectedUpdatedAt=${encodeURIComponent(T0_ISO)}` },
      );
      assert.equal(res.status, 409);
      assert.equal(((await res.json()) as { code: string }).code, 'STANDALONE_BLOCK_PROTECTED');
      assert.equal(
        db.contentBlock.rows.some((b) => b.slug === 'landing-hero'),
        true,
      );
    });

    it('creates and deletes a prose block through the section endpoints', async () => {
      let res = await call(
        { method: 'POST', url: '/api/sections/sec-1/content-blocks' },
        { role: 'editor', body: { title: 'Metodologi', body: 'Isi.' } },
      );
      assert.equal(res.status, 201);
      const created = (await res.json()) as { block: { slug: string; updatedAt: string } };
      assert.equal(created.block.slug, 'metodologi');

      res = await call(
        { method: 'DELETE', url: `/api/content-blocks/${created.block.slug}` },
        {
          role: 'editor',
          query: `?expectedUpdatedAt=${encodeURIComponent(created.block.updatedAt)}`,
        },
      );
      assert.equal(res.status, 200);
    });

    describe('section figure', () => {
      const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
      const figure = {
        kind: 'photo',
        photos: [{ mediaId: MEDIA_ID, alt: 'Balai warga contoh', caption: 'Contoh' }],
      };

      beforeEach(() => db.addMedia({ id: MEDIA_ID }));

      it('PUT creates, PUT replaces and DELETE removes it, chaining the section token', async () => {
        let res = await call(
          { method: 'PUT', url: '/api/sections/sec-1/figure' },
          { role: 'editor', body: { expectedUpdatedAt: T0_ISO, figure } },
        );
        assert.equal(res.status, 200);
        const saved = (await res.json()) as {
          block: { type: string; slug: string; metadata: unknown; sortOrder: number | null };
          section: { id: string; updatedAt: string };
        };
        assert.equal(saved.block.type, 'figure');
        assert.equal(saved.block.slug, 'figure-sec-1');
        assert.equal(saved.block.sortOrder, null);
        assert.deepEqual(saved.block.metadata, figure);
        assert.notEqual(saved.section.updatedAt, T0_ISO);
        assert.notEqual(db.mediaAsset.rows[0]!.attachedAt, null);

        res = await call(
          { method: 'DELETE', url: '/api/sections/sec-1/figure' },
          {
            role: 'admin',
            query: `?expectedUpdatedAt=${encodeURIComponent(saved.section.updatedAt)}`,
          },
        );
        assert.equal(res.status, 200);
        const removed = (await res.json()) as { section: { id: string; updatedAt: string } };
        assert.equal(removed.section.id, 'sec-1');
        assert.equal(db.mediaAsset.rows[0]!.attachedAt, null);
        assert.equal(
          db.contentBlock.rows.some((b) => b.type === 'figure'),
          false,
        );
      });

      it('PUT answers 400 with a plain sentence for an invalid figure and 409 STALE_WRITE for an old token', async () => {
        let res = await call(
          { method: 'PUT', url: '/api/sections/sec-1/figure' },
          {
            role: 'editor',
            body: {
              expectedUpdatedAt: T0_ISO,
              figure: { kind: 'photos', photos: [figure.photos[0]] },
            },
          },
        );
        assert.equal(res.status, 400);
        assert.match(((await res.json()) as { error: string }).error, /minimal berisi 2 foto/);

        res = await call(
          { method: 'PUT', url: '/api/sections/sec-1/figure' },
          { role: 'editor', body: { expectedUpdatedAt: '2026-09-30T00:00:00.000Z', figure } },
        );
        assert.equal(res.status, 409);
        assert.equal(((await res.json()) as { code: string }).code, 'STALE_WRITE');
      });

      it('DELETE answers 404 FIGURE_NOT_FOUND when the section has no figure', async () => {
        const res = await call(
          { method: 'DELETE', url: '/api/sections/sec-1/figure' },
          { role: 'editor', query: `?expectedUpdatedAt=${encodeURIComponent(T0_ISO)}` },
        );
        assert.equal(res.status, 404);
        assert.equal(((await res.json()) as { code: string }).code, 'FIGURE_NOT_FOUND');
      });

      it('the generic content-block PATCH and DELETE refuse the figure block (409 FIGURE_BLOCK_PROTECTED)', async () => {
        const put = await call(
          { method: 'PUT', url: '/api/sections/sec-1/figure' },
          { role: 'editor', body: { expectedUpdatedAt: T0_ISO, figure } },
        );
        const saved = (await put.json()) as { block: { slug: string; updatedAt: string } };

        let res = await call(
          { method: 'PATCH', url: `/api/content-blocks/${saved.block.slug}` },
          { role: 'admin', body: { body: 'Disusupkan' } },
        );
        assert.equal(res.status, 409);
        assert.equal(((await res.json()) as { code: string }).code, 'FIGURE_BLOCK_PROTECTED');

        res = await call(
          { method: 'DELETE', url: `/api/content-blocks/${saved.block.slug}` },
          {
            role: 'admin',
            query: `?expectedUpdatedAt=${encodeURIComponent(saved.block.updatedAt)}`,
          },
        );
        assert.equal(res.status, 409);
        assert.equal(((await res.json()) as { code: string }).code, 'FIGURE_BLOCK_PROTECTED');
        assert.equal(
          db.contentBlock.rows.some((b) => b.type === 'figure'),
          true,
        );
        assert.notEqual(db.mediaAsset.rows[0]!.attachedAt, null);
      });
    });

    it('does not leak internals on an unexpected failure (500)', async () => {
      const original = console.error;
      console.error = () => {};
      db.page.findUnique = async () => {
        throw new Error('secret db failure');
      };
      const res = await call(
        { method: 'POST', url: '/api/pages/kependudukan/chapters' },
        { role: 'editor', body: { title: 'Baru' } },
      );
      console.error = original;
      assert.equal(res.status, 500);
      assert.deepStrictEqual(await res.json(), { error: 'Terjadi kesalahan internal server' });
    });

    it('PATCH /api/pages/:slug keeps the slug stable and exposes the new token', async () => {
      const res = await call(
        { method: 'PATCH', url: '/api/pages/kependudukan' },
        { role: 'editor', body: { title: 'Data Penduduk', expectedUpdatedAt: T0_ISO } },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        page: { slug: string; title: string; updatedAt: string };
      };
      assert.equal(body.page.slug, 'kependudukan');
      assert.equal(body.page.title, 'Data Penduduk');
      assert.notEqual(body.page.updatedAt, T0_ISO);
    });
  });
});
