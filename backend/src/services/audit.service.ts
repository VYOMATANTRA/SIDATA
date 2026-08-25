import prisma from '../utils/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

export class AuditServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuditServiceError';
    this.statusCode = statusCode;
  }
}

export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

interface AuditActionDef {
  action: string;
  severity: AuditSeverity;
}

function defineAction(action: string, severity: AuditSeverity): AuditActionDef {
  return { action, severity };
}

/**
 * Every action this codebase can log, each with a severity fixed here rather than left to the
 * call site — see docs/SPEC.md §3. Adding a new action means adding one line here; nothing
 * about it requires a migration (action/severity are plain strings on the row, not DB enums).
 * Future CMS content-edit actions (SPEC.md §7 "override logs") belong in this same object.
 */
export const AUDIT_ACTIONS = {
  USER_CREATED_BY_ADMIN: defineAction('user.created_by_admin', 'info'),
  USER_CREATED_VIA_GOOGLE: defineAction('user.created_via_google', 'info'),
  USER_REACTIVATED: defineAction('user.reactivated', 'warning'),
  USER_DEACTIVATED: defineAction('user.deactivated', 'warning'),
  USER_ROLE_CHANGED: defineAction('user.role_changed', 'critical'),
  USER_PASSWORD_RESET_BY_ADMIN: defineAction('user.password_reset_by_admin', 'critical'),

  PROFILE_PASSWORD_CHANGED: defineAction('profile.password_changed', 'info'),

  AUTH_LOGIN: defineAction('auth.login', 'info'),
  AUTH_LOGIN_FAILED: defineAction('auth.login_failed', 'warning'),
  AUTH_LOGOUT: defineAction('auth.logout', 'info'),
  AUTH_FIRST_LOGIN_PASSWORD_SET: defineAction('auth.first_login_password_set', 'info'),
  AUTH_REFRESH_TOKEN_MISMATCH: defineAction('auth.refresh_token_mismatch', 'critical'),
  AUTH_GOOGLE_ACCOUNT_LINKED: defineAction('auth.google_account_linked', 'critical'),
  AUTH_SESSIONS_REVOKED: defineAction('auth.sessions_revoked', 'info'),
  AUTH_OAUTH_STATE_MISMATCH: defineAction('auth.oauth_state_mismatch', 'critical'),
  AUTH_EMAIL_VERIFIED: defineAction('auth.email_verified', 'info'),
  AUTH_OTP_ATTEMPTS_EXCEEDED: defineAction('auth.otp_attempts_exceeded', 'critical'),

  SETTINGS_AUDIT_RETENTION_CHANGED: defineAction('settings.audit_retention_changed', 'critical'),
  AUDIT_PRUNED: defineAction('audit.pruned', 'info'),
} as const satisfies Record<string, AuditActionDef>;

export interface AuditActor {
  id?: string | null;
  email?: string | null;
  role?: string | null;
}

export interface AuditTarget {
  type?: string | null;
  id?: string | null;
  label?: string | null;
}

export interface AuditRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry {
  action: AuditActionDef;
  outcome?: 'success' | 'failure' | undefined;
  actor?: AuditActor | null | undefined;
  target?: AuditTarget | null | undefined;
  /**
   * Before/after diffs, failure reasons, counts, etc. NEVER put credential material here —
   * no password hashes, no plaintext passwords, no JWTs/refresh tokens, no OTP codes. Password
   * and credential events record only that a change happened.
   */
  metadata?: Record<string, unknown> | null | undefined;
  context?: AuditRequestContext | null | undefined;
}

/**
 * Builds (but does not await) the `prisma.auditLog.create(...)` call for one entry, so it can
 * be pushed as an extra op into an existing `prisma.$transaction([...])` array — the codebase
 * uses only the array/batch form of $transaction (see users.service.ts, profile.service.ts),
 * never the interactive callback form, so there is no `tx` client to thread through; this is
 * the shape that form requires. Prisma Client promises are lazy, so calling this does not touch
 * the DB until the resulting promise is awaited (directly, or via $transaction).
 */
