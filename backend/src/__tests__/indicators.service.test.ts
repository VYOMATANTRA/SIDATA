import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  listIndicators,
  getIndicatorById,
  createIndicator,
  updateIndicator,
  deleteIndicator,
  invalidateIndicatorsCache,
  indicatorByIdCache,
  IndicatorServiceError,
} from '../services/indicators.service.js';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  TEMPLATE_ROW,
  NAIK_TEXT,
  TURUN_TEXT,
  honoringInclude,
  findAnyTemplate,
} from './helpers/comparisonFixtures.js';

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

/** A row as Prisma returns it for `include: { comparisonTemplate: true }`. */
const attachedRow = (overrides: AnyRecord = {}) =>
  indicatorRow({ comparisonTemplateId: 'tpl-1', comparisonTemplate: TEMPLATE_ROW, ...overrides });

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const p2003 = () =>
  new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: 'test',
  });

// ---------------------------------------------------------------------------
// Stub harness: prisma.$transaction runs the callback against an in-memory tx
// stub, so mutation+audit atomicity is observable without a database.
// ---------------------------------------------------------------------------
let indicatorImpl: Record<string, AsyncFn>;
let sectionImpl: Record<string, AsyncFn>;
let templateImpl: Record<string, AsyncFn>;
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
  // By default every template id resolves, so pre-existing tests that never touch templates
  // are unaffected; tests for the missing-template case override findUnique.
  templateImpl = { findUnique: async (...args: never[]) => findAnyTemplate(args[0]) };
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
    comparisonTemplate: {
      findUnique: (async (...args: never[]) => templateImpl['findUnique']!(...args)) as AsyncFn,
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

  it('rejects sortOrder outside the signed 32-bit INT range with 400', async () => {
    await assertServiceError(
      createIndicator(validPayload({ sortOrder: 3000000000 }), ACTOR, CONTEXT),
      400,
      'Urutan',
    );
    await assertServiceError(
      createIndicator(validPayload({ sortOrder: -1 }), ACTOR, CONTEXT),
      400,
      'Urutan',
    );
    await assertServiceError(
      createIndicator(validPayload({ sortOrder: 1.5 }), ACTOR, CONTEXT),
      400,
      'Urutan',
    );
    assert.equal(txCalls.length, 0);
  });

  it('accepts the maximum signed 32-bit INT sortOrder', async () => {
    const result = await createIndicator(validPayload({ sortOrder: 2147483647 }), ACTOR, CONTEXT);

    assert.equal(result.sortOrder, 2147483647);
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
      validPayload({ valueCurrent: 125000, valuePrevious: 119500.25, periodPrevious: '2024' }),
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.valueCurrent, '125000');
    assert.equal(result.valuePrevious, '119500.25');
  });

  it('rejects orphaned previous pairs on non-computed indicators with 400', async () => {
    await assertServiceError(
      createIndicator(validPayload({ valuePrevious: '100', periodPrevious: null }), ACTOR, CONTEXT),
      400,
      'berpasangan',
    );
    await assertServiceError(
      createIndicator(
        validPayload({ valuePrevious: null, periodPrevious: '2024' }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'berpasangan',
    );
    assert.equal(txCalls.length, 0);
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
      validPayload({ valueCurrent: ' 12 ', valuePrevious: '012.50', periodPrevious: '2024' }),
      ACTOR,
      CONTEXT,
    );

    // Stored values are canonical — Prisma never sees the raw padded form (which it rejects).
    assert.equal(createdData!['valueCurrent'], '12');
    assert.equal(createdData!['valuePrevious'], '12.5');
    assert.equal(result.valueCurrent, '12');
    assert.equal(result.valuePrevious, '12.5');
  });

  it('invalidates list caches and warms the per-id cache on successful create', async () => {
    let findManyCount = 0;
    indicatorImpl['findMany'] = async () => {
      findManyCount++;
      return [indicatorRow({ id: 'ind-new' })];
    };
    indicatorImpl['count'] = async () => 1;

    await listIndicators({});
    assert.equal(findManyCount, 1);

    const created = await createIndicator(validPayload(), ACTOR, CONTEXT);
    assert.equal(created.id, 'ind-new');

    // List cache was flushed by the commit…
    await listIndicators({});
    assert.equal(findManyCount, 2);

    // …while the new row itself was warmed: no DB hit on immediate re-read.
    indicatorImpl['findUnique'] = async () => {
      throw new Error('must be served from warmed cache');
    };
    const reread = await getIndicatorById('ind-new');
    assert.equal(reread?.slug, 'jumlah-penduduk');
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

  it('rejects out-of-range sortOrder on update with 400', async () => {
    await assertServiceError(
      updateIndicator('ind-1', { sortOrder: 3000000000 }, ACTOR, CONTEXT),
      400,
      'Urutan',
    );
    assert.equal(auditRows.length, 0);
  });

  it('locks the destination section when moving, but not when staying', async () => {
    // Move to sec-2: indicator lock + destination section lock.
    await updateIndicator('ind-1', { sectionId: 'sec-2', label: 'Pindah' }, ACTOR, CONTEXT);
    assert.equal(queryRawCalls.length, 2);

    // Same section: only the indicator lock, no extra destination lock.
    queryRawCalls.length = 0;
    await updateIndicator('ind-1', { sectionId: 'sec-1', label: 'Tetap' }, ACTOR, CONTEXT);
    assert.equal(queryRawCalls.length, 1);
  });

  it('maps a destination-section delete racing the update (P2003) to 404', async () => {
    indicatorImpl['update'] = async () => {
      throw p2003();
    };

    await assertServiceError(
      updateIndicator('ind-1', { sectionId: 'sec-2', label: 'Pindah' }, ACTOR, CONTEXT),
      404,
      'Section',
    );
    assert.equal(auditRows.length, 0);
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

  it('rejects updates that would orphan the previous pair with 400', async () => {
    indicatorImpl['findUnique'] = async () =>
      existing({ isComputedComparison: false, valuePrevious: null, periodPrevious: null });

    await assertServiceError(
      updateIndicator('ind-1', { valuePrevious: '100' }, ACTOR, CONTEXT),
      400,
      'berpasangan',
    );
    await assertServiceError(
      updateIndicator('ind-1', { periodPrevious: '2024' }, ACTOR, CONTEXT),
      400,
      'berpasangan',
    );
    assert.equal(auditRows.length, 0);
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

  it('warms the per-id cache on successful update (no DB hit on immediate re-read)', async () => {
    const updated = await updateIndicator('ind-1', { label: 'Penduduk Anyar' }, ACTOR, CONTEXT);
    assert.equal(updated.label, 'Penduduk Anyar');

    indicatorImpl['findUnique'] = async () => {
      throw new Error('must be served from warmed cache');
    };
    const reread = await getIndicatorById('ind-1');
    assert.equal(reread?.label, 'Penduduk Anyar');
  });

  it('leaves list caches intact on no-op updates', async () => {
    let findManyCount = 0;
    indicatorImpl['findMany'] = async () => {
      findManyCount++;
      return [indicatorRow()];
    };
    indicatorImpl['count'] = async () => 1;

    await listIndicators({});
    assert.equal(findManyCount, 1);

    await updateIndicator('ind-1', { label: 'Jumlah Penduduk' }, ACTOR, CONTEXT);
    await listIndicators({});
    assert.equal(findManyCount, 1);
  });

  it('leaves list caches intact on failed updates', async () => {
    let findManyCount = 0;
    indicatorImpl['findMany'] = async () => {
      findManyCount++;
      return [indicatorRow()];
    };
    indicatorImpl['count'] = async () => 1;
    indicatorImpl['findUnique'] = async () => null;

    await listIndicators({});
    assert.equal(findManyCount, 1);

    await assertServiceError(updateIndicator('missing', { label: 'x' }, ACTOR, CONTEXT), 404);
    await listIndicators({});
    assert.equal(findManyCount, 1);
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

  it('invalidates list caches and drops the per-id entry on delete', async () => {
    let findManyCount = 0;
    let rowGone = false;
    indicatorImpl['findUnique'] = async () => (rowGone ? null : indicatorRow());
    indicatorImpl['findMany'] = async () => {
      findManyCount++;
      return rowGone ? [] : [indicatorRow()];
    };
    indicatorImpl['count'] = async () => (rowGone ? 0 : 1);

    await listIndicators({});
    assert.equal((await getIndicatorById('ind-1'))?.id, 'ind-1');
    assert.equal(findManyCount, 1);

    await deleteIndicator('ind-1', ACTOR, CONTEXT);

    rowGone = true;
    const relisted = await listIndicators({});
    assert.equal(findManyCount, 2);
    assert.equal(relisted.total, 0);
    // Per-id slot was dropped: the re-read goes to the DB and observes the miss.
    assert.equal(await getIndicatorById('ind-1'), null);
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

  it('does not retain misses in the shared per-id LRU', async () => {
    let queryCount = 0;
    indicatorImpl['findUnique'] = async () => {
      queryCount++;
      return null;
    };

    assert.equal(await getIndicatorById('ghost-1'), null);
    // The just-allocated slot is dropped instead of caching the miss.
    assert.equal(indicatorByIdCache.has('ghost-1'), false);

    // A repeat miss is short-circuited by the negative set: no second DB hit.
    assert.equal(await getIndicatorById('ghost-1'), null);
    assert.equal(queryCount, 1);
    assert.equal(indicatorByIdCache.has('ghost-1'), false);
  });

  it('forgets a miss after cache invalidation (row may have been created since)', async () => {
    indicatorImpl['findUnique'] = async () => null;
    assert.equal(await getIndicatorById('late-row'), null);

    invalidateIndicatorsCache();
    indicatorImpl['findUnique'] = async () => indicatorRow({ id: 'late-row' });

    const result = await getIndicatorById('late-row');
    assert.equal(result?.id, 'late-row');
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
      // Legacy rows (and rows with no template attached) carry no comparison at all.
      comparisonTemplateId: null,
      comparison: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// Tier-1 computed-comparison prose builder (SPEC §5): an indicator may reference an
// admin-authored comparison template, and its DTO then carries the rendered comparison.
// ---------------------------------------------------------------------------
const templateLock = () =>
  queryRawCalls
    .map((call) => call[0] as { sql: string; values: unknown[] })
    .filter((q) => /comparison_templates/.test(q.sql));

describe('indicators.service tier-1 comparison templates', () => {
  describe('createIndicator', () => {
    let createdData: AnyRecord | null;

    const attachPayload = (overrides: AnyRecord = {}) =>
      validPayload({
        // NAIK_TEXT is rendered with the unit, so the request must carry it: the stub writes
        // whatever the service sends, exactly as the database would.
        unit: 'jiwa',
        isComputedComparison: true,
        valuePrevious: '120000',
        periodPrevious: '2024',
        comparisonTemplateId: 'tpl-1',
        ...overrides,
      });

    beforeEach(() => {
      createdData = null;
      sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
      indicatorImpl['create'] = async (...args: never[]) => {
        const { data } = args[0] as unknown as { data: AnyRecord };
        createdData = data;
        return honoringInclude(
          indicatorRow({ comparisonTemplateId: null, ...data, id: 'ind-new' }),
          args[0],
        );
      };
    });

    it('attaches a template to a computed, paired indicator and renders the comparison', async () => {
      const result = await createIndicator(attachPayload(), ACTOR, CONTEXT);

      assert.equal(createdData!['comparisonTemplateId'], 'tpl-1');
      assert.equal(result.comparisonTemplateId, 'tpl-1');
      assert.deepEqual(result.comparison, { trend: 'naik', text: NAIK_TEXT });
    });

    it('locks the template row FOR UPDATE so a concurrent template delete cannot slip in', async () => {
      await createIndicator(attachPayload(), ACTOR, CONTEXT);

      assert.equal(queryRawCalls.length, 2); // parent section + template
      const locks = templateLock();
      assert.equal(locks.length, 1);
      assert.match(locks[0]!.sql, /FOR UPDATE/);
      assert.deepEqual(locks[0]!.values, ['tpl-1']);
    });

    it('takes no template lock when no template is attached', async () => {
      await createIndicator(validPayload(), ACTOR, CONTEXT);

      assert.equal(queryRawCalls.length, 1);
      assert.equal(templateLock().length, 0);
    });

    describe('refuses indicators that are not genuinely paired (acceptance criterion)', () => {
      const cases: Array<[string, AnyRecord, string]> = [
        [
          'no previous value or period at all',
          validPayload({ comparisonTemplateId: 'tpl-1' }),
          'value_previous',
        ],
        [
          'computed but value_previous is null',
          validPayload({
            isComputedComparison: true,
            valuePrevious: null,
            comparisonTemplateId: 'tpl-1',
          }),
          'value_previous',
        ],
        [
          'a full pair that is not flagged computed',
          validPayload({
            valuePrevious: '120000',
            periodPrevious: '2024',
            comparisonTemplateId: 'tpl-1',
          }),
          'terkomputasi',
        ],
        [
          'computed with value_previous but no period_previous',
          validPayload({
            isComputedComparison: true,
            valuePrevious: '120000',
            periodPrevious: null,
            comparisonTemplateId: 'tpl-1',
          }),
          'period_previous',
        ],
      ];

      for (const [name, payload, messagePart] of cases) {
        it(`400: ${name}`, async () => {
          await assertServiceError(createIndicator(payload, ACTOR, CONTEXT), 400, messagePart);

          assert.equal(txCalls.length, 0);
          assert.equal(createdData, null);
          assert.equal(auditRows.length, 0);
        });
      }
    });

    it('returns 404 for an unknown template and writes nothing', async () => {
      templateImpl['findUnique'] = async () => null;

      await assertServiceError(createIndicator(attachPayload(), ACTOR, CONTEXT), 404, 'Template');

      assert.equal(createdData, null);
      assert.equal(auditRows.length, 0);
    });

    it('accepts comparisonTemplateId: null and omits any comparison', async () => {
      const result = await createIndicator(
        attachPayload({ comparisonTemplateId: null }),
        ACTOR,
        CONTEXT,
      );

      assert.equal(result.comparisonTemplateId, null);
      assert.equal(result.comparison, null);
      assert.equal(queryRawCalls.length, 1);
    });

    it('rejects malformed comparisonTemplateId values with 400', async () => {
      for (const value of ['', '   ', 5, false, {}, [], 'x'.repeat(192)]) {
        await assertServiceError(
          createIndicator(attachPayload({ comparisonTemplateId: value }), ACTOR, CONTEXT),
          400,
        );
      }
      assert.equal(txCalls.length, 0);
    });

    it('trims the template id', async () => {
      await createIndicator(attachPayload({ comparisonTemplateId: '  tpl-1  ' }), ACTOR, CONTEXT);

      assert.equal(createdData!['comparisonTemplateId'], 'tpl-1');
    });
  });

  describe('updateIndicator', () => {
    let storedRow: AnyRecord;
    let updatedData: AnyRecord | null;

    beforeEach(() => {
      storedRow = indicatorRow({ comparisonTemplateId: null });
      updatedData = null;
      sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
      indicatorImpl['findUnique'] = async (...args: never[]) => honoringInclude(storedRow, args[0]);
      indicatorImpl['update'] = async (...args: never[]) => {
        const { data } = args[0] as unknown as { data: AnyRecord };
        updatedData = data;
        return honoringInclude({ ...storedRow, ...data }, args[0]);
      };
    });

    const patch = (payload: AnyRecord) => updateIndicator('ind-1', payload, ACTOR, CONTEXT);
    const changesOf = () =>
      (
        auditRows[0]!['metadata'] as {
          changes: Record<string, { before: unknown; after: unknown }>;
        }
      ).changes;

    describe('attaching', () => {
      it('attaches to a computed, paired indicator, renders it and records the change', async () => {
        const result = await patch({ comparisonTemplateId: 'tpl-1' });

        assert.equal(updatedData!['comparisonTemplateId'], 'tpl-1');
        assert.equal(result.comparisonTemplateId, 'tpl-1');
        assert.deepEqual(result.comparison, { trend: 'naik', text: NAIK_TEXT });
        assert.equal(auditRows.length, 1);
        assert.equal(auditRows[0]!['action'], 'indicator.updated');
        assert.deepEqual(changesOf()['comparisonTemplateId'], { before: null, after: 'tpl-1' });
      });

      it('refuses an indicator whose stored value_previous is null (acceptance criterion)', async () => {
        storedRow = indicatorRow({
          comparisonTemplateId: null,
          isComputedComparison: false,
          valuePrevious: null,
          periodPrevious: null,
        });

        await assertServiceError(patch({ comparisonTemplateId: 'tpl-1' }), 400, 'value_previous');

        assert.equal(updatedData, null);
        assert.equal(auditRows.length, 0);
      });

      it('refuses an indicator that has a pair but is not flagged computed', async () => {
        storedRow = indicatorRow({ comparisonTemplateId: null, isComputedComparison: false });

        await assertServiceError(patch({ comparisonTemplateId: 'tpl-1' }), 400, 'terkomputasi');

        assert.equal(updatedData, null);
      });

      it('allows attaching in the same request that makes the indicator paired and computed', async () => {
        storedRow = indicatorRow({
          comparisonTemplateId: null,
          isComputedComparison: false,
          valuePrevious: null,
          periodPrevious: null,
        });

        const result = await patch({
          isComputedComparison: true,
          valuePrevious: '120000',
          periodPrevious: '2024',
          comparisonTemplateId: 'tpl-1',
        });

        assert.deepEqual(result.comparison, { trend: 'naik', text: NAIK_TEXT });
      });

      it('returns 404 for an unknown template and writes nothing', async () => {
        templateImpl['findUnique'] = async () => null;

        await assertServiceError(patch({ comparisonTemplateId: 'tpl-missing' }), 404, 'Template');

        assert.equal(updatedData, null);
        assert.equal(auditRows.length, 0);
      });

      it('rejects malformed comparisonTemplateId values with 400', async () => {
        for (const value of ['', '   ', 5, false, 'x'.repeat(192)]) {
          await assertServiceError(patch({ comparisonTemplateId: value }), 400);
        }
        assert.equal(txCalls.length, 0);
      });
    });

    describe('while a template is attached', () => {
      beforeEach(() => {
        storedRow = attachedRow();
      });

      it('refuses to clear the pair or the computed flag (each would orphan the template)', async () => {
        for (const payload of [
          { isComputedComparison: false },
          { valuePrevious: null },
          { periodPrevious: null },
          { valuePrevious: null, periodPrevious: null, isComputedComparison: false },
        ]) {
          await assertServiceError(patch(payload), 400);
        }

        assert.equal(updatedData, null);
        assert.equal(auditRows.length, 0);
      });

      it('allows clearing the pair when the same request detaches the template', async () => {
        const result = await patch({
          valuePrevious: null,
          periodPrevious: null,
          isComputedComparison: false,
          comparisonTemplateId: null,
        });

        assert.equal(updatedData!['comparisonTemplateId'], null);
        assert.equal(result.valuePrevious, null);
        assert.equal(result.comparisonTemplateId, null);
        assert.equal(result.comparison, null);
        assert.deepEqual(changesOf()['comparisonTemplateId'], { before: 'tpl-1', after: null });
      });

      it('re-renders when valueCurrent changes the direction', async () => {
        const turun = await patch({ valueCurrent: '115000' });
        assert.deepEqual(turun.comparison, { trend: 'turun', text: TURUN_TEXT });

        const tetap = await patch({ valueCurrent: '120000' });
        assert.deepEqual(tetap.comparison, {
          trend: 'tetap',
          text: 'Berdasarkan data 2025, Jumlah Penduduk tercatat 120.000 jiwa, tidak berubah dibandingkan 2024.',
        });
      });

      it('detaches with comparisonTemplateId: null, recording before/after and taking no template lock', async () => {
        const result = await patch({ comparisonTemplateId: null });

        assert.equal(result.comparisonTemplateId, null);
        assert.equal(result.comparison, null);
        assert.deepEqual(changesOf()['comparisonTemplateId'], { before: 'tpl-1', after: null });
        assert.equal(queryRawCalls.length, 1);
        assert.equal(templateLock().length, 0);
      });

      it('switches to another template, locking the new one', async () => {
        const result = await patch({ comparisonTemplateId: 'tpl-2' });

        assert.equal(result.comparisonTemplateId, 'tpl-2');
        assert.deepEqual(changesOf()['comparisonTemplateId'], { before: 'tpl-1', after: 'tpl-2' });
        const locks = templateLock();
        assert.equal(locks.length, 1);
        assert.deepEqual(locks[0]!.values, ['tpl-2']);
      });

      it('takes no template lock when the template is unchanged', async () => {
        await patch({ comparisonTemplateId: 'tpl-1', label: 'Penduduk Baru' });

        assert.equal(queryRawCalls.length, 1);
        assert.equal(templateLock().length, 0);
      });

      it('leaves the template alone on unrelated edits', async () => {
        const result = await patch({ label: 'Penduduk Baru' });

        assert.equal('comparisonTemplateId' in updatedData!, false);
        assert.equal(queryRawCalls.length, 1);
        assert.equal(result.comparisonTemplateId, 'tpl-1');
        assert.match(result.comparison!.text, /Penduduk Baru/);
      });

      it('treats re-sending the same template id as a no-op that still reports the comparison', async () => {
        const result = await patch({ comparisonTemplateId: 'tpl-1' });

        assert.equal(txIndicatorCalls['update']?.length ?? 0, 0);
        assert.equal(auditRows.length, 0);
        assert.deepEqual(result.comparison, { trend: 'naik', text: NAIK_TEXT });
      });
    });

    it('still maps a racing destination-section delete (P2003) to a Section 404', async () => {
      indicatorImpl['update'] = async () => {
        throw p2003();
      };

      await assertServiceError(patch({ sectionId: 'sec-2', label: 'Pindah' }), 404, 'Section');
    });
  });

  describe('reads', () => {
    it('asks the database for the related template on list and get', async () => {
      let listArgs: AnyRecord | null = null;
      let getArgs: AnyRecord | null = null;
      indicatorImpl['findMany'] = async (...args: never[]) => {
        listArgs = args[0] as unknown as AnyRecord;
        return [];
      };
      indicatorImpl['count'] = async () => 0;
      indicatorImpl['findUnique'] = async (...args: never[]) => {
        getArgs = args[0] as unknown as AnyRecord;
        return null;
      };

      await listIndicators({});
      await getIndicatorById('ind-1');

      assert.deepEqual(listArgs!['include'], { comparisonTemplate: true });
      assert.deepEqual(getArgs!['include'], { comparisonTemplate: true });
    });

    it('renders the comparison per row in a list and leaves unattached rows null', async () => {
      indicatorImpl['findMany'] = async (...args: never[]) => [
        honoringInclude(attachedRow(), args[0]),
        honoringInclude(
          indicatorRow({ id: 'ind-2', slug: 'lain', comparisonTemplateId: null }),
          args[0],
        ),
      ];
      indicatorImpl['count'] = async () => 2;

      const { indicators } = await listIndicators({});

      assert.deepEqual(indicators[0]!.comparison, { trend: 'naik', text: NAIK_TEXT });
      assert.equal(indicators[0]!.comparisonTemplateId, 'tpl-1');
      assert.equal(indicators[1]!.comparison, null);
      assert.equal(indicators[1]!.comparisonTemplateId, null);
    });

    it('renders the comparison on get', async () => {
      indicatorImpl['findUnique'] = async (...args: never[]) =>
        honoringInclude(attachedRow(), args[0]);

      const result = await getIndicatorById('ind-1');

      assert.deepEqual(result?.comparison, { trend: 'naik', text: NAIK_TEXT });
    });

    it('never renders an unpaired row even if a template is somehow attached (CHECK bypassed)', async () => {
      indicatorImpl['findUnique'] = async (...args: never[]) =>
        honoringInclude(attachedRow({ valuePrevious: null, periodPrevious: null }), args[0]);

      const result = await getIndicatorById('ind-1');

      assert.equal(result?.comparison, null);
      assert.equal(result?.comparisonTemplateId, 'tpl-1'); // still visible, so an editor can fix it
    });

    it('never renders a row that is not flagged computed', async () => {
      indicatorImpl['findUnique'] = async (...args: never[]) =>
        honoringInclude(attachedRow({ isComputedComparison: false }), args[0]);

      assert.equal((await getIndicatorById('ind-1'))?.comparison, null);
    });

    it('treats a dangling template id (relation missing) as no comparison, without throwing', async () => {
      indicatorImpl['findUnique'] = async () =>
        indicatorRow({ comparisonTemplateId: 'tpl-gone', comparisonTemplate: null });

      const result = await getIndicatorById('ind-1');

      assert.equal(result?.comparison, null);
      assert.equal(result?.comparisonTemplateId, 'tpl-gone');
    });
  });

  describe('deleteIndicator', () => {
    it('deletes an indicator with an attached template and snapshots its comparison in the audit row', async () => {
      indicatorImpl['findUnique'] = async (...args: never[]) =>
        honoringInclude(attachedRow(), args[0]);
      indicatorImpl['delete'] = async () => attachedRow();

      const result = await deleteIndicator('ind-1', ACTOR, CONTEXT);

      assert.deepEqual(result.comparison, { trend: 'naik', text: NAIK_TEXT });
      const before = (auditRows[0]!['metadata'] as { before: AnyRecord }).before;
      assert.equal(before['comparisonTemplateId'], 'tpl-1');
      assert.deepEqual(before['comparison'], { trend: 'naik', text: NAIK_TEXT });
    });
  });
});
