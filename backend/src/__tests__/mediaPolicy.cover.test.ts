import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_PURPOSES, isMediaPurpose, resolveOwnerKey } from '../utils/mediaPolicy.js';
import { AUDIT_ACTIONS } from '../services/audit.service.js';

describe('cerita-cover media policy & audit actions', () => {
  it('registers cerita-cover as an uploader-owned photo purpose', () => {
    assert.equal(isMediaPurpose('cerita-cover'), true);
    assert.deepEqual(MEDIA_PURPOSES['cerita-cover'], {
      kinds: ['photo'],
      owner: { type: 'uploader' },
    });
    assert.equal(resolveOwnerKey('cerita-cover', 'user-123'), 'user-123');
  });

  it('registers page cover audit actions', () => {
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_UPDATED.action, 'page.cover_updated');
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_UPDATED.severity, 'info');
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_DELETED.action, 'page.cover_deleted');
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_DELETED.severity, 'warning');
  });
});
