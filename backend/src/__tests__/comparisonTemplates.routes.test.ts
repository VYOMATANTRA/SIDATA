import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, before, after } from 'node:test';
import express from 'express';
import app from '../app.js';
import prisma from '../utils/prisma.js';
import { generateAccessToken } from '../utils/jwt.js';
import comparisonTemplatesRouter from '../routes/comparisonTemplates.routes.js';
import {
  listComparisonTemplatesHandler,
  getComparisonTemplateHandler,
  createComparisonTemplateHandler,
  updateComparisonTemplateHandler,
  deleteComparisonTemplateHandler,
  previewComparisonTemplateHandler,
} from '../controllers/comparisonTemplates.controller.js';
import {
  apiLimiter,
  comparisonTemplatesWriteLimiter,
  comparisonTemplatesPreviewLimiter,
  comparisonTemplatesPreviewPreAuthLimiter,
  contentBlocksWriteLimiter,
  indicatorsWriteLimiter,
  settingsWriteLimiter,
  userManagementWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin, requireEditorOrAdmin } from '../middlewares/role.middleware.js';

interface RouteStackLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

function findRoute(method: string, path: string) {
  const layers = comparisonTemplatesRouter.stack as unknown as RouteStackLayer[];
  return layers.find((layer) => layer.route?.methods?.[method] && layer.route?.path === path);
}

const handlesOf = (method: string, path: string): unknown[] => {
  const layer = findRoute(method, path);
  assert.ok(layer?.route, `${method.toUpperCase()} ${path} route must exist`);
  return layer.route.stack.map((s) => s.handle);
};

