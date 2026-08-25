// Enforces "audit_logs is append-only" at the application layer. The Prisma client extension
// in prisma.ts wraps every `auditLog` write with these checks. This is Layer 1 of the two-layer
// tamper defense described in docs/SPEC.md §3 — a guardrail against accidental/careless app
// code, not a security boundary: anything with direct DB access bypasses it. Layer 2, the
// actual prevention, is the column-level MySQL grants in
// backend/scripts/grants/audit-logs-grants.sql, which the app's runtime DB user cannot bypass
// no matter what application code does.
//
// Kept as pure functions (no Prisma import) so this logic can be unit-tested without a live
// database — see src/__tests__/auditLogGuard.test.ts.

export const AUDIT_LOG_ACKNOWLEDGE_ONLY_COLUMNS = new Set(['acknowledgedAt', 'acknowledgedById']);

export class AuditLogImmutableError extends Error {
  constructor(operation: string) {
    super(
      `audit_logs bersifat append-only: operasi "${operation}" tidak diizinkan dari aplikasi. ` +
        'Hanya kolom acknowledgedAt/acknowledgedById yang boleh diubah, melalui alur acknowledge.',
    );
    this.name = 'AuditLogImmutableError';
  }
}

/**
 * Throws AuditLogImmutableError unless every key in `data` is one of the acknowledge-only
 * columns. Used to gate `auditLog.update`/`updateMany` — the only mutations ever permitted
 * against an existing audit_logs row.
 */
export function assertAuditLogAcknowledgeOnlyUpdate(data: unknown, operation: string): void {
  if (!data || typeof data !== 'object') {
    throw new AuditLogImmutableError(operation);
  }
  const keys = Object.keys(data as Record<string, unknown>);
  if (keys.length === 0 || !keys.every((key) => AUDIT_LOG_ACKNOWLEDGE_ONLY_COLUMNS.has(key))) {
    throw new AuditLogImmutableError(operation);
  }
}
