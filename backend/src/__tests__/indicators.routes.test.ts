import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import indicatorsRouter from '../routes/indicators.routes.js';
import {
  apiLimiter,
  contentBlocksWriteLimiter,
  userManagementWriteLimiter,
  indicatorsWriteLimiter,
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
  const layers = indicatorsRouter.stack as unknown as RouteStackLayer[];
  return layers.find((layer) => layer.route?.methods?.[method] && layer.route?.path === path);
}

describe('indicators.routes wiring', () => {
  it('registers public GET / and GET /:id routes', () => {
    const list = findRoute('get', '/');
    const detail = findRoute('get', '/:id');

    assert.ok(list, 'GET / route must exist');
    assert.ok(detail, 'GET /:id route must exist');
    assert.ok(
      list.route!.stack.map((s) => s.handle).includes(apiLimiter as never),
      'GET / must be rate-limited',
    );
  });

  it('registers POST /, PATCH /:id and DELETE /:id mutation routes', () => {
    assert.ok(findRoute('post', '/'), 'POST / route must exist');
    assert.ok(findRoute('patch', '/:id'), 'PATCH /:id route must exist');
    assert.ok(findRoute('delete', '/:id'), 'DELETE /:id route must exist');
  });

  for (const [method, path] of [
    ['post', '/'],
    ['patch', '/:id'],
    ['delete', '/:id'],
  ] as const) {
    it(`must protect ${method.toUpperCase()} ${path} with auth, editor role and a dedicated limiter`, () => {
      const layer = findRoute(method, path);
      assert.ok(layer?.route);
      const handles = layer.route.stack.map((s) => s.handle);

      const apiLimiterIndex = handles.indexOf(apiLimiter as never);
      const verifyTokenIndex = handles.indexOf(verifyToken as never);
      const requireRoleIndex = handles.indexOf(requireEditorOrAdmin as never);
      const limiterIndex = handles.indexOf(indicatorsWriteLimiter as never);

      assert.ok(apiLimiterIndex !== -1, 'apiLimiter must be present at route entry');
      assert.ok(verifyTokenIndex !== -1, 'verifyToken middleware must be present');
      assert.ok(requireRoleIndex !== -1, 'requireEditorOrAdmin middleware must be present');
      assert.ok(limiterIndex !== -1, 'indicatorsWriteLimiter must be present');
      assert.ok(
        apiLimiterIndex < verifyTokenIndex,
        'apiLimiter must run before verifyToken to rate-limit unauthenticated traffic',
      );
      assert.ok(
        verifyTokenIndex < limiterIndex,
        'verifyToken must run before indicatorsWriteLimiter so unauthenticated requests do not drain quota',
      );
      assert.ok(
        requireRoleIndex < limiterIndex,
        'requireEditorOrAdmin must run before indicatorsWriteLimiter so unauthorized requests do not drain quota',
      );
      assert.equal(
        handles.includes(userManagementWriteLimiter as never),
        false,
        'indicators route must not share userManagementWriteLimiter with admin actions',
      );
      assert.equal(
        handles.includes(contentBlocksWriteLimiter as never),
        false,
        'indicators route must not share contentBlocksWriteLimiter with prose edits',
      );
    });
  }
});