describe('comparisonTemplates.routes wiring', () => {
  it('registers exactly the six expected routes', () => {
    const layers = (comparisonTemplatesRouter.stack as unknown as RouteStackLayer[]).filter(
      (l) => l.route,
    );
    const registered = layers
      .flatMap((l) => Object.keys(l.route!.methods ?? {}).map((m) => `${m} ${l.route!.path}`))
      .sort();

    assert.deepEqual(registered, [
      'delete /:id',
      'get /',
      'get /:id',
      'patch /:id',
      'post /',
      'post /preview',
    ]);
  });

  describe('reads are for editors and admins only (templates are not public content)', () => {
    for (const [path, handler] of [
      ['/', listComparisonTemplatesHandler],
      ['/:id', getComparisonTemplateHandler],
    ] as const) {
      it(`GET ${path} runs apiLimiter → verifyToken → requireEditorOrAdmin → handler`, () => {
        assert.deepEqual(handlesOf('get', path), [
          apiLimiter,
          verifyToken,
          requireEditorOrAdmin,
          handler,
        ]);
      });
    }
  });

  describe('writes are admin-only (SPEC §3: Admin authors phrase structures)', () => {
    for (const [method, path, handler] of [
      ['post', '/', createComparisonTemplateHandler],
      ['patch', '/:id', updateComparisonTemplateHandler],
      ['delete', '/:id', deleteComparisonTemplateHandler],
    ] as const) {
      it(`${method.toUpperCase()} ${path} runs apiLimiter → verifyToken → requireAdmin → write limiter → handler`, () => {
        assert.deepEqual(handlesOf(method, path), [
          apiLimiter,
          verifyToken,
          requireAdmin,
          comparisonTemplatesWriteLimiter,
          handler,
        ]);
      });

      it(`${method.toUpperCase()} ${path} is not reachable by editors and has its own limiter`, () => {
        const handles = handlesOf(method, path);

        assert.equal(handles.includes(requireEditorOrAdmin as never), false);
        for (const shared of [
          indicatorsWriteLimiter,
          contentBlocksWriteLimiter,
          userManagementWriteLimiter,
          settingsWriteLimiter,
        ]) {
          assert.equal(
            handles.includes(shared as never),
            false,
            'templates must not share a write-limiter bucket with another resource',
          );
        }
      });
    }

    it('uses a limiter instance that no other route uses', () => {
      for (const other of [
        indicatorsWriteLimiter,
        contentBlocksWriteLimiter,
        userManagementWriteLimiter,
        settingsWriteLimiter,
        apiLimiter,
      ]) {
        assert.notEqual(comparisonTemplatesWriteLimiter, other);
      }
    });
  });

  describe('live preview is admin-only with its own roomier limiter', () => {
    it('POST /preview runs pre-auth guard → verifyToken → requireAdmin → per-user preview limiter → handler', () => {
      assert.deepEqual(handlesOf('post', '/preview'), [
        comparisonTemplatesPreviewPreAuthLimiter,
        verifyToken,
        requireAdmin,
        comparisonTemplatesPreviewLimiter,
        previewComparisonTemplateHandler,
      ]);
    });

    it('does not use the shared apiLimiter, and auth/role come before the per-user limiter', () => {
      const handles = handlesOf('post', '/preview');

      assert.equal(handles.includes(apiLimiter as never), false);
      assert.notEqual(comparisonTemplatesPreviewPreAuthLimiter, apiLimiter);
      assert.ok(handles.includes(comparisonTemplatesPreviewLimiter as never));
      const idx = (h: unknown) => handles.indexOf(h);
      assert.ok(idx(verifyToken) < idx(requireAdmin));
      assert.ok(idx(requireAdmin) < idx(comparisonTemplatesPreviewLimiter));
      assert.ok(idx(comparisonTemplatesPreviewLimiter) < idx(previewComparisonTemplateHandler));
    });

    it('is not reachable by editors and does not drain the save bucket', () => {
      const handles = handlesOf('post', '/preview');

      assert.equal(handles.includes(requireEditorOrAdmin as never), false);
      assert.equal(handles.includes(comparisonTemplatesWriteLimiter as never), false);
      assert.notEqual(comparisonTemplatesPreviewLimiter, comparisonTemplatesWriteLimiter);
    });
  });

  describe('mounted at /api/comparison-templates in app', () => {
    let server: Server;
    let baseUrl: string;

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

    it('GET /api/comparison-templates without a token is 401, not a public list', async () => {
      const response = await fetch(`${baseUrl}/api/comparison-templates`);

      assert.equal(response.status, 401);
    });

    it('GET /api/comparison-templates/:id without a token is 401', async () => {
      const response = await fetch(`${baseUrl}/api/comparison-templates/tpl-1`);

      assert.equal(response.status, 401);
    });

    it('applies the 300-request apiLimiter policy to reads', async () => {
      const response = await fetch(`${baseUrl}/api/comparison-templates`);

      assert.match(response.headers.get('ratelimit-policy') ?? '', /^300;/);
    });

    for (const [method, path] of [
      ['POST', '/api/comparison-templates'],
      ['POST', '/api/comparison-templates/preview'],
      ['PATCH', '/api/comparison-templates/tpl-1'],
      ['DELETE', '/api/comparison-templates/tpl-1'],
    ] as const) {
      it(`${method} ${path} without a CSRF token is rejected with 403`, async () => {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          ...(method === 'DELETE' ? {} : { body: JSON.stringify({}) }),
        });

        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: 'CSRF token tidak valid' });
      });
    }

    describe('editor role is forbidden from mutating routes', () => {
      let originalUserFindUnique: typeof prisma.user.findUnique;

      before(() => {
        originalUserFindUnique = prisma.user.findUnique;
        prisma.user.findUnique = (async (args: { where: { id?: string } }) => {
          if (args?.where?.id === 'editor-user-id') {
            return {
              id: 'editor-user-id',
              email: 'editor@manggar.go.id',
              role: { name: 'editor' },
              deletedAt: null,
            };
          }
          return null;
        }) as unknown as typeof prisma.user.findUnique;
      });

      after(() => {
        prisma.user.findUnique = originalUserFindUnique;
      });

      const getCsrf = async (): Promise<{ token: string; cookie: string }> => {
        const res = await fetch(`${baseUrl}/api/auth/csrf-token`);
        const cookie = res.headers.get('set-cookie') ?? '';
        const data = (await res.json()) as { csrfToken: string };
        return { token: data.csrfToken, cookie };
      };

      for (const [method, path] of [
        ['POST', '/api/comparison-templates'],
        ['POST', '/api/comparison-templates/preview'],
        ['PATCH', '/api/comparison-templates/tpl-1'],
        ['DELETE', '/api/comparison-templates/tpl-1'],
      ] as const) {
        it(`${method} ${path} with Editor token is rejected with 403`, async () => {
          const csrf = await getCsrf();
          const editorToken = generateAccessToken({
            id: 'editor-user-id',
            email: 'editor@manggar.go.id',
            role: 'editor',
          });
          const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
              'content-type': 'application/json',
              'x-csrf-token': csrf.token,
              cookie: csrf.cookie,
              authorization: `Bearer ${editorToken}`,
            },
            ...(method === 'DELETE' ? {} : { body: JSON.stringify({}) }),
          });

          assert.equal(response.status, 403);
          assert.deepEqual(await response.json(), {
            error: 'Akses ditolak. Membutuhkan hak akses Admin.',
          });
        });
      }
    });

    it('PATCH /api/comparison-templates/:id returns 409 with code STALE_WRITE and details on stale update', async () => {
      const originalUserFindUnique = prisma.user.findUnique;
      const originalTransaction = prisma.$transaction;
      const updatedAt = new Date('2026-02-01T10:00:00.000Z');

      prisma.user.findUnique = (async (args: { where: { id?: string } }) => {
        if (args?.where?.id === 'admin-user-id') {
          return {
            id: 'admin-user-id',
            email: 'admin@manggar.go.id',
            role: { name: 'admin' },
            deletedAt: null,
          };
        }
        return null;
      }) as unknown as typeof prisma.user.findUnique;

      prisma.$transaction = (async (callback: (tx: unknown) => Promise<unknown>) => {
        const fakeTx = {
          $queryRaw: async () => [],
          comparisonTemplate: {
            findUnique: async () => ({
              id: 'tpl-1',
              slug: 'perbandingan-tahunan',
              label: 'Perbandingan tahunan',
              body: 'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.',
              trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
              trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
              trendTetap: 'tidak berubah',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt,
              _count: { indicators: 0 },
            }),
          },
        };
        return callback(fakeTx);
      }) as unknown as typeof prisma.$transaction;

      try {
        const res = await fetch(`${baseUrl}/api/auth/csrf-token`);
        const cookie = res.headers.get('set-cookie') ?? '';
        const data = (await res.json()) as { csrfToken: string };
        const adminToken = generateAccessToken({
          id: 'admin-user-id',
          email: 'admin@manggar.go.id',
          role: 'admin',
        });

        const response = await fetch(`${baseUrl}/api/comparison-templates/tpl-1`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': data.csrfToken,
            cookie,
            authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            label: 'Judul Baru',
            expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
          }),
        });

        assert.equal(response.status, 409);
        const resBody = (await response.json()) as {
          code: string;
          details: { currentUpdatedAt: string };
        };
        assert.equal(resBody.code, 'STALE_WRITE');
        assert.deepEqual(resBody.details, {
          currentUpdatedAt: updatedAt.toISOString(),
        });
      } finally {
        prisma.user.findUnique = originalUserFindUnique;
        prisma.$transaction = originalTransaction;
      }
    });

    it('rate limiter responds with 429 and Retry-After header when write limit is exceeded', async () => {
      const testApp = express();
      testApp.use((req, _res, next) => {
        (req as unknown as { user: { id: string } }).user = { id: 'rate-limit-exceeded-user' };
        next();
      });
      testApp.use(comparisonTemplatesWriteLimiter);
      testApp.post('/test', (_req, res) => res.json({ ok: true }));

      const testServer = testApp.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => testServer.once('listening', () => resolve()));
      const { port } = testServer.address() as AddressInfo;
      const testUrl = `http://127.0.0.1:${port}/test`;

      try {
        let lastRes: Response | null = null;
        for (let i = 0; i < 101; i++) {
          lastRes = await fetch(testUrl, { method: 'POST' });
          if (lastRes.status === 429) break;
        }
        assert.ok(lastRes);
        assert.equal(lastRes.status, 429);
        const retryAfterHeader = lastRes.headers.get('retry-after');
        assert.ok(retryAfterHeader);
        const retryAfter = Number(retryAfterHeader);
        assert.ok(!Number.isNaN(retryAfter) && retryAfter > 0);
      } finally {
        await new Promise<void>((resolve, reject) =>
          testServer.close((err) => (err ? reject(err) : resolve())),
        );
      }
    });
  });
});
