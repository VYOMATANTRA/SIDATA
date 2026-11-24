import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { putSectionTextSchema } from '../services/sectionText.service.js';

const TOKEN = '2026-01-01T00:00:00.000Z';
const ok = (extra: Record<string, unknown>) =>
  putSectionTextSchema.safeParse({
    title: 'Judul',
    body: 'Isi',
    expectedUpdatedAt: TOKEN,
    ...extra,
  });

describe('putSectionTextSchema (SPEC §3 section text)', () => {
  it('accepts a title with limited Markdown and blank-line paragraphs', () => {
    const r = ok({ body: 'Satu **tebal**.\n\nDua [tautan](https://contoh.id)\n- a\n- b' });
    assert.equal(r.success, true);
  });

  it('allows an empty body (it removes the section text) and trims it', () => {
    const r = ok({ body: '   ' });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.body, '');
  });

  it('refuses a tag-shaped body but allows a bare comparison', () => {
    assert.equal(ok({ body: 'Klik <b>ini</b>' }).success, false);
    assert.equal(ok({ body: 'RT 1 < RT 2 dan a<b' }).success, true);
  });

  it('refuses a body over 50.000 characters, a blank title and unknown keys', () => {
    assert.equal(ok({ body: 'x'.repeat(50001) }).success, false);
    assert.equal(ok({ title: '   ' }).success, false);
    assert.equal(ok({ extra: 1 }).success, false);
  });
});
