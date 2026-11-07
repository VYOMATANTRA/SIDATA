import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HierarchyServiceError,
  assertFresh,
  baseSlugFromTitle,
  planReorder,
  resolveUniqueSlug,
  sendHierarchyError,
  slugifyTitle,
  titleSchema,
  reorderBodySchema,
} from '../utils/hierarchyAuthoring.js';
import { fakeRes } from './helpers/fakeRes.js';

describe('hierarchyAuthoring', () => {
  describe('slugifyTitle', () => {
    it('lowercases, strips diacritics and collapses punctuation', () => {
      assert.equal(slugifyTitle('  Kesehatan Ibú & Anak!! '), 'kesehatan-ibu-anak');
      assert.equal(slugifyTitle('PHBS (2025)'), 'phbs-2025');
      assert.equal(slugifyTitle('!!!'), '');
      assert.equal(slugifyTitle('Анализ'), '');
    });
  });

  describe('baseSlugFromTitle', () => {
    it('rejects titles that yield no slug with 400', () => {
      assert.throws(
        () => baseSlugFromTitle('!!!', 'bab'),
        (e) => e instanceof HierarchyServiceError && e.statusCode === 400,
      );
    });

    it('does not treat reserved page words as an error', () => {
      for (const title of ['Public', 'Admin', 'Reorder', 'API']) {
        assert.equal(baseSlugFromTitle(title, 'bab'), title.toLowerCase());
      }
    });

    it('truncates to 100 characters without a trailing hyphen', () => {
      const slug = baseSlugFromTitle(`${'a'.repeat(99)} bbbb`, 'bab');
      assert.ok(slug.length <= 100);
      assert.equal(slug.endsWith('-'), false);
    });
  });

  describe('resolveUniqueSlug', () => {
    it('returns the base when free, else the first free numeric suffix', () => {
      assert.equal(resolveUniqueSlug('ringkasan', new Set()), 'ringkasan');
      assert.equal(resolveUniqueSlug('ringkasan', new Set(['ringkasan'])), 'ringkasan-2');
      assert.equal(
        resolveUniqueSlug('ringkasan', new Set(['ringkasan', 'ringkasan-2', 'ringkasan-3'])),
        'ringkasan-4',
      );
    });

    it('keeps suffixed slugs within 100 characters', () => {
      const base = 'a'.repeat(100);
      const result = resolveUniqueSlug(base, new Set([base]));
      assert.equal(result.length, 100);
      assert.ok(result.endsWith('-2'));
    });
  });

  describe('titleSchema', () => {
    const schema = titleSchema('Judul bab');
    it('trims valid titles and rejects HTML, control characters, bidi marks and overlong input', () => {
      assert.equal(schema.parse('  Bab Satu  '), 'Bab Satu');
      for (const bad of ['', '   ', '<b>x</b>', 'a<!--', 'a\u0000b', 'a‮b', 'x'.repeat(256), 5]) {
        assert.equal(schema.safeParse(bad).success, false, JSON.stringify(bad));
      }
    });
  });

  describe('assertFresh', () => {
    it('passes on an exact millisecond match and throws 409 STALE_WRITE otherwise', () => {
      const current = new Date('2026-10-01T00:00:00.123Z');
      assert.doesNotThrow(() => assertFresh(current, '2026-10-01T00:00:00.123Z', 'Bab'));
      assert.doesNotThrow(() => assertFresh(current, '2026-10-01T07:00:00.123+07:00', 'Bab'));
      assert.throws(
        () => assertFresh(current, '2026-10-01T00:00:00.124Z', 'Bab'),
        (e) =>
          e instanceof HierarchyServiceError &&
          e.statusCode === 409 &&
          e.code === 'STALE_WRITE' &&
          (e.details as { currentUpdatedAt: string }).currentUpdatedAt ===
            '2026-10-01T00:00:00.123Z',
      );
    });
  });

  describe('planReorder', () => {
    const siblings = [
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
    ];

    it('returns only changed items, sorted by id', () => {
      const plan = planReorder(
        [
          { id: 'b', sortOrder: 0 },
          { id: 'a', sortOrder: 1 },
        ],
        siblings,
        'bab',
      );
      assert.deepEqual(plan.changes, [
        { id: 'a', sortOrder: 1, from: 0 },
        { id: 'b', sortOrder: 0, from: 1 },
      ]);
    });

    it('returns no changes for an identical order', () => {
      assert.deepEqual(planReorder(siblings, siblings, 'bab').changes, []);
    });

    it('rejects duplicates, strangers and incomplete coverage', () => {
      const bad = [
        [
          { id: 'a', sortOrder: 0 },
          { id: 'a', sortOrder: 1 },
        ],
        [
          { id: 'a', sortOrder: 0 },
          { id: 'b', sortOrder: 0 },
        ],
        [
          { id: 'a', sortOrder: 0 },
          { id: 'z', sortOrder: 1 },
        ],
        [{ id: 'a', sortOrder: 0 }],
      ];
      for (const items of bad) {
        assert.throws(
          () => planReorder(items, siblings, 'bab'),
          (e) => e instanceof HierarchyServiceError && e.statusCode === 400,
        );
      }
    });
  });

  describe('reorderBodySchema', () => {
    it('requires expectedUpdatedAt and rejects negative, fractional and oversized sortOrders', () => {
      const ok = {
        expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
        items: [{ id: 'a', sortOrder: 0 }],
      };
      assert.equal(reorderBodySchema.safeParse(ok).success, true);
      assert.equal(reorderBodySchema.safeParse({ items: ok.items }).success, false);
      for (const sortOrder of [-1, 1.5, 2_147_483_648, '1']) {
        assert.equal(
          reorderBodySchema.safeParse({ ...ok, items: [{ id: 'a', sortOrder }] }).success,
          false,
        );
      }
      assert.equal(reorderBodySchema.safeParse({ ...ok, extra: 1 }).success, false);
    });
  });

  describe('sendHierarchyError', () => {
    it('writes status, message, code and details; ignores foreign errors', () => {
      const res = fakeRes();
      const handled = sendHierarchyError(
        res,
        new HierarchyServiceError('boom', 409, 'STALE_WRITE', { currentUpdatedAt: 'x' }),
      );
      assert.equal(handled, true);
      assert.equal(res.status, 409);
      assert.deepStrictEqual(res.body, {
        error: 'boom',
        code: 'STALE_WRITE',
        details: { currentUpdatedAt: 'x' },
      });

      const plain = fakeRes();
      assert.equal(sendHierarchyError(plain, new Error('x')), false);
      assert.equal(typeof plain.status, 'function', 'res.status was never called');
    });

    it('omits code/details when absent so legacy error bodies are unchanged', () => {
      const res = fakeRes();
      sendHierarchyError(res, new HierarchyServiceError('nope', 404));
      assert.deepStrictEqual(res.body, { error: 'nope' });
    });
  });
});
