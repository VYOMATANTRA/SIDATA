import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  listIndicators,
  getIndicatorById,
  createIndicator,
  updateIndicator,
  deleteIndicator,
  invalidateIndicatorsCache,
  IndicatorServiceError,
} from '../services/indicators.service.js';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

type AnyRecord = Record<string, unknown>;
type AsyncFn = (...args: never[]) => Promise<unknown>;

const ACTOR = { id: 'editor-1', email: 'editor@example.com', role: 'editor' };
const CONTEXT = { ipAddress: '127.0.0.1', userAgent: 'TestAgent/1.0' };

const validPayload = (overrides: AnyRecord = {}) => ({
  sectionId: 'sec-1',
  slug: 'jumlah-penduduk',
  label: 'Jumlah Penduduk',
  valueCurrent: '125000',
  periodCurrent: '2025',
  ...overrides,
});

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

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

// ---------------------------------------------------------------------------
// Stub harness: prisma.$transaction runs the callback against an in-memory tx
// stub, so mutation+audit atomicity is observable without a database.
// ---------------------------------------------------------------------------
let indicatorImpl: Record<string, AsyncFn>;
let sectionImpl: Record<string, AsyncFn>;
let auditRows: AnyRecord[];
let txCalls: unknown[][];
let queryRawCalls: unknown[][];
let txIndicatorCalls: Record<string, unknown[][]>;
let originals: Array<{ target: AnyRecord; key: string; fn: unknown }>;

function stubMethod(target: AnyRecord, key: string, fn: AsyncFn) {
  originals.push({ target, key, fn: target[key] });
  target[key] = fn;
}

beforeEach(() => {
  indicatorImpl = {};
  sectionImpl = {};
  auditRows = [];
  txCalls = [];
  queryRawCalls = [];
  txIndicatorCalls = {};
  originals = [];
  invalidateIndicatorsCache();

  const tx = {
    $queryRaw: (async (...args: never[]) => {
      queryRawCalls.push(args);
      return [];
    }) as AsyncFn,
    section: {
      findUnique: (async (...args: never[]) => sectionImpl['findUnique']!(...args)) as AsyncFn,
    },
    indicator: new Proxy(
      {},
      {
        get:
          (_t, prop: string) =>
          async (...args: never[]) => {
            txIndicatorCalls[prop] ??= [];
            txIndicatorCalls[prop]!.push(args);
            return indicatorImpl[prop]!(...args);
          },
      },
    ),
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
    txCalls.push(args);
    const arg = args[0] as unknown;
    if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(tx);
    if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
    throw new Error('unsupported $transaction argument');
  }) as AsyncFn);

  stubMethod(prisma.indicator as unknown as AnyRecord, 'findMany', (async (...args: never[]) => {
    if (!indicatorImpl['findMany']) throw new Error('unexpected prisma.indicator.findMany call');
    return indicatorImpl['findMany'](...args);
  }) as AsyncFn);
  stubMethod(prisma.indicator as unknown as AnyRecord, 'findUnique', (async (...args: never[]) => {
    if (!indicatorImpl['findUnique'])
      throw new Error('unexpected prisma.indicator.findUnique call');
    return indicatorImpl['findUnique'](...args);
  }) as AsyncFn);
  stubMethod(prisma.indicator as unknown as AnyRecord, 'count', (async (...args: never[]) => {
    if (!indicatorImpl['count']) throw new Error('unexpected prisma.indicator.count call');
    return indicatorImpl['count'](...args);
  }) as AsyncFn);
});

afterEach(() => {
  for (const { target, key, fn } of originals) {
    target[key] = fn;
  }
  invalidateIndicatorsCache();
});

async function assertServiceError(
  promise: Promise<unknown>,
  statusCode: number,
  messagePart?: string,
) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof IndicatorServiceError);
    assert.equal(err.statusCode, statusCode);
    if (messagePart) assert.match(err.message, new RegExp(messagePart));
    return true;
  });
}

