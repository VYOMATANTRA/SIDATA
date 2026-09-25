import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  getAuditRetention,
  updateAuditRetention,
  getPublicSettingsHandler,
  updatePublicSettingsHandler,
} from '../controllers/settings.controller.js';
import {
  invalidatePublicSettingsCache,
  getFastPublicSettings,
  DEFAULT_PUBLIC_SETTINGS,
  PUBLIC_SETTING_KEYS,
} from '../services/settings.service.js';
import {
  getManggarForecast,
  getWeatherCacheKeysForTests,
  resetWeatherCache,
} from '../services/weather.service.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    body: {},
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    ...overrides,
  } as unknown as AuthRequest;
}

/* =========================================================================
 * 1. AUDIT RETENTION SETTINGS: GET
 * "Test the happy path last" — error handling & resilience first
 * ========================================================================= */

describe('settings.controller getAuditRetention', () => {
  it('returns 500 when database query throws an unhandled error', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => {
      throw new Error('Database connection lost');
    }) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getAuditRetention(makeReq(), res as unknown as Response);

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Terjadi kesalahan internal server' });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
    }
  });

  it('defaults every severity to 0 (keep forever) when no settings rows exist', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getAuditRetention(makeReq(), res as unknown as Response);

      assert.equal(res.status, 200);
      assert.deepEqual((res.body as { retention: unknown }).retention, {
        info: 0,
        warning: 0,
        critical: 0,
      });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
    }
  });

  // Happy path last
  it('reads configured values back from database', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'audit.retention_info_days', value: '30' },
      { key: 'audit.retention_warning_days', value: '365' },
      { key: 'audit.retention_critical_days', value: '0' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getAuditRetention(makeReq(), res as unknown as Response);

      assert.equal(res.status, 200);
      assert.deepEqual((res.body as { retention: unknown }).retention, {
        info: 30,
        warning: 365,
        critical: 0,
      });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
    }
  });
});

/* =========================================================================
 * 2. AUDIT RETENTION SETTINGS: UPDATE
 * "Test the happy path last" — boundary conditions & errors first
 * ========================================================================= */

