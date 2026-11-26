import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_PAGE_HIGHLIGHTS,
  getAllPageHighlights,
  setPageHighlights,
} from '../services/pageHighlights.service.js';
import { HierarchyServiceError } from '../utils/hierarchyAuthoring.js';
import type { AuditActor } from '../services/audit.service.js';

const UPDATED = new Date('2026-11-01T00:00:00.000Z');
const actor = { id: 'u1', email: 'e@x.id', role: 'editor' } as unknown as AuditActor;

interface FakeIndicator {
  id: string;
  pageId: string;
}

/** Minimal in-memory stand-in for the Prisma calls the service makes. */
function fakeClient(opts: {
  pages?: Array<{ id: string; slug: string }>;
  indicators: FakeIndicator[];
  stored?: Array<{ pageId: string; indicatorId: string; position: number }>;
}) {
  const stored = [...(opts.stored ?? [])];
  const pages = opts.pages ?? [{ id: 'p1', slug: 'pendidikan' }];
  const calls = {
    created: [] as unknown[],
    audit: [] as unknown[],
    pageUpdates: 0,
    fallbackQueries: [] as Array<{ pageId: string; returned: number }>,
  };
  const nest = (pageId: string) => ({ section: { chapter: { pageId } } });
  const api = {
    page: {
      findMany: async () => pages,
      findUnique: async () => ({
        id: 'p1',
        slug: 'pendidikan',
        title: 'Pendidikan',
        updatedAt: UPDATED,
      }),
      update: async () => {
        calls.pageUpdates += 1;
      },
    },
    pageHighlight: {
      findMany: async () =>
        stored
          .map((r) => ({
            ...r,
            indicator: nest(opts.indicators.find((i) => i.id === r.indicatorId)?.pageId ?? ''),
          }))
          .sort((a, b) => a.position - b.position),
      deleteMany: async () => {
        stored.length = 0;
      },
      createMany: async ({ data }: { data: unknown[] }) => {
        calls.created.push(...data);
      },
    },
    indicator: {
      findMany: async (arg: {
        where: { section: { chapter: { pageId: string } } };
        take?: number;
      }) => {
        const pageId = arg.where.section.chapter.pageId;
        const rows = opts.indicators
          .filter((i) => i.pageId === pageId)
          .slice(0, arg.take ?? Infinity)
          .map((i) => ({ id: i.id }));
        calls.fallbackQueries.push({ pageId, returned: rows.length });
        return rows;
      },
      count: async ({ where }: { where: { id: { in: string[] } } }) =>
        opts.indicators.filter((i) => where.id.in.includes(i.id) && i.pageId === 'p1').length,
    },
    auditLog: {
      create: async (arg: unknown) => {
        calls.audit.push(arg);
        return {};
      },
    },
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(api),
  };
  return { client: api as never, calls };
}

const ind = (n: number, pageId = 'p1'): FakeIndicator => ({ id: `ind-${n}`, pageId });

