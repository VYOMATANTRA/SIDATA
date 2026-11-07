// In-memory stand-in for the media_assets and audit_logs tables, installed on the real prisma
// singleton (same pattern as the other service tests). Calls to anything not stubbed here still
// hit the real client, which has no database in unit tests, so an unexpected query fails loudly.

import type { MediaAsset } from '../../../generated/prisma/client.js';
import prisma from '../../utils/prisma.js';

type AnyRecord = Record<string, unknown>;

export interface MediaDbStub {
  assets: Map<string, MediaAsset>;
  auditRows: AnyRecord[];
  /** When set, mediaAsset.create throws it (simulates a DB failure after bytes were written). */
  failCreateWith: Error | null;
  restore: () => void;
}

export function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'local',
    storageKey: 'photos/cerita/u1/11111111-1111-4111-8111-111111111111.webp',
    kind: 'photo',
    purpose: 'cerita',
    ownerKey: 'u1',
    mimeType: 'image/webp',
    byteSize: 10,
    width: 10,
    height: 10,
    originalName: 'foto.jpg',
    createdById: 'u1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    attachedAt: null,
    ...overrides,
  };
}

export function installMediaDbStub(seed: MediaAsset[] = []): MediaDbStub {
  const stub: MediaDbStub = {
    assets: new Map(seed.map((a) => [a.id, a])),
    auditRows: [],
    failCreateWith: null,
    restore: () => undefined,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only monkeypatching of the singleton
  const p = prisma as any;
  const originals = {
    create: p.mediaAsset.create,
    findUnique: p.mediaAsset.findUnique,
    auditCreate: p.auditLog.create,
    transaction: p.$transaction,
  };

  p.mediaAsset.create = async ({ data }: { data: AnyRecord }) => {
    if (stub.failCreateWith) throw stub.failCreateWith;
    const row = makeAsset({ attachedAt: null, createdAt: new Date(), ...(data as object) });
    stub.assets.set(row.id, row);
    return row;
  };
  p.mediaAsset.findUnique = async ({ where }: { where: { id: string } }) =>
    stub.assets.get(where.id) ?? null;
  // Lazy (a thenable), like a Prisma promise: nothing is recorded until the transaction awaits
  // it, so a failed earlier op in the same transaction means no audit row, as with a rollback.
  p.auditLog.create = ({ data }: { data: AnyRecord }) => ({
    then(resolve: (v: unknown) => void) {
      stub.auditRows.push(data);
      resolve(data);
    },
  });
  p.$transaction = async (ops: unknown[]) => {
    const results: unknown[] = [];
    for (const op of ops) results.push(await op);
    return results;
  };

  stub.restore = () => {
    p.mediaAsset.create = originals.create;
    p.mediaAsset.findUnique = originals.findUnique;
    p.auditLog.create = originals.auditCreate;
    p.$transaction = originals.transaction;
  };
  return stub;
}
