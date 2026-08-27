import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertAuditLogAcknowledgeOnlyUpdate,
  AuditLogImmutableError,
  AUDIT_LOG_ACKNOWLEDGE_ONLY_COLUMNS,
} from '../utils/auditLogGuard.js';

// This is Layer 1 of the two-layer tamper defense (docs/SPEC.md §3): a Prisma client extension
// (src/utils/prisma.ts) wraps every auditLog write with these checks. Testing the pure logic
// directly — rather than through a live extended Prisma client — means this suite runs without
// a database and isolates exactly what the guard does and doesn't allow.
describe('auditLogGuard', () => {
  it('exposes exactly acknowledgedAt/acknowledgedById as the allowed columns', () => {
    assert.deepEqual([...AUDIT_LOG_ACKNOWLEDGE_ONLY_COLUMNS].sort(), [
      'acknowledgedAt',
      'acknowledgedById',
    ]);
  });

  it('allows an update touching only acknowledgedAt', () => {
    assert.doesNotThrow(() =>
      assertAuditLogAcknowledgeOnlyUpdate({ acknowledgedAt: new Date() }, 'update'),
    );
  });

  it('allows an update touching only acknowledgedById', () => {
    assert.doesNotThrow(() =>
      assertAuditLogAcknowledgeOnlyUpdate({ acknowledgedById: 'admin-1' }, 'update'),
    );
  });

  it('allows an update touching both acknowledge columns together', () => {
    assert.doesNotThrow(() =>
      assertAuditLogAcknowledgeOnlyUpdate(
        { acknowledgedAt: new Date(), acknowledgedById: 'admin-1' },
        'updateMany',
      ),
    );
  });

  it('rejects an update touching a non-acknowledge column', () => {
    assert.throws(
      () => assertAuditLogAcknowledgeOnlyUpdate({ action: 'tampered' }, 'update'),
      AuditLogImmutableError,
    );
  });

  it('rejects an update mixing an allowed column with a disallowed one', () => {
    // The whole point is that acknowledging a row can never smuggle in an edit to anything
    // else — a mixed payload must be rejected, not partially allowed.
    assert.throws(
      () =>
        assertAuditLogAcknowledgeOnlyUpdate(
          { acknowledgedAt: new Date(), severity: 'info' },
          'update',
        ),
      AuditLogImmutableError,
    );
  });

  it('rejects an empty update payload', () => {
    assert.throws(() => assertAuditLogAcknowledgeOnlyUpdate({}, 'update'), AuditLogImmutableError);
  });

  it('rejects a non-object payload', () => {
    assert.throws(
      () => assertAuditLogAcknowledgeOnlyUpdate(null, 'update'),
      AuditLogImmutableError,
    );
    assert.throws(
      () => assertAuditLogAcknowledgeOnlyUpdate(undefined, 'update'),
      AuditLogImmutableError,
    );
  });

  it('error message names the rejected operation', () => {
    try {
      assertAuditLogAcknowledgeOnlyUpdate({ action: 'x' }, 'deleteMany');
      assert.fail('expected a throw');
    } catch (error) {
      assert.ok(error instanceof AuditLogImmutableError);
      assert.match((error as Error).message, /deleteMany/);
    }
  });
});
