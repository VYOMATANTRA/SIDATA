import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import type { Request, Response } from 'express';
import {
  listIndicatorTablesHandler,
  getIndicatorTableHandler,
  createIndicatorTableHandler,
  updateIndicatorTableHandler,
  deleteIndicatorTableHandler,
  createIndicatorTableRowHandler,
  updateIndicatorTableRowHandler,
  deleteIndicatorTableRowHandler,
} from '../controllers/indicatorTables.controller.js';
import { invalidateIndicatorTablesCache } from '../services/indicatorTables.service.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

type AnyRecord = Record<string, unknown>;
type AsyncFn = (...args: never[]) => Promise<unknown>;

const tableRow = (overrides: AnyRecord = {}) => ({
  id: 'tbl-1',
  sectionId: 'sec-1',
  slug: 'piramida-usia',
  title: 'Piramida Usia',
  kind: 'age_pyramid',
  period: 'Juni 2024',
  source: 'Prodeskel',
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

const cellRow = (overrides: AnyRecord = {}) => ({
  id: 'row-1',
  tableId: 'tbl-1',
  rowKey: '0-4',
  label: 'Usia 0-4 tahun',
  male: 120,
  female: 115,
  total: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
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

let tableImpl: Record<string, AsyncFn>;
let rowImpl: Record<string, AsyncFn>;
let sectionImpl: Record<string, AsyncFn>;
let originals: Array<{ target: AnyRecord; key: string; fn: unknown }>;

function stubMethod(target: AnyRecord, key: string, fn: AsyncFn) {
  originals.push({ target, key, fn: target[key] });
  target[key] = fn;
}

function proxied(impl: Record<string, AsyncFn>) {
  return new Proxy(
    {},
    {
      get:
        (_t, prop: string) =>
        async (...args: never[]) =>
          impl[prop]!(...args),
    },
  );
}

beforeEach(() => {
  tableImpl = {};
  rowImpl = {};
  sectionImpl = {};
  originals = [];
  invalidateIndicatorTablesCache();

  const tx = {
    $queryRaw: (async () => []) as AsyncFn,
    section: {
      findUnique: (async (...args: never[]) => sectionImpl['findUnique']!(...args)) as AsyncFn,
    },
    indicatorTable: proxied(tableImpl),
    indicatorTableRow: proxied(rowImpl),
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

  const stubRead = (model: string, method: string, impl: Record<string, AsyncFn>) => {
    stubMethod((prisma as unknown as AnyRecord)[model] as AnyRecord, method, (async (
      ...args: never[]
    ) => {
      if (!impl[method]) throw new Error(`unexpected prisma.${model}.${method} call`);
      return impl[method](...args);
    }) as AsyncFn);
  };
  stubRead('indicatorTable', 'findMany', tableImpl);
  stubRead('indicatorTable', 'findUnique', tableImpl);
  stubRead('indicatorTable', 'count', tableImpl);
  stubRead('indicatorTableRow', 'findMany', rowImpl);
  stubRead('indicatorTableRow', 'aggregate', rowImpl);

  sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
  tableImpl['findUnique'] = async () => tableRow();
  tableImpl['aggregate'] = async () => ({ _max: { sortOrder: null } });
  rowImpl['findMany'] = async () => [cellRow()];
  rowImpl['aggregate'] = async () => ({
    _sum: { male: 120, female: 115, total: null },
    _count: { _all: 1 },
  });
});

afterEach(() => {
  for (const { target, key, fn } of originals) {
    target[key] = fn;
  }
  invalidateIndicatorTablesCache();
});

describe('indicatorTables.controller list', () => {
  it('returns 200 with tables on valid query', async () => {
    tableImpl['findMany'] = async () => [tableRow()];
    tableImpl['count'] = async () => 1;

    const res = fakeRes();
    await listIndicatorTablesHandler(
      makeReq({ query: { kind: 'ethnicity' } }) as Request,
      res as Response,
    );

    assert.equal(res.status, 200);
    assert.equal((res.body as AnyRecord)['total'], 1);
  });

  it('returns 400 on invalid kind', async () => {
    const res = fakeRes();
    await listIndicatorTablesHandler(
      makeReq({ query: { kind: 'bbox' } }) as Request,
      res as Response,
    );

    assert.equal(res.status, 400);
  });
});

describe('indicatorTables.controller get', () => {
  it('resolves by slug and returns 200 with rows and totals', async () => {
    const res = fakeRes();
    await getIndicatorTableHandler(
      makeReq({ params: { key: 'piramida-usia' } }) as unknown as Request,
      res as Response,
    );

    assert.equal(res.status, 200);
    const table = (res.body as AnyRecord)['table'] as AnyRecord;
    assert.equal(table['slug'], 'piramida-usia');
    assert.deepStrictEqual(table['totals'], { rowCount: 1, male: 120, female: 115, total: 235 });
  });

  it('falls back to id lookup when the slug misses', async () => {
    let calls = 0;
    tableImpl['findUnique'] = async (...args: never[]) => {
      calls++;
      const { where } = args[0] as unknown as { where: AnyRecord };
      if ('slug' in where) return null;
      return tableRow({ id: where['id'] });
    };

    const res = fakeRes();
    await getIndicatorTableHandler(
      makeReq({ params: { key: 'tbl-1' } }) as unknown as Request,
      res as Response,
    );

    assert.equal(res.status, 200);
    assert.equal(calls, 2);
  });

  it('returns 404 when neither slug nor id matches', async () => {
    tableImpl['findUnique'] = async () => null;

    const res = fakeRes();
    await getIndicatorTableHandler(
      makeReq({ params: { key: 'hilang' } }) as unknown as Request,
      res as Response,
    );

    assert.equal(res.status, 404);
  });

  it('returns 400 on empty key', async () => {
    const res = fakeRes();
    await getIndicatorTableHandler(
      makeReq({ params: { key: '  ' } }) as unknown as Request,
      res as Response,
    );

    assert.equal(res.status, 400);
  });
});

describe('indicatorTables.controller mutations', () => {
  beforeEach(() => {
    tableImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return tableRow({ ...data, id: 'tbl-new', rows: [] });
    };
    tableImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return { ...tableRow(), ...data };
    };
    tableImpl['delete'] = async () => tableRow();
    rowImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return cellRow({ ...data, id: 'row-new' });
    };
    rowImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return { ...cellRow(), ...data };
    };
    rowImpl['delete'] = async () => cellRow();
    rowImpl['count'] = async () => 1;
    rowImpl['aggregate'] = async () => ({
      _sum: { male: null, female: null, total: null },
      _count: { _all: 0 },
      _max: { sortOrder: null },
    });
    rowImpl['findUnique'] = async (...args: never[]) => {
      const { where } = args[0] as unknown as { where: AnyRecord };
      if ((where as AnyRecord)['tableId_rowKey']) return null;
      return cellRow();
    };
  });

  it('create returns 201 and 401 without actor', async () => {
    const res = fakeRes();
    await createIndicatorTableHandler(
      makeReq({
        body: {
          sectionId: 'sec-1',
          slug: 'okupasi',
          title: 'Okupasi',
          kind: 'occupation',
          period: 'Juni 2024',
        },
      }),
      res as Response,
    );
    assert.equal(res.status, 201);

    const unauth = fakeRes();
    await createIndicatorTableHandler(makeReq({ user: undefined, body: {} }), unauth as Response);
    assert.equal(unauth.status, 401);
  });

  it('update and delete return 200', async () => {
    const updated = fakeRes();
    await updateIndicatorTableHandler(
      makeReq({ params: { id: 'tbl-1' }, body: { title: 'Baru' } }),
      updated as Response,
    );
    assert.equal(updated.status, 200);

    const deleted = fakeRes();
    await deleteIndicatorTableHandler(makeReq({ params: { id: 'tbl-1' } }), deleted as Response);
    assert.equal(deleted.status, 200);
  });

  it('update maps service 404 to response status', async () => {
    tableImpl['findUnique'] = async () => null;

    const res = fakeRes();
    await updateIndicatorTableHandler(
      makeReq({ params: { id: 'missing' }, body: { title: 'x' } }),
      res as Response,
    );
    assert.equal(res.status, 404);
  });

  it('row create returns 201, row update/delete return 200', async () => {
    const created = fakeRes();
    await createIndicatorTableRowHandler(
      makeReq({
        params: { id: 'tbl-1' },
        body: { rowKey: '5-9', label: 'Usia 5-9', male: 1, female: 1 },
      }),
      created as Response,
    );
    assert.equal(created.status, 201);

    const updated = fakeRes();
    await updateIndicatorTableRowHandler(
      makeReq({ params: { rowId: 'row-1' }, body: { male: 2 } }),
      updated as Response,
    );
    assert.equal(updated.status, 200);

    const deleted = fakeRes();
    await deleteIndicatorTableRowHandler(
      makeReq({ params: { rowId: 'row-1' } }),
      deleted as Response,
    );
    assert.equal(deleted.status, 200);
  });

  it('row handlers return 400 on empty ids', async () => {
    const res = fakeRes();
    await deleteIndicatorTableRowHandler(makeReq({ params: { rowId: '' } }), res as Response);
    assert.equal(res.status, 400);
  });
});
