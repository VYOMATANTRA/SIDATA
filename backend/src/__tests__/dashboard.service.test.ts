import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECENT_CHANGE_PREFIXES,
  actorNameFrom,
  toRecentChange,
} from '../services/dashboard.service.js';

describe('dashboard projection', () => {
  it('shows only the handle of the actor email', () => {
    assert.equal(actorNameFrom('andi.naufal@itk.ac.id'), 'andi.naufal');
    assert.equal(actorNameFrom(null), null);
    assert.equal(actorNameFrom('@x'), null);
  });

  it('projects exactly five fields and never leaks metadata, IP or email', () => {
    const out = toRecentChange({
      action: 'indicator.updated',
      targetType: 'indicator',
      targetLabel: 'Jumlah guru',
      actorEmail: 'budi@itk.ac.id',
      createdAt: new Date('2026-11-26T01:00:00.000Z'),
      metadata: { secret: 1 },
      ipAddress: '10.0.0.1',
      userAgent: 'x',
    } as never);
    assert.deepEqual(Object.keys(out).sort(), [
      'action',
      'actorName',
      'createdAt',
      'targetLabel',
      'targetType',
    ]);
    assert.ok(!JSON.stringify(out).includes('itk.ac.id'));
  });

  it('allowlists content actions only, never auth, user or audit ones', () => {
    for (const bad of ['auth.login', 'user.role_changed', 'audit.pruned', 'media.uploaded']) {
      assert.ok(!RECENT_CHANGE_PREFIXES.some((p) => bad.startsWith(p)), bad);
    }
    assert.ok(RECENT_CHANGE_PREFIXES.some((p) => 'page.highlights_updated'.startsWith(p)));
  });
});
