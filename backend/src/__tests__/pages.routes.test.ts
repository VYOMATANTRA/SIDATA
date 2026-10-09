import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Router } from 'express';
import app from '../app.js';
import prisma from '../utils/prisma.js';
import { listPages, getPage } from '../controllers/pages.controller.js';
import * as rateLimit from '../middlewares/rateLimit.middleware.js';

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
    it('default-exports a router with exactly two routes: GET / and GET /:slug', async () => {
      const router = await loadRouter();
      const routes = routeLayers(router).map((l) => ({
        path: l.route!.path,
        methods: Object.keys(l.route!.methods)
          .filter((m) => l.route!.methods[m])
          .sort(),
      }));

      assert.deepStrictEqual(routes, [
        { path: '/', methods: ['get'] },
        { path: '/:slug', methods: ['get'] },
      ]);
    });

    it('registers no mutating methods', async () => {
      const router = await loadRouter();
      for (const layer of routeLayers(router)) {
        for (const method of ['post', 'put', 'patch', 'delete']) {
          assert.notEqual(layer.route!.methods[method], true, `${method} ${layer.route!.path}`);
        }
      }
    });

    it('exports pagesLimiter from the rate-limit middleware', () => {
      const limiter = (rateLimit as Record<string, unknown>).pagesLimiter;
      assert.equal(typeof limiter, 'function');
    });

    it('puts pagesLimiter first, then the controller, on both routes', async () => {
      const router = await loadRouter();
      const limiter = (rateLimit as Record<string, unknown>).pagesLimiter;
      const byPath = new Map(routeLayers(router).map((l) => [l.route!.path, l.route!.stack]));

      assert.deepStrictEqual(
        byPath.get('/')?.map((s) => s.handle),
        [limiter, listPages],
      );
      assert.deepStrictEqual(
        byPath.get('/:slug')?.map((s) => s.handle),
        [limiter, getPage],
      );
    });
  });

  describe('mounted at /api/pages in app', () => {
    let server: Server;
    let baseUrl: string;
    let originalFindMany: typeof prisma.page.findMany;
    let originalFindUnique: typeof prisma.page.findUnique;
    let findUniqueCalls: unknown[][];

    before(async () => {
      server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    });

    beforeEach(() => {
      originalFindMany = prisma.page.findMany;
      originalFindUnique = prisma.page.findUnique;
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
    });

    afterEach(() => {
      prisma.page.findMany = originalFindMany;
      prisma.page.findUnique = originalFindUnique;
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
  });
});
