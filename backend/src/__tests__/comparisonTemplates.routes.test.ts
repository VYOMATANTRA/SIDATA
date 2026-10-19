import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, before, after } from 'node:test';
import app from '../app.js';
import comparisonTemplatesRouter from '../routes/comparisonTemplates.routes.js';
import {
  listComparisonTemplatesHandler,
  getComparisonTemplateHandler,
  createComparisonTemplateHandler,
  updateComparisonTemplateHandler,
  deleteComparisonTemplateHandler,
} from '../controllers/comparisonTemplates.controller.js';
import {
  apiLimiter,
  comparisonTemplatesWriteLimiter,
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
  it('registers exactly the five expected routes', () => {
    const layers = (comparisonTemplatesRouter.stack as unknown as RouteStackLayer[]).filter(
      (l) => l.route,
    );
    const registered = layers
      .flatMap((l) => Object.keys(l.route!.methods ?? {}).map((m) => `${m} ${l.route!.path}`))
      .sort();

    assert.deepEqual(registered, ['delete /:id', 'get /', 'get /:id', 'patch /:id', 'post /']);
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
  });
});
