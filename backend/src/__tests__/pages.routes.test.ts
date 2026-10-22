import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Router } from 'express';
import app from '../app.js';
import prisma from '../utils/prisma.js';
import {
  listPages,
  getPage,
  createPageHandler,
  deletePageHandler,
  reorderPagesHandler,
} from '../controllers/pages.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import * as rateLimit from '../middlewares/rateLimit.middleware.js';
import { generateAccessToken } from '../utils/jwt.js';

// Router internals (router.stack / layer.route) are the Express 5 `router` package's public-ish
// shape; kept to the minimum needed: path, methods, and the handler chain.
interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown; method?: string }>;
  };
}

const loadRouter = async (): Promise<Router> => {
  const mod = await import('../routes/pages.routes.js');
  return mod.default as Router;
};

const routeLayers = (router: Router) =>
  (router as unknown as { stack: RouteLayer[] }).stack.filter((l) => l.route);

describe('pages.routes', () => {
  describe('router definition', () => {
    it('default-exports a router with routes: GET /, PUT /reorder, GET /:slug, POST /, and DELETE /:slug', async () => {
      const router = await loadRouter();
      const routes = routeLayers(router).map((l) => ({
        path: l.route!.path,
        methods: Object.keys(l.route!.methods)
          .filter((m) => l.route!.methods[m])
          .sort(),
      }));

      assert.deepStrictEqual(routes, [
        { path: '/', methods: ['get'] },
        { path: '/reorder', methods: ['put'] },
        { path: '/:slug', methods: ['get'] },
        { path: '/', methods: ['post'] },
        { path: '/:slug', methods: ['delete'] },
      ]);
    });

    it('registers /reorder BEFORE /:slug routes to eliminate Express parameter shadowing', async () => {
      const router = await loadRouter();
      const layers = routeLayers(router);
      const reorderIndex = layers.findIndex((l) => l.route?.path === '/reorder');
      const slugIndex = layers.findIndex((l) => l.route?.path === '/:slug');
      assert.ok(reorderIndex !== -1, 'PUT /reorder route must exist');
      assert.ok(slugIndex !== -1, 'GET /:slug route must exist');
      assert.ok(
        reorderIndex < slugIndex,
        'PUT /reorder must precede /:slug in router stack to avoid shadowing',
      );
    });

    it('exports pagesLimiter and pagesWriteLimiter from rate-limit middleware', () => {
      const limiter = (rateLimit as Record<string, unknown>).pagesLimiter;
      assert.equal(typeof limiter, 'function');
      const writeLimiter = (rateLimit as Record<string, unknown>).pagesWriteLimiter;
      assert.equal(typeof writeLimiter, 'function');
    });

    it('puts pagesLimiter first, then the controller, on public read routes', async () => {
      const router = await loadRouter();
      const limiter = (rateLimit as Record<string, unknown>).pagesLimiter;
      const getRoot = routeLayers(router).find(
        (l) => l.route?.path === '/' && l.route?.methods['get'],
      );
      assert.ok(getRoot);
      assert.deepStrictEqual(
        getRoot.route!.stack.map((s) => s.handle),
        [limiter, listPages],
      );

      const getSlug = routeLayers(router).find(
        (l) => l.route?.path === '/:slug' && l.route?.methods['get'],
      );
      assert.ok(getSlug);
      assert.deepStrictEqual(
        getSlug.route!.stack.map((s) => s.handle),
        [limiter, getPage],
      );
    });

    it('puts apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, then createPageHandler on POST /', async () => {
      const router = await loadRouter();
      const apiLimiter = (rateLimit as Record<string, unknown>).apiLimiter;
      const pagesWriteLimiter = (rateLimit as Record<string, unknown>).pagesWriteLimiter;

      const postRoot = routeLayers(router).find(
        (l) => l.route?.path === '/' && l.route?.methods['post'],
      );
      assert.ok(postRoot);
      assert.deepStrictEqual(
        postRoot.route!.stack.map((s) => s.handle),
        [apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, createPageHandler],
      );
    });

    it('puts apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, then reorderPagesHandler on PUT /reorder', async () => {
      const router = await loadRouter();
      const apiLimiter = (rateLimit as Record<string, unknown>).apiLimiter;
      const pagesWriteLimiter = (rateLimit as Record<string, unknown>).pagesWriteLimiter;

      const putReorder = routeLayers(router).find(
        (l) => l.route?.path === '/reorder' && l.route?.methods['put'],
      );
      assert.ok(putReorder);
      assert.deepStrictEqual(
        putReorder.route!.stack.map((s) => s.handle),
        [apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, reorderPagesHandler],
      );
    });

    it('puts apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, then deletePageHandler on DELETE /:slug', async () => {
      const router = await loadRouter();
      const apiLimiter = (rateLimit as Record<string, unknown>).apiLimiter;
      const pagesWriteLimiter = (rateLimit as Record<string, unknown>).pagesWriteLimiter;

      const deleteSlug = routeLayers(router).find(
        (l) => l.route?.path === '/:slug' && l.route?.methods['delete'],
      );
      assert.ok(deleteSlug);
      assert.deepStrictEqual(
        deleteSlug.route!.stack.map((s) => s.handle),
        [apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, deletePageHandler],
      );
    });
  });

  describe('mounted at /api/pages in app', () => {
    let server: Server;
    let baseUrl: string;
    let originalFindMany: typeof prisma.page.findMany;
    let originalFindUnique: typeof prisma.page.findUnique;
    let originalUserFindUnique: typeof prisma.user.findUnique;
    let findUniqueCalls: unknown[][];

    const getCsrf = async (): Promise<{ token: string; cookie: string }> => {
      const res = await fetch(`${baseUrl}/api/auth/csrf-token`);
      const cookie = res.headers.get('set-cookie') ?? '';
      const data = (await res.json()) as { csrfToken: string };
      return { token: data.csrfToken, cookie };
    };

    before(async () => {
      server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
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
      originalFindMany = prisma.page.findMany;
      originalFindUnique = prisma.page.findUnique;
      originalUserFindUnique = prisma.user.findUnique;
      findUniqueCalls = [];
      prisma.page.findMany = (async () => [
        {
          id: 'p1',
          slug: 'kependudukan',
          title: 'Kependudukan',
          sortOrder: 0,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          updatedAt: new Date('2026-10-01T00:00:00.000Z'),
          _count: { chapters: 6 },
        },
      ]) as unknown as typeof prisma.page.findMany;
      prisma.page.findUnique = (async (...args: unknown[]) => {
        findUniqueCalls.push(args);
        return null;
      }) as unknown as typeof prisma.page.findUnique;
      prisma.user.findUnique = (async (args: { where: { id?: string } }) => {
        if (args?.where?.id) {
          return {
            id: args.where.id,
            email: 'user@manggar.go.id',
            role: { name: 'user' },
            deletedAt: null,
          };
        }
        return null;
      }) as unknown as typeof prisma.user.findUnique;
    });

    afterEach(() => {
      prisma.page.findMany = originalFindMany;
      prisma.page.findUnique = originalFindUnique;
      prisma.user.findUnique = originalUserFindUnique;
    });

    it('GET /api/pages returns 200 with the list body', async () => {
      const response = await fetch(`${baseUrl}/api/pages`);

      assert.equal(response.status, 200);
      assert.deepStrictEqual(await response.json(), {
        pages: [
          { id: 'p1', slug: 'kependudukan', title: 'Kependudukan', sortOrder: 0, chapterCount: 6 },
        ],
        total: 1,
      });
    });

    it('GET /api/pages applies rate-limit headers (pagesLimiter is in the chain)', async () => {
      const response = await fetch(`${baseUrl}/api/pages`);

      // draft-7 standard headers, as configured in createLimiter.
      assert.ok(response.headers.get('ratelimit-policy'), 'missing RateLimit-Policy header');
      assert.match(response.headers.get('ratelimit-policy') ?? '', /^300;/);
    });

    it('GET /api/pages/:slug reaches the controller (404 for a missing page)', async () => {
      const response = await fetch(`${baseUrl}/api/pages/tidak-ada`);

      assert.equal(response.status, 404);
      assert.deepStrictEqual(await response.json(), { error: 'Halaman tidak ditemukan' });
      assert.equal(findUniqueCalls.length, 1);
      assert.deepStrictEqual((findUniqueCalls[0]![0] as { where: unknown }).where, {
        slug: 'tidak-ada',
      });
    });

    it('GET /api/pages/:slug with an invalid slug returns 400 without hitting prisma', async () => {
      const response = await fetch(`${baseUrl}/api/pages/Kependudukan`);

      assert.equal(response.status, 400);
      assert.deepStrictEqual(await response.json(), { error: 'Slug halaman tidak valid' });
      assert.equal(findUniqueCalls.length, 0);
    });

    it('GET /api/pages/:slug with a percent-encoded space is decoded and rejected', async () => {
      const response = await fetch(`${baseUrl}/api/pages/a%20b`);

      assert.equal(response.status, 400);
      assert.equal(findUniqueCalls.length, 0);
    });

    it('mutating routes without CSRF token are stopped by CSRF middleware with 403', async () => {
      const response = await fetch(`${baseUrl}/api/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No CSRF' }),
      });

      assert.equal(response.status, 403);
      assert.deepStrictEqual(await response.json(), { error: 'CSRF token tidak valid' });
    });

    it('POST /api/pages with valid CSRF rejects unauthenticated request with exact 401', async () => {
      const csrf = await getCsrf();
      const response = await fetch(`${baseUrl}/api/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf.token,
          cookie: csrf.cookie,
        },
        body: JSON.stringify({ title: 'Unauthorized' }),
      });

      assert.equal(response.status, 401);
      assert.deepStrictEqual(await response.json(), { error: 'Akses ditolak.' });
    });

    it('DELETE /api/pages/:slug with valid CSRF rejects unauthenticated request with exact 401', async () => {
      const csrf = await getCsrf();
      const response = await fetch(`${baseUrl}/api/pages/kependudukan`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrf.token,
          cookie: csrf.cookie,
        },
      });

      assert.equal(response.status, 401);
      assert.deepStrictEqual(await response.json(), { error: 'Akses ditolak.' });
    });

    it('PUT /api/pages/reorder with valid CSRF rejects unauthenticated request with exact 401', async () => {
      const csrf = await getCsrf();
      const response = await fetch(`${baseUrl}/api/pages/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf.token,
          cookie: csrf.cookie,
        },
        body: JSON.stringify({ items: [{ id: 'p1', sortOrder: 1 }] }),
      });

      assert.equal(response.status, 401);
      assert.deepStrictEqual(await response.json(), { error: 'Akses ditolak.' });
    });

    it('POST /api/pages with valid CSRF rejects unauthorized user role with exact 403', async () => {
      const csrf = await getCsrf();
      const userToken = generateAccessToken({
        id: 'u-user',
        email: 'user@manggar.go.id',
        role: 'user',
      });
      const response = await fetch(`${baseUrl}/api/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf.token,
          cookie: csrf.cookie,
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ title: 'Forbidden' }),
      });

      assert.equal(response.status, 403);
      assert.deepStrictEqual(await response.json(), {
        error: 'Akses ditolak. Membutuhkan hak akses Editor atau Admin.',
      });
    });
  });
});
