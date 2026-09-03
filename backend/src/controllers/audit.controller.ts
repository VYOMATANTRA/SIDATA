import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import {
  AuditServiceError,
  AUDIT_SEVERITIES,
  getAuditLogsList,
  getAuditSummary,
  acknowledgeAuditLog,
  type AuditSeverity,
} from '../services/audit.service.js';

function parseSeverity(value: unknown): AuditSeverity | undefined {
  return typeof value === 'string' && (AUDIT_SEVERITIES as readonly string[]).includes(value)
    ? (value as AuditSeverity)
    : undefined;
}

function parseOutcome(value: unknown): 'success' | 'failure' | undefined {
  return value === 'success' || value === 'failure' ? value : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const listAuditLogs = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const q = req.query;
    const result = await getAuditLogsList({
      actorId: typeof q.actorId === 'string' ? q.actorId : undefined,
      action: typeof q.action === 'string' ? q.action : undefined,
      severity: parseSeverity(q.severity),
      targetType: typeof q.targetType === 'string' ? q.targetType : undefined,
      targetId: typeof q.targetId === 'string' ? q.targetId : undefined,
      outcome: parseOutcome(q.outcome),
      acknowledged: parseBoolean(q.acknowledged),
      from: parseDate(q.from),
      to: parseDate(q.to),
      page: parsePositiveInt(q.page),
      pageSize: parsePositiveInt(q.pageSize),
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuditServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat mengambil audit log:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getAuditLogsSummary = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const since = parseDate(req.query.since);
    const summary = await getAuditSummary({ since });
    return res.status(200).json(summary);
  } catch (error) {
    console.error(
      'Error saat mengambil ringkasan audit log:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const acknowledgeAuditLogEntry = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const { id } = req.params;
    const log = await acknowledgeAuditLog({ id, actor });
    return res.status(200).json({ message: 'Audit log berhasil di-acknowledge.', log });
  } catch (error) {
    if (error instanceof AuditServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat acknowledge audit log:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