describe('indicators.service createIndicator', () => {
  beforeEach(() => {
    sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
    indicatorImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return indicatorRow({ ...data, id: 'ind-new' });
    };
  });

  it('rejects non-object payloads with 400', async () => {
    await assertServiceError(createIndicator(null, ACTOR, CONTEXT), 400);
    await assertServiceError(createIndicator('x', ACTOR, CONTEXT), 400);
    await assertServiceError(createIndicator([], ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('rejects missing required fields with 400', async () => {
    await assertServiceError(createIndicator({}, ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('rejects invalid slug format with 400', async () => {
    await assertServiceError(
      createIndicator(validPayload({ slug: 'Bad_Slug!' }), ACTOR, CONTEXT),
      400,
    );
    assert.equal(txCalls.length, 0);
  });

  it('rejects values with more than 4 decimals with 400', async () => {
    await assertServiceError(
      createIndicator(validPayload({ valueCurrent: '1.12345' }), ACTOR, CONTEXT),
      400,
    );
    await assertServiceError(
      createIndicator(validPayload({ valueCurrent: 'nan' }), ACTOR, CONTEXT),
      400,
    );
  });

  it('preserves null value_previous (tier-1 gate) instead of coercing it', async () => {
    let createdData: AnyRecord | null = null;
    indicatorImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      createdData = data;
      return indicatorRow({ ...data, id: 'ind-new', valuePrevious: null, periodPrevious: null });
    };

    const result = await createIndicator(validPayload({ valuePrevious: null }), ACTOR, CONTEXT);

    assert.equal(result.valuePrevious, null);
    assert.ok('valuePrevious' in result);
    assert.equal(createdData!['valuePrevious'], null);
  });

  it('accepts numeric valueCurrent and serializes values as strings', async () => {
    const result = await createIndicator(
      validPayload({ valueCurrent: 125000, valuePrevious: 119500.25 }),
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.valueCurrent, '125000');
    assert.equal(result.valuePrevious, '119500.25');
  });

  it('rejects is_computed_comparison=true without a paired previous value', async () => {
    await assertServiceError(
      createIndicator(
        validPayload({ isComputedComparison: true, valuePrevious: null }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'value_previous',
    );
    await assertServiceError(
      createIndicator(
        validPayload({
          isComputedComparison: true,
          valuePrevious: '100',
          periodPrevious: null,
        }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'period_previous',
    );
    assert.equal(txCalls.length, 0);
  });

  it('creates a paired comparison indicator when previous value and period are present', async () => {
    const result = await createIndicator(
      validPayload({
        isComputedComparison: true,
        valuePrevious: '120000',
        periodPrevious: '2024',
      }),
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.isComputedComparison, true);
    assert.equal(result.valuePrevious, '120000');
    assert.equal(result.periodPrevious, '2024');
  });

  it('returns 404 when the section does not exist and writes no audit row', async () => {
    sectionImpl['findUnique'] = async () => null;

    await assertServiceError(createIndicator(validPayload(), ACTOR, CONTEXT), 404, 'Section');
    assert.equal(auditRows.length, 0);
  });

  it('maps slug conflicts (P2002) to 409', async () => {
    indicatorImpl['create'] = async () => {
      throw p2002();
    };

    await assertServiceError(
      createIndicator(validPayload(), ACTOR, CONTEXT),
      409,
      'sudah digunakan',
    );
  });

  it('canonicalizes padded/non-canonical decimal strings before storage', async () => {
    let createdData: AnyRecord | null = null;
    indicatorImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      createdData = data;
      return indicatorRow({ ...data, id: 'ind-new' });
    };

    const result = await createIndicator(
      validPayload({ valueCurrent: ' 12 ', valuePrevious: '012.50' }),
      ACTOR,
      CONTEXT,
    );

    // Stored values are canonical — Prisma never sees the raw padded form (which it rejects).
    assert.equal(createdData!['valueCurrent'], '12');
    assert.equal(createdData!['valuePrevious'], '12.5');
    assert.equal(result.valueCurrent, '12');
    assert.equal(result.valuePrevious, '12.5');
  });

  it('writes the indicator.created audit row inside the same transaction', async () => {
    const result = await createIndicator(validPayload(), ACTOR, CONTEXT);

    assert.equal(result.slug, 'jumlah-penduduk');
    assert.equal(txCalls.length, 1);
    assert.equal(typeof txCalls[0]![0], 'function');
    assert.equal(queryRawCalls.length, 1);
    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['action'], 'indicator.created');
    assert.equal(audit['severity'], 'info');
    assert.equal(audit['targetType'], 'indicator');
    assert.equal(audit['actorEmail'], ACTOR.email);
  });

  it('trims label and collapses whitespace-only unit/source/hedgeNote to null', async () => {
    let createdData: AnyRecord | null = null;
    indicatorImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      createdData = data;
      return indicatorRow({ ...data, id: 'ind-new' });
    };

    await createIndicator(
      validPayload({ label: '  Jumlah Penduduk  ', unit: '   ', source: '', hedgeNote: '  ' }),
      ACTOR,
      CONTEXT,
    );

    assert.equal(createdData!['label'], 'Jumlah Penduduk');
    assert.equal(createdData!['unit'], null);
    assert.equal(createdData!['source'], null);
    assert.equal(createdData!['hedgeNote'], null);
  });
});

describe('indicators.service updateIndicator', () => {
  const existing = (overrides: Record<string, unknown> = {}) => indicatorRow(overrides);

  beforeEach(() => {
    indicatorImpl['findUnique'] = async () => existing();
    sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
    indicatorImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return { ...existing(), ...data };
    };
  });

  it('rejects invalid ids and empty payloads with 400', async () => {
    await assertServiceError(updateIndicator('', { label: 'x' }, ACTOR, CONTEXT), 400);
    await assertServiceError(updateIndicator(null, { label: 'x' }, ACTOR, CONTEXT), 400);
    await assertServiceError(updateIndicator('ind-1', {}, ACTOR, CONTEXT), 400);
    await assertServiceError(updateIndicator('ind-1', null, ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('returns 404 when the indicator does not exist', async () => {
    indicatorImpl['findUnique'] = async () => null;

    await assertServiceError(updateIndicator('missing', { label: 'x' }, ACTOR, CONTEXT), 404);
    assert.equal(auditRows.length, 0);
  });

  it('returns 404 when moving to a missing section', async () => {
    sectionImpl['findUnique'] = async () => null;

    await assertServiceError(
      updateIndicator('ind-1', { sectionId: 'sec-missing' }, ACTOR, CONTEXT),
      404,
      'Section',
    );
  });

  it('returns 409 when the new slug belongs to another indicator', async () => {
    indicatorImpl['findUnique'] = async (...args: never[]) => {
      const { where } = args[0] as unknown as { where: AnyRecord };
      if ((where as AnyRecord)['slug'] === 'diambil') return indicatorRow({ id: 'ind-other' });
      return existing();
    };

    await assertServiceError(
      updateIndicator('ind-1', { slug: 'diambil' }, ACTOR, CONTEXT),
      409,
      'sudah digunakan',
    );
  });

  it('leaves value_previous untouched on partial updates (no silent nulling)', async () => {
    let updatedData: AnyRecord | null = null;
    indicatorImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      updatedData = data;
      return { ...existing(), ...data };
    };

    const result = await updateIndicator('ind-1', { label: 'Penduduk Baru' }, ACTOR, CONTEXT);

    assert.equal(result.valuePrevious, '120000');
    assert.equal('valuePrevious' in updatedData!, false);
    assert.equal('periodPrevious' in updatedData!, false);
  });

  it('allows explicitly clearing value_previous on a non-computed indicator', async () => {
    indicatorImpl['findUnique'] = async () =>
      existing({ isComputedComparison: false, valuePrevious: '5', periodPrevious: '2024' });
    let updatedData: AnyRecord | null = null;
    indicatorImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      updatedData = data;
      return { ...existing(), ...data, valuePrevious: null };
    };

    const result = await updateIndicator(
      'ind-1',
      { valuePrevious: null, periodPrevious: null },
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.valuePrevious, null);
    assert.equal(updatedData!['valuePrevious'], null);
  });

  it('rejects enabling computed comparison without a pair, or clearing the pair on one', async () => {
    indicatorImpl['findUnique'] = async () =>
      existing({ isComputedComparison: false, valuePrevious: null, periodPrevious: null });

    await assertServiceError(
      updateIndicator('ind-1', { isComputedComparison: true }, ACTOR, CONTEXT),
      400,
      'value_previous',
    );

    indicatorImpl['findUnique'] = async () => existing();
    await assertServiceError(
      updateIndicator('ind-1', { valuePrevious: null }, ACTOR, CONTEXT),
      400,
      'value_previous',
    );
    assert.equal(auditRows.length, 0);
  });

  it('treats value-identical non-canonical PATCHes as no-ops (no bogus audit diff)', async () => {
    indicatorImpl['findUnique'] = async () =>
      existing({ valueCurrent: '12.5', valuePrevious: '3.25' });

    for (const payload of [
      { valueCurrent: '12.50', valuePrevious: '03.250' },
      { valueCurrent: ' 12.5 ', valuePrevious: '3.2500' },
    ]) {
      const result = await updateIndicator('ind-1', payload, ACTOR, CONTEXT);

      assert.equal(result.valueCurrent, '12.5');
      assert.equal(result.valuePrevious, '3.25');
    }

    assert.equal(txIndicatorCalls['update']?.length ?? 0, 0);
    assert.equal(auditRows.length, 0);
  });

  it('short-circuits no-op updates without writing an audit row', async () => {
    const result = await updateIndicator('ind-1', { label: 'Jumlah Penduduk' }, ACTOR, CONTEXT);

    assert.equal(result.id, 'ind-1');
    assert.equal(txIndicatorCalls['update']?.length ?? 0, 0);
    assert.equal(auditRows.length, 0);
  });

  it('writes indicator.updated with a changes diff on real edits', async () => {
    const result = await updateIndicator('ind-1', { label: 'Penduduk Anyar' }, ACTOR, CONTEXT);

    assert.equal(result.label, 'Penduduk Anyar');
    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['action'], 'indicator.updated');
    assert.equal(audit['severity'], 'info');
    const metadata = audit['metadata'] as AnyRecord;
    const changes = metadata['changes'] as AnyRecord;
    assert.deepStrictEqual(changes['label'], {
      before: 'Jumlah Penduduk',
      after: 'Penduduk Anyar',
    });
  });
});

describe('indicators.service deleteIndicator', () => {
  beforeEach(() => {
    indicatorImpl['findUnique'] = async () => indicatorRow();
    indicatorImpl['delete'] = async () => indicatorRow();
  });

  it('rejects invalid ids with 400', async () => {
    await assertServiceError(deleteIndicator('', ACTOR, CONTEXT), 400);
    await assertServiceError(deleteIndicator(null, ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('returns 404 when the indicator does not exist', async () => {
    indicatorImpl['findUnique'] = async () => null;

    await assertServiceError(deleteIndicator('missing', ACTOR, CONTEXT), 404);
    assert.equal(auditRows.length, 0);
  });

  it('deletes and writes an indicator.deleted warning audit with the before snapshot', async () => {
    const result = await deleteIndicator('ind-1', ACTOR, CONTEXT);

    assert.equal(result.id, 'ind-1');
    assert.equal(txIndicatorCalls['delete']?.length ?? 0, 1);
    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['action'], 'indicator.deleted');
    assert.equal(audit['severity'], 'warning');
    assert.equal(audit['targetType'], 'indicator');
    assert.equal(audit['targetId'], 'ind-1');
    const metadata = audit['metadata'] as AnyRecord;
    assert.equal(metadata['slug'], 'jumlah-penduduk');
    assert.ok(metadata['before']);
  });
});

describe('indicators.service listIndicators', () => {
  beforeEach(() => {
    indicatorImpl['findMany'] = async () => [indicatorRow()];
    indicatorImpl['count'] = async () => 1;
  });

  it('applies defaults (page 1, pageSize 50, includeStale true) and exact query args', async () => {
    let seenArgs: AnyRecord | null = null;
    indicatorImpl['findMany'] = async (...args: never[]) => {
      seenArgs = args[0] as unknown as AnyRecord;
      return [indicatorRow()];
    };

    const result = await listIndicators({});

    assert.deepStrictEqual(seenArgs!['where'], {});
    assert.deepStrictEqual(seenArgs!['orderBy'], [{ sortOrder: 'asc' }, { id: 'asc' }]);
    assert.equal(seenArgs!['skip'], 0);
    assert.equal(seenArgs!['take'], 50);
    assert.deepStrictEqual(
      { total: result.total, page: result.page, pageSize: result.pageSize },
      { total: 1, page: 1, pageSize: 50 },
    );
  });

  it('filters by section and excludes stale rows when asked', async () => {
    let seenArgs: AnyRecord | null = null;
    indicatorImpl['findMany'] = async (...args: never[]) => {
      seenArgs = args[0] as unknown as AnyRecord;
      return [];
    };
    indicatorImpl['count'] = async () => 0;

    await listIndicators({ sectionId: 'sec-9', includeStale: false, page: 2, pageSize: 10 });

    assert.deepStrictEqual(seenArgs!['where'], { sectionId: 'sec-9', isStale: false });
    assert.equal(seenArgs!['skip'], 10);
    assert.equal(seenArgs!['take'], 10);
  });

  it('serializes decimals as strings and preserves null value_previous', async () => {
    indicatorImpl['findMany'] = async () => [indicatorRow({ valuePrevious: null })];

    const { indicators } = await listIndicators({});

    assert.equal(indicators[0]!.valueCurrent, '125000');
    assert.equal(indicators[0]!.valuePrevious, null);
    assert.ok('valuePrevious' in indicators[0]!);
  });

  it('serves the second identical call from cache without a new query', async () => {
    let queryCount = 0;
    indicatorImpl['findMany'] = async () => {
      queryCount++;
      return [indicatorRow()];
    };

    await listIndicators({ sectionId: 'sec-1' });
    await listIndicators({ sectionId: 'sec-1' });

    assert.equal(queryCount, 1);
  });
});

describe('indicators.service getIndicatorById', () => {
  it('returns null for invalid ids without touching the database', async () => {
    assert.equal(await getIndicatorById(''), null);
    assert.equal(await getIndicatorById(null), null);
    assert.equal(await getIndicatorById(123), null);
  });

  it('returns null when the row does not exist', async () => {
    indicatorImpl['findUnique'] = async () => null;

    assert.equal(await getIndicatorById('missing'), null);
  });

  it('maps a row to the exact DTO shape', async () => {
    indicatorImpl['findUnique'] = async () => indicatorRow();

    const result = await getIndicatorById('ind-1');

    assert.deepStrictEqual(result, {
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
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
});
