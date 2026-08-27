import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPruneWindows, buildPruneWhere } from '../../scripts/prune-audit-logs.js';

// scripts/prune-audit-logs.ts needs a privileged DB connection (AUDIT_ADMIN_DATABASE_URL) to
// actually run, which this test environment doesn't have. Its window-selection logic — which
// severities are in scope, what cutoff applies, and the "never prune an unacknowledged critical
// row" rule — is factored into these two pure functions specifically so it's testable without
// one. See docs/SPEC.md §3.
describe('buildPruneWindows', () => {
  const now = new Date('2026-08-25T00:00:00.000Z');

  it('skips every severity whose retention is 0 (keep forever)', () => {
    const windows = buildPruneWindows({ info: 0, warning: 0, critical: 0 }, now);
    assert.deepEqual(windows, []);
  });

  it('includes only the severities with a positive retention window', () => {
    const windows = buildPruneWindows({ info: 30, warning: 0, critical: 0 }, now);
    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.severity, 'info');
    assert.equal(windows[0]?.retentionDays, 30);
  });

  it('computes the cutoff as `now - retentionDays` in whole days', () => {
    const windows = buildPruneWindows({ info: 30, warning: 365, critical: 0 }, now);
    const info = windows.find((w) => w.severity === 'info');
    const warning = windows.find((w) => w.severity === 'warning');

    assert.equal(info?.cutoff.toISOString(), '2026-07-26T00:00:00.000Z');
    assert.equal(warning?.cutoff.toISOString(), '2025-08-25T00:00:00.000Z');
  });

  it('treats a negative retention value the same as 0 (skipped)', () => {
    const windows = buildPruneWindows({ info: -5, warning: 0, critical: 0 }, now);
    assert.deepEqual(windows, []);
  });
});

describe('buildPruneWhere', () => {
  const cutoff = new Date('2026-07-26T00:00:00.000Z');

  it('does not filter on acknowledgedAt for info/warning severities', () => {
    const where = buildPruneWhere({ severity: 'info', retentionDays: 30, cutoff });
    assert.deepEqual(where, { severity: 'info', createdAt: { lt: cutoff } });
  });

  it('requires acknowledgedAt to be set for critical severity — an open incident is never pruned', () => {
    const where = buildPruneWhere({ severity: 'critical', retentionDays: 30, cutoff });
    assert.deepEqual(where, {
      severity: 'critical',
      createdAt: { lt: cutoff },
      acknowledgedAt: { not: null },
    });
  });
});
