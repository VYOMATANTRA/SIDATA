import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEGACY_SAMPLE_LEADERS,
  matchesLegacySampleLeader,
  phoneSha256,
} from '../utils/legacySampleRtFingerprints.js';
import {
  recordLegacySampleCleanupAudit,
  runLegacySampleRtCleanup,
  type LegacySampleCleanupResult,
} from '../../scripts/cleanup-legacy-sample-rt-leaders.js';
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
            return { name: LEGACY_SAMPLE_LEADERS[1]!.name, phone };
          }
          if (where.rtNumber === 2) {
            return { name: 'Ketua RT 02', phone: '—' };
          }
          return { name: 'Ketua RT 03', phone: '—' };
        },
        update: async ({
          where,
          data,
        }: {
          where: { rtNumber: number };
          data: Record<string, unknown>;
        }) => {
          updates.push({ rtNumber: where.rtNumber, data });
          return data;
        },
      },
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
        findUnique: async () => ({ name: 'Ketua RT 01', phone: '—' }),
        update: async () => {
          throw new Error('should not update');
        },
      },
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

describe('recordLegacySampleCleanupAudit', () => {
  it('writes a structured log always and an audit row only on --force', async () => {
    const lines: string[] = [];
    const audits: unknown[] = [];
    const result: LegacySampleCleanupResult = {
      deletedJunctions: 1,
      deletedPoints: 1,
      updatedLeaders: 2,
    };

    await recordLegacySampleCleanupAudit(
      result,
      { force: false, nodeEnv: 'development' },
      {
        log: (line) => lines.push(line),
        recordAudit: async (entry) => {
          audits.push(entry);
        },
        now: () => new Date('2026-10-30T12:00:00.000Z'),
      },
    );
    assert.equal(audits.length, 0);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(parsed['event'], 'maintenance.legacy_rt_cleanup');
    assert.equal(parsed['updatedLeaders'], 2);
    assert.equal(parsed['force'], false);

    await recordLegacySampleCleanupAudit(
      result,
      { force: true, nodeEnv: 'production' },
      {
        log: (line) => lines.push(line),
        recordAudit: async (entry) => {
          audits.push(entry);
        },
        now: () => new Date('2026-10-30T12:00:00.000Z'),
      },
    );
    assert.equal(audits.length, 1);
    const entry = audits[0] as {
      action: { action: string };
      metadata: Record<string, unknown>;
    };
    assert.equal(entry.action.action, AUDIT_ACTIONS.MAINTENANCE_LEGACY_RT_CLEANUP.action);
    assert.equal(entry.metadata['force'], true);
    assert.equal(entry.metadata['updatedLeaders'], 2);
    // No personal data in metadata.
    assert.equal('name' in entry.metadata, false);
    assert.equal('phone' in entry.metadata, false);
  });
});