export function buildAuditLog(entry: AuditEntry) {
  return prisma.auditLog.create({
    data: {
      action: entry.action.action,
      severity: entry.action.severity,
      outcome: entry.outcome ?? 'success',
      actorId: entry.actor?.id ?? null,
      actorEmail: entry.actor?.email ?? null,
      actorRole: entry.actor?.role ?? null,
      targetType: entry.target?.type ?? null,
      targetId: entry.target?.id ?? null,
      targetLabel: entry.target?.label ?? null,
      ipAddress: entry.context?.ipAddress ?? null,
      userAgent: entry.context?.userAgent ?? null,
      // Omitted entirely (rather than set to `undefined`) when absent — exactOptionalPropertyTypes
      // rejects an explicit `undefined` against Prisma's JSON input type, and omitting the key
      // lets the nullable column default to NULL the same way it would with a bare `?? undefined`.
      ...(entry.metadata != null ? { metadata: entry.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}

/**
 * For standalone events (auth/session flows) with no existing transaction to join. Wrapped in
 * a single-op $transaction rather than a bare `create` purely for consistency with the
 * mutation+audit call sites — there is nothing else in this transaction to be atomic with.
 * Deliberately does NOT swallow errors: the "same transaction" choice over "best-effort" was
 * made specifically so a DB hiccup doesn't silently drop a log row, so a failure here propagates
 * to the caller's existing try/catch (which already returns 500). Known limitation: for events
 * recorded after an already-committed side effect (e.g. a session already issued), a failure
 * here surfaces as a 500 to the client even though that prior effect isn't rolled back — a full
 * saga/compensating-transaction fix is out of scope for this pass.
 */
export async function recordAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.$transaction([buildAuditLog(entry)]);
}

export interface AuditLogListFilters {
  actorId?: string | undefined;
  action?: string | undefined;
  severity?: AuditSeverity | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  outcome?: 'success' | 'failure' | undefined;
  acknowledged?: boolean | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export const getAuditLogsList = async (filters: AuditLogListFilters) => {
  const page = filters.page && filters.page > 0 ? Math.floor(filters.page) : 1;
  const pageSize =
    filters.pageSize && filters.pageSize > 0
      ? Math.min(Math.floor(filters.pageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const where = {
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
    ...(filters.targetId ? { targetId: filters.targetId } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.acknowledged === true ? { acknowledgedAt: { not: null } } : {}),
    ...(filters.acknowledged === false ? { acknowledgedAt: null } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total, page, pageSize };
};

const DEFAULT_SUMMARY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const getAuditSummary = async (params: { since?: Date | undefined } = {}) => {
  const since = params.since ?? new Date(Date.now() - DEFAULT_SUMMARY_WINDOW_MS);

  const [bySeverity, openCritical] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['severity'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.auditLog.count({
      where: { severity: 'critical', acknowledgedAt: null },
    }),
  ]);

  const counts: Record<AuditSeverity, number> = { info: 0, warning: 0, critical: 0 };
  for (const row of bySeverity) {
    if (row.severity === 'info' || row.severity === 'warning' || row.severity === 'critical') {
      counts[row.severity] = row._count._all;
    }
  }

  return { since, counts, openCritical };
};

export const acknowledgeAuditLog = async (params: { id: unknown; actor: AuditActor }) => {
  const { id, actor } = params;

  if (!id || typeof id !== 'string') {
    throw new AuditServiceError('ID audit log tidak valid.', 400);
  }

  const log = await prisma.auditLog.findUnique({ where: { id } });

  if (!log) {
    throw new AuditServiceError('Audit log tidak ditemukan.', 404);
  }

  if (log.severity !== 'critical') {
    throw new AuditServiceError(
      'Hanya kejadian dengan tingkat critical yang perlu di-acknowledge.',
      400,
    );
  }

  if (log.acknowledgedAt != null) {
    throw new AuditServiceError('Audit log ini sudah di-acknowledge sebelumnya.', 400);
  }

  return prisma.auditLog.update({
    where: { id },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedById: actor.id ?? null,
    },
  });
};
