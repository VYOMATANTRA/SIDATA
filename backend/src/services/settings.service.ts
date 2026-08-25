import prisma from '../utils/prisma.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';

export class SettingsServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'SettingsServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Keys into the generic `system_settings` key/value store (see prisma/schema.prisma) that back
 * admin-configurable audit log retention. `0` means "keep forever" — this is the default seeded
 * in prisma/seed.ts, so a fresh install never silently deletes evidence.
 */
export const AUDIT_RETENTION_KEYS = {
  info: 'audit.retention_info_days',
  warning: 'audit.retention_warning_days',
  critical: 'audit.retention_critical_days',
} as const;

export interface AuditRetentionSettings {
  info: number;
  warning: number;
  critical: number;
}

export const getAuditRetentionSettings = async (): Promise<AuditRetentionSettings> => {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(AUDIT_RETENTION_KEYS) } },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  const parse = (key: string): number => {
    const raw = byKey.get(key);
    const value = raw !== undefined ? Number(raw) : 0;
    return Number.isInteger(value) && value >= 0 ? value : 0;
  };

  return {
    info: parse(AUDIT_RETENTION_KEYS.info),
    warning: parse(AUDIT_RETENTION_KEYS.warning),
    critical: parse(AUDIT_RETENTION_KEYS.critical),
  };
};

function validateRetentionPayload(payload: {
  info?: unknown;
  warning?: unknown;
  critical?: unknown;
}): AuditRetentionSettings {
  const validateOne = (value: unknown, label: string): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new SettingsServiceError(
        `Nilai retensi "${label}" harus berupa bilangan bulat non-negatif (0 = simpan selamanya).`,
        400,
      );
    }
    return value;
  };

  const info = validateOne(payload.info, 'info');
  const warning = validateOne(payload.warning, 'warning');
  const critical = validateOne(payload.critical, 'critical');

  // 0 means "keep forever" — treat it as infinite for the ordering check, since infinite
  // retention always satisfies "at least as long as" regardless of position.
  const effective = (value: number) => (value === 0 ? Infinity : value);

  if (effective(info) > effective(warning) || effective(warning) > effective(critical)) {
    throw new SettingsServiceError(
      'Retensi critical harus >= warning >= info. Kejadian yang lebih parah tidak boleh dihapus lebih cepat daripada kejadian yang lebih ringan.',
      400,
    );
  }

  return { info, warning, critical };
}

export const updateAuditRetentionSettings = async (params: {
  payload: { info?: unknown; warning?: unknown; critical?: unknown };
  actor: AuditActor;
  context?: AuditRequestContext | undefined;
}) => {
  const { payload, actor, context } = params;
  const next = validateRetentionPayload(payload);
  const before = await getAuditRetentionSettings();

  const upsertOne = (key: string, value: number, updatedById: string | null | undefined) =>
    prisma.systemSetting.upsert({
      where: { key },
      update: { value: String(value), updatedById: updatedById ?? null },
      create: { key, value: String(value), updatedById: updatedById ?? null },
    });

  // Shortening retention is the single most useful move for someone covering their tracks, so
  // this change is logged at `critical` severity — the loudest level the system has — with the
  // full before/after in metadata. This write goes through the same "mutation + audit row in
  // one transaction" pattern as users.service.ts, so a failed audit write rolls back the
  // settings change rather than leaving an unlogged retention change in place.
  await prisma.$transaction([
    upsertOne(AUDIT_RETENTION_KEYS.info, next.info, actor.id),
    upsertOne(AUDIT_RETENTION_KEYS.warning, next.warning, actor.id),
    upsertOne(AUDIT_RETENTION_KEYS.critical, next.critical, actor.id),
    buildAuditLog({
      action: AUDIT_ACTIONS.SETTINGS_AUDIT_RETENTION_CHANGED,
      actor,
      target: { type: 'system_setting', id: 'audit_retention', label: 'Retensi Audit Log' },
      metadata: { before, after: next },
      context,
    }),
  ]);

  return next;
};
