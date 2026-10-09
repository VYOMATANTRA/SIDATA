import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import settingsRouter from '../routes/settings.routes.js';
import {
  apiLimiter,
  userManagementWriteLimiter,
  settingsWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

interface RouteStackLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

describe('settings.routes PATCH rate limiter ordering', () => {
  const layers = settingsRouter.stack as unknown as RouteStackLayer[];
  const patchLayers = layers.filter((layer) => layer.route?.methods?.patch);

  it('registers the three PATCH routes', () => {
    assert.deepEqual(patchLayers.map((l) => l.route?.path).sort(), [
      '/audit-retention',
      '/public',
      '/weather-config',
    ]);
  });

  for (const path of ['/public', '/audit-retention', '/weather-config']) {
    it(`PATCH ${path}: no shared pre-auth limiter, user-keyed limiter after auth`, () => {
      const layer = patchLayers.find((l) => l.route?.path === path);
      assert.ok(layer?.route);
      const handles = layer.route.stack.map((s) => s.handle);

      assert.equal(
        handles.includes(userManagementWriteLimiter as never),
        false,
        'must not share userManagementWriteLimiter with user management',
      );

      const apiIdx = handles.indexOf(apiLimiter as never);
      const tokenIdx = handles.indexOf(verifyToken as never);
      const roleIdx = handles.indexOf(requireAdmin as never);
      const writeIdx = handles.indexOf(settingsWriteLimiter as never);

      assert.ok(apiIdx !== -1 && tokenIdx !== -1 && roleIdx !== -1 && writeIdx !== -1);
      assert.ok(apiIdx < tokenIdx, 'apiLimiter must throttle before verifyToken');
      assert.ok(tokenIdx < writeIdx, 'verifyToken must run before settingsWriteLimiter');
      assert.ok(roleIdx < writeIdx, 'requireAdmin must run before settingsWriteLimiter');
    });
  }
});
