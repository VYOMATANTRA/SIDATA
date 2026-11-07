import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { authoringHandler, expectedUpdatedAtFromQuery } from '../controllers/hierarchyHandler.js';
import { deletePageHandler } from '../controllers/pages.controller.js';
import { HierarchyServiceError } from '../utils/hierarchyAuthoring.js';
import { fakeRes } from './helpers/fakeRes.js';
import {
  installFakeHierarchyDb,
  T0,
  type FakeHierarchyDb,
  type FakeHierarchyHandle,
} from './helpers/fakeHierarchyDb.js';

const editorReq = (extra: Record<string, unknown> = {}) =>
  ({
    params: {},
    user: { id: 'u1', email: 'editor@manggar.go.id', role: 'editor' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    ...extra,
  }) as never;

describe('authoringHandler', () => {
  let originalConsoleError: typeof console.error;
  let logged: unknown[][];

  beforeEach(() => {
    originalConsoleError = console.error;
    logged = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('returns 401 without running the service when there is no authenticated actor', async () => {
    let ran = false;
    const handler = authoringHandler({
      errorLabel: 'menguji',
      run: async () => {
        ran = true;
        return {};
      },
    });
    const res = fakeRes();

    await handler({ params: {} } as never, res);

    assert.equal(res.status, 401);
    assert.equal(ran, false);
  });

  it('passes actor and request context through and uses the success status', async () => {
    const seen: unknown[] = [];
    const handler = authoringHandler({
      errorLabel: 'menguji',
      successStatus: 201,
      run: async (_req, actor, context) => {
        seen.push(actor, context);
        return { ok: true };
      },
    });
    const res = fakeRes();

    await handler(editorReq(), res);

    assert.equal(res.status, 201);
    assert.deepStrictEqual(res.body, { ok: true });
    assert.deepStrictEqual(seen[0], { id: 'u1', email: 'editor@manggar.go.id', role: 'editor' });
    assert.deepStrictEqual(seen[1], { ipAddress: '127.0.0.1', userAgent: 'test-agent' });
  });

  it('maps HierarchyServiceError to status with code and details', async () => {
    const handler = authoringHandler({
      errorLabel: 'menguji',
      run: async () => {
        throw new HierarchyServiceError('bentrok', 409, 'STALE_WRITE', { currentUpdatedAt: 'x' });
      },
    });
    const res = fakeRes();

    await handler(editorReq(), res);

    assert.equal(res.status, 409);
    assert.deepStrictEqual(res.body, {
      error: 'bentrok',
      code: 'STALE_WRITE',
      details: { currentUpdatedAt: 'x' },
    });
  });

  it('returns a generic 500 and logs only the message for unexpected errors', async () => {
    const handler = authoringHandler({
      errorLabel: 'menguji',
      run: async () => {
        throw new Error('mysql://root:hunter2@db exploded');
      },
    });
    const res = fakeRes();

    await handler(editorReq(), res);

    assert.equal(res.status, 500);
    assert.deepStrictEqual(res.body, { error: 'Terjadi kesalahan internal server' });
    assert.equal(JSON.stringify(res.body).includes('hunter2'), false);
    assert.equal(logged.length, 1);
  });
});

describe('expectedUpdatedAtFromQuery', () => {
  it('accepts an ISO timestamp and rejects missing, repeated, or malformed values', () => {
    const ok = '2026-10-01T00:00:00.000Z';
    assert.equal(expectedUpdatedAtFromQuery({ query: { expectedUpdatedAt: ok } } as never), ok);
    for (const bad of [undefined, '', 'kemarin', [ok, ok], 5]) {
      assert.throws(
        () => expectedUpdatedAtFromQuery({ query: { expectedUpdatedAt: bad } } as never),
        (e) => e instanceof HierarchyServiceError && e.statusCode === 400,
      );
    }
  });
});

describe('deletePageHandler expectedUpdatedAt query', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  beforeEach(() => {
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addPage();
  });
  afterEach(() => handle.restore());

  it('is required (400 when missing) and must be fresh', async () => {
    const missing = fakeRes();
    await deletePageHandler(editorReq({ params: { slug: 'kependudukan' }, query: {} }), missing);
    assert.equal(missing.status, 400);
    assert.equal(db.page.rows.length, 1);

    const stale = fakeRes();
    await deletePageHandler(
      editorReq({
        params: { slug: 'kependudukan' },
        query: { expectedUpdatedAt: '2026-09-30T00:00:00.000Z' },
      }),
      stale,
    );
    assert.equal(stale.status, 409);
    assert.equal((stale.body as { code: string }).code, 'STALE_WRITE');
    assert.equal(db.page.rows.length, 1);

    const malformed = fakeRes();
    await deletePageHandler(
      editorReq({ params: { slug: 'kependudukan' }, query: { expectedUpdatedAt: 'x' } }),
      malformed,
    );
    assert.equal(malformed.status, 400);

    const fresh = fakeRes();
    await deletePageHandler(
      editorReq({
        params: { slug: 'kependudukan' },
        query: { expectedUpdatedAt: T0.toISOString() },
      }),
      fresh,
    );
    assert.equal(fresh.status, 200);
    assert.equal(db.page.rows.length, 0);
  });

  it('reports HAS_DEPENDENTS with counts in the response body', async () => {
    db.addChapter({ id: 'ch-1' });
    db.addSection({ id: 'sec-1' });
    db.indicatorTable.rows.push({ id: 't1', sectionId: 'sec-1' });

    const res = fakeRes();
    await deletePageHandler(
      editorReq({
        params: { slug: 'kependudukan' },
        query: { expectedUpdatedAt: T0.toISOString() },
      }),
      res,
    );

    assert.equal(res.status, 409);
    const body = res.body as { code: string; details: { dependencies: Record<string, number> } };
    assert.equal(body.code, 'HAS_DEPENDENTS');
    assert.deepEqual(body.details.dependencies, {
      contentBlocks: 0,
      indicators: 0,
      indicatorTables: 1,
    });
  });
});
