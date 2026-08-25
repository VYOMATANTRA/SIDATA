// Standalone retention-pruning script for audit_logs. Run on a schedule (host cron, or a
// Docker sidecar — the deploy target is Docker on a VPS per AGENTS.md). See docs/SPEC.md §3.
//
// Connects with its own privileged DB client via AUDIT_ADMIN_DATABASE_URL — deliberately NOT
// the app's singleton in src/utils/prisma.ts, which is (a) bound to DATABASE_URL, the app's
// restricted runtime user (see backend/scripts/grants/audit-logs-grants.sql — that user cannot
// DELETE), and (b) wrapped in a client extension that blocks auditLog.deleteMany outright. This
// script needs a genuinely privileged connection, and it must be a DIFFERENT one from what the
// running server uses, or the no-DELETE grant on the app user would be pointless.
//
// Usage: npx tsx scripts/prune-audit-logs.ts   (from backend/, with AUDIT_ADMIN_DATABASE_URL set)

import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AUDIT_ADMIN_DATABASE_URL } from '../src/configs/index.js';
import { AUDIT_ACTIONS, type AuditSeverity } from '../src/services/audit.service.js';
import { AUDIT_RETENTION_KEYS as RETENTION_KEYS } from '../src/services/settings.service.js';

function getPrivilegedClient() {
  if (!AUDIT_ADMIN_DATABASE_URL) {
    throw new Error(
      'AUDIT_ADMIN_DATABASE_URL tidak diset. Script ini sengaja tidak jatuh kembali ke ' +
        'DATABASE_URL (user aplikasi tidak memiliki hak DELETE pada audit_logs — lihat ' +
        'backend/scripts/grants/audit-logs-grants.sql). Set AUDIT_ADMIN_DATABASE_URL ke koneksi ' +
        'MySQL yang memiliki hak penuh sebelum menjalankan pruning.',
    );
  }

  const url = new URL(AUDIT_ADMIN_DATABASE_URL);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  });
}

export interface PruneWindow {
  severity: AuditSeverity;
  retentionDays: number;
  cutoff: Date;
}

/**
 * Pure function so the window-selection logic (which severities are in scope, what cutoff
 * applies) is unit-testable without a database — see src/__tests__/pruneAuditLogs.test.ts.
 * `retentionDays <= 0` means "keep forever" — that severity is skipped entirely.
 */
export function buildPruneWindows(
  retention: Record<AuditSeverity, number>,
  now: Date = new Date(),
): PruneWindow[] {
  const windows: PruneWindow[] = [];
  for (const severity of ['info', 'warning', 'critical'] as const) {
    const retentionDays = retention[severity];
    if (retentionDays <= 0) continue;
    windows.push({
      severity,
      retentionDays,
      cutoff: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000),
    });
  }
  return windows;
}

/**
 * The WHERE clause for one prune window. Separated from the query call so it stays testable:
 * an unacknowledged `critical` row is never eligible, regardless of age — an incident nobody
 * has looked at yet is not stale. Acknowledged critical rows are eligible like any other
 * severity once past their window.
 */
export function buildPruneWhere(window: PruneWindow) {
  return window.severity === 'critical'
    ? {
        severity: window.severity,
        createdAt: { lt: window.cutoff },
        acknowledgedAt: { not: null },
      }
    : { severity: window.severity, createdAt: { lt: window.cutoff } };
}

async function main() {
  const client = getPrivilegedClient();

  try {
    const settingRows = await client.systemSetting.findMany({
      where: { key: { in: Object.values(RETENTION_KEYS) } },
    });
    const byKey = new Map(settingRows.map((row) => [row.key, row.value]));
    const parse = (key: string): number => {
      const value = Number(byKey.get(key) ?? 0);
      return Number.isInteger(value) && value >= 0 ? value : 0;
    };
    const retention: Record<AuditSeverity, number> = {
      info: parse(RETENTION_KEYS.info),
      warning: parse(RETENTION_KEYS.warning),
      critical: parse(RETENTION_KEYS.critical),
    };

    const windows = buildPruneWindows(retention);

    if (windows.length === 0) {
      console.log(
        'No severities configured for pruning (all retention settings are 0/keep-forever).',
      );
      return;
    }

    const deletedCounts: Partial<Record<AuditSeverity, number>> = {};

    for (const window of windows) {
      const { count } = await client.auditLog.deleteMany({ where: buildPruneWhere(window) });
      deletedCounts[window.severity] = count;
      console.log(
        `Pruned ${count} "${window.severity}" audit_logs row(s) older than ${window.retentionDays}d.`,
      );
    }

    // The log records its own truncation, so a gap in the timeline is never unexplained.
    await client.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.AUDIT_PRUNED.action,
        severity: AUDIT_ACTIONS.AUDIT_PRUNED.severity,
        metadata: { deletedCounts, retention },
      },
    });
  } finally {
    await client.$disconnect();
  }
}

// Only auto-run when executed directly (npx tsx scripts/prune-audit-logs.ts), not when imported
// by tests for buildPruneWindows/buildPruneWhere.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error saat menjalankan pruning audit log:', error);
    process.exit(1);
  });
}
