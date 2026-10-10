import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  listComparisonTemplates,
  getComparisonTemplateById,
  createComparisonTemplate,
  updateComparisonTemplate,
  deleteComparisonTemplate,
  ComparisonTemplateServiceError,
  DEFAULT_COMPARISON_TEMPLATES,
} from '../services/comparisonTemplates.service.js';
import { getIndicatorById, invalidateIndicatorsCache } from '../services/indicators.service.js';
import { renderComparison, validateTemplateStructure } from '../utils/comparisonProse.js';
import { findTrendKeywords, trendWarningAckKey } from '../utils/trendKeywords.js';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

type AnyRecord = Record<string, unknown>;
type AsyncFn = (...args: never[]) => Promise<unknown>;

const ACTOR = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
const CONTEXT = { ipAddress: '127.0.0.1', userAgent: 'TestAgent/1.0' };

const CLEAN_BODY =
  'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.';
// "terus" and "meningkat" are both trend words sitting outside the {trend} slot.
const FLAGGED_BODY =
  'Berdasarkan data {period_current}, {label} terus meningkat, {trend} dibandingkan {period_previous}.';
// The same keyword twice, to prove an acknowledgment is bound to one occurrence.
const TWICE_BODY = 'Penduduk meningkat dan meningkat lagi, {trend} dibandingkan {period_previous}.';

const keysFor = (body: string): string[] =>
  findTrendKeywords(body).map((match) => trendWarningAckKey(body, match));

