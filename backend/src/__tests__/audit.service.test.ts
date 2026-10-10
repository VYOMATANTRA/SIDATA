import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIT_ACTIONS, AUDIT_SEVERITIES } from '../services/audit.service.js';

describe('audit.service AUDIT_ACTIONS', () => {
  it('defines PAGE_CREATED with info severity', () => {
    assert.deepStrictEqual(AUDIT_ACTIONS.PAGE_CREATED, {
      action: 'page.created',
      severity: 'info',
    });
  });

  it('defines PAGE_DELETED with warning severity', () => {
    assert.deepStrictEqual(AUDIT_ACTIONS.PAGE_DELETED, {
      action: 'page.deleted',
      severity: 'warning',
    });
  });

  it('defines PAGE_REORDERED with info severity', () => {
    assert.deepStrictEqual(AUDIT_ACTIONS.PAGE_REORDERED, {
      action: 'page.reordered',
      severity: 'info',
    });
  });

  it('all defined actions have valid severities from AUDIT_SEVERITIES', () => {
    for (const [key, def] of Object.entries(AUDIT_ACTIONS)) {
      assert.ok(
        (AUDIT_SEVERITIES as readonly string[]).includes(def.severity),
        `Action ${key} has invalid severity: ${def.severity}`,
      );
    }
  });
});
