import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mapsRouter from '../routes/maps.routes.js';
import {
  apiLimiter,
  mapsWriteLimiter,
  indicatorsWriteLimiter,
  indicatorTablesWriteLimiter,
  contentBlocksWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';

interface RouteStackLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

function findRoute(method: string, path: string) {
  const layers = mapsRouter.stack as unknown as RouteStackLayer[];
  return layers.find((layer) => layer.route?.methods?.[method] && layer.route?.path === path);
}

describe('maps.routes wiring', () => {
  it('registers the public GET read routes', () => {
    for (const path of [
      '/points',
      '/points/:id',
      '/rt-leaders',
      '/rt-leaders/:rtNumber',
      '/summary',
    ]) {
      assert.ok(findRoute('get', path), `GET ${path} route must exist`);
    }
  });

  it('registers the spatial point / RT leader write routes', () => {
    assert.ok(findRoute('post', '/points'), 'POST /points route must exist');
    assert.ok(findRoute('patch', '/points/:id'), 'PATCH /points/:id route must exist');
    assert.ok(findRoute('delete', '/points/:id'), 'DELETE /points/:id route must exist');
    assert.ok(findRoute('post', '/points/:id/rts'), 'POST /points/:id/rts route must exist');
    assert.ok(
      findRoute('delete', '/points/:id/rts/:rtNumber'),
      'DELETE /points/:id/rts/:rtNumber route must exist',
    );
    assert.ok(
      findRoute('patch', '/rt-leaders/:rtNumber'),
      'PATCH /rt-leaders/:rtNumber route must exist',
    );
  });

  for (const [method, path] of [
    ['post', '/points'],
    ['patch', '/points/:id'],
    ['delete', '/points/:id'],
    ['post', '/points/:id/rts'],
    ['delete', '/points/:id/rts/:rtNumber'],
    ['patch', '/rt-leaders/:rtNumber'],
  ] as const) {
    it(`must protect ${method.toUpperCase()} ${path} with auth, editor role and the maps write limiter`, () => {
      const layer = findRoute(method, path);
      assert.ok(layer?.route);
      const handles = layer.route.stack.map((s) => s.handle);

      const apiLimiterIndex = handles.indexOf(apiLimiter as never);
      const verifyTokenIndex = handles.indexOf(verifyToken as never);
      const requireRoleIndex = handles.indexOf(requireEditorOrAdmin as never);
      const limiterIndex = handles.indexOf(mapsWriteLimiter as never);

      assert.ok(apiLimiterIndex !== -1, 'apiLimiter must be present at route entry');
      assert.ok(verifyTokenIndex !== -1, 'verifyToken middleware must be present');
      assert.ok(requireRoleIndex !== -1, 'requireEditorOrAdmin middleware must be present');
      assert.ok(limiterIndex !== -1, 'mapsWriteLimiter must be present');
      assert.ok(
        apiLimiterIndex < verifyTokenIndex,
        'apiLimiter must run before verifyToken to rate-limit unauthenticated traffic',
      );
      assert.ok(
        verifyTokenIndex < limiterIndex,
        'verifyToken must run before mapsWriteLimiter so unauthenticated requests do not drain quota',
      );
      assert.ok(
        requireRoleIndex < limiterIndex,
        'requireEditorOrAdmin must run before mapsWriteLimiter so unauthorized requests do not drain quota',
      );
      assert.equal(
        handles.includes(indicatorsWriteLimiter as never),
        false,
        'maps write routes must not share indicatorsWriteLimiter with scalar-figure edits',
      );
      assert.equal(
        handles.includes(indicatorTablesWriteLimiter as never),
        false,
        'maps write routes must not share indicatorTablesWriteLimiter with matrix-table edits',
      );
      assert.equal(
        handles.includes(contentBlocksWriteLimiter as never),
        false,
        'maps write routes must not share contentBlocksWriteLimiter with prose edits',
      );
    });
  }
});
