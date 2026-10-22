import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  listIndicatorTables,
  getIndicatorTableById,
  getIndicatorTableBySlug,
  createIndicatorTable,
  updateIndicatorTable,
  deleteIndicatorTable,
  createIndicatorTableRow,
  updateIndicatorTableRow,
  deleteIndicatorTableRow,
  invalidateIndicatorTablesCache,
  tableByIdCache,
  tableBySlugCache,
  IndicatorTableServiceError,
} from '../services/indicatorTables.service.js';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

type AnyRecord = Record<string, unknown>;
type AsyncFn = (...args: never[]) => Promise<unknown>;

const ACTOR = { id: 'editor-1', email: 'editor@example.com', role: 'editor' };
const CONTEXT = { ipAddress: '127.0.0.1', userAgent: 'TestAgent/1.0' };

const tablePayload = (overrides: AnyRecord = {}) => ({
  sectionId: 'sec-1',
  slug: 'piramida-usia',
  title: 'Piramida Usia',
  kind: 'age_pyramid',
  period: 'Juni 2024',
  ...overrides,
});

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

const aggregateResult = (overrides: AnyRecord = {}) => ({
  _sum: { male: 120, female: 115, total: null },
  _count: { _all: 1 },
  ...overrides,
});

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

// ---------------------------------------------------------------------------
// Stub harness: mirrors indicators.service.test.ts — $transaction runs the
// callback against an in-memory tx stub so mutation+audit atomicity is
// observable without a database.
// ---------------------------------------------------------------------------
let tableImpl: Record<string, AsyncFn>;
let rowImpl: Record<string, AsyncFn>;
let sectionImpl: Record<string, AsyncFn>;
let auditRows: AnyRecord[];
let txCalls: unknown[][];
let queryRawCalls: unknown[][];
let txTableCalls: Record<string, unknown[][]>;
let txRowCalls: Record<string, unknown[][]>;
let originals: Array<{ target: AnyRecord; key: string; fn: unknown }>;

function stubMethod(target: AnyRecord, key: string, fn: AsyncFn) {
  originals.push({ target, key, fn: target[key] });
  target[key] = fn;
}

function proxied(impl: Record<string, AsyncFn>, calls: Record<string, unknown[][]>) {
  return new Proxy(
    {},
    {
      get:
        (_t, prop: string) =>
        async (...args: never[]) => {
          calls[prop] ??= [];
          calls[prop]!.push(args);
          return impl[prop]!(...args);
        },
    },
  );
}

beforeEach(() => {
  tableImpl = {};
  rowImpl = {};
  sectionImpl = {};
  auditRows = [];
  txCalls = [];
  queryRawCalls = [];
  txTableCalls = {};
  txRowCalls = {};
  originals = [];
  invalidateIndicatorTablesCache();

  const tx = {
    $queryRaw: (async (...args: never[]) => {
      queryRawCalls.push(args);
      return [];
    }) as AsyncFn,
    section: {
      findUnique: (async (...args: never[]) => sectionImpl['findUnique']!(...args)) as AsyncFn,
    },
    indicatorTable: proxied(tableImpl, txTableCalls),
    indicatorTableRow: proxied(rowImpl, txRowCalls),
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
});

afterEach(() => {
  for (const { target, key, fn } of originals) {
    target[key] = fn;
  }
  invalidateIndicatorTablesCache();
});

async function assertServiceError(
  promise: Promise<unknown>,
  statusCode: number,
  messagePart?: string,
) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof IndicatorTableServiceError);
    assert.equal(err.statusCode, statusCode);
    if (messagePart) assert.match(err.message, new RegExp(messagePart));
    return true;
  });
}

