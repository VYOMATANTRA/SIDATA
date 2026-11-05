import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEGACY_SAMPLE_LEADERS,
  matchesLegacySampleLeader,
  phoneSha256,
} from '../utils/legacySampleRtFingerprints.js';
import {
  cleanLegacySampleRtData,
  runLegacySampleRtCleanup,
  type CleanupTx,
} from '../services/legacySampleRtCleanup.service.js';
import { AUDIT_ACTIONS } from '../services/audit.service.js';

describe('legacySampleRtFingerprints', () => {
  it('digests match the offline sha256 of the known sample phones without raw literals', () => {
    // Digit chunks only — the contiguous dialable string must not appear in source.
    const samples: Array<[number, string[]]> = [
      [1, ['0812', '3456', '7801']],
      [2, ['0812', '3456', '7802']],
      [3, ['0812', '3456', '7803']],
    ];
    for (const [rt, chunks] of samples) {
      const phone = chunks.join('');
      assert.equal(phoneSha256(phone), LEGACY_SAMPLE_LEADERS[rt]!.phoneSha256);
      assert.equal(
        matchesLegacySampleLeader(
          { name: LEGACY_SAMPLE_LEADERS[rt]!.name, phone },
          LEGACY_SAMPLE_LEADERS[rt]!,
        ),
        true,
      );
    }
  });

  it('does not match when the phone digest differs', () => {
    assert.equal(
      matchesLegacySampleLeader(
        { name: LEGACY_SAMPLE_LEADERS[1]!.name, phone: '—' },
        LEGACY_SAMPLE_LEADERS[1]!,
      ),
      false,
    );
  });

  it('source module text does not contain contiguous legacy phone literals', async () => {
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const pathMod = await import('node:path');
    const here = pathMod.dirname(url.fileURLToPath(import.meta.url));
    const modPath = pathMod.join(here, '../utils/legacySampleRtFingerprints.ts');
    const source = await fs.readFile(modPath, 'utf8');
    assert.equal(/\b081234567801\b/.test(source), false);
    assert.equal(/\b081234567802\b/.test(source), false);
    assert.equal(/\b081234567803\b/.test(source), false);
  });
});

