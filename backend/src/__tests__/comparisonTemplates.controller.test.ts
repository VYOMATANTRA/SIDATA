import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import type { Response } from 'express';
import {
  listComparisonTemplatesHandler,
  getComparisonTemplateHandler,
  createComparisonTemplateHandler,
  updateComparisonTemplateHandler,
  deleteComparisonTemplateHandler,
} from '../controllers/comparisonTemplates.controller.js';
import { invalidateIndicatorsCache } from '../services/indicators.service.js';
import { findTrendKeywords, trendWarningAckKey } from '../utils/trendKeywords.js';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

type AnyRecord = Record<string, unknown>;
type AsyncFn = (...args: never[]) => Promise<unknown>;

const CLEAN_BODY =
  'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.';
const FLAGGED_BODY =
  'Berdasarkan data {period_current}, {label} terus meningkat, {trend} dibandingkan {period_previous}.';

const validBody = (overrides: AnyRecord = {}) => ({
  slug: 'perbandingan-tahunan',
  label: 'Perbandingan tahunan',
  body: CLEAN_BODY,
  trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
  trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
  trendTetap: 'tidak berubah',
  ...overrides,
});

const templateRow = (overrides: AnyRecord = {}) => ({
  id: 'tpl-1',
  ...validBody(),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

function makeReq(overrides: AnyRecord = {}): AuthRequest {
  const req: AnyRecord = {
    body: {},
    params: {},
    query: {},
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    ip: '10.0.0.7',
    headers: { 'user-agent': 'Mozilla/5.0 (controller-test)' },
    ...overrides,
  };
  if ('user' in overrides && overrides['user'] === undefined) {
    delete req['user'];
  }
  return req as unknown as AuthRequest;
}

let stored: AnyRecord | null;
let usage: number;
let templateImpl: Record<string, AsyncFn>;
let readImpl: Record<string, AsyncFn>;
let auditRows: AnyRecord[];
let txCount: number;
let originals: Array<{ target: AnyRecord; key: string; fn: unknown }>;
let consoleErrors: unknown[][];

function stubMethod(target: AnyRecord, key: string, fn: unknown) {
  originals.push({ target, key, fn: target[key] });
  target[key] = fn;
}

const withCount = (row: AnyRecord, args: unknown): AnyRecord => {
  const include = (args as { include?: { _count?: unknown } } | undefined)?.include;
  return include?._count ? { ...row, _count: { indicators: usage } } : row;
};

beforeEach(() => {
  stored = templateRow();
  usage = 0;
  templateImpl = {};
  readImpl = {};
  auditRows = [];
  txCount = 0;
  originals = [];
  consoleErrors = [];
  invalidateIndicatorsCache();

  // Keep expected 500-path logging out of the test output, but still observable.
  stubMethod(console as unknown as AnyRecord, 'error', (...args: unknown[]) => {
    consoleErrors.push(args);
  });

  templateImpl['findUnique'] = async (...args: never[]) =>
    stored ? withCount(stored, args[0]) : null;
  templateImpl['create'] = async (...args: never[]) => {
    const { data } = args[0] as unknown as { data: AnyRecord };
    return withCount(templateRow({ ...data, id: 'tpl-new' }), args[0]);
  };
  templateImpl['update'] = async (...args: never[]) => {
    const { data } = args[0] as unknown as { data: AnyRecord };
    return withCount(templateRow({ ...stored, ...data }), args[0]);
  };
  templateImpl['delete'] = async () => stored;

  const tx = {
    $queryRaw: (async () => []) as AsyncFn,
    comparisonTemplate: new Proxy(
      {},
      {
        get:
          (_t, prop: string) =>
          async (...args: never[]) => {
            if (!templateImpl[prop]) throw new Error(`unexpected tx.comparisonTemplate.${prop}`);
            return templateImpl[prop]!(...args);
          },
      },
    ),
    indicator: { count: (async () => usage) as AsyncFn },
    auditLog: {
      create: (async (...args: never[]) => {
        const { data } = args[0] as unknown as { data: AnyRecord };
        const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
        auditRows.push(row);
        return row;
      }) as AsyncFn,
    },
  };

  stubMethod(prisma as unknown as AnyRecord, '$transaction', (async (...args: never[]) => {
    txCount += 1;
    const arg = args[0] as unknown;
    if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(tx);
    throw new Error('unsupported $transaction argument');
  }) as AsyncFn);

  for (const method of ['findMany', 'findUnique'] as const) {
    stubMethod(prisma.comparisonTemplate as unknown as AnyRecord, method, (async (
      ...args: never[]
    ) => {
      if (!readImpl[method]) throw new Error(`unexpected prisma.comparisonTemplate.${method} call`);
      return readImpl[method]!(...args);
    }) as AsyncFn);
  }
});

afterEach(() => {
  for (const { target, key, fn } of originals.reverse()) {
    target[key] = fn;
  }
  invalidateIndicatorsCache();
});

const GENERIC_500 = { error: 'Terjadi kesalahan internal server' };

describe('comparisonTemplates.controller listComparisonTemplatesHandler', () => {
  it('returns 200 with { templates }', async () => {
    readImpl['findMany'] = async () => [{ ...templateRow(), _count: { indicators: 2 } }];

    const res = fakeRes();
    await listComparisonTemplatesHandler(makeReq(), res as unknown as Response);

    assert.equal(res.status, 200);
    const templates = (res.body as AnyRecord)['templates'] as AnyRecord[];
    assert.equal(templates.length, 1);
    assert.equal(templates[0]!['id'], 'tpl-1');
    assert.equal(templates[0]!['usageCount'], 2);
  });

  it('returns 500 with a generic message when the database throws', async () => {
    readImpl['findMany'] = async () => {
      throw new Error('db password=hunter2');
    };

    const res = fakeRes();
    await listComparisonTemplatesHandler(makeReq(), res as unknown as Response);

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, GENERIC_500);
    assert.equal(consoleErrors.length, 1);
  });
});

describe('comparisonTemplates.controller getComparisonTemplateHandler', () => {
  it('returns 400 for a missing id param', async () => {
    const res = fakeRes();
    await getComparisonTemplateHandler(makeReq({ params: {} }), res as unknown as Response);

    assert.equal(res.status, 400);
  });

  it('returns 404 when the template does not exist', async () => {
    readImpl['findUnique'] = async () => null;

    const res = fakeRes();
    await getComparisonTemplateHandler(
      makeReq({ params: { id: 'missing' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 404);
    assert.equal(typeof (res.body as AnyRecord)['error'], 'string');
  });

  it('returns 200 with { template }', async () => {
    readImpl['findUnique'] = async () => ({ ...templateRow(), _count: { indicators: 0 } });

    const res = fakeRes();
    await getComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 200);
    assert.equal(
      ((res.body as AnyRecord)['template'] as AnyRecord)['slug'],
      'perbandingan-tahunan',
    );
  });

  it('returns 500 with a generic message when the database throws', async () => {
    readImpl['findUnique'] = async () => {
      throw new Error('db down');
    };

    const res = fakeRes();
    await getComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, GENERIC_500);
  });
});

describe('comparisonTemplates.controller createComparisonTemplateHandler', () => {
  it('returns 401 without an authenticated user and opens no transaction', async () => {
    const res = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ user: undefined, body: validBody() }),
      res as unknown as Response,
    );

    assert.equal(res.status, 401);
    assert.equal(txCount, 0);
  });

  it('returns 201 with { message, template }', async () => {
    const res = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ body: validBody() }),
      res as unknown as Response,
    );

    assert.equal(res.status, 201);
    const body = res.body as AnyRecord;
    assert.equal(typeof body['message'], 'string');
    assert.equal((body['template'] as AnyRecord)['id'], 'tpl-new');
    assert.equal((body['template'] as AnyRecord)['usageCount'], 0);
  });

  it('records the acting user and request context on the audit row', async () => {
    const res = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ body: validBody() }),
      res as unknown as Response,
    );

    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['actorId'], 'admin-1');
    assert.equal(audit['actorEmail'], 'admin@example.com');
    assert.equal(audit['actorRole'], 'admin');
    assert.equal(audit['ipAddress'], '10.0.0.7');
    assert.equal(audit['userAgent'], 'Mozilla/5.0 (controller-test)');
  });

  it('returns 400 for an invalid payload with only { error } in the body', async () => {
    const res = fakeRes();
    await createComparisonTemplateHandler(makeReq({ body: {} }), res as unknown as Response);

    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body as AnyRecord), ['error']);
    assert.equal(auditRows.length, 0);
  });

  it('returns 400 for a missing or non-object body', async () => {
    const res = fakeRes();
    await createComparisonTemplateHandler(makeReq({ body: undefined }), res as unknown as Response);

    assert.equal(res.status, 400);
  });

  it('returns 409 when the slug is taken', async () => {
    templateImpl['create'] = async () => {
      throw prismaError('P2002');
    };

    const res = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ body: validBody() }),
      res as unknown as Response,
    );

    assert.equal(res.status, 409);
    assert.deepEqual(Object.keys(res.body as AnyRecord), ['error']);
  });

  it('returns 422 with { error, code, warnings } when a trend word sits outside {trend}', async () => {
    const res = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ body: validBody({ body: FLAGGED_BODY }) }),
      res as unknown as Response,
    );

    assert.equal(res.status, 422);
    const body = res.body as AnyRecord;
    assert.equal(typeof body['error'], 'string');
    assert.equal(body['code'], 'TREND_KEYWORD_ACK_REQUIRED');
    const warnings = body['warnings'] as AnyRecord[];
    assert.deepEqual(
      warnings.map((w) => w['phrase']),
      ['terus', 'meningkat'],
    );
    for (const warning of warnings) {
      assert.equal(typeof warning['ackKey'], 'string');
      assert.equal(warning['acknowledged'], false);
    }
    assert.equal(auditRows.length, 0);
  });

  it('returns 201 and logs the override when the client echoes back every ackKey', async () => {
    const first = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ body: validBody({ body: FLAGGED_BODY }) }),
      first as unknown as Response,
    );
    const acknowledgedWarnings = ((first.body as AnyRecord)['warnings'] as AnyRecord[]).map(
      (w) => w['ackKey'],
    );
    assert.deepEqual(
      acknowledgedWarnings,
      findTrendKeywords(FLAGGED_BODY).map((m) => trendWarningAckKey(FLAGGED_BODY, m)),
    );

    const second = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ body: validBody({ body: FLAGGED_BODY, acknowledgedWarnings }) }),
      second as unknown as Response,
    );

    assert.equal(second.status, 201);
    assert.deepEqual(auditRows.map((r) => r['action']).sort(), [
      'comparison_template.created',
      'comparison_template.keyword_warning_overridden',
    ]);
  });

  it('returns 500 with a generic message on unexpected failures and does not leak details', async () => {
    templateImpl['create'] = async () => {
      throw new Error('connection string leaked');
    };

    const res = fakeRes();
    await createComparisonTemplateHandler(
      makeReq({ body: validBody() }),
      res as unknown as Response,
    );

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, GENERIC_500);
    assert.equal(JSON.stringify(res.body).includes('leaked'), false);
  });
});