describe('getAllPageHighlights', () => {
  it('falls back to the first four indicators in content order', async () => {
    const { client } = fakeClient({ indicators: [1, 2, 3, 4, 5, 6].map((n) => ind(n)) });
    const out = await getAllPageHighlights(client);
    assert.deepEqual(out['pendidikan'], {
      indicatorIds: ['ind-1', 'ind-2', 'ind-3', 'ind-4'],
      isFallback: true,
    });
  });

  it('bounds the fallback query to four rows per page and skips pages with chosen rows', async () => {
    const { client, calls } = fakeClient({
      pages: [
        { id: 'p1', slug: 'pendidikan' },
        { id: 'p2', slug: 'kesehatan' },
      ],
      indicators: [...[1, 2, 3, 4, 5, 6].map((n) => ind(n)), ind(7, 'p2'), ind(8, 'p2')],
      stored: [{ pageId: 'p2', indicatorId: 'ind-8', position: 1 }],
    });
    await getAllPageHighlights(client);
    assert.deepEqual(calls.fallbackQueries, [{ pageId: 'p1', returned: MAX_PAGE_HIGHLIGHTS }]);
  });

  it('returns chosen ids in position order, capped at four', async () => {
    const { client } = fakeClient({
      indicators: [1, 2, 3, 4, 5].map((n) => ind(n)),
      stored: [
        { pageId: 'p1', indicatorId: 'ind-3', position: 2 },
        { pageId: 'p1', indicatorId: 'ind-5', position: 1 },
      ],
    });
    const out = await getAllPageHighlights(client);
    assert.deepEqual(out['pendidikan'], { indicatorIds: ['ind-5', 'ind-3'], isFallback: false });
    assert.ok(out['pendidikan']!.indicatorIds.length <= MAX_PAGE_HIGHLIGHTS);
  });

  it('ignores a stored highlight whose indicator moved to another page', async () => {
    const { client } = fakeClient({
      indicators: [ind(1), ind(2), ind(3, 'p2')],
      stored: [{ pageId: 'p1', indicatorId: 'ind-3', position: 1 }],
    });
    const out = await getAllPageHighlights(client);
    assert.deepEqual(out['pendidikan'], { indicatorIds: ['ind-1', 'ind-2'], isFallback: true });
  });
});

describe('setPageHighlights', () => {
  const base = { expectedUpdatedAt: UPDATED.toISOString() };

  it('rejects more than four', async () => {
    const { client } = fakeClient({ indicators: [1, 2, 3, 4, 5].map((n) => ind(n)) });
    await assert.rejects(
      setPageHighlights(
        'pendidikan',
        { ...base, indicatorIds: ['ind-1', 'ind-2', 'ind-3', 'ind-4', 'ind-5'] },
        actor,
        undefined,
        client,
      ),
      (e: HierarchyServiceError) => e.statusCode === 400 && /Maksimal 4/.test(e.message),
    );
  });

  it('rejects duplicates', async () => {
    const { client } = fakeClient({ indicators: [ind(1)] });
    await assert.rejects(
      setPageHighlights(
        'pendidikan',
        { ...base, indicatorIds: ['ind-1', 'ind-1'] },
        actor,
        undefined,
        client,
      ),
      (e: HierarchyServiceError) => e.statusCode === 400,
    );
  });

  it('rejects an indicator from another topic', async () => {
    const { client } = fakeClient({ indicators: [ind(1), ind(2, 'p2')] });
    await assert.rejects(
      setPageHighlights(
        'pendidikan',
        { ...base, indicatorIds: ['ind-1', 'ind-2'] },
        actor,
        undefined,
        client,
      ),
      (e: HierarchyServiceError) => e.statusCode === 400 && /tidak termasuk/.test(e.message),
    );
  });

  it('rejects a stale expectedUpdatedAt with 409', async () => {
    const { client } = fakeClient({ indicators: [ind(1)] });
    await assert.rejects(
      setPageHighlights(
        'pendidikan',
        { indicatorIds: ['ind-1'], expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
        actor,
        undefined,
        client,
      ),
      (e: HierarchyServiceError) => e.statusCode === 409,
    );
  });

  it('stores positions 1..n, bumps the page and writes one audit row', async () => {
    const { client, calls } = fakeClient({ indicators: [1, 2, 3].map((n) => ind(n)) });
    await setPageHighlights(
      'pendidikan',
      { ...base, indicatorIds: ['ind-3', 'ind-1'] },
      actor,
      undefined,
      client,
    );
    assert.deepEqual(calls.created, [
      { pageId: 'p1', indicatorId: 'ind-3', position: 1 },
      { pageId: 'p1', indicatorId: 'ind-1', position: 2 },
    ]);
    assert.equal(calls.pageUpdates, 1);
    assert.equal(calls.audit.length, 1);
  });
});
