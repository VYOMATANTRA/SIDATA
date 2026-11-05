import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AUDIT_ACTIONS } from './audit.service.js';
import {
  LEGACY_SAMPLE_LEADERS,
  LEGACY_SAMPLE_POINT_ID,
  matchesLegacySampleLeader,
} from '../utils/legacySampleRtFingerprints.js';

export type LegacySampleCleanupResult = {
  deletedJunctions: number;
  deletedPoints: number;
  updatedLeaders: number;
};

export type LegacySampleCleanupSource = 'seed' | 'script';
export type CleanupTransactionRunner = (
  callback: (tx: CleanupTx) => Promise<LegacySampleCleanupResult>,
) => Promise<LegacySampleCleanupResult>;

export async function cleanLegacySampleRtData(
  source: LegacySampleCleanupSource,
  options: {
    force?: boolean;
    nodeEnv?: string;
    transaction?: CleanupTransactionRunner;
  } = {},
): Promise<LegacySampleCleanupResult> {
  const transact =
    options.transaction ??
    ((callback) => prisma.$transaction((tx) => callback(tx as unknown as CleanupTx)));
  const result = await transact((tx) => runLegacySampleRtCleanup(tx, { ...options, source }));

  if (result.deletedJunctions || result.deletedPoints || result.updatedLeaders) {
    console.log(JSON.stringify({ event: 'maintenance.legacy_rt_cleanup', source, ...result }));
  }
  return result;
}

export type CleanupTx = {
  spatialPoint: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      type: string;
      name: string;
      latitude: number;
      longitude: number;
    } | null>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  spatialPointRt: { deleteMany(args: { where: { pointId: string } }): Promise<{ count: number }> };
  rtLeader: {
    findUnique(args: {
      where: { rtNumber: number };
    }): Promise<{ name: string; phone: string; phoneIsWhatsapp: boolean } | null>;
    updateMany(args: {
      where: { rtNumber: number; name: string; phone: string; phoneIsWhatsapp: boolean };
      data: { name: string; phone: string; phoneIsWhatsapp: boolean; alamat: null };
    }): Promise<{ count: number }>;
  };
  auditLog: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
};

export async function runLegacySampleRtCleanup(
  tx: CleanupTx,
  options: {
    source?: LegacySampleCleanupSource;
    force?: boolean;
    nodeEnv?: string;
    now?: () => Date;
  } = {},
): Promise<LegacySampleCleanupResult> {
  const source = options.source ?? 'script';
  const point = await tx.spatialPoint.findUnique({ where: { id: LEGACY_SAMPLE_POINT_ID } });
  let deletedJunctions = 0;
  let deletedPoints = 0;
  if (
    point?.type === 'ketua_rt' &&
    point.name.includes('Pos RT 01') &&
    point.latitude === -1.2235 &&
    point.longitude === 116.9521
  ) {
    deletedJunctions = (
      await tx.spatialPointRt.deleteMany({ where: { pointId: LEGACY_SAMPLE_POINT_ID } })
    ).count;
    deletedPoints = (
      await tx.spatialPoint.deleteMany({
        where: {
          id: LEGACY_SAMPLE_POINT_ID,
          type: 'ketua_rt',
          name: point.name,
          latitude: point.latitude,
          longitude: point.longitude,
        },
      })
    ).count;
    if (deletedPoints === 0 && deletedJunctions > 0) {
      throw new Error('Legacy sample point changed during cleanup; transaction rolled back.');
    }
  }

  let updatedLeaders = 0;
  for (const [number, expected] of Object.entries(LEGACY_SAMPLE_LEADERS)) {
    const rtNumber = Number(number);
    const current = await tx.rtLeader.findUnique({ where: { rtNumber } });
    if (!current || !matchesLegacySampleLeader(current, expected)) continue;
    const update = await tx.rtLeader.updateMany({
      where: {
        rtNumber,
        name: current.name,
        phone: current.phone,
        phoneIsWhatsapp: current.phoneIsWhatsapp,
      },
      data: {
        name: `Ketua RT ${String(rtNumber).padStart(2, '0')}`,
        phone: '—',
        phoneIsWhatsapp: false,
        alamat: null,
      },
    });
    updatedLeaders += update.count;
  }

  const changed = deletedJunctions > 0 || deletedPoints > 0 || updatedLeaders > 0;
  if (changed) {
    const metadata = {
      source,
      deletedJunctions,
      deletedPoints,
      updatedLeaders,
      force: options.force ?? false,
      nodeEnv: options.nodeEnv ?? null,
      at: (options.now ?? (() => new Date()))().toISOString(),
    };
    await tx.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.MAINTENANCE_LEGACY_RT_CLEANUP.action,
        severity: AUDIT_ACTIONS.MAINTENANCE_LEGACY_RT_CLEANUP.severity,
        outcome: 'success',
        actorId: null,
        actorEmail: `${source}:cleanup-legacy-sample-rt-leaders`,
        actorRole: 'system',
        targetType: 'rt_leader',
        targetId: null,
        targetLabel: 'legacy-sample-cleanup',
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
  return { deletedJunctions, deletedPoints, updatedLeaders };
}
