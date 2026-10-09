import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import contentBlocksRouter from '../routes/contentBlocks.routes.js';
import {
  apiLimiter,
  userManagementWriteLimiter,
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

describe('contentBlocks.routes rate limiter isolation and ordering', () => {
  const routerLayers = contentBlocksRouter.stack as unknown as RouteStackLayer[];
  const patchLayer = routerLayers.find((layer) => layer.route && layer.route.methods?.patch);

  it('ensures PATCH /:slug route is registered', () => {
    assert.ok(patchLayer, 'PATCH /:slug route layer must exist');
    assert.equal(patchLayer.route?.path, '/:slug');
  });

  it('must NOT use shared userManagementWriteLimiter on content blocks mutation', () => {
    assert.ok(patchLayer?.route);
    const handles = patchLayer.route.stack.map((s) => s.handle);

    // Celah yang disorot reviewer: router.patch memakai userManagementWriteLimiter yang dipakai bersama admin
    assert.equal(
      handles.includes(userManagementWriteLimiter as never),
      false,
      'contentBlocks route must not share userManagementWriteLimiter with admin actions',
    );

    // Harus memakai dedicated limiter khusus content blocks
    assert.ok(
      handles.includes(contentBlocksWriteLimiter as never),
      'contentBlocks route must use dedicated contentBlocksWriteLimiter',
    );
  });

  it('must place verifyToken and requireEditorOrAdmin BEFORE contentBlocksWriteLimiter', () => {
    assert.ok(patchLayer?.route);
    const handles = patchLayer.route.stack.map((s) => s.handle);

    const verifyTokenIndex = handles.indexOf(verifyToken as never);
    const requireRoleIndex = handles.indexOf(requireEditorOrAdmin as never);
    const limiterIndex = handles.indexOf(contentBlocksWriteLimiter as never);

    assert.ok(verifyTokenIndex !== -1, 'verifyToken middleware must be present');
    assert.ok(requireRoleIndex !== -1, 'requireEditorOrAdmin middleware must be present');
    assert.ok(limiterIndex !== -1, 'contentBlocksWriteLimiter must be present');

    assert.ok(
      verifyTokenIndex < limiterIndex,
      'verifyToken must run before contentBlocksWriteLimiter so unauthenticated requests do not drain quota',
    );
    assert.ok(
      requireRoleIndex < limiterIndex,
      'requireEditorOrAdmin must run before contentBlocksWriteLimiter so unauthorized requests do not drain quota',
    );
  });

  it('places apiLimiter before verifyToken to protect against unthrottled DoS and satisfy CodeQL', () => {
    assert.ok(patchLayer?.route);
    const handles = patchLayer.route.stack.map((s) => s.handle);

    const apiLimiterIndex = handles.indexOf(apiLimiter as never);
    const verifyTokenIndex = handles.indexOf(verifyToken as never);

    assert.ok(apiLimiterIndex !== -1, 'apiLimiter must be present at route entry');
    assert.ok(
      apiLimiterIndex < verifyTokenIndex,
      'apiLimiter must run before verifyToken to rate-limit unauthenticated traffic',
    );
  });

  it('unauthenticated request is stopped by verifyToken before reaching contentBlocksWriteLimiter', async () => {
    assert.ok(patchLayer?.route);
    const handles = patchLayer.route.stack.map((s) => s.handle);

    // Call verifyToken without auth header -> must return 401 and NOT call next()
    const req = { headers: {}, user: undefined };
    let statusCode: number | null = null;
    let jsonBody: unknown = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: unknown) {
        jsonBody = data;
        return this;
      },
    };

    let nextCalled = false;
    const verifyTokenHandle = handles.find((h) => h === (verifyToken as never));
    assert.ok(verifyTokenHandle, 'verifyToken handler must exist in stack');
    await (verifyTokenHandle as (r: unknown, s: unknown, n: () => void) => Promise<void>)(
      req,
      res,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, false, 'verifyToken must not call next() without valid credentials');
    assert.equal(statusCode, 401, 'verifyToken must return 401 Unauthorized');
    assert.deepEqual(jsonBody, { error: 'Akses ditolak.' });
  });

  it('contentBlocksWriteLimiter boundary test: handles valid requests and throws when connection identity is missing', async () => {
    const validReq = { ip: '127.0.0.1', user: { id: 'editor-42' }, headers: {} };
    const fakeRes = { setHeader: () => {}, getHeader: () => {} };
    let nextCalled = false;
    await new Promise<void>((resolve) => {
      contentBlocksWriteLimiter(validReq as never, fakeRes as never, () => {
        nextCalled = true;
        resolve();
      });
    });
    assert.equal(nextCalled, true);

    const invalidReq = { ip: undefined, user: undefined, headers: {} };
    await assert.rejects(
      async () => {
        await new Promise<void>((resolve, reject) => {
          contentBlocksWriteLimiter(invalidReq as never, fakeRes as never, (err?: unknown) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      { message: 'Identitas koneksi tidak valid' },
    );
  });
});
