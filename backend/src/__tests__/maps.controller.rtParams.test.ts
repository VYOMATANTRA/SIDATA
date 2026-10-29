import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  deletePointCoverageHandler,
  updateRtLeaderHandler,
} from '../controllers/maps.controller.js';
import prisma from '../utils/prisma.js';

type AnyRecord = Record<string, unknown>;

interface OriginalEntry {
  target: AnyRecord;
  key: string;
  fn: unknown;
}

const originals: OriginalEntry[] = [];
let auditRows: AnyRecord[] = [];
let txCalls: unknown[][] = [];

function stubMethod(target: AnyRecord, key: string, fn: unknown) {
  originals.push({ target, key, fn: target[key] });
  target[key] = fn;
}

// Minimal per-request tx emulator: everything the write paths touch before validation
// data exists resolves to "not found", so the handlers surface their 404s — proving the
// :rtNumber param was actually parsed (the old bug always 400'd before reaching them).
const tx = {
  $queryRaw: (async () => []) as (...args: never[]) => Promise<unknown>,
  spatialPoint: new Proxy(
    {},
    {
      get: (_t, prop: string) => async () => {
        if (prop === 'findUnique') return null;
        throw new Error(`unexpected spatialPoint.${prop} call`);
      },
    },
  ),
  spatialPointRt: new Proxy(
    {},
    {
      get: (_t, prop: string) => async () => {
        throw new Error(`unexpected spatialPointRt.${prop} call`);
      },
    },
  ),
  rtLeader: new Proxy(
    {},
    {
      get: (_t, prop: string) => async () => {
        if (prop === 'findUnique') return null;
        throw new Error(`unexpected rtLeader.${prop} call`);
      },
    },
  ),
  auditLog: {
    create: (async (...args: never[]) => {
      const { data } = args[0] as unknown as { data: AnyRecord };
      const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
      auditRows.push(row);
      return row;
    }) as (...args: never[]) => Promise<unknown>,
  },
};

function makeReq(
  params: Record<string, string>,
  body: unknown = undefined,
): Record<string, unknown> {
  return { params, body, user: { id: 'editor-1', email: 'editor@example.com', role: 'editor' } };
}

function makeRes(): {
  statusCode: number | undefined;
  body: unknown;
  status(code: number): unknown;
  json(payload: unknown): unknown;
} {
  const out: {
    statusCode?: number;
    body?: unknown;
    status(code: number): unknown;
    json(payload: unknown): unknown;
  } = {
    status(code: number) {
      out.statusCode = code;
      return out;
    },
    json(payload: unknown) {
      out.body = payload;
      return out;
    },
  };
  return out as ReturnType<typeof makeRes>;
}

describe('maps.controller :rtNumber handlers', () => {
  beforeEach(() => {
    auditRows = [];
    txCalls = [];
    // The handlers call the services with the default prisma singleton; every service path
    // runs inside executeLockedTransaction -> client.$transaction, so stubbing that one
    // method keeps the handlers off the real database.
    stubMethod(prisma as unknown as AnyRecord, '$transaction', (async (...args: unknown[]) => {
      txCalls.push(args);
      const arg = args[0] as unknown;
      if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(tx);
      throw new Error('unsupported $transaction argument');
    }) as unknown);
  });

  afterEach(() => {
    for (const { target, key, fn } of originals) {
      target[key] = fn;
    }
    originals.length = 0;
  });

  it('DELETE /points/:id/rts/:rtNumber accepts a real RT number (never 400 on valid input)', async () => {
    const res = makeRes();
    const result = (await deletePointCoverageHandler(
      makeReq({ id: 'point-1', rtNumber: '5' }) as never,
      res as never,
    )) as unknown as ReturnType<typeof makeRes>;

    assert.equal(
      result.statusCode,
      404,
      'a valid RT must pass param parsing (missing point → 404)',
    );
    assert.match(
      String(((result as AnyRecord).body as AnyRecord)['error']),
      /Titik spasial tidak ditemukan/,
    );
    assert.equal(txCalls.length, 1, 'service transaction must have run');
    assert.equal(auditRows.length, 0);
  });

  it('PATCH /rt-leaders/:rtNumber accepts a real RT number (never 400 on valid input)', async () => {
    const res = makeRes();
    const result = (await updateRtLeaderHandler(
      makeReq({ rtNumber: '5' }, { name: 'Ketua Baru' }) as never,
      res as never,
    )) as unknown as ReturnType<typeof makeRes>;

    assert.equal(
      result.statusCode,
      404,
      'a valid RT must pass param parsing (missing leader → 404)',
    );
    assert.match(
      String(((result as AnyRecord).body as AnyRecord)['error']),
      /Ketua RT tidak ditemukan/,
    );
    assert.equal(txCalls.length, 1, 'service transaction must have run');
    assert.equal(auditRows.length, 0);
  });

  it('still rejects out-of-range and non-numeric RT params with 400', async () => {
    const bad1 = makeRes();
    await deletePointCoverageHandler(
      makeReq({ id: 'point-1', rtNumber: '101' }) as never,
      bad1 as never,
    );
    assert.equal(bad1.statusCode, 400, 'RT 101 exceeds the 1–100 write range');
    assert.match(String(((bad1 as AnyRecord).body as AnyRecord)['error']), /Nomor RT/);

    const bad2 = makeRes();
    await updateRtLeaderHandler(makeReq({ rtNumber: 'abc' }, {}) as never, bad2 as never);
    assert.equal(bad2.statusCode, 400, 'non-numeric RT must be rejected');
    assert.match(String(((bad2 as AnyRecord).body as AnyRecord)['error']), /Nomor RT/);
    assert.equal(txCalls.length, 0, 'invalid params must never open a transaction');
  });
});