describe('settings.controller updateAuditRetention', () => {
  // --- Boundary & Malformed Payloads ---
  it('rejects null payload', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: null as unknown as Record<string, unknown> }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /Payload pengaturan tidak valid/);
  });

  it('rejects an empty array [] as payload', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: [] as unknown as Record<string, unknown> }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /Payload pengaturan tidak valid/);
  });

  it('rejects primitive strings as payload', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: 'invalid-string' as unknown as Record<string, unknown> }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects payload with unrecognized fields (strict check)', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 10, warning: 20, critical: 30, extra: 'malicious' } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /tidak dikenali/);
  });

  it('rejects null values inside retention fields', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: null, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects empty array values inside retention fields', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: [], warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  // --- Numeric Boundaries (Negative, Decimals, NaN, Infinity, Max Int) ---
  it('rejects a negative retention value for info', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: -1, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /non-negatif/);
  });

  it('rejects a negative retention value for warning', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 10, warning: -5, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects a negative retention value for critical', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 10, warning: 20, critical: -1 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects non-integer retention values (floating point)', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 1.5, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /bilangan bulat/);
  });

  it('rejects NaN retention values', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: NaN, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects Infinity and -Infinity retention values', async () => {
    const res1 = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: Infinity, warning: 10, critical: 20 } }),
      res1 as unknown as Response,
    );
    assert.equal(res1.status, 400);

    const res2 = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 10, warning: -Infinity, critical: 20 } }),
      res2 as unknown as Response,
    );
    assert.equal(res2.status, 400);
  });

  it('rejects retention exceeding maximum allowable days (36500 / 100 years)', async () => {
    const res1 = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 36501, warning: 36501, critical: 36501 } }),
      res1 as unknown as Response,
    );
    assert.equal(res1.status, 400);
    assert.match(String((res1.body as { error: string }).error), /maksimal 36500 hari/);

    const res2 = fakeRes();
    await updateAuditRetention(
      makeReq({
        body: {
          info: Number.MAX_SAFE_INTEGER,
          warning: Number.MAX_SAFE_INTEGER,
          critical: Number.MAX_SAFE_INTEGER,
        },
      }),
      res2 as unknown as Response,
    );
    assert.equal(res2.status, 400);
  });

  // --- Business Logic Inversions ---
  it('rejects an ordering where a less severe level outlives a more severe one', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 10, warning: 90, critical: 30 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(
      String((res.body as { error: string }).error),
      /critical harus >= warning >= info/,
    );
  });

  it('rejects infinite info retention paired with finite critical retention', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 0, warning: 10, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('rejects infinite warning retention paired with finite critical retention', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ body: { info: 5, warning: 0, critical: 20 } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  // --- Auth & Error Handling ---
  it('returns 401 with no authenticated actor', async () => {
    const res = fakeRes();
    await updateAuditRetention(
      makeReq({ user: undefined } as unknown as Partial<AuthRequest>),
      res as unknown as Response,
    );
    assert.equal(res.status, 401);
  });

  it('returns 500 when transaction execution fails', async () => {
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = (async () => {
      throw new Error('Database transaction lock timeout');
    }) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      await updateAuditRetention(
        makeReq({ body: { info: 10, warning: 20, critical: 30 } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Terjadi kesalahan internal server' });
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });

  // --- Happy Path (Tested Last) ---
  it('accepts valid upper boundary retention of 36500 days', async () => {
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalAuditCreate = prisma.auditLog.create;

    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected function transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;
    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;
    prisma.systemSetting.upsert = (async (args: { create: Record<string, unknown> }) => ({
      ...args.create,
      updatedAt: new Date(),
    })) as unknown as typeof prisma.systemSetting.upsert;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => ({
      id: 'audit-1',
      ...args.data,
    })) as unknown as typeof prisma.auditLog.create;

    try {
      const res = fakeRes();
      await updateAuditRetention(
        makeReq({ body: { info: 36500, warning: 36500, critical: 36500 } }),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.deepEqual((res.body as { retention: unknown }).retention, {
        info: 36500,
        warning: 36500,
        critical: 36500,
      });
    } finally {
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.auditLog.create = originalAuditCreate;
    }
  });

  it('accepts 0 (infinite) at the more-severe end of the ordering', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalAuditCreate = prisma.auditLog.create;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;

    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;
    let upsertCount = 0;
    prisma.systemSetting.upsert = (async (args: { create: Record<string, unknown> }) => {
      upsertCount += 1;
      return { ...args.create, updatedAt: new Date() };
    }) as unknown as typeof prisma.systemSetting.upsert;
    let auditCreateCount = 0;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => {
      auditCreateCount += 1;
      return { id: 'audit-1', ...args.data };
    }) as unknown as typeof prisma.auditLog.create;
    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    try {
      const res = fakeRes();
      await updateAuditRetention(
        makeReq({ body: { info: 5, warning: 0, critical: 0 } }),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.equal(upsertCount, 3);
      assert.equal(auditCreateCount, 1);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.auditLog.create = originalAuditCreate;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
    }
  });

  it('writes a critical-severity audit log with before/after values on a valid change', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;

    prisma.systemSetting.findMany = (async () => [
      { key: 'audit.retention_info_days', value: '7' },
      { key: 'audit.retention_warning_days', value: '30' },
      { key: 'audit.retention_critical_days', value: '0' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    prisma.systemSetting.upsert = (async (args: { create: Record<string, unknown> }) => ({
      ...args.create,
      updatedAt: new Date(),
    })) as unknown as typeof prisma.systemSetting.upsert;

    let auditLogged: Record<string, unknown> | undefined;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => {
      auditLogged = args.data;
      return { id: 'audit-1', ...args.data };
    }) as unknown as typeof prisma.auditLog.create;
    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    try {
      const res = fakeRes();
      await updateAuditRetention(
        makeReq({ body: { info: 14, warning: 30, critical: 0 } }),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.equal(auditLogged?.action, 'settings.audit_retention_changed');
      assert.equal(auditLogged?.severity, 'critical');
      const metadata = auditLogged?.metadata as { before: unknown; after: unknown };
      assert.deepEqual(metadata.before, { info: 7, warning: 30, critical: 0 });
      assert.deepEqual(metadata.after, { info: 14, warning: 30, critical: 0 });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
      prisma.auditLog.create = originalAuditCreate;
    }
  });
});

/* =========================================================================
 * 3. PUBLIC PORTAL SETTINGS: GET
 * "Test the happy path last" — error handling, edge cases & resilience first
 * ========================================================================= */

describe('settings.controller getPublicSettingsHandler', () => {
  it('returns 500 when database throws an error', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => {
      throw new Error('Database connection failed');
    }) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getPublicSettingsHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Terjadi kesalahan internal server' });
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('falls back safely to default coordinates if stored JSON is corrupt syntax', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'public.default_coordinates', value: 'invalid-json{{{' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getPublicSettingsHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 200);
      const settings = (res.body as { settings: { defaultCoordinates: unknown } }).settings;
      assert.deepEqual(settings.defaultCoordinates, DEFAULT_PUBLIC_SETTINGS.defaultCoordinates);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('falls back safely to default coordinates if stored JSON has out-of-bounds coordinates', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'public.default_coordinates', value: '{"lat": 999, "lon": 0, "zoom": 0}' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getPublicSettingsHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 200);
      const settings = (res.body as { settings: { defaultCoordinates: unknown } }).settings;
      assert.deepEqual(settings.defaultCoordinates, DEFAULT_PUBLIC_SETTINGS.defaultCoordinates);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('falls back safely to default coordinates if stored JSON is null or empty array', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'public.default_coordinates', value: 'null' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getPublicSettingsHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 200);
      const settings = (res.body as { settings: { defaultCoordinates: unknown } }).settings;
      assert.deepEqual(settings.defaultCoordinates, DEFAULT_PUBLIC_SETTINGS.defaultCoordinates);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('prevents cache pollution: mutating retrieved object does not mutate the in-memory cache', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'public.app_name', value: 'Original Name' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res1 = fakeRes();
      await getPublicSettingsHandler({} as Request, res1 as unknown as Response);
      const settings1 = (
        res1.body as { settings: { appName: string; defaultCoordinates: { lat: number } } }
      ).settings;

      // Attempt to mutate the returned object
      settings1.appName = 'Hacked App Name';
      settings1.defaultCoordinates.lat = 88.88;

      // Next call served from cache
      const res2 = fakeRes();
      await getPublicSettingsHandler({} as Request, res2 as unknown as Response);
      const settings2 = (
        res2.body as { settings: { appName: string; defaultCoordinates: { lat: number } } }
      ).settings;

      assert.equal(
        settings2.appName,
        'Original Name',
        'cache appName should not have been mutated',
      );
      assert.equal(
        settings2.defaultCoordinates.lat,
        DEFAULT_PUBLIC_SETTINGS.defaultCoordinates.lat,
        'cache defaultCoordinates should not have been mutated',
      );
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  // Happy path last
  it('returns default settings when no rows exist in database', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getPublicSettingsHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.deepEqual((res.body as { settings: unknown }).settings, DEFAULT_PUBLIC_SETTINGS);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('reads configured public settings and excludes internal/retention settings', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'public.app_name', value: 'Custom SIDATA' },
      { key: 'public.institution_name', value: 'Kelurahan Manggar Baru' },
      { key: 'public.contact_phone', value: '081299998888' },
      { key: 'audit.retention_critical_days', value: '365' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getPublicSettingsHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 200);
      const settings = (res.body as { settings: Record<string, unknown> }).settings;
      assert.equal(settings.appName, 'Custom SIDATA');
      assert.equal(settings.institutionName, 'Kelurahan Manggar Baru');
      assert.equal(settings.contactPhone, '081299998888');
      assert.equal(settings.tagline, DEFAULT_PUBLIC_SETTINGS.tagline);
      assert.equal('audit.retention_critical_days' in settings, false);
      assert.equal('retention' in settings, false);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('falls back to DEFAULT_PUBLIC_SETTINGS if stored appName or institutionName is empty string or whitespace in database', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    prisma.systemSetting.findMany = (async () => [
      { key: 'public.app_name', value: '   ' },
      { key: 'public.institution_name', value: '' },
      { key: 'public.weather_adm4', value: '   ' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res = fakeRes();
      await getPublicSettingsHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 200);
      const settings = (res.body as { settings: Record<string, unknown> }).settings;
      assert.equal(settings.appName, DEFAULT_PUBLIC_SETTINGS.appName);
      assert.equal(settings.institutionName, DEFAULT_PUBLIC_SETTINGS.institutionName);
      assert.equal(settings.weatherAdm4, DEFAULT_PUBLIC_SETTINGS.weatherAdm4);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('serves cached result on subsequent calls without querying DB again', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    let queryCount = 0;
    prisma.systemSetting.findMany = (async () => {
      queryCount += 1;
      return [{ key: 'public.app_name', value: 'Cached Portal' }];
    }) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res1 = fakeRes();
      await getPublicSettingsHandler({} as Request, res1 as unknown as Response);
      assert.equal(queryCount, 1);

      const res2 = fakeRes();
      await getPublicSettingsHandler({} as Request, res2 as unknown as Response);
      assert.equal(queryCount, 1, 'second call should hit in-memory cache');
      assert.equal(
        (res2.body as { settings: { appName: string } }).settings.appName,
        'Cached Portal',
      );
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('does not cache stale data if invalidatePublicSettingsCache was called during in-flight query execution (TOCTOU race prevention)', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    let queryCount = 0;
    prisma.systemSetting.findMany = (async () => {
      queryCount += 1;
      // Simulate cache invalidation / admin update happening while query is in-flight
      invalidatePublicSettingsCache();
      return [{ key: 'public.app_name', value: 'Stale Portal' }];
    }) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res1 = fakeRes();
      await getPublicSettingsHandler({} as Request, res1 as unknown as Response);
      assert.equal(queryCount, 1);

      // Since invalidation happened in-flight, stale result must NOT be cached.
      // Next call must re-query the DB.
      const res2 = fakeRes();
      await getPublicSettingsHandler({} as Request, res2 as unknown as Response);
      assert.equal(
        queryCount,
        2,
        'second call must re-query DB because in-flight invalidation discarded cache write',
      );
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });
});

/* =========================================================================
 * 3b. PUBLIC PORTAL SETTINGS: FAST BOUNDED LOOKUP (getFastPublicSettings)
 * ========================================================================= */

describe('settings.service getFastPublicSettings', () => {
  it('serves warm cached result in 0ms without querying database', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    let queryCount = 0;

    prisma.systemSetting.findMany = (async () => {
      queryCount += 1;
      return [{ key: 'public.app_name', value: 'Warm Fast App' }];
    }) as unknown as typeof prisma.systemSetting.findMany;

    try {
      // 1. First call warms the cache
      const res1 = await getFastPublicSettings();
      assert.equal(res1.appName, 'Warm Fast App');
      assert.equal(queryCount, 1);

      // 2. Second call must return immediately from cache even if findMany would throw
      prisma.systemSetting.findMany = (() => {
        throw new Error('Database should not be accessed on warm cache');
      }) as unknown as typeof prisma.systemSetting.findMany;

      const res2 = await getFastPublicSettings();
      assert.equal(res2.appName, 'Warm Fast App');
      assert.equal(queryCount, 1, 'warm cache lookup must not invoke DB');
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('fetches fresh settings from DB when cache is cold', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;

    prisma.systemSetting.findMany = (async () => [
      { key: 'public.app_name', value: 'Cold Fast App' },
      { key: 'public.weather_adm4', value: '64.71.01.2002' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const settings = await getFastPublicSettings();
      assert.equal(settings.appName, 'Cold Fast App');
      assert.equal(settings.weatherAdm4, '64.71.01.2002');
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('aborts and falls back to last-known-good settings when DB query exceeds timeoutMs', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;

    // Simulate slow database (500ms delay)
    prisma.systemSetting.findMany = (() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve([{ key: 'public.app_name', value: 'Too Slow App' }]);
        }, 500);
      });
    }) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const start = Date.now();
      const settings = await getFastPublicSettings({ timeoutMs: 50 });
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 300, `Expected elapsed time < 300ms, got ${elapsed}ms`);
      assert.equal(
        settings.appName,
        DEFAULT_PUBLIC_SETTINGS.appName,
        'Should fall back to default appName on timeout',
      );
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('returns deep clone preventing mutation from polluting internal state', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;

    prisma.systemSetting.findMany = (async () => [
      { key: 'public.app_name', value: 'Immutable App' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    try {
      const res1 = await getFastPublicSettings();
      res1.appName = 'HACKED_NAME';

      const res2 = await getFastPublicSettings();
      assert.equal(res2.appName, 'Immutable App', 'Internal state must not be mutated');
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });

  it('boundary testing: safely handles non-positive numbers, NaN, and integer overflow for timeoutMs', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;

    prisma.systemSetting.findMany = (async () => [
      { key: 'public.app_name', value: 'Boundary App' },
    ]) as unknown as typeof prisma.systemSetting.findMany;

    const invalidTimeouts = [
      0,
      -1,
      -100,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER,
      2_147_483_648,
      0.5,
      '' as unknown as number,
      [] as unknown as number,
      {} as unknown as number,
      null as unknown as number,
      undefined as unknown as number,
    ];

    try {
      for (const badTimeout of invalidTimeouts) {
        invalidatePublicSettingsCache();
        const settings = await getFastPublicSettings({ timeoutMs: badTimeout });
        assert.equal(settings.appName, 'Boundary App');
      }
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      invalidatePublicSettingsCache();
    }
  });
});

/* =========================================================================
 * 4. PUBLIC PORTAL SETTINGS: UPDATE
 * "Test the happy path last" — boundary conditions, sanity checks & errors first
 * ========================================================================= */

describe('settings.controller updatePublicSettingsHandler', () => {
  // --- Boundary & Malformed Inputs ---
  it('returns 400 when payload is null', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: null as unknown as Record<string, unknown> }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /Payload pengaturan tidak valid/);
  });

  it('returns 400 when payload is an empty array []', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: [] as unknown as Record<string, unknown> }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /Payload pengaturan tidak valid/);
  });

  it('returns 400 when payload is an array with objects', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: [{ appName: 'Portal' }] as unknown as Record<string, unknown> }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('returns 400 when payload is a primitive string or number', async () => {
    const res1 = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: 'invalid-string' as unknown as Record<string, unknown> }),
      res1 as unknown as Response,
    );
    assert.equal(res1.status, 400);

    const res2 = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: 12345 as unknown as Record<string, unknown> }),
      res2 as unknown as Response,
    );
    assert.equal(res2.status, 400);
  });

  it('returns 400 when payload is an empty object {}', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(makeReq({ body: {} }), res as unknown as Response);
    assert.equal(res.status, 400);
    assert.match(
      String((res.body as { error: string }).error),
      /Setidaknya satu bidang pengaturan harus dikirimkan/,
    );
  });

  it('returns 400 when unrecognized fields are provided (strict schema check)', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { appName: 'SIDATA', unknownKey: 'malicious', adminRole: 'superadmin' } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /tidak dikenali/);
  });

  // --- Required Core Field Boundaries (appName, institutionName) ---
  it('returns 400 when appName is null', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { appName: null as unknown as string } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('returns 400 when appName is an empty string or whitespace only', async () => {
    const res1 = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { appName: '' } }),
      res1 as unknown as Response,
    );
    assert.equal(res1.status, 400);
    assert.match(String((res1.body as { error: string }).error), /tidak boleh kosong/);

    const res2 = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { appName: '    ' } }),
      res2 as unknown as Response,
    );
    assert.equal(res2.status, 400);
    assert.match(String((res2.body as { error: string }).error), /tidak boleh kosong/);
  });

  it('returns 400 when appName exceeds 100 characters', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { appName: 'A'.repeat(101) } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /maksimal 100 karakter/);
  });

  it('returns 400 when institutionName is null', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { institutionName: null as unknown as string } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
  });

  it('returns 400 when institutionName is empty string or whitespace only', async () => {
    const res1 = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { institutionName: '' } }),
      res1 as unknown as Response,
    );
    assert.equal(res1.status, 400);
    assert.match(String((res1.body as { error: string }).error), /tidak boleh kosong/);

    const res2 = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { institutionName: '   \t  ' } }),
      res2 as unknown as Response,
    );
    assert.equal(res2.status, 400);
    assert.match(String((res2.body as { error: string }).error), /tidak boleh kosong/);
  });

  it('returns 400 when institutionName exceeds 150 characters', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { institutionName: 'B'.repeat(151) } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /maksimal 150 karakter/);
  });

  // --- Anti-XSS & Injection Sanity Checks ---
  it('returns 400 when text fields contain HTML characters < or >', async () => {
    const maliciousCases = [
      { field: 'appName', value: '<script>alert(1)</script>' },
      { field: 'appName', value: 'Portal > Admin' },
      { field: 'institutionName', value: 'Kelurahan <img src=x onerror=alert(1)>' },
      { field: 'tagline', value: '<b>Slogan Tebal</b>' },
      { field: 'administrativeArea', value: 'Wilayah <script src="evil.js">' },
      { field: 'contactAddress', value: 'Jl. Pemuda <iframe src="evil.com"></iframe>' },
    ];

    for (const testCase of maliciousCases) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { [testCase.field]: testCase.value } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400, `Expected 400 for ${testCase.field} containing HTML tags`);
      assert.match(
        String((res.body as { error: string }).error),
        /tidak boleh mengandung karakter < atau >/,
      );
    }
  });

  it('returns 400 when single-line text fields contain CRLF newlines (anti-header-injection)', async () => {
    const crlfCases = [
      { field: 'appName', value: 'Portal\r\nBcc: evil@attacker.com' },
      { field: 'appName', value: 'Portal\nInjection' },
      { field: 'institutionName', value: 'Kelurahan\r\nManggar' },
      { field: 'tagline', value: 'Tagline\nBaru' },
      { field: 'administrativeArea', value: 'Wilayah\r\nBaru' },
    ];

    for (const testCase of crlfCases) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { [testCase.field]: testCase.value } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400, `Expected 400 for ${testCase.field} containing CRLF`);
      assert.match(String((res.body as { error: string }).error), /baris baru/);
    }
  });

  // --- Clearable / Optional Fields Boundaries ---
  it('returns 400 when tagline exceeds 255 characters', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { tagline: 'C'.repeat(256) } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /maksimal 255 karakter/);
  });

  it('returns 400 when administrativeArea exceeds 255 characters', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { administrativeArea: 'D'.repeat(256) } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /maksimal 255 karakter/);
  });

  it('returns 400 when contactAddress exceeds 500 characters', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { contactAddress: 'E'.repeat(501) } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /maksimal 500 karakter/);
  });

  it('returns 400 when phone or WhatsApp contains letters, SQL injection, or punctuation without digits', async () => {
    const invalidPhoneCases = [
      'telepon-palsu-123',
      '0812; DROP TABLE users;',
      'whatsapp:hack',
      '0812@3456',
      '0812#9999',
      '+',
      '---',
      '(   )',
      '++--',
    ];

    for (const invalidPhone of invalidPhoneCases) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { contactPhone: invalidPhone } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400);
      assert.match(
        String((res.body as { error: string }).error),
        /Format nomor telepon tidak valid/,
      );
    }
  });

  it('returns 400 when contactEmail format is invalid', async () => {
    const invalidEmails = ['not-an-email', 'admin@', '@domain.com', 'admin@domain..com'];

    for (const invalidEmail of invalidEmails) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { contactEmail: invalidEmail } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400);
      assert.match(
        String((res.body as { error: string }).error),
        /Format email kontak tidak valid/,
      );
    }
  });

  // --- Coordinates Boundary Condition Testing ---
  it('returns 400 when latitude is out of bounds (lat < -90 or lat > 90)', async () => {
    const outOfBoundsLat = [-90.0001, -91, -1000, 90.0001, 91, 1000];

    for (const lat of outOfBoundsLat) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { defaultCoordinates: { lat, lon: 116.9, zoom: 13 } } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400, `Expected 400 for lat = ${lat}`);
      assert.match(
        String((res.body as { error: string }).error),
        /Latitude harus di antara -90 dan 90/,
      );
    }
  });

  it('returns 400 when longitude is out of bounds (lon < -180 or lon > 180)', async () => {
    const outOfBoundsLon = [-180.0001, -181, -200, 180.0001, 181, 200];

    for (const lon of outOfBoundsLon) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { defaultCoordinates: { lat: -1.2, lon, zoom: 13 } } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400, `Expected 400 for lon = ${lon}`);
      assert.match(
        String((res.body as { error: string }).error),
        /Longitude harus di antara -180 dan 180/,
      );
    }
  });

  it('returns 400 when latitude or longitude is not finite (NaN, Infinity, -Infinity)', async () => {
    const nonFiniteCases = [
      { lat: NaN, lon: 116.9, zoom: 13 },
      { lat: Infinity, lon: 116.9, zoom: 13 },
      { lat: -Infinity, lon: 116.9, zoom: 13 },
      { lat: -1.2, lon: NaN, zoom: 13 },
      { lat: -1.2, lon: Infinity, zoom: 13 },
      { lat: -1.2, lon: -Infinity, zoom: 13 },
    ];

    for (const coords of nonFiniteCases) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { defaultCoordinates: coords } }),
        res as unknown as Response,
      );
      assert.equal(
        res.status,
        400,
        `Expected 400 for non-finite coordinates ${JSON.stringify(coords)}`,
      );
    }
  });

  it('returns 400 when zoom is out of bounds (zoom < 1 or zoom > 20)', async () => {
    // Zoom 0 is a critical boundary condition: min is 1
    const outOfBoundsZoom = [0, -1, -10, 21, 50, Number.MAX_SAFE_INTEGER];

    for (const zoom of outOfBoundsZoom) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { defaultCoordinates: { lat: -1.2, lon: 116.9, zoom } } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400, `Expected 400 for zoom = ${zoom}`);
    }
  });

  it('returns 400 when zoom is a floating point number (must be integer)', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ body: { defaultCoordinates: { lat: -1.2, lon: 116.9, zoom: 13.5 } } }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /Zoom harus berupa bilangan bulat/);
  });

  it('returns 400 when defaultCoordinates contains unrecognized properties', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({
        body: {
          defaultCoordinates: { lat: -1.2, lon: 116.9, zoom: 13, extraField: 'unauthorized' },
        },
      }),
      res as unknown as Response,
    );
    assert.equal(res.status, 400);
    assert.match(
      String((res.body as { error: string }).error),
      /bidang koordinat yang tidak dikenali/,
    );
  });

  it('returns 400 when defaultCoordinates is empty object {} or missing required fields', async () => {
    const partialCoordinates = [
      {},
      { lat: -1.2 },
      { lon: 116.9 },
      { zoom: 13 },
      { lat: -1.2, lon: 116.9 },
    ];

    for (const coords of partialCoordinates) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({
          body: {
            defaultCoordinates: coords as unknown as { lat: number; lon: number; zoom: number },
          },
        }),
        res as unknown as Response,
      );
      assert.equal(
        res.status,
        400,
        `Expected 400 for partial coordinates: ${JSON.stringify(coords)}`,
      );
    }
  });

  it('returns 400 when weatherAdm4 format is invalid', async () => {
    const invalidWeatherAdm4 = ['64.71.01', '64.71.01.10011', '64-71-01-1001', '64.71.AB.1001', ''];

    for (const code of invalidWeatherAdm4) {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { weatherAdm4: code } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 400, `Expected 400 for weatherAdm4 = ${code}`);
      assert.match(
        String((res.body as { error: string }).error),
        /Format kode adm4 BMKG tidak valid/,
      );
    }
  });

  // --- Auth & Error Handling ---
  it('returns 401 when actor is not authenticated', async () => {
    const res = fakeRes();
    await updatePublicSettingsHandler(
      makeReq({ user: undefined } as unknown as Partial<AuthRequest>),
      res as unknown as Response,
    );
    assert.equal(res.status, 401);
  });

  it('returns 500 when transaction execution fails', async () => {
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = (async () => {
      throw new Error('Database transaction lock timeout');
    }) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { appName: 'SIDATA Manggar' } }),
        res as unknown as Response,
      );
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Terjadi kesalahan internal server' });
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });

  // --- Happy Path (Tested Last) ---
  it('accepts exact coordinate boundaries (lat: -90, 90, 0; lon: -180, 180, 0; zoom: 1, 20)', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;

    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;
    prisma.systemSetting.upsert = (async (args: { create: Record<string, unknown> }) => ({
      ...args.create,
      updatedAt: new Date(),
    })) as unknown as typeof prisma.systemSetting.upsert;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => ({
      id: 'audit-test',
      ...args.data,
    })) as unknown as typeof prisma.auditLog.create;
    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    try {
      // Test exact min boundaries
      const resMin = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { defaultCoordinates: { lat: -90, lon: -180, zoom: 1 } } }),
        resMin as unknown as Response,
      );
      assert.equal(resMin.status, 200);

      // Test exact max boundaries
      const resMax = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { defaultCoordinates: { lat: 90, lon: 180, zoom: 20 } } }),
        resMax as unknown as Response,
      );
      assert.equal(resMax.status, 200);

      // Test exact zero boundaries
      const resZero = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { defaultCoordinates: { lat: 0, lon: 0, zoom: 10 } } }),
        resZero as unknown as Response,
      );
      assert.equal(resZero.status, 200);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.auditLog.create = originalAuditCreate;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
    }
  });

  it('accepts clearing optional fields with null (transforms to empty string)', async () => {
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;

    const upsertedValues = new Map<string, string>();
    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;
    prisma.systemSetting.upsert = (async (args: { create: { key: string; value: string } }) => {
      upsertedValues.set(args.create.key, args.create.value);
      return { ...args.create, updatedAt: new Date() };
    }) as unknown as typeof prisma.systemSetting.upsert;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => ({
      id: 'audit-test',
      ...args.data,
    })) as unknown as typeof prisma.auditLog.create;
    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    try {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({
          body: {
            tagline: null,
            administrativeArea: null,
            contactPhone: null,
            contactWhatsapp: null,
            contactEmail: null,
            contactAddress: null,
          },
        }),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.equal(upsertedValues.get('public.tagline'), '');
      assert.equal(upsertedValues.get('public.administrative_area'), '');
      assert.equal(upsertedValues.get('public.contact_phone'), '');
      assert.equal(upsertedValues.get('public.contact_whatsapp'), '');
      assert.equal(upsertedValues.get('public.contact_email'), '');
      assert.equal(upsertedValues.get('public.contact_address'), '');
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.auditLog.create = originalAuditCreate;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
    }
  });

  it('successfully updates settings, invalidates cache, and writes audit log with diff', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;

    const stored = new Map<string, string>();
    prisma.systemSetting.findMany = (async () => {
      return Array.from(stored.entries()).map(([key, value]) => ({ key, value }));
    }) as unknown as typeof prisma.systemSetting.findMany;

    prisma.systemSetting.upsert = (async (args: { create: { key: string; value: string } }) => {
      stored.set(args.create.key, args.create.value);
      return { ...args.create, updatedAt: new Date() };
    }) as unknown as typeof prisma.systemSetting.upsert;

    let auditLogged: Record<string, unknown> | undefined;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => {
      auditLogged = args.data;
      return { id: 'audit-2', ...args.data };
    }) as unknown as typeof prisma.auditLog.create;

    let capturedLockQuery: unknown;
    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async (query: unknown) => {
      capturedLockQuery = query;
      return [];
    }) as unknown as typeof prisma.$queryRaw;

    try {
      const res = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({
          body: {
            appName: 'SIDATA Manggar Updated',
            contactPhone: '081122334455',
            defaultCoordinates: { lat: -1.23, lon: 116.95, zoom: 14 },
          },
        }),
        res as unknown as Response,
      );

      assert.equal(res.status, 200);
      assert.equal(auditLogged?.action, 'settings.public_updated');
      assert.equal(auditLogged?.severity, 'info');

      // Verify that lockQuery targets ONLY the updated keys in deterministic sorted order
      const lockSql = capturedLockQuery as { values: unknown[] };
      assert.deepEqual(
        lockSql.values,
        [
          PUBLIC_SETTING_KEYS.appName,
          PUBLIC_SETTING_KEYS.contactPhone,
          PUBLIC_SETTING_KEYS.defaultCoordinates,
        ].sort(),
      );

      const metadata = auditLogged?.metadata as {
        before: { appName: string };
        after: { appName: string; contactPhone: string };
        changedFields: string[];
      };
      assert.equal(metadata.before.appName, DEFAULT_PUBLIC_SETTINGS.appName);
      assert.equal(metadata.after.appName, 'SIDATA Manggar Updated');
      assert.equal(metadata.after.contactPhone, '081122334455');
      assert.deepEqual(
        metadata.changedFields.sort(),
        ['appName', 'contactPhone', 'defaultCoordinates'].sort(),
      );

      // Check that cache was invalidated and reflects updated values
      const getRes = fakeRes();
      await getPublicSettingsHandler({} as Request, getRes as unknown as Response);
      const fetched = (getRes.body as { settings: { appName: string; contactPhone: string } })
        .settings;
      assert.equal(fetched.appName, 'SIDATA Manggar Updated');
      assert.equal(fetched.contactPhone, '081122334455');
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
      prisma.auditLog.create = originalAuditCreate;
      invalidatePublicSettingsCache();
    }
  });

  it('evicts previous weather cache entry when weatherAdm4 is updated, but preserves weather cache when weatherAdm4 is unchanged', async () => {
    resetWeatherCache();
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;
    const originalFetch = globalThis.fetch;

    // Seed BMKG fetch mock
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          lokasi: { desa: 'Manggar', lat: -1.2, lon: 116.9 },
          data: [{ cuaca: [] }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    // Warm weather cache with default adm4 ('64.71.01.1001')
    await getManggarForecast('64.71.01.1001');
    assert.ok(getWeatherCacheKeysForTests().includes('64.71.01.1001'));

    const stored = new Map<string, string>([['public.weather_adm4', '64.71.01.1001']]);
    prisma.systemSetting.findMany = (async () => {
      return Array.from(stored.entries()).map(([key, value]) => ({ key, value }));
    }) as unknown as typeof prisma.systemSetting.findMany;
    prisma.systemSetting.upsert = (async (args: { create: { key: string; value: string } }) => {
      stored.set(args.create.key, args.create.value);
      return { ...args.create, updatedAt: new Date() };
    }) as unknown as typeof prisma.systemSetting.upsert;
    prisma.auditLog.create = (async () => ({
      id: 'audit-weather',
    })) as unknown as typeof prisma.auditLog.create;
    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    try {
      // 1. Update unrelated setting (appName): weather cache for 64.71.01.1001 MUST NOT be evicted
      const res1 = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { appName: 'Brand New Portal' } }),
        res1 as unknown as Response,
      );
      assert.equal(res1.status, 200);
      assert.ok(
        getWeatherCacheKeysForTests().includes('64.71.01.1001'),
        'Unrelated setting update must keep weather cache intact',
      );

      // 2. Update weatherAdm4 to a new code ('64.71.02.2002'): old code ('64.71.01.1001') MUST be evicted
      const res2 = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({ body: { weatherAdm4: '64.71.02.2002' } }),
        res2 as unknown as Response,
      );
      assert.equal(res2.status, 200);
      assert.equal(
        getWeatherCacheKeysForTests().includes('64.71.01.1001'),
        false,
        'Old weatherAdm4 must be evicted from weather cache upon setting change',
      );
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
      prisma.auditLog.create = originalAuditCreate;
      globalThis.fetch = originalFetch;
      resetWeatherCache();
      invalidatePublicSettingsCache();
    }
  });

  it('returns current settings without writing audit log, upserting rows, or invalidating cache when no fields changed (no-op)', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;

    const stored = new Map<string, string>([
      [PUBLIC_SETTING_KEYS.appName, 'Current App Name'],
      [PUBLIC_SETTING_KEYS.contactPhone, '081234567890'],
      [
        PUBLIC_SETTING_KEYS.defaultCoordinates,
        JSON.stringify({ lat: -1.23, lon: 116.95, zoom: 14 }),
      ],
    ]);

    prisma.systemSetting.findMany = (async () => {
      return Array.from(stored.entries()).map(([key, value]) => ({ key, value }));
    }) as unknown as typeof prisma.systemSetting.findMany;

    let upsertCalled = false;
    prisma.systemSetting.upsert = (async () => {
      upsertCalled = true;
      return { key: 'mock', value: 'mock', updatedAt: new Date() };
    }) as unknown as typeof prisma.systemSetting.upsert;

    let auditCreated = false;
    prisma.auditLog.create = (async () => {
      auditCreated = true;
      return { id: 'audit-noop' };
    }) as unknown as typeof prisma.auditLog.create;

    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    try {
      // 1. Warm cache first
      const warmRes = fakeRes();
      await getPublicSettingsHandler({} as Request, warmRes as unknown as Response);
      assert.equal(warmRes.status, 200);

      // 2. Submit identical values to PATCH /api/settings/public
      const updateRes = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({
          body: {
            appName: 'Current App Name',
            contactPhone: '081234567890',
            defaultCoordinates: { lat: -1.23, lon: 116.95, zoom: 14 },
          },
        }),
        updateRes as unknown as Response,
      );

      assert.equal(updateRes.status, 200);
      assert.equal(
        (updateRes.body as { settings: { appName: string } }).settings.appName,
        'Current App Name',
      );
      assert.equal(upsertCalled, false, 'No DB upsert should be performed on no-op');
      assert.equal(auditCreated, false, 'No audit log should be written on no-op');

      // 3. Verify publicSettingsCache was NOT invalidated (still serves cached data without calling findMany)
      prisma.systemSetting.findMany = (async () => {
        throw new Error('DB findMany should not be called if cache was preserved');
      }) as unknown as typeof prisma.systemSetting.findMany;

      const getCachedRes = fakeRes();
      await getPublicSettingsHandler({} as Request, getCachedRes as unknown as Response);
      assert.equal(getCachedRes.status, 200);
      assert.equal(
        (getCachedRes.body as { settings: { appName: string } }).settings.appName,
        'Current App Name',
      );
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
      prisma.auditLog.create = originalAuditCreate;
      invalidatePublicSettingsCache();
    }
  });

  it('treats nested object settings with reordered keys as identical (no-op)', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;

    const stored = new Map<string, string>([
      [PUBLIC_SETTING_KEYS.appName, 'Current App Name'],
      [
        PUBLIC_SETTING_KEYS.defaultCoordinates,
        JSON.stringify({ lat: -1.23, lon: 116.95, zoom: 14 }),
      ],
    ]);

    prisma.systemSetting.findMany = (async () => {
      return Array.from(stored.entries()).map(([key, value]) => ({ key, value }));
    }) as unknown as typeof prisma.systemSetting.findMany;

    let upsertCalled = false;
    prisma.systemSetting.upsert = (async () => {
      upsertCalled = true;
      return { key: 'mock', value: 'mock', updatedAt: new Date() };
    }) as unknown as typeof prisma.systemSetting.upsert;

    let auditCreated = false;
    prisma.auditLog.create = (async () => {
      auditCreated = true;
      return { id: 'audit-noop' };
    }) as unknown as typeof prisma.auditLog.create;

    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    try {
      // Submit coordinates with keys in reverse order (zoom, lon, lat)
      const updateRes = fakeRes();
      await updatePublicSettingsHandler(
        makeReq({
          body: {
            defaultCoordinates: { zoom: 14, lon: 116.95, lat: -1.23 },
          },
        }),
        updateRes as unknown as Response,
      );

      assert.equal(updateRes.status, 200);
      assert.equal(upsertCalled, false, 'No DB upsert should be performed on key-reordered no-op');
      assert.equal(auditCreated, false, 'No audit log should be written on key-reordered no-op');
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
      prisma.auditLog.create = originalAuditCreate;
      invalidatePublicSettingsCache();
    }
  });

  it('correctly persists all 10 public settings and reflects them in audit after snapshot', async () => {
    invalidatePublicSettingsCache();
    const originalFindMany = prisma.systemSetting.findMany;
    const originalUpsert = prisma.systemSetting.upsert;
    const originalTransaction = prisma.$transaction;
    const originalQueryRaw = prisma.$queryRaw;
    const originalAuditCreate = prisma.auditLog.create;

    const upserted = new Map<string, string>();
    prisma.systemSetting.findMany =
      (async () => []) as unknown as typeof prisma.systemSetting.findMany;
    prisma.systemSetting.upsert = (async (args: { create: { key: string; value: string } }) => {
      upserted.set(args.create.key, args.create.value);
      return { ...args.create, updatedAt: new Date() };
    }) as unknown as typeof prisma.systemSetting.upsert;

    let auditData: Record<string, unknown> | undefined;
    prisma.auditLog.create = (async (args: { data: Record<string, unknown> }) => {
      auditData = args.data;
      return { id: 'audit-all-10', ...args.data };
    }) as unknown as typeof prisma.auditLog.create;

    prisma.$transaction = (async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
      throw new Error('expected interactive transaction');
    }) as unknown as typeof prisma.$transaction;
    prisma.$queryRaw = (async () => []) as unknown as typeof prisma.$queryRaw;

    const payload = {
      appName: 'All New App',
      institutionName: 'All New Instansi',
      tagline: 'All New Tagline',
      administrativeArea: 'All New Area',
      contactPhone: '0811111111',
      contactWhatsapp: '0822222222',
      contactEmail: 'new@example.com',
      contactAddress: 'All New Address',
      defaultCoordinates: { lat: -2.0, lon: 117.0, zoom: 15 },
      weatherAdm4: '64.71.01.1002',
    };

    try {
      const res = fakeRes();
      await updatePublicSettingsHandler(makeReq({ body: payload }), res as unknown as Response);

      assert.equal(res.status, 200);
      assert.equal(upserted.size, 10);
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.appName), 'All New App');
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.institutionName), 'All New Instansi');
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.tagline), 'All New Tagline');
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.administrativeArea), 'All New Area');
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.contactPhone), '0811111111');
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.contactWhatsapp), '0822222222');
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.contactEmail), 'new@example.com');
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.contactAddress), 'All New Address');
      assert.equal(
        upserted.get(PUBLIC_SETTING_KEYS.defaultCoordinates),
        JSON.stringify({ lat: -2.0, lon: 117.0, zoom: 15 }),
      );
      assert.equal(upserted.get(PUBLIC_SETTING_KEYS.weatherAdm4), '64.71.01.1002');

      const meta = auditData?.metadata as {
        after: Record<string, unknown>;
        changedFields: string[];
      };
      assert.equal(meta.changedFields.length, 10);
      assert.deepEqual(meta.after, payload);
    } finally {
      prisma.systemSetting.findMany = originalFindMany;
      prisma.systemSetting.upsert = originalUpsert;
      prisma.$transaction = originalTransaction;
      prisma.$queryRaw = originalQueryRaw;
      prisma.auditLog.create = originalAuditCreate;
      invalidatePublicSettingsCache();
    }
  });
});
