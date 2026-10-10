import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import type { Request, Response } from 'express';
import {
  listIndicatorsHandler,
  getIndicatorHandler,
  createIndicatorHandler,
  updateIndicatorHandler,
  deleteIndicatorHandler,
} from '../controllers/indicators.controller.js';
import { invalidateIndicatorsCache } from '../services/indicators.service.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

type AnyRecord = Record<string, unknown>;
type AsyncFn = (...args: never[]) => Promise<unknown>;

const indicatorRow = (overrides: AnyRecord = {}) => ({
  id: 'ind-1',
  sectionId: 'sec-1',
  slug: 'jumlah-penduduk',
  label: 'Jumlah Penduduk',
  unit: 'jiwa',
  valueCurrent: '125000',
  valuePrevious: '120000',
  periodCurrent: '2025',
  periodPrevious: '2024',
  isComputedComparison: true,
  isStale: false,
  source: 'Prodeskel',
  hedgeNote: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

const validBody = (overrides: AnyRecord = {}) => ({
  sectionId: 'sec-1',
  slug: 'jumlah-penduduk',
  label: 'Jumlah Penduduk',
  valueCurrent: '125000',
  periodCurrent: '2025',
  ...overrides,
});

function makeReq(overrides: AnyRecord = {}): AuthRequest {
  const req: AnyRecord = {
    body: {},
    params: {},
    query: {},
    user: { id: 'editor-1', email: 'editor@example.com', role: 'editor' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'TestAgent/1.0' },
    ...overrides,
  };
  if ('user' in overrides && overrides['user'] === undefined) {
    delete req['user'];
  }
  return req as unknown as AuthRequest;
}

let indicatorImpl: Record<string, AsyncFn>;
let sectionImpl: Record<string, AsyncFn>;
let originals: Array<{ target: AnyRecord; key: string; fn: unknown }>;

function stubMethod(target: AnyRecord, key: string, fn: AsyncFn) {
  originals.push({ target, key, fn: target[key] });
  target[key] = fn;
}

beforeEach(() => {
  indicatorImpl = {};
  sectionImpl = {};
  originals = [];
  invalidateIndicatorsCache();

  const tx = {
    $queryRaw: (async () => []) as AsyncFn,
    section: {
      findUnique: (async (...args: never[]) => sectionImpl['findUnique']!(...args)) as AsyncFn,
    },
    indicator: new Proxy(
      {},
      {
        get:
          (_t, prop: string) =>
          async (...args: never[]) =>
            indicatorImpl[prop]!(...args),
      },
    ),
    auditLog: {
      create: (async (...args: never[]) => {
        const { data } = args[0] as unknown as { data: AnyRecord };
        return { id: 'audit-1', createdAt: new Date(), ...data };
      }) as AsyncFn,
    },
  };

  stubMethod(prisma as unknown as AnyRecord, '$transaction', (async (...args: never[]) => {
    const arg = args[0] as unknown;
    if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(tx);
    throw new Error('unsupported $transaction argument');
  }) as AsyncFn);

  for (const method of ['findMany', 'findUnique', 'count'] as const) {
    stubMethod(prisma.indicator as unknown as AnyRecord, method, (async (...args: never[]) => {
      if (!indicatorImpl[method]) throw new Error(`unexpected prisma.indicator.${method} call`);
      return indicatorImpl[method](...args);
    }) as AsyncFn);
  }

  sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
});

afterEach(() => {
  for (const { target, key, fn } of originals) {
    target[key] = fn;
  }
  invalidateIndicatorsCache();
});

describe('indicators.controller listIndicatorsHandler', () => {
  it('returns 200 with the list result shape', async () => {
    indicatorImpl['findMany'] = async () => [indicatorRow()];
    indicatorImpl['count'] = async () => 1;

    const res = fakeRes();
    await listIndicatorsHandler({ query: {} } as unknown as Request, res as unknown as Response);

    assert.equal(res.status, 200);
    assert.equal((res.body as AnyRecord)['total'], 1);
    assert.equal(((res.body as AnyRecord)['indicators'] as unknown[]).length, 1);
  });

  it('returns 500 when the database throws', async () => {
    indicatorImpl['findMany'] = async () => {
      throw new Error('db down');
    };
    indicatorImpl['count'] = async () => 1;

    const res = fakeRes();
    await listIndicatorsHandler({ query: {} } as unknown as Request, res as unknown as Response);

    assert.equal(res.status, 500);
  });

  it('returns 400 for out-of-range page without touching the database', async () => {
    let dbCalls = 0;
    indicatorImpl['findMany'] = async () => {
      dbCalls++;
      return [];
    };
    indicatorImpl['count'] = async () => {
      dbCalls++;
      return 0;
    };

    // The reported repro: page=1e20 used to produce a skip MySQL rejects (500).
    for (const page of ['1e20', 'abc', '1.5', '0', '-3', '10001', '']) {
      const res = fakeRes();
      await listIndicatorsHandler(
        { query: { page } } as unknown as Request,
        res as unknown as Response,
      );

      assert.equal(res.status, 400, `page=${JSON.stringify(page)} must be rejected`);
    }
    assert.equal(dbCalls, 0);
  });

  it('returns 400 for invalid pageSize without touching the database', async () => {
    let dbCalls = 0;
    indicatorImpl['findMany'] = async () => {
      dbCalls++;
      return [];
    };
    indicatorImpl['count'] = async () => {
      dbCalls++;
      return 0;
    };

    for (const pageSize of ['0', '201', '1000', 'sepuluh', '10.5', '']) {
      const res = fakeRes();
      await listIndicatorsHandler(
        { query: { pageSize } } as unknown as Request,
        res as unknown as Response,
      );

      assert.equal(res.status, 400, `pageSize=${JSON.stringify(pageSize)} must be rejected`);
    }
    assert.equal(dbCalls, 0);
  });

  it('returns 400 for malformed sectionId and includeStale', async () => {
    let dbCalls = 0;
    indicatorImpl['findMany'] = async () => {
      dbCalls++;
      return [];
    };
    indicatorImpl['count'] = async () => {
      dbCalls++;
      return 0;
    };

    const badQueries = [
      { sectionId: 'x'.repeat(192) },
      { sectionId: ['a', 'b'] },
      { includeStale: 'maybe' },
      { includeStale: '0' },
      { page: ['1'] },
    ];

    for (const query of badQueries) {
      const res = fakeRes();
      await listIndicatorsHandler(
        { query: query as unknown as Request['query'] } as unknown as Request,
        res as unknown as Response,
      );

      assert.equal(res.status, 400, `${JSON.stringify(query)} must be rejected`);
    }
    assert.equal(dbCalls, 0);
  });

  it('passes valid pagination and filters through to the service', async () => {
    let seenArgs: AnyRecord | null = null;
    indicatorImpl['findMany'] = async (...args: never[]) => {
      seenArgs = args[0] as unknown as AnyRecord;
      return [indicatorRow()];
    };
    indicatorImpl['count'] = async () => 1;

    const res = fakeRes();
    await listIndicatorsHandler(
      {
        query: { page: '2', pageSize: '10', sectionId: 'sec-1', includeStale: 'false' },
      } as unknown as Request,
      res as unknown as Response,
    );

    assert.equal(res.status, 200);
    assert.deepStrictEqual(seenArgs!['where'], { sectionId: 'sec-1', isStale: false });
    assert.equal(seenArgs!['skip'], 10);
    assert.equal(seenArgs!['take'], 10);
  });
});

describe('indicators.controller getIndicatorHandler', () => {
  it('returns 400 for a missing id param', async () => {
    const res = fakeRes();
    await getIndicatorHandler({ params: {} } as unknown as Request, res as unknown as Response);

    assert.equal(res.status, 400);
  });

  it('returns 404 when the indicator does not exist', async () => {
    indicatorImpl['findUnique'] = async () => null;

    const res = fakeRes();
    await getIndicatorHandler(
      { params: { id: 'missing' } } as unknown as Request,
      res as unknown as Response,
    );

    assert.equal(res.status, 404);
  });

  it('returns 200 with the indicator', async () => {
    indicatorImpl['findUnique'] = async () => indicatorRow();

    const res = fakeRes();
    await getIndicatorHandler(
      { params: { id: 'ind-1' } } as unknown as Request,
      res as unknown as Response,
    );

    assert.equal(res.status, 200);
    assert.equal(((res.body as AnyRecord)['indicator'] as AnyRecord)['slug'], 'jumlah-penduduk');
  });

  it('returns 500 when the database throws', async () => {
    indicatorImpl['findUnique'] = async () => {
      throw new Error('db down');
    };

    const res = fakeRes();
    await getIndicatorHandler(
      { params: { id: 'ind-1' } } as unknown as Request,
      res as unknown as Response,
    );

    assert.equal(res.status, 500);
  });
});

describe('indicators.controller createIndicatorHandler', () => {
  beforeEach(() => {
    indicatorImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return indicatorRow({ ...data, id: 'ind-new', valuePrevious: null, periodPrevious: null });
    };
  });

  it('returns 401 without an authenticated user', async () => {
    const res = fakeRes();
    await createIndicatorHandler(
      makeReq({ user: undefined, body: validBody() }),
      res as unknown as Response,
    );

    assert.equal(res.status, 401);
  });

  it('returns 201 on success and preserves null value_previous', async () => {
    const res = fakeRes();
    await createIndicatorHandler(
      makeReq({ body: validBody({ valuePrevious: null }) }),
      res as unknown as Response,
    );

    assert.equal(res.status, 201);
    assert.equal(((res.body as AnyRecord)['indicator'] as AnyRecord)['valuePrevious'], null);
  });

  it('maps validation failures to 400', async () => {
    const res = fakeRes();
    await createIndicatorHandler(makeReq({ body: { slug: 'x' } }), res as unknown as Response);

    assert.equal(res.status, 400);
  });

  it('maps a missing section to 404', async () => {
    sectionImpl['findUnique'] = async () => null;

    const res = fakeRes();
    await createIndicatorHandler(makeReq({ body: validBody() }), res as unknown as Response);

    assert.equal(res.status, 404);
  });

  it('returns 500 on unexpected failures', async () => {
    sectionImpl['findUnique'] = async () => {
      throw new Error('db down');
    };

    const res = fakeRes();
    await createIndicatorHandler(makeReq({ body: validBody() }), res as unknown as Response);

    assert.equal(res.status, 500);
  });
});

describe('indicators.controller updateIndicatorHandler', () => {
  beforeEach(() => {
    indicatorImpl['findUnique'] = async () => indicatorRow();
    indicatorImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return { ...indicatorRow(), ...data };
    };
  });

  it('returns 400 for a missing id param', async () => {
    const res = fakeRes();
    await updateIndicatorHandler(
      makeReq({ params: {}, body: { label: 'x' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 400);
  });

  it('returns 401 without an authenticated user', async () => {
    const res = fakeRes();
    await updateIndicatorHandler(
      makeReq({ user: undefined, params: { id: 'ind-1' }, body: { label: 'x' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 401);
  });

  it('returns 200 on success', async () => {
    const res = fakeRes();
    await updateIndicatorHandler(
      makeReq({ params: { id: 'ind-1' }, body: { label: 'Penduduk Anyar' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 200);
    assert.equal(((res.body as AnyRecord)['indicator'] as AnyRecord)['label'], 'Penduduk Anyar');
  });

  it('returns 404 when the indicator does not exist', async () => {
    indicatorImpl['findUnique'] = async () => null;

    const res = fakeRes();
    await updateIndicatorHandler(
      makeReq({ params: { id: 'missing' }, body: { label: 'x' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 404);
  });

  it('returns 500 on unexpected failures', async () => {
    indicatorImpl['findUnique'] = async () => {
      throw new Error('db down');
    };

    const res = fakeRes();
    await updateIndicatorHandler(
      makeReq({ params: { id: 'ind-1' }, body: { label: 'x' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 500);
  });
});

describe('indicators.controller deleteIndicatorHandler', () => {
  beforeEach(() => {
    indicatorImpl['findUnique'] = async () => indicatorRow();
    indicatorImpl['delete'] = async () => indicatorRow();
  });

  it('returns 400 for a missing id param', async () => {
    const res = fakeRes();
    await deleteIndicatorHandler(makeReq({ params: {} }), res as unknown as Response);

    assert.equal(res.status, 400);
  });

  it('returns 401 without an authenticated user', async () => {
    const res = fakeRes();
    await deleteIndicatorHandler(
      makeReq({ user: undefined, params: { id: 'ind-1' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 401);
  });

  it('returns 200 with a confirmation message on success', async () => {
    const res = fakeRes();
    await deleteIndicatorHandler(makeReq({ params: { id: 'ind-1' } }), res as unknown as Response);

    assert.equal(res.status, 200);
    assert.equal((res.body as AnyRecord)['message'], 'Indikator berhasil dihapus');
  });

  it('returns 404 when the indicator does not exist', async () => {
    indicatorImpl['findUnique'] = async () => null;

    const res = fakeRes();
    await deleteIndicatorHandler(
      makeReq({ params: { id: 'missing' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 404);
  });

  it('returns 500 on unexpected failures', async () => {
    indicatorImpl['findUnique'] = async () => {
      throw new Error('db down');
    };

    const res = fakeRes();
    await deleteIndicatorHandler(makeReq({ params: { id: 'ind-1' } }), res as unknown as Response);

    assert.equal(res.status, 500);
  });
});