const validPayload = (overrides: AnyRecord = {}) => ({
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
  ...validPayload(),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

const indicatorRow = () => ({
  id: 'ind-1',
  sectionId: 'sec-1',
  slug: 'jumlah-penduduk',
  label: 'Jumlah Penduduk',
  unit: 'jiwa',
  valueCurrent: '12480',
  valuePrevious: '12360',
  periodCurrent: '2025',
  periodPrevious: '2024',
  isComputedComparison: true,
  isStale: false,
  source: null,
  hedgeNote: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
});

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

// ---------------------------------------------------------------------------
// Stub harness (same approach as indicators.service.test.ts): prisma.$transaction runs the
// callback against an in-memory tx, so mutation + audit atomicity is observable without a DB.
// The stubs are faithful where it matters: `_count` only comes back when the code under test
// actually asks for it via `include`.
// ---------------------------------------------------------------------------
let stored: AnyRecord | null; // the row tx.comparisonTemplate.findUnique returns
let usage: number; // how many indicators reference `stored`
let templateImpl: Record<string, AsyncFn>;
let readImpl: Record<string, AsyncFn>; // non-transactional prisma.comparisonTemplate.*
let templateCalls: Record<string, unknown[][]>;
let indicatorCountCalls: unknown[][];
let auditRows: AnyRecord[];
let auditFailure: Error | null;
let txCalls: unknown[][];
let queryRawCalls: unknown[][];
let originals: Array<{ target: AnyRecord; key: string; fn: unknown }>;

function stubMethod(target: AnyRecord, key: string, fn: AsyncFn) {
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
  templateCalls = {};
  indicatorCountCalls = [];
  auditRows = [];
  auditFailure = null;
  txCalls = [];
  queryRawCalls = [];
  originals = [];
  invalidateIndicatorsCache();

  templateImpl['findUnique'] = async (...args: never[]) =>
    stored ? withCount(stored, args[0]) : null;
  templateImpl['create'] = async (...args: never[]) => {
    const { data } = args[0] as unknown as { data: AnyRecord };
    return withCount(templateRow({ ...data, id: 'tpl-new' }), args[0]);
  };
  templateImpl['update'] = async (...args: never[]) => {
    const { data } = args[0] as unknown as { data: AnyRecord };
    return withCount(
      templateRow({ ...stored, ...data, updatedAt: new Date('2026-02-01T00:00:00.000Z') }),
      args[0],
    );
  };
  templateImpl['delete'] = async () => stored;

  const tx = {
    $queryRaw: (async (...args: never[]) => {
      queryRawCalls.push(args);
      return [];
    }) as AsyncFn,
    comparisonTemplate: new Proxy(
      {},
      {
        get:
          (_t, prop: string) =>
          async (...args: never[]) => {
            templateCalls[prop] ??= [];
            templateCalls[prop]!.push(args);
            if (!templateImpl[prop]) throw new Error(`unexpected tx.comparisonTemplate.${prop}`);
            return templateImpl[prop]!(...args);
          },
      },
    ),
    indicator: {
      count: (async (...args: never[]) => {
        indicatorCountCalls.push(args);
        return usage;
      }) as AsyncFn,
    },
    auditLog: {
      create: (async (...args: never[]) => {
        if (auditFailure) throw auditFailure;
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

async function assertServiceError(
  promise: Promise<unknown>,
  statusCode: number,
  messagePart?: RegExp,
): Promise<ComparisonTemplateServiceError> {
  let caught: ComparisonTemplateServiceError | undefined;
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof ComparisonTemplateServiceError, `unexpected error: ${String(err)}`);
    assert.equal(err.statusCode, statusCode);
    if (messagePart) assert.match(err.message, messagePart);
    caught = err;
    return true;
  });
  return caught!;
}

const warningsOf = (err: ComparisonTemplateServiceError): AnyRecord[] =>
  (err as unknown as { warnings: AnyRecord[] }).warnings;
const codeOf = (err: ComparisonTemplateServiceError): unknown =>
  (err as unknown as AnyRecord)['code'];

/** Primes the shared per-id indicator cache; the returned fn reports DB reads so far. */
async function primeIndicatorCache(): Promise<() => number> {
  let dbReads = 0;
  stubMethod(prisma.indicator as unknown as AnyRecord, 'findUnique', (async () => {
    dbReads += 1;
    return indicatorRow();
  }) as AsyncFn);
  await getIndicatorById('ind-1');
  await getIndicatorById('ind-1');
  assert.equal(dbReads, 1, 'precondition: second read must be served from cache');
  return () => dbReads;
}

const lockedSql = (callIndex = 0) => {
  const query = queryRawCalls[callIndex]![0] as { sql: string; values: unknown[] };
  return { sql: query.sql, values: query.values };
};

describe('comparisonTemplates.service reads', () => {
  it('lists templates ordered by label then id, mapping _count.indicators to usageCount', async () => {
    let findManyArgs: unknown;
    readImpl['findMany'] = async (...args: never[]) => {
      findManyArgs = args[0];
      return [
        { ...templateRow({ id: 'tpl-a', label: 'A' }), _count: { indicators: 2 } },
        { ...templateRow({ id: 'tpl-b', label: 'B' }), _count: { indicators: 0 } },
      ];
    };

    const result = await listComparisonTemplates();

    assert.deepEqual(
      result.map((t) => [t.id, t.usageCount]),
      [
        ['tpl-a', 2],
        ['tpl-b', 0],
      ],
    );
    const args = findManyArgs as { orderBy: unknown; include: unknown };
    assert.deepEqual(args.orderBy, [{ label: 'asc' }, { id: 'asc' }]);
    assert.deepEqual(args.include, { _count: { select: { indicators: true } } });
  });

  it('returns the template DTO with ISO timestamps and no internal fields', async () => {
    readImpl['findUnique'] = async () => ({ ...templateRow(), _count: { indicators: 3 } });

    const result = await getComparisonTemplateById('tpl-1');

    assert.deepEqual(result, {
      id: 'tpl-1',
      slug: 'perbandingan-tahunan',
      label: 'Perbandingan tahunan',
      body: CLEAN_BODY,
      trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
      trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
      trendTetap: 'tidak berubah',
      usageCount: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('returns null for an unknown id', async () => {
    readImpl['findUnique'] = async () => null;

    assert.equal(await getComparisonTemplateById('missing'), null);
  });

  it('returns null for an invalid id without touching the database', async () => {
    let reads = 0;
    readImpl['findUnique'] = async () => {
      reads += 1;
      return null;
    };

    for (const id of [undefined, null, 42, {}, '', '   ', 'x'.repeat(192)]) {
      assert.equal(await getComparisonTemplateById(id), null);
    }
    assert.equal(reads, 0);
  });
});

describe('comparisonTemplates.service createComparisonTemplate', () => {
  describe('validation (400, nothing written)', () => {
    it('rejects non-object payloads', async () => {
      for (const payload of [null, undefined, 'x', 42, []]) {
        await assertServiceError(createComparisonTemplate(payload, ACTOR, CONTEXT), 400);
      }
      assert.equal(txCalls.length, 0);
    });

    it('rejects unknown fields (strict schema)', async () => {
      await assertServiceError(
        createComparisonTemplate(validPayload({ usageCount: 5 }), ACTOR, CONTEXT),
        400,
      );
      await assertServiceError(
        createComparisonTemplate(validPayload({ id: 'forced-id' }), ACTOR, CONTEXT),
        400,
      );
      assert.equal(txCalls.length, 0);
    });

    for (const field of ['slug', 'label', 'body', 'trendNaik', 'trendTurun', 'trendTetap']) {
      it(`requires ${field}`, async () => {
        const missing: AnyRecord = validPayload();
        delete missing[field];

        await assertServiceError(createComparisonTemplate(missing, ACTOR, CONTEXT), 400);
        await assertServiceError(
          createComparisonTemplate(validPayload({ [field]: '' }), ACTOR, CONTEXT),
          400,
        );
        await assertServiceError(
          createComparisonTemplate(validPayload({ [field]: '   ' }), ACTOR, CONTEXT),
          400,
        );
        await assertServiceError(
          createComparisonTemplate(validPayload({ [field]: 5 }), ACTOR, CONTEXT),
          400,
        );
        assert.equal(txCalls.length, 0);
      });
    }

    it('rejects malformed slugs and accepts a 100-character one', async () => {
      for (const slug of [
        'Bad_Slug!',
        'two--dashes',
        '-lead',
        'trail-',
        'spasi di tengah',
        'a'.repeat(101),
      ]) {
        await assertServiceError(
          createComparisonTemplate(validPayload({ slug }), ACTOR, CONTEXT),
          400,
        );
      }
      assert.equal(txCalls.length, 0);

      const result = await createComparisonTemplate(
        validPayload({ slug: 'a'.repeat(100) }),
        ACTOR,
        CONTEXT,
      );
      assert.equal(result.slug, 'a'.repeat(100));
    });

    it('enforces length limits: label 255, body 2000, each variant 500', async () => {
      const longBody = (n: number) => `{trend}${'a'.repeat(n - '{trend}'.length)}`;

      await createComparisonTemplate(validPayload({ label: 'l'.repeat(255) }), ACTOR, CONTEXT);
      await createComparisonTemplate(validPayload({ body: longBody(2000) }), ACTOR, CONTEXT);
      for (const field of ['trendNaik', 'trendTurun', 'trendTetap']) {
        await createComparisonTemplate(validPayload({ [field]: 'v'.repeat(500) }), ACTOR, CONTEXT);
      }

      const before = txCalls.length;
      await assertServiceError(
        createComparisonTemplate(validPayload({ label: 'l'.repeat(256) }), ACTOR, CONTEXT),
        400,
      );
      await assertServiceError(
        createComparisonTemplate(validPayload({ body: longBody(2001) }), ACTOR, CONTEXT),
        400,
      );
      for (const field of ['trendNaik', 'trendTurun', 'trendTetap']) {
        await assertServiceError(
          createComparisonTemplate(validPayload({ [field]: 'v'.repeat(501) }), ACTOR, CONTEXT),
          400,
        );
      }
      assert.equal(txCalls.length, before);
    });

    it('rejects a body with no {trend} slot, naming the slot', async () => {
      await assertServiceError(
        createComparisonTemplate(validPayload({ body: 'Tidak ada slot.' }), ACTOR, CONTEXT),
        400,
        /\{trend\}/,
      );
      assert.equal(txCalls.length, 0);
    });

    it('rejects a body with two {trend} slots', async () => {
      await assertServiceError(
        createComparisonTemplate(validPayload({ body: '{trend} dan {trend}' }), ACTOR, CONTEXT),
        400,
        /\{trend\}/,
      );
      assert.equal(txCalls.length, 0);
    });

    it('rejects {trend} inside a variant', async () => {
      for (const field of ['trendNaik', 'trendTurun', 'trendTetap']) {
        await assertServiceError(
          createComparisonTemplate(validPayload({ [field]: 'x {trend}' }), ACTOR, CONTEXT),
          400,
          /\{trend\}/,
        );
      }
      assert.equal(txCalls.length, 0);
    });

    it('rejects an unknown placeholder, naming it', async () => {
      await assertServiceError(
        createComparisonTemplate(validPayload({ body: '{trend} {populasi}' }), ACTOR, CONTEXT),
        400,
        /populasi/,
      );
      await assertServiceError(
        createComparisonTemplate(validPayload({ trendTetap: '{persen}' }), ACTOR, CONTEXT),
        400,
        /persen/,
      );
      assert.equal(txCalls.length, 0);
    });

    it('rejects stray braces', async () => {
      await assertServiceError(
        createComparisonTemplate(validPayload({ body: '{trend} }' }), ACTOR, CONTEXT),
        400,
      );
      await assertServiceError(
        createComparisonTemplate(validPayload({ trendNaik: 'naik {' }), ACTOR, CONTEXT),
        400,
      );
      assert.equal(txCalls.length, 0);
    });

    it('rejects a malformed acknowledgedWarnings value', async () => {
      for (const acknowledgedWarnings of [
        'not-an-array',
        { a: 1 },
        [123],
        [null],
        ['k'.repeat(129)],
        Array.from({ length: 401 }, (_, i) => `key-${i}`),
      ]) {
        await assertServiceError(
          createComparisonTemplate(validPayload({ acknowledgedWarnings }), ACTOR, CONTEXT),
          400,
        );
      }
      assert.equal(txCalls.length, 0);
    });

    it('accepts acknowledgedWarnings at its limits (400 keys, 128 characters each)', async () => {
      const result = await createComparisonTemplate(
        validPayload({
          acknowledgedWarnings: Array.from({ length: 400 }, (_, i) => `${i}`.padEnd(128, 'k')),
        }),
        ACTOR,
        CONTEXT,
      );

      assert.equal(result.id, 'tpl-new');
    });
  });

  describe('happy path', () => {
    it('creates the template and writes one comparison_template.created audit row in the same transaction', async () => {
      const result = await createComparisonTemplate(validPayload(), ACTOR, CONTEXT);

      assert.equal(result.id, 'tpl-new');
      assert.equal(result.slug, 'perbandingan-tahunan');
      assert.equal(result.usageCount, 0);
      assert.equal(txCalls.length, 1);
      assert.equal(typeof txCalls[0]![0], 'function');
      assert.equal(auditRows.length, 1);
      const audit = auditRows[0]!;
      assert.equal(audit['action'], 'comparison_template.created');
      assert.equal(audit['severity'], 'info');
      assert.equal(audit['outcome'], 'success');
      assert.equal(audit['targetType'], 'comparison_template');
      assert.equal(audit['targetId'], 'tpl-new');
      assert.equal(audit['targetLabel'], 'perbandingan-tahunan');
      assert.equal(audit['actorId'], ACTOR.id);
      assert.equal(audit['actorEmail'], ACTOR.email);
      assert.equal(audit['actorRole'], ACTOR.role);
      assert.equal(audit['ipAddress'], CONTEXT.ipAddress);
      assert.equal(audit['userAgent'], CONTEXT.userAgent);
      assert.deepEqual(audit['metadata'], {
        slug: 'perbandingan-tahunan',
        label: 'Perbandingan tahunan',
      });
    });

    it('trims every text field and lowercases the slug before writing', async () => {
      await createComparisonTemplate(
        validPayload({
          slug: '  Perbandingan-Tahunan  ',
          label: '  Perbandingan tahunan  ',
          body: `  ${CLEAN_BODY}  `,
          trendNaik: '  naik  ',
          trendTurun: '  turun  ',
          trendTetap: '  tetap  ',
        }),
        ACTOR,
        CONTEXT,
      );

      const data = (templateCalls['create']![0]![0] as { data: AnyRecord }).data;
      assert.deepEqual(data, {
        slug: 'perbandingan-tahunan',
        label: 'Perbandingan tahunan',
        body: CLEAN_BODY,
        trendNaik: 'naik',
        trendTurun: 'turun',
        trendTetap: 'tetap',
      });
    });

    it('does not flag trend words inside the variants (that is the conditional slot)', async () => {
      await createComparisonTemplate(
        validPayload({ trendNaik: 'meningkat tajam {delta}', trendTurun: 'menurun terus' }),
        ACTOR,
        CONTEXT,
      );

      assert.equal(auditRows.length, 1);
      assert.equal(auditRows[0]!['action'], 'comparison_template.created');
    });

    it('ignores acknowledgment keys that match no finding', async () => {
      await createComparisonTemplate(
        validPayload({ acknowledgedWarnings: ['0'.repeat(64)] }),
        ACTOR,
        CONTEXT,
      );

      assert.equal(auditRows.length, 1);
      assert.equal(auditRows[0]!['action'], 'comparison_template.created');
    });

    it('never stores acknowledgedWarnings on the template row', async () => {
      await createComparisonTemplate(
        validPayload({ acknowledgedWarnings: ['0'.repeat(64)] }),
        ACTOR,
        CONTEXT,
      );

      const data = (templateCalls['create']![0]![0] as { data: AnyRecord }).data;
      assert.equal('acknowledgedWarnings' in data, false);
    });
  });

  describe('warn-on-save for trend words outside {trend}', () => {
    it('responds 422 with every finding when nothing is acknowledged, and writes nothing', async () => {
      const err = await assertServiceError(
        createComparisonTemplate(validPayload({ body: FLAGGED_BODY }), ACTOR, CONTEXT),
        422,
      );

      assert.equal(codeOf(err), 'TREND_KEYWORD_ACK_REQUIRED');
      assert.ok(err.message.length > 0);
      const warnings = warningsOf(err);
      const expected = findTrendKeywords(FLAGGED_BODY);
      assert.deepEqual(
        warnings.map((w) => w['phrase']),
        ['terus', 'meningkat'],
      );
      assert.equal(warnings.length, expected.length);
      warnings.forEach((warning, i) => {
        const match = expected[i]!;
        assert.equal(warning['keyword'], match.keyword);
        assert.equal(warning['start'], match.start);
        assert.equal(warning['end'], match.end);
        assert.equal(warning['excerpt'], match.excerpt);
        assert.equal(warning['ackKey'], trendWarningAckKey(FLAGGED_BODY, match));
        assert.equal(warning['acknowledged'], false);
        assert.equal(typeof warning['message'], 'string');
        assert.ok((warning['message'] as string).includes(`"${match.phrase}"`));
        assert.ok((warning['message'] as string).includes('{trend}'));
      });
      assert.equal(templateCalls['create'], undefined);
      assert.equal(auditRows.length, 0);
    });

    it('still responds 422 when only some findings are acknowledged, flagging which', async () => {
      const [terusKey] = keysFor(FLAGGED_BODY);

      const err = await assertServiceError(
        createComparisonTemplate(
          validPayload({ body: FLAGGED_BODY, acknowledgedWarnings: [terusKey] }),
          ACTOR,
          CONTEXT,
        ),
        422,
      );

      assert.deepEqual(
        warningsOf(err).map((w) => [w['phrase'], w['acknowledged']]),
        [
          ['terus', true],
          ['meningkat', false],
        ],
      );
      assert.equal(templateCalls['create'], undefined);
      assert.equal(auditRows.length, 0);
    });

    it('saves when every finding is acknowledged and logs the override in the same transaction', async () => {
      const result = await createComparisonTemplate(
        validPayload({ body: FLAGGED_BODY, acknowledgedWarnings: keysFor(FLAGGED_BODY) }),
        ACTOR,
        CONTEXT,
      );

      assert.equal(result.body, FLAGGED_BODY);
      assert.equal(txCalls.length, 1);
      assert.deepEqual(auditRows.map((r) => r['action']).sort(), [
        'comparison_template.created',
        'comparison_template.keyword_warning_overridden',
      ]);
      const override = auditRows.find(
        (r) => r['action'] === 'comparison_template.keyword_warning_overridden',
      )!;
      assert.equal(override['severity'], 'warning');
      assert.equal(override['outcome'], 'success');
      assert.equal(override['targetType'], 'comparison_template');
      assert.equal(override['targetId'], 'tpl-new');
      assert.equal(override['targetLabel'], 'perbandingan-tahunan');
      assert.equal(override['actorEmail'], ACTOR.email);
      assert.equal(override['ipAddress'], CONTEXT.ipAddress);
      assert.deepEqual(override['metadata'], {
        slug: 'perbandingan-tahunan',
        overrides: findTrendKeywords(FLAGGED_BODY).map(({ phrase, keyword, start, excerpt }) => ({
          phrase,
          keyword,
          start,
          excerpt,
        })),
      });
    });

    it('never writes the acknowledgment keys into any audit row', async () => {
      await createComparisonTemplate(
        validPayload({ body: FLAGGED_BODY, acknowledgedWarnings: keysFor(FLAGGED_BODY) }),
        ACTOR,
        CONTEXT,
      );

      const serialized = JSON.stringify(auditRows);
      for (const key of keysFor(FLAGGED_BODY)) assert.equal(serialized.includes(key), false);
    });

    it('rejects a key computed for a different body (acknowledgment is bound to the exact wording)', async () => {
      const staleKeys = keysFor(FLAGGED_BODY);
      const editedBody = FLAGGED_BODY.replace('data', 'dara'); // same length, same positions

      const err = await assertServiceError(
        createComparisonTemplate(
          validPayload({ body: editedBody, acknowledgedWarnings: staleKeys }),
          ACTOR,
          CONTEXT,
        ),
        422,
      );

      assert.deepEqual(
        warningsOf(err).map((w) => w['acknowledged']),
        [false, false],
      );
      assert.equal(auditRows.length, 0);
    });

    it('binds an acknowledgment to one occurrence of a repeated keyword', async () => {
      const [first] = keysFor(TWICE_BODY);

      const err = await assertServiceError(
        createComparisonTemplate(
          validPayload({ body: TWICE_BODY, acknowledgedWarnings: [first, first] }),
          ACTOR,
          CONTEXT,
        ),
        422,
      );

      assert.deepEqual(
        warningsOf(err).map((w) => [w['phrase'], w['acknowledged']]),
        [
          ['meningkat', true],
          ['meningkat', false],
        ],
      );
    });

    it('saves a repeated keyword once each occurrence is acknowledged', async () => {
      await createComparisonTemplate(
        validPayload({ body: TWICE_BODY, acknowledgedWarnings: keysFor(TWICE_BODY) }),
        ACTOR,
        CONTEXT,
      );

      const override = auditRows.find(
        (r) => r['action'] === 'comparison_template.keyword_warning_overridden',
      )!;
      assert.equal((override['metadata'] as { overrides: unknown[] }).overrides.length, 2);
    });

    it('can save a maximum-length body in which every word is flagged (every occurrence needs a key)', async () => {
      const body = `{trend}${' naik'.repeat(398)}`; // 1997 characters, 398 flagged occurrences
      assert.equal(findTrendKeywords(body).length, 398);

      await createComparisonTemplate(
        validPayload({ body, acknowledgedWarnings: keysFor(body) }),
        ACTOR,
        CONTEXT,
      );

      const override = auditRows.find(
        (r) => r['action'] === 'comparison_template.keyword_warning_overridden',
      )!;
      assert.equal((override['metadata'] as { overrides: unknown[] }).overrides.length, 398);
    });

    it('checks structure before keywords: a malformed flagged body is a 400, not a 422', async () => {
      await assertServiceError(
        createComparisonTemplate(
          validPayload({ body: 'terus meningkat tanpa slot' }),
          ACTOR,
          CONTEXT,
        ),
        400,
        /\{trend\}/,
      );
    });
  });

  describe('failures', () => {
    it('maps a unique-slug violation (P2002) to 409', async () => {
      templateImpl['create'] = async () => {
        throw prismaError('P2002');
      };

      await assertServiceError(
        createComparisonTemplate(validPayload(), ACTOR, CONTEXT),
        409,
        /perbandingan-tahunan/,
      );
    });

    it('lets an audit-write failure fail the request instead of swallowing it', async () => {
      auditFailure = new Error('audit table unavailable');

      await assert.rejects(
        createComparisonTemplate(validPayload(), ACTOR, CONTEXT),
        /audit table unavailable/,
      );
    });

    it('rethrows unexpected database errors untouched', async () => {
      templateImpl['create'] = async () => {
        throw new Error('connection lost');
      };

      await assert.rejects(
        createComparisonTemplate(validPayload(), ACTOR, CONTEXT),
        /connection lost/,
      );
    });
  });
});

describe('comparisonTemplates.service updateComparisonTemplate', () => {
  const update = (payload: unknown, id: unknown = 'tpl-1') =>
    updateComparisonTemplate(id, payload, ACTOR, CONTEXT);

  describe('input validation', () => {
    it('rejects an invalid id with 400 before opening a transaction', async () => {
      // Called directly: the `update` helper's default id would swallow `undefined`.
      for (const id of [undefined, null, 42, '', '   ', 'x'.repeat(192)]) {
        await assertServiceError(
          updateComparisonTemplate(id, { label: 'Baru' }, ACTOR, CONTEXT),
          400,
        );
      }
      assert.equal(txCalls.length, 0);
    });

    it('rejects non-object payloads and unknown fields', async () => {
      for (const payload of [null, 'x', 42, []]) {
        await assertServiceError(update(payload), 400);
      }
      await assertServiceError(update({ label: 'Baru', usageCount: 1 }), 400);
      assert.equal(txCalls.length, 0);
    });

    it('requires at least one real field (acknowledgedWarnings alone does not count)', async () => {
      await assertServiceError(update({}), 400);
      await assertServiceError(update({ acknowledgedWarnings: [] }), 400);
      await assertServiceError(update({ acknowledgedWarnings: keysFor(FLAGGED_BODY) }), 400);
      assert.equal(txCalls.length, 0);
    });

    it('applies the same field rules as create', async () => {
      for (const payload of [
        { slug: 'Bad_Slug!' },
        { label: '' },
        { label: 'l'.repeat(256) },
        { body: '' },
        { trendNaik: 'v'.repeat(501) },
        { acknowledgedWarnings: 'nope' },
      ]) {
        await assertServiceError(update(payload), 400);
      }
      assert.equal(txCalls.length, 0);
    });

    it('normalizes the slug', async () => {
      await update({ slug: '  Slug-Baru ' });

      const data = (templateCalls['update']![0]![0] as { data: AnyRecord }).data;
      assert.equal(data['slug'], 'slug-baru');
    });
  });

  describe('locking and lookup', () => {
    it('locks the template row FOR UPDATE before reading it', async () => {
      await update({ label: 'Baru' });

      assert.equal(queryRawCalls.length >= 1, true);
      const { sql, values } = lockedSql();
      assert.match(sql, /comparison_templates/);
      assert.match(sql, /FOR UPDATE/);
      assert.deepEqual(values, ['tpl-1']);
    });

    it('responds 404 when the template does not exist', async () => {
      stored = null;

      await assertServiceError(update({ label: 'Baru' }), 404);
      assert.equal(templateCalls['update'], undefined);
      assert.equal(auditRows.length, 0);
    });

    it('maps P2025 from the update to 404', async () => {
      templateImpl['update'] = async () => {
        throw prismaError('P2025');
      };

      await assertServiceError(update({ label: 'Baru' }), 404);
    });

    it('maps a unique-slug violation (P2002) to 409', async () => {
      templateImpl['update'] = async () => {
        throw prismaError('P2002');
      };

      await assertServiceError(update({ slug: 'dipakai' }), 409);
    });
  });

  describe('change tracking and audit', () => {
    it('writes comparison_template.updated with only the changed fields', async () => {
      const result = await update({ label: 'Label baru' });

      assert.equal(result.label, 'Label baru');
      assert.equal(txCalls.length, 1);
      assert.equal(auditRows.length, 1);
      const audit = auditRows[0]!;
      assert.equal(audit['action'], 'comparison_template.updated');
      assert.equal(audit['severity'], 'info');
      assert.equal(audit['targetType'], 'comparison_template');
      assert.equal(audit['targetId'], 'tpl-1');
      assert.equal(audit['targetLabel'], 'perbandingan-tahunan');
      assert.equal(audit['actorEmail'], ACTOR.email);
      assert.deepEqual(audit['metadata'], {
        slug: 'perbandingan-tahunan',
        changes: { label: { before: 'Perbandingan tahunan', after: 'Label baru' } },
      });
      const data = (templateCalls['update']![0]![0] as { data: AnyRecord }).data;
      assert.equal(data['label'], 'Label baru');
      assert.equal('body' in data, false);
    });

    it('records a variant-only change as just that field', async () => {
      await update({ trendTurun: 'turun sebesar {delta} {unit}' });

      const metadata = auditRows[0]!['metadata'] as { changes: AnyRecord };
      assert.deepEqual(Object.keys(metadata.changes), ['trendTurun']);
      assert.deepEqual(metadata.changes['trendTurun'], {
        before: 'turun {delta} {unit} ({delta_percent}%)',
        after: 'turun sebesar {delta} {unit}',
      });
    });

    it('records a slug rename as before/after', async () => {
      await update({ slug: 'nama-baru' });

      const metadata = auditRows[0]!['metadata'] as { slug: string; changes: AnyRecord };
      assert.equal(metadata.slug, 'perbandingan-tahunan');
      assert.deepEqual(metadata.changes['slug'], {
        before: 'perbandingan-tahunan',
        after: 'nama-baru',
      });
    });

    it('reports usageCount on the returned DTO', async () => {
      usage = 3;

      const result = await update({ label: 'Baru' });

      assert.equal(result.usageCount, 3);
    });

    it('treats a resubmission of identical values as a no-op: no write, no audit row', async () => {
      const result = await update({
        label: 'Perbandingan tahunan',
        body: `${CLEAN_BODY}   `, // trims back to the stored body
        trendTetap: 'tidak berubah',
      });

      assert.equal(result.id, 'tpl-1');
      assert.equal(templateCalls['update'], undefined);
      assert.equal(auditRows.length, 0);
    });

    it('propagates an audit-write failure', async () => {
      auditFailure = new Error('audit table unavailable');

      await assert.rejects(update({ label: 'Baru' }), /audit table unavailable/);
    });
  });

  describe('structure is validated on the merged template', () => {
    it('rejects a variant edit that introduces {trend}', async () => {
      await assertServiceError(update({ trendNaik: 'naik {trend}' }), 400, /\{trend\}/);
      assert.equal(templateCalls['update'], undefined);
    });

    it('rejects a body edit that removes {trend}', async () => {
      await assertServiceError(update({ body: 'Tanpa slot.' }), 400, /\{trend\}/);
      assert.equal(templateCalls['update'], undefined);
    });

    it('rejects a body edit that duplicates {trend}', async () => {
      await assertServiceError(update({ body: '{trend} {trend}' }), 400, /\{trend\}/);
    });

    it('rejects an unknown placeholder in an edited variant', async () => {
      await assertServiceError(update({ trendTetap: '{bogus}' }), 400, /bogus/);
      assert.equal(auditRows.length, 0);
    });
  });

  describe('warn-on-save', () => {
    it('does not run the keyword check when the body is untouched, even if the stored body is flagged', async () => {
      stored = templateRow({ body: FLAGGED_BODY });

      const result = await update({ label: 'Label baru' });

      assert.equal(result.label, 'Label baru');
      assert.equal(auditRows.length, 1);
      assert.equal(auditRows[0]!['action'], 'comparison_template.updated');
    });

    it('does not re-trigger when the body is resubmitted unchanged alongside another edit', async () => {
      stored = templateRow({ body: FLAGGED_BODY });

      await update({ body: FLAGGED_BODY, label: 'Label baru' });

      assert.deepEqual(
        auditRows.map((r) => r['action']),
        ['comparison_template.updated'],
      );
      const metadata = auditRows[0]!['metadata'] as { changes: AnyRecord };
      assert.deepEqual(Object.keys(metadata.changes), ['label']);
    });

    it('responds 422 when a body edit introduces a trend word and nothing is acknowledged', async () => {
      const err = await assertServiceError(update({ body: FLAGGED_BODY }), 422);

      assert.equal(codeOf(err), 'TREND_KEYWORD_ACK_REQUIRED');
      assert.deepEqual(
        warningsOf(err).map((w) => w['phrase']),
        ['terus', 'meningkat'],
      );
      assert.equal(templateCalls['update'], undefined);
      assert.equal(auditRows.length, 0);
    });

    it('saves with updated + override rows once every finding is acknowledged', async () => {
      await update({ body: FLAGGED_BODY, acknowledgedWarnings: keysFor(FLAGGED_BODY) });

      assert.deepEqual(auditRows.map((r) => r['action']).sort(), [
        'comparison_template.keyword_warning_overridden',
        'comparison_template.updated',
      ]);
      const override = auditRows.find(
        (r) => r['action'] === 'comparison_template.keyword_warning_overridden',
      )!;
      assert.equal(override['severity'], 'warning');
      assert.equal(override['targetId'], 'tpl-1');
      assert.equal((override['metadata'] as { overrides: unknown[] }).overrides.length, 2);
    });

    it('requires a fresh acknowledgment when an already-flagged body is edited again', async () => {
      stored = templateRow({ body: FLAGGED_BODY });

      const err = await assertServiceError(update({ body: `${FLAGGED_BODY} Tambahan.` }), 422);

      assert.deepEqual(
        warningsOf(err).map((w) => w['acknowledged']),
        [false, false],
      );
    });

    it('rejects keys that were issued for the previous wording', async () => {
      const keysForOldWording = keysFor(FLAGGED_BODY);

      await assertServiceError(
        update({
          body: FLAGGED_BODY.replace('data', 'dara'),
          acknowledgedWarnings: keysForOldWording,
        }),
        422,
      );
    });

    it('saves a body edit that removes the flagged words with no override row', async () => {
      stored = templateRow({ body: FLAGGED_BODY });

      await update({ body: CLEAN_BODY });

      assert.deepEqual(
        auditRows.map((r) => r['action']),
        ['comparison_template.updated'],
      );
    });
  });

  describe('indicator cache coherence', () => {
    it('invalidates cached indicators after a changed update (rendered text is embedded in them)', async () => {
      const dbReads = await primeIndicatorCache();

      await update({ label: 'Baru' });
      await getIndicatorById('ind-1');

      assert.equal(dbReads(), 2);
    });

    it('leaves the indicator cache alone for a no-op update', async () => {
      const dbReads = await primeIndicatorCache();

      await update({ label: 'Perbandingan tahunan' });
      await getIndicatorById('ind-1');

      assert.equal(dbReads(), 1);
    });

    it('leaves the indicator cache alone when the save is refused (422)', async () => {
      const dbReads = await primeIndicatorCache();

      await assertServiceError(update({ body: FLAGGED_BODY }), 422);
      await getIndicatorById('ind-1');

      assert.equal(dbReads(), 1);
    });
  });
});

describe('comparisonTemplates.service deleteComparisonTemplate', () => {
  const remove = (id: unknown = 'tpl-1') => deleteComparisonTemplate(id, ACTOR, CONTEXT);

  it('rejects an invalid id with 400 before opening a transaction', async () => {
    // Called directly: the `remove` helper's default id would swallow `undefined`.
    for (const id of [undefined, null, 42, '', '   ', 'x'.repeat(192)]) {
      await assertServiceError(deleteComparisonTemplate(id, ACTOR, CONTEXT), 400);
    }
    assert.equal(txCalls.length, 0);
  });

  it('locks the template row FOR UPDATE', async () => {
    await remove();

    const { sql, values } = lockedSql();
    assert.match(sql, /comparison_templates/);
    assert.match(sql, /FOR UPDATE/);
    assert.deepEqual(values, ['tpl-1']);
  });

  it('responds 404 when the template does not exist', async () => {
    stored = null;

    await assertServiceError(remove(), 404);
    assert.equal(templateCalls['delete'], undefined);
    assert.equal(auditRows.length, 0);
  });

  it('refuses with 409 while indicators still use the template, deleting and logging nothing', async () => {
    usage = 2;

    await assertServiceError(remove(), 409, /indikator/i);

    assert.equal(templateCalls['delete'], undefined);
    assert.equal(auditRows.length, 0);
  });

  it('deletes an unused template and logs comparison_template.deleted with the full prior state', async () => {
    const result = await remove();

    assert.equal(result.id, 'tpl-1');
    assert.equal(result.usageCount, 0);
    assert.deepEqual((templateCalls['delete']![0]![0] as { where: unknown }).where, {
      id: 'tpl-1',
    });
    assert.equal(txCalls.length, 1);
    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['action'], 'comparison_template.deleted');
    assert.equal(audit['severity'], 'warning');
    assert.equal(audit['targetType'], 'comparison_template');
    assert.equal(audit['targetId'], 'tpl-1');
    assert.equal(audit['targetLabel'], 'perbandingan-tahunan');
    assert.equal(audit['actorEmail'], ACTOR.email);
    assert.deepEqual(audit['metadata'], {
      slug: 'perbandingan-tahunan',
      label: 'Perbandingan tahunan',
      before: result,
    });
  });

  it('maps an FK violation raised by a racing attach (P2003) to 409', async () => {
    templateImpl['delete'] = async () => {
      throw prismaError('P2003');
    };

    await assertServiceError(remove(), 409, /indikator/i);
  });

  it('maps P2025 to 404', async () => {
    templateImpl['delete'] = async () => {
      throw prismaError('P2025');
    };

    await assertServiceError(remove(), 404);
  });

  it('propagates an audit-write failure', async () => {
    auditFailure = new Error('audit table unavailable');

    await assert.rejects(remove(), /audit table unavailable/);
  });

  it('invalidates cached indicators after a successful delete', async () => {
    const dbReads = await primeIndicatorCache();

    await remove();
    await getIndicatorById('ind-1');

    assert.equal(dbReads(), 2);
  });

  it('leaves the indicator cache alone when the delete is refused', async () => {
    const dbReads = await primeIndicatorCache();
    usage = 1;

    await assertServiceError(remove(), 409);
    await getIndicatorById('ind-1');

    assert.equal(dbReads(), 1);
  });
});

describe('DEFAULT_COMPARISON_TEMPLATES', () => {
  it('ships at least the perbandingan-tahunan template', () => {
    assert.ok(DEFAULT_COMPARISON_TEMPLATES.some((t) => t.slug === 'perbandingan-tahunan'));
  });

  it('has unique, well-formed slugs and non-empty labels', () => {
    const slugs = DEFAULT_COMPARISON_TEMPLATES.map((t) => t.slug);

    assert.equal(new Set(slugs).size, slugs.length);
    for (const template of DEFAULT_COMPARISON_TEMPLATES) {
      assert.match(template.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(template.slug.length <= 100);
      assert.ok(template.label.trim().length > 0 && template.label.length <= 255);
    }
  });

  it('passes structure validation and trips no trend-keyword warning (so seeding never needs an override)', () => {
    for (const template of DEFAULT_COMPARISON_TEMPLATES) {
      assert.deepEqual(validateTemplateStructure(template), [], template.slug);
      assert.deepEqual(findTrendKeywords(template.body), [], template.slug);
    }
  });

  it('every default can be created through the service without acknowledgments', async () => {
    for (const template of DEFAULT_COMPARISON_TEMPLATES) {
      const { slug, label, body, trendNaik, trendTurun, trendTetap } = template;

      await createComparisonTemplate(
        { slug, label, body, trendNaik, trendTurun, trendTetap },
        ACTOR,
        CONTEXT,
      );
    }
    assert.equal(auditRows.length, DEFAULT_COMPARISON_TEMPLATES.length);
  });

  it('renders the documented sentence for a paired indicator', () => {
    const template = DEFAULT_COMPARISON_TEMPLATES.find((t) => t.slug === 'perbandingan-tahunan')!;

    const result = renderComparison(
      {
        label: 'Jumlah Penduduk',
        unit: 'jiwa',
        valueCurrent: '12480',
        valuePrevious: '12360',
        periodCurrent: '2025',
        periodPrevious: '2024',
        isComputedComparison: true,
      },
      template,
    );

    assert.equal(
      result?.text,
      'Berdasarkan data 2025, Jumlah Penduduk tercatat 12.480 jiwa, naik 120 jiwa (0,97%) dibandingkan 2024.',
    );
  });
});