describe('runLegacySampleRtCleanup', () => {
  it('resets leaders that match the hashed fingerprint and leaves others alone', async () => {
    const phone = ['0812', '3456', '7801'].join('');
    const updates: Array<{ rtNumber: number; data: Record<string, unknown> }> = [];
    const tx = {
      spatialPoint: {
        findUnique: async () => null,
        deleteMany: async () => ({ count: 0 }),
      },
      spatialPointRt: {
        deleteMany: async () => ({ count: 0 }),
      },
      rtLeader: {
        findUnique: async ({ where }: { where: { rtNumber: number } }) => {
          if (where.rtNumber === 1) {
            return { name: LEGACY_SAMPLE_LEADERS[1]!.name, phone, phoneIsWhatsapp: true };
          }
          if (where.rtNumber === 2) {
            return { name: 'Ketua RT 02', phone: '—', phoneIsWhatsapp: false };
          }
          return { name: 'Ketua RT 03', phone: '—', phoneIsWhatsapp: false };
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { rtNumber: number };
          data: Record<string, unknown>;
        }) => {
          updates.push({ rtNumber: where.rtNumber, data });
          return { count: 1 };
        },
      },
      auditLog: { create: async () => ({}) },
    };

    const result = await runLegacySampleRtCleanup(tx);
    assert.deepEqual(result, {
      deletedJunctions: 0,
      deletedPoints: 0,
      updatedLeaders: 1,
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]!.rtNumber, 1);
    assert.equal(updates[0]!.data['phone'], '—');
  });

  it('writes one warning audit with counts for a change and none for a no-op', async () => {
    let auditWrites = 0;
    let metadata: Record<string, unknown> | undefined;
    const tx = {
      spatialPoint: { findUnique: async () => null, deleteMany: async () => ({ count: 0 }) },
      spatialPointRt: { deleteMany: async () => ({ count: 0 }) },
      rtLeader: {
        findUnique: async ({ where }: { where: { rtNumber: number } }) =>
          where.rtNumber === 1
            ? {
                name: LEGACY_SAMPLE_LEADERS[1]!.name,
                phone: ['0812', '3456', '7801'].join(''),
                phoneIsWhatsapp: true,
              }
            : null,
        updateMany: async () => ({ count: 1 }),
      },
      auditLog: {
        create: async ({
          data,
        }: {
          data: { action: string; severity: string; metadata: unknown };
        }) => {
          auditWrites += 1;
          assert.equal(data.action, AUDIT_ACTIONS.MAINTENANCE_LEGACY_RT_CLEANUP.action);
          assert.equal(data.severity, 'warning');
          metadata = data.metadata as Record<string, unknown>;
          return {};
        },
      },
    };
    await runLegacySampleRtCleanup(tx, {
      source: 'seed',
      now: () => new Date('2026-10-30T12:00:00Z'),
    });
    assert.equal(auditWrites, 1);
    assert.equal(metadata?.['source'], 'seed');
    assert.equal(metadata?.['updatedLeaders'], 1);
    assert.equal('phone' in (metadata ?? {}), false);
    assert.equal('name' in (metadata ?? {}), false);

    tx.rtLeader.findUnique = async () => null;
    await runLegacySampleRtCleanup(tx);
    assert.equal(auditWrites, 1);
  });

  it('deletes the legacy sample point when the spatial fingerprint still matches', async () => {
    let deletedPoint = false;
    let deletedJunction = false;
    const tx = {
      spatialPoint: {
        findUnique: async () => ({
          id: '00000000-0000-0000-0000-000000000001',
          type: 'ketua_rt',
          name: 'Pos RT 01 Manggar',
          latitude: -1.2235,
          longitude: 116.9521,
        }),
        deleteMany: async () => {
          deletedPoint = true;
          return { count: 1 };
        },
      },
      spatialPointRt: {
        deleteMany: async () => {
          deletedJunction = true;
          return { count: 1 };
        },
      },
      rtLeader: {
        findUnique: async () => ({ name: 'Ketua RT 01', phone: '—', phoneIsWhatsapp: false }),
        updateMany: async () => {
          throw new Error('should not update');
        },
      },
      auditLog: { create: async () => ({}) },
    };

    const result = await runLegacySampleRtCleanup(tx);
    assert.equal(deletedJunction, true);
    assert.equal(deletedPoint, true);
    assert.deepEqual(result, {
      deletedJunctions: 1,
      deletedPoints: 1,
      updatedLeaders: 0,
    });
  });
});

describe('cleanLegacySampleRtData transaction boundary', () => {
  it('does not swallow an audit failure, so Prisma rolls cleanup back', async () => {
    const phone = ['0812', '3456', '7801'].join('');
    let leaderName = LEGACY_SAMPLE_LEADERS[1]!.name;
    let committed = false;
    const fakeTx = {
      spatialPoint: {
        findUnique: async () => null,
        deleteMany: async () => ({ count: 0 }),
      },
      spatialPointRt: { deleteMany: async () => ({ count: 0 }) },
      rtLeader: {
        findUnique: async ({ where }: { where: { rtNumber: number } }) =>
          where.rtNumber === 1 ? { name: leaderName, phone, phoneIsWhatsapp: true } : null,
        updateMany: async ({ data }: { data: { name: string } }) => {
          leaderName = data.name;
          return { count: 1 };
        },
      },
      auditLog: {
        create: async () => {
          throw new Error('audit unavailable');
        },
      },
    } satisfies CleanupTx;

    const transaction = async (
      callback: (tx: CleanupTx) => Promise<{
        deletedJunctions: number;
        deletedPoints: number;
        updatedLeaders: number;
      }>,
    ) => {
      const pendingName = leaderName;
      try {
        const result = await callback(fakeTx);
        committed = true;
        return result;
      } catch (error) {
        leaderName = pendingName;
        throw error;
      }
    };

    await assert.rejects(cleanLegacySampleRtData('script', { transaction }), /audit unavailable/);
    assert.equal(committed, false);
    assert.equal(leaderName, LEGACY_SAMPLE_LEADERS[1]!.name);
  });
});
