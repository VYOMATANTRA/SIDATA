import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIT_ACTIONS } from '../services/audit.service.js';

describe('AUDIT_ACTIONS for Cerita authoring (SPEC §3)', () => {
  const expected: Array<[keyof typeof AUDIT_ACTIONS, string, 'info' | 'warning']> = [
    ['PAGE_UPDATED', 'page.updated', 'info'],
    ['CHAPTER_CREATED', 'chapter.created', 'info'],
    ['CHAPTER_UPDATED', 'chapter.updated', 'info'],
    ['CHAPTER_DELETED', 'chapter.deleted', 'warning'],
    ['CHAPTER_REORDERED', 'chapter.reordered', 'info'],
    ['SECTION_CREATED', 'section.created', 'info'],
    ['SECTION_UPDATED', 'section.updated', 'info'],
    ['SECTION_DELETED', 'section.deleted', 'warning'],
    ['SECTION_REORDERED', 'section.reordered', 'info'],
    ['CONTENT_BLOCK_CREATED', 'content_block.created', 'info'],
    ['CONTENT_BLOCK_DELETED', 'content_block.deleted', 'warning'],
    ['CONTENT_BLOCK_REORDERED', 'content_block.reordered', 'info'],
  ];

  for (const [key, action, severity] of expected) {
    it(`${action} is logged at ${severity}`, () => {
      assert.deepEqual(AUDIT_ACTIONS[key], { action, severity });
    });
  }

  it('every deletion is warning severity', () => {
    for (const [key, def] of Object.entries(AUDIT_ACTIONS)) {
      if (def.action.endsWith('.deleted')) {
        assert.equal(def.severity, 'warning', key);
      }
    }
  });
});