describe('indicatorTables.service createIndicatorTable', () => {
  beforeEach(() => {
    sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
    tableImpl['aggregate'] = async () => ({ _max: { sortOrder: null } });
    tableImpl['create'] = async (...args: never[]) => {
      const { data, include } = args[0] as unknown as { data: AnyRecord; include: AnyRecord };
      assert.ok(include);
      const nested = ((data['rows'] as AnyRecord)['create'] as AnyRecord[]).map((r, i) => ({
        ...cellRow(),
        ...r,
        id: `row-new-${i}`,
        tableId: 'tbl-new',
      }));
      return tableRow({ ...data, id: 'tbl-new', rows: nested });
    };
  });

  it('rejects non-object payloads with 400', async () => {
    await assertServiceError(createIndicatorTable(null, ACTOR, CONTEXT), 400);
    await assertServiceError(createIndicatorTable('x', ACTOR, CONTEXT), 400);
    await assertServiceError(createIndicatorTable([], ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('rejects invalid slug and kind with 400', async () => {
    await assertServiceError(
      createIndicatorTable(tablePayload({ slug: 'Bad_Slug!' }), ACTOR, CONTEXT),
      400,
    );
    await assertServiceError(
      createIndicatorTable(tablePayload({ kind: 'piramida' }), ACTOR, CONTEXT),
      400,
    );
    assert.equal(txCalls.length, 0);
  });

  it('rejects sex-split rows missing male/female with 400', async () => {
    await assertServiceError(
      createIndicatorTable(
        tablePayload({ rows: [{ rowKey: '0-4', label: 'Usia 0-4', male: 10 }] }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'male dan female',
    );
    assert.equal(txCalls.length, 0);
  });

  it('rejects stored total on sex-split rows with 400', async () => {
    await assertServiceError(
      createIndicatorTable(
        tablePayload({
          rows: [{ rowKey: '0-4', label: 'Usia 0-4', male: 10, female: 9, total: 19 }],
        }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'tidak memakai total',
    );
    assert.equal(txCalls.length, 0);
  });

  it('rejects single-value rows with male/female or missing total with 400', async () => {
    const ethnicity = { kind: 'ethnicity' };
    await assertServiceError(
      createIndicatorTable(
        tablePayload({ ...ethnicity, rows: [{ rowKey: 'jawa', label: 'Jawa' }] }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'membutuhkan total',
    );
    await assertServiceError(
      createIndicatorTable(
        tablePayload({
          ...ethnicity,
          rows: [{ rowKey: 'jawa', label: 'Jawa', male: 5, total: 5 }],
        }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'tidak memakai male',
    );
    assert.equal(txCalls.length, 0);
  });

  it('rejects duplicate rowKey within the payload with 400', async () => {
    await assertServiceError(
      createIndicatorTable(
        tablePayload({
          rows: [
            { rowKey: '0-4', label: 'A', male: 1, female: 1 },
            { rowKey: '0-4', label: 'B', male: 2, female: 2 },
          ],
        }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'duplikat',
    );
    assert.equal(txCalls.length, 0);
  });

  it('returns 404 when the section does not exist and writes no audit row', async () => {
    sectionImpl['findUnique'] = async () => null;

    await assertServiceError(createIndicatorTable(tablePayload(), ACTOR, CONTEXT), 404, 'Section');
    assert.equal(auditRows.length, 0);
  });

  it('maps slug conflicts (P2002) to 409', async () => {
    tableImpl['create'] = async () => {
      throw p2002();
    };

    await assertServiceError(
      createIndicatorTable(tablePayload(), ACTOR, CONTEXT),
      409,
      'sudah digunakan',
    );
  });

  it('creates with nested rows, derives totals, and writes the audit row', async () => {
    const result = await createIndicatorTable(
      tablePayload({
        rows: [
          { rowKey: '0-4', label: 'Usia 0-4', male: 120, female: 115 },
          { rowKey: '5-9', label: 'Usia 5-9', male: 130, female: 125 },
        ],
      }),
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.slug, 'piramida-usia');
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0]!.total, 235);
    assert.deepStrictEqual(result.totals, { rowCount: 2, male: 250, female: 240, total: 490 });
    assert.equal(txCalls.length, 1);
    assert.equal(queryRawCalls.length, 1);
    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['action'], 'indicator_table.created');
    assert.equal(audit['severity'], 'info');
    assert.equal(audit['targetType'], 'indicator_table');
    assert.equal((audit['metadata'] as AnyRecord)['rowCount'], 2);
  });

  it('defaults nested rows to submission order instead of all zero', async () => {
    let createdData: AnyRecord | null = null;
    tableImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      createdData = data;
      const nested = ((data['rows'] as AnyRecord)['create'] as AnyRecord[]).map((r, i) => ({
        ...cellRow(),
        ...r,
        id: `row-new-${i}`,
        tableId: 'tbl-new',
      }));
      return tableRow({ ...data, id: 'tbl-new', rows: nested });
    };

    await createIndicatorTable(
      tablePayload({
        rows: [
          { rowKey: 'b', label: 'B', male: 1, female: 1 },
          { rowKey: 'a', label: 'A', male: 2, female: 2 },
          { rowKey: 'c', label: 'C', male: 3, female: 3, sortOrder: 10 },
        ],
      }),
      ACTOR,
      CONTEXT,
    );

    const nested = (createdData!['rows'] as AnyRecord)['create'] as AnyRecord[];
    assert.deepStrictEqual(
      nested.map((r) => r['rowKey']),
      ['b', 'a', 'c'],
    );
    assert.deepStrictEqual(
      nested.map((r) => r['sortOrder']),
      [0, 1, 10],
    );
  });

  it('rejects duplicate final sortOrders in nested rows with 400', async () => {
    // Two explicit zeros (e.g. a form defaulting every row to 0).
    await assertServiceError(
      createIndicatorTable(
        tablePayload({
          rows: [
            { rowKey: 'a', label: 'A', male: 1, female: 1, sortOrder: 0 },
            { rowKey: 'b', label: 'B', male: 2, female: 2, sortOrder: 0 },
          ],
        }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'duplikat',
    );
    // Explicit value colliding with the other row's index default (index 1 → 1).
    await assertServiceError(
      createIndicatorTable(
        tablePayload({
          rows: [
            { rowKey: 'a', label: 'A', male: 1, female: 1, sortOrder: 1 },
            { rowKey: 'b', label: 'B', male: 2, female: 2 },
          ],
        }),
        ACTOR,
        CONTEXT,
      ),
      400,
      'duplikat',
    );
    assert.equal(txCalls.length, 0);
  });

  it('appends an omitted table sortOrder after MAX(sort_order) in the section', async () => {
    tableImpl['aggregate'] = async () => ({ _max: { sortOrder: 4 } });
    let createdData: AnyRecord | null = null;
    const prevCreate = tableImpl['create']!;
    tableImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      createdData = data;
      return prevCreate(...args);
    };

    const result = await createIndicatorTable(tablePayload(), ACTOR, CONTEXT);

    assert.equal(createdData!['sortOrder'], 5);
    assert.equal(result.sortOrder, 5);
  });

  it('starts the first table in a section at 0 and respects explicit table sortOrder', async () => {
    let aggregateCalls = 0;
    tableImpl['aggregate'] = async () => {
      aggregateCalls++;
      return { _max: { sortOrder: null } };
    };

    const first = await createIndicatorTable(tablePayload(), ACTOR, CONTEXT);
    assert.equal(first.sortOrder, 0);
    assert.equal(aggregateCalls, 1);

    const explicit = await createIndicatorTable(
      tablePayload({ slug: 'lain', sortOrder: 7 }),
      ACTOR,
      CONTEXT,
    );
    assert.equal(explicit.sortOrder, 7);
    assert.equal(aggregateCalls, 1);
  });

  it('warms the per-id and per-slug caches on successful create', async () => {
    const created = await createIndicatorTable(tablePayload(), ACTOR, CONTEXT);

    tableImpl['findUnique'] = async () => {
      throw new Error('must be served from warmed cache');
    };
    assert.equal((await getIndicatorTableById(created.id))?.slug, 'piramida-usia');
    assert.equal((await getIndicatorTableBySlug(created.slug))?.id, created.id);
  });
});

describe('indicatorTables.service updateIndicatorTable', () => {
  beforeEach(() => {
    tableImpl['findUnique'] = async (...args: never[]) => {
      const { where } = args[0] as unknown as { where: AnyRecord };
      if ((where as AnyRecord)['slug'] === 'diambil') return tableRow({ id: 'tbl-other' });
      if ((where as AnyRecord)['id'] === 'tbl-1') return tableRow();
      return null;
    };
    sectionImpl['findUnique'] = async () => ({ id: 'sec-1' });
    rowImpl['count'] = async () => 0;
    rowImpl['findMany'] = async () => [cellRow()];
    rowImpl['aggregate'] = async () => aggregateResult();
    tableImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return { ...tableRow(), ...data };
    };
  });

  it('rejects invalid ids and empty payloads with 400', async () => {
    await assertServiceError(updateIndicatorTable('', { title: 'x' }, ACTOR, CONTEXT), 400);
    await assertServiceError(updateIndicatorTable('tbl-1', {}, ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('returns 404 when the table does not exist', async () => {
    tableImpl['findUnique'] = async () => null;

    await assertServiceError(updateIndicatorTable('missing', { title: 'x' }, ACTOR, CONTEXT), 404);
    assert.equal(auditRows.length, 0);
  });

  it('returns 409 when the new slug belongs to another table', async () => {
    await assertServiceError(
      updateIndicatorTable('tbl-1', { slug: 'diambil' }, ACTOR, CONTEXT),
      409,
      'sudah digunakan',
    );
  });

  it('rejects kind changes while rows exist with 400', async () => {
    rowImpl['count'] = async () => 3;

    await assertServiceError(
      updateIndicatorTable('tbl-1', { kind: 'ethnicity' }, ACTOR, CONTEXT),
      400,
      'masih memiliki baris',
    );
    assert.equal(auditRows.length, 0);
  });

  it('short-circuits no-op updates without writing an audit row', async () => {
    const result = await updateIndicatorTable('tbl-1', { title: 'Piramida Usia' }, ACTOR, CONTEXT);

    assert.equal(result.id, 'tbl-1');
    assert.equal(txTableCalls['update']?.length ?? 0, 0);
    assert.equal(auditRows.length, 0);
  });

  it('writes indicator_table.updated with a changes diff on real edits', async () => {
    const result = await updateIndicatorTable('tbl-1', { title: 'Piramida Anyar' }, ACTOR, CONTEXT);

    assert.equal(result.title, 'Piramida Anyar');
    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['action'], 'indicator_table.updated');
    assert.equal(audit['severity'], 'info');
    const changes = (audit['metadata'] as AnyRecord)['changes'] as AnyRecord;
    assert.deepStrictEqual(changes['title'], { before: 'Piramida Usia', after: 'Piramida Anyar' });
  });
});

describe('indicatorTables.service deleteIndicatorTable', () => {
  beforeEach(() => {
    tableImpl['findUnique'] = async () => tableRow();
    rowImpl['count'] = async () => 2;
    tableImpl['delete'] = async () => tableRow();
  });

  it('rejects invalid ids with 400', async () => {
    await assertServiceError(deleteIndicatorTable('', ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('returns 404 when the table does not exist', async () => {
    tableImpl['findUnique'] = async () => null;

    await assertServiceError(deleteIndicatorTable('missing', ACTOR, CONTEXT), 404);
    assert.equal(auditRows.length, 0);
  });

  it('deletes and writes a warning audit with the row count', async () => {
    const result = await deleteIndicatorTable('tbl-1', ACTOR, CONTEXT);

    assert.equal(result.id, 'tbl-1');
    assert.equal(txTableCalls['delete']?.length ?? 0, 1);
    assert.equal(auditRows.length, 1);
    const audit = auditRows[0]!;
    assert.equal(audit['action'], 'indicator_table.deleted');
    assert.equal(audit['severity'], 'warning');
    assert.equal((audit['metadata'] as AnyRecord)['rowCount'], 2);
  });
});

describe('indicatorTables.service row mutations', () => {
  beforeEach(() => {
    tableImpl['findUnique'] = async () => tableRow();
    rowImpl['findUnique'] = async (...args: never[]) => {
      const { where } = args[0] as unknown as { where: AnyRecord };
      if ((where as AnyRecord)['id'] === 'row-1') return cellRow();
      return null;
    };
    rowImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return cellRow({ ...data, id: 'row-new' });
    };
    rowImpl['update'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      return { ...cellRow(), ...data };
    };
    rowImpl['delete'] = async () => cellRow();
    rowImpl['count'] = async () => 0;
    rowImpl['aggregate'] = async () => ({
      _sum: { male: null, female: null, total: null },
      _count: { _all: 0 },
      _max: { sortOrder: null },
    });
  });

  it('create returns 404 when the parent table does not exist', async () => {
    tableImpl['findUnique'] = async () => null;

    await assertServiceError(
      createIndicatorTableRow(
        'missing',
        { rowKey: '0-4', label: 'x', male: 1, female: 1 },
        ACTOR,
        CONTEXT,
      ),
      404,
    );
    assert.equal(auditRows.length, 0);
  });

  it('create rejects cells violating the table kind with 400', async () => {
    await assertServiceError(
      createIndicatorTableRow('tbl-1', { rowKey: '0-4', label: 'x', total: 5 }, ACTOR, CONTEXT),
      400,
      'male dan female',
    );
    assert.equal(txRowCalls['create']?.length ?? 0, 0);
  });

  it('create returns 409 on duplicate rowKey', async () => {
    rowImpl['findUnique'] = async (...args: never[]) => {
      const { where } = args[0] as unknown as { where: AnyRecord };
      if ((where as AnyRecord)['tableId_rowKey']) return cellRow({ id: 'row-other' });
      return cellRow();
    };

    await assertServiceError(
      createIndicatorTableRow(
        'tbl-1',
        { rowKey: '0-4', label: 'x', male: 1, female: 1 },
        ACTOR,
        CONTEXT,
      ),
      409,
      'sudah dipakai',
    );
  });

  it('create appends an omitted sortOrder after MAX(sort_order)', async () => {
    rowImpl['aggregate'] = async () => ({ _max: { sortOrder: 7 } });
    let createdData: AnyRecord | null = null;
    rowImpl['create'] = async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      createdData = data;
      return cellRow({ ...data, id: 'row-new' });
    };

    const result = await createIndicatorTableRow(
      'tbl-1',
      { rowKey: '5-9', label: 'Usia 5-9', male: 1, female: 1 },
      ACTOR,
      CONTEXT,
    );

    assert.equal(createdData!['sortOrder'], 8);
    assert.equal(result.sortOrder, 8);
  });

  it('create starts at 0 when the table has no rows yet', async () => {
    rowImpl['aggregate'] = async () => ({ _max: { sortOrder: null } });

    const result = await createIndicatorTableRow(
      'tbl-1',
      { rowKey: '5-9', label: 'Usia 5-9', male: 1, female: 1 },
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.sortOrder, 0);
  });

  it('create respects an explicit sortOrder without querying MAX', async () => {
    let aggregateCalls = 0;
    rowImpl['aggregate'] = async () => {
      aggregateCalls++;
      return { _max: { sortOrder: 7 } };
    };

    const result = await createIndicatorTableRow(
      'tbl-1',
      { rowKey: '5-9', label: 'Usia 5-9', male: 1, female: 1, sortOrder: 3 },
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.sortOrder, 3);
    assert.equal(aggregateCalls, 0);
  });

  it('create rejects the 501st row with 409 and allows the 500th', async () => {
    rowImpl['count'] = async () => 500;

    await assertServiceError(
      createIndicatorTableRow(
        'tbl-1',
        { rowKey: 'baru', label: 'Baru', male: 1, female: 1 },
        ACTOR,
        CONTEXT,
      ),
      409,
      'batas 500 baris',
    );
    assert.equal(txRowCalls['create']?.length ?? 0, 0);
    assert.equal(auditRows.length, 0);

    rowImpl['count'] = async () => 499;
    const result = await createIndicatorTableRow(
      'tbl-1',
      { rowKey: 'baru', label: 'Baru', male: 1, female: 1 },
      ACTOR,
      CONTEXT,
    );
    assert.equal(result.rowKey, 'baru');
    assert.equal(txRowCalls['create']?.length ?? 0, 1);
  });

  it('create writes the row.created audit and derives the total', async () => {
    const result = await createIndicatorTableRow(
      'tbl-1',
      { rowKey: '5-9', label: 'Usia 5-9', male: 10, female: 9 },
      ACTOR,
      CONTEXT,
    );

    assert.equal(result.total, 19);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]!['action'], 'indicator_table_row.created');
    assert.equal(auditRows[0]!['severity'], 'info');
  });

  it('update returns 404 for missing rows and rejects kind violations', async () => {
    rowImpl['findUnique'] = async (...args: never[]) => {
      const { where } = args[0] as unknown as { where: AnyRecord };
      return (where as AnyRecord)['id'] === 'row-1' ? cellRow() : null;
    };

    await assertServiceError(
      updateIndicatorTableRow('missing', { label: 'x' }, ACTOR, CONTEXT),
      404,
    );
    await assertServiceError(updateIndicatorTableRow('row-1', { total: 5 }, ACTOR, CONTEXT), 400);
    assert.equal(auditRows.length, 0);
  });

  it('update short-circuits no-ops and audits real edits with a diff', async () => {
    const noop = await updateIndicatorTableRow(
      'row-1',
      { label: 'Usia 0-4 tahun' },
      ACTOR,
      CONTEXT,
    );
    assert.equal(noop.id, 'row-1');
    assert.equal(txRowCalls['update']?.length ?? 0, 0);
    assert.equal(auditRows.length, 0);

    const updated = await updateIndicatorTableRow('row-1', { male: 200 }, ACTOR, CONTEXT);
    assert.equal(updated.male, 200);
    assert.equal(updated.total, 315);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]!['action'], 'indicator_table_row.updated');
    const changes = (auditRows[0]!['metadata'] as AnyRecord)['changes'] as AnyRecord;
    assert.deepStrictEqual(changes['male'], { before: 120, after: 200 });
  });

  it('delete removes the row and writes a warning audit with the before snapshot', async () => {
    const result = await deleteIndicatorTableRow('row-1', ACTOR, CONTEXT);

    assert.equal(result.id, 'row-1');
    assert.equal(result.total, 235);
    assert.equal(txRowCalls['delete']?.length ?? 0, 1);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]!['action'], 'indicator_table_row.deleted');
    assert.equal(auditRows[0]!['severity'], 'warning');
    assert.ok((auditRows[0]!['metadata'] as AnyRecord)['before']);
  });
});

describe('indicatorTables.service reads', () => {
  beforeEach(() => {
    tableImpl['findMany'] = async () => [tableRow()];
    tableImpl['count'] = async () => 1;
    tableImpl['findUnique'] = async () => tableRow();
    rowImpl['findMany'] = async () => [cellRow()];
    rowImpl['aggregate'] = async () => aggregateResult();
  });

  it('list applies defaults and filters by section and kind', async () => {
    let seenArgs: AnyRecord | null = null;
    tableImpl['findMany'] = async (...args: never[]) => {
      seenArgs = args[0] as unknown as AnyRecord;
      return [];
    };
    tableImpl['count'] = async () => 0;

    const result = await listIndicatorTables({
      sectionId: 'sec-9',
      kind: 'ethnicity',
      page: 2,
      pageSize: 10,
    });

    assert.deepStrictEqual(seenArgs!['where'], { sectionId: 'sec-9', kind: 'ethnicity' });
    assert.equal(seenArgs!['skip'], 10);
    assert.equal(seenArgs!['take'], 10);
    assert.deepStrictEqual(
      { total: result.total, page: result.page, pageSize: result.pageSize },
      { total: 0, page: 2, pageSize: 10 },
    );
  });

  it('serves repeated identical list calls from cache', async () => {
    let queryCount = 0;
    tableImpl['findMany'] = async () => {
      queryCount++;
      return [tableRow()];
    };

    await listIndicatorTables({ sectionId: 'sec-1' });
    await listIndicatorTables({ sectionId: 'sec-1' });

    assert.equal(queryCount, 1);
  });

  it('getById returns null for invalid ids without touching the database', async () => {
    assert.equal(await getIndicatorTableById(''), null);
    assert.equal(await getIndicatorTableById(null), null);
  });

  it('getBySlug lowercases the lookup and returns rows with SQL totals', async () => {
    const result = await getIndicatorTableBySlug('PIRAMIDA-USIA');

    assert.equal(result?.slug, 'piramida-usia');
    assert.equal(result?.rows.length, 1);
    assert.equal(result?.rows[0]!.total, 235);
    assert.deepStrictEqual(result?.totals, { rowCount: 1, male: 120, female: 115, total: 235 });
  });

  it('reads rows with a deterministic (sortOrder, rowKey) order', async () => {
    let seenArgs: AnyRecord | null = null;
    rowImpl['findMany'] = async (...args: never[]) => {
      seenArgs = args[0] as unknown as AnyRecord;
      return [cellRow()];
    };

    await getIndicatorTableBySlug('piramida-usia');

    assert.deepStrictEqual(seenArgs!['orderBy'], [{ sortOrder: 'asc' }, { rowKey: 'asc' }]);
  });

  it('does not retain misses in the shared LRU caches', async () => {
    tableImpl['findUnique'] = async () => null;

    assert.equal(await getIndicatorTableById('ghost-1'), null);
    assert.equal(tableByIdCache.has('ghost-1'), false);
    assert.equal(await getIndicatorTableBySlug('ghost-slug'), null);
    assert.equal(tableBySlugCache.has('ghost-slug'), false);
  });
});