describe('comparisonTemplates.controller updateComparisonTemplateHandler', () => {
  it('returns 400 for a missing id param', async () => {
    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ params: {}, body: { label: 'Baru' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 400);
  });

  it('returns 401 without an authenticated user', async () => {
    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ user: undefined, params: { id: 'tpl-1' }, body: { label: 'Baru' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 401);
    assert.equal(txCount, 0);
  });

  it('returns 200 with { message, template }', async () => {
    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' }, body: { label: 'Label baru' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 200);
    const body = res.body as AnyRecord;
    assert.equal(typeof body['message'], 'string');
    assert.equal((body['template'] as AnyRecord)['label'], 'Label baru');
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]!['actorEmail'], 'admin@example.com');
  });

  it('returns 400 for an empty payload', async () => {
    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' }, body: {} }),
      res as unknown as Response,
    );

    assert.equal(res.status, 400);
  });

  it('returns 404 when the template does not exist', async () => {
    stored = null;

    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ params: { id: 'missing' }, body: { label: 'Baru' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 404);
  });

  it('returns 409 when the new slug is taken', async () => {
    templateImpl['update'] = async () => {
      throw prismaError('P2002');
    };

    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' }, body: { slug: 'dipakai' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 409);
  });

  it('returns 422 with { error, code, warnings } for a flagged body edit', async () => {
    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' }, body: { body: FLAGGED_BODY } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 422);
    const body = res.body as AnyRecord;
    assert.equal(body['code'], 'TREND_KEYWORD_ACK_REQUIRED');
    assert.equal((body['warnings'] as unknown[]).length, 2);
    assert.equal(auditRows.length, 0);
  });

  it('returns 500 with a generic message on unexpected failures', async () => {
    templateImpl['update'] = async () => {
      throw new Error('boom');
    };

    const res = fakeRes();
    await updateComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' }, body: { label: 'Baru' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, GENERIC_500);
  });
});

