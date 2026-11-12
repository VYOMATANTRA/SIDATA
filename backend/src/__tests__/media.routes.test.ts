import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import app from '../app.js';
import mediaRouter from '../routes/media.routes.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { acceptMediaUpload } from '../middlewares/mediaUpload.middleware.js';
import {
  apiLimiter,
  mediaReadLimiter,
  mediaWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';
import { doubleCsrfProtection } from '../middlewares/csrf.middleware.js';
import { uploadMediaHandler } from '../controllers/media.controller.js';

interface RouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
  handle?: unknown;
}

const layers = mediaRouter.stack as unknown as RouteLayer[];
const find = (method: string, routePath: string) =>
  layers.find((l) => l.route?.path === routePath && l.route.methods?.[method]);

describe('media routes: wiring', () => {
  it('registers exactly the four documented routes', () => {
    const routes = layers
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route!.methods ?? {})[0]!.toUpperCase()} ${l.route!.path}`)
      .sort();
    assert.deepEqual(routes, ['GET /:id', 'GET /:id/download', 'GET /:id/preview', 'POST /']);
  });

  it('POST / runs auth, role and the user-keyed limiter BEFORE the multipart transport', () => {
    const layer = find('post', '/');
    assert.ok(layer?.route);
    const handles = layer.route.stack.map((s) => s.handle);
    const idx = (fn: unknown) => handles.indexOf(fn as never);

    assert.ok(idx(apiLimiter) !== -1, 'a per-IP limiter must run before token verification');
    assert.ok(idx(apiLimiter) < idx(verifyToken));
    assert.ok(idx(verifyToken) !== -1 && idx(requireEditorOrAdmin) !== -1);
    assert.ok(idx(mediaWriteLimiter) !== -1 && idx(acceptMediaUpload) !== -1);
    assert.ok(idx(verifyToken) < idx(requireEditorOrAdmin));
    assert.ok(idx(requireEditorOrAdmin) < idx(mediaWriteLimiter));
    assert.ok(idx(mediaWriteLimiter) < idx(acceptMediaUpload));
    assert.ok(idx(acceptMediaUpload) < idx(uploadMediaHandler));
  });

  it('GET /:id/preview is Editor/Admin only; the public routes have no auth', () => {
    const preview = find('get', '/:id/preview')!.route!.stack.map((s) => s.handle);
    assert.ok(preview.includes(verifyToken as never));
    assert.ok(preview.includes(requireEditorOrAdmin as never));
    assert.ok(preview.includes(mediaReadLimiter as never));
    for (const p of ['/:id', '/:id/download']) {
      const handles = find('get', p)!.route!.stack.map((s) => s.handle);
      assert.equal(handles.includes(verifyToken as never), false, `${p} must be public`);
      assert.ok(handles.includes(mediaReadLimiter as never), `${p} must be rate limited`);
    }
  });

  it('exposes no listing or other routes (no directory listing)', () => {
    assert.equal(find('get', '/'), undefined);
    assert.equal(find('delete', '/:id'), undefined);
    assert.equal(find('put', '/:id'), undefined);
  });
});

describe('media routes: CSRF and role enforcement', () => {
  it('the app mounts /api/media AFTER the global CSRF protection', () => {
    const stack = (app as unknown as { router: { stack: RouteLayer[] } }).router.stack;
    const csrfIndex = stack.findIndex((l) => l.handle === doubleCsrfProtection);
    const mediaIndex = stack.findIndex((l) => l.handle === mediaRouter);
    assert.ok(csrfIndex !== -1, 'global CSRF middleware must be registered');
    assert.ok(mediaIndex !== -1, 'media router must be mounted');
    assert.ok(csrfIndex < mediaIndex, 'CSRF must run before any media route');
  });

  it('a mutating upload request without a CSRF token is rejected by the global middleware', async () => {
    const req = {
      method: 'POST',
      url: '/api/media',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      cookies: {},
      ip: '127.0.0.1',
    };
    const error = await new Promise<unknown>((resolve) => {
      doubleCsrfProtection(req as never, {} as never, (err?: unknown) => resolve(err));
    });
    assert.ok(error, 'must call next(err) when the CSRF cookie/header pair is missing');
    assert.equal((error as { code?: string }).code, 'EBADCSRFTOKEN');
  });

  it('a viewer-role user is stopped by requireEditorOrAdmin before the transport runs', () => {
    let status = 0;
    let nextCalled = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    };
    requireEditorOrAdmin({ user: { id: 'u', role: 'user' } } as never, res as never, () => {
      nextCalled = true;
    });
    assert.equal(status, 403);
    assert.equal(nextCalled, false);
  });

  it('an unauthenticated upload is stopped by verifyToken with 401', async () => {
    let status = 0;
    let nextCalled = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await verifyToken({ headers: {} } as never, res as never, () => {
      nextCalled = true;
    });
    assert.equal(status, 401);
    assert.equal(nextCalled, false);
  });

  it('editor and admin pass the role gate', () => {
    for (const role of ['editor', 'Editor', 'admin']) {
      let nextCalled = false;
      requireEditorOrAdmin({ user: { id: 'u', role } } as never, {} as never, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true, `${role} must pass`);
    }
  });
});