describe('comparisonTemplates.controller deleteComparisonTemplateHandler', () => {
  it('returns 400 for a missing id param', async () => {
    const res = fakeRes();
    await deleteComparisonTemplateHandler(makeReq({ params: {} }), res as unknown as Response);

    assert.equal(res.status, 400);
  });

  it('returns 401 without an authenticated user', async () => {
    const res = fakeRes();
    await deleteComparisonTemplateHandler(
      makeReq({ user: undefined, params: { id: 'tpl-1' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 401);
    assert.equal(txCount, 0);
  });

  it('returns 200 with { message, template } for an unused template', async () => {
    const res = fakeRes();
    await deleteComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 200);
    const body = res.body as AnyRecord;
    assert.equal(typeof body['message'], 'string');
    assert.equal((body['template'] as AnyRecord)['id'], 'tpl-1');
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]!['action'], 'comparison_template.deleted');
  });

  it('returns 409 while indicators still use the template', async () => {
    usage = 4;

    const res = fakeRes();
    await deleteComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 409);
    assert.equal(auditRows.length, 0);
  });

  it('returns 404 when the template does not exist', async () => {
    stored = null;

    const res = fakeRes();
    await deleteComparisonTemplateHandler(
      makeReq({ params: { id: 'missing' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 404);
  });

  it('returns 500 with a generic message on unexpected failures', async () => {
    templateImpl['delete'] = async () => {
      throw new Error('boom');
    };

    const res = fakeRes();
    await deleteComparisonTemplateHandler(
      makeReq({ params: { id: 'tpl-1' } }),
      res as unknown as Response,
    );

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, GENERIC_500);
  });
});
