import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalizeJson, stableJsonStringify, hasFieldChanged } from '../utils/comparator.js';

describe('utils/comparator', () => {
  describe('canonicalizeJson', () => {
    it('returns primitives, null, and undefined as-is', () => {
      assert.equal(canonicalizeJson(null), null);
      assert.equal(canonicalizeJson(undefined), undefined);
      assert.equal(canonicalizeJson(42), 42);
      assert.equal(canonicalizeJson('hello'), 'hello');
      assert.equal(canonicalizeJson(true), true);
    });

    it('converts Date instances to ISO strings, handling invalid dates safely', () => {
      const d = new Date('2026-09-25T12:00:00.000Z');
      assert.equal(canonicalizeJson(d), '2026-09-25T12:00:00.000Z');

      const invalid = new Date('invalid');
      assert.equal(canonicalizeJson(invalid), null);
    });

    it('recursively canonicalizes arrays', () => {
      const arr = [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ];
      const result = canonicalizeJson(arr);
      assert.deepEqual(result, [
        { a: 1, b: 2 },
        { c: 3, d: 4 },
      ]);
      assert.deepEqual(Object.keys((result as Record<string, unknown>[])[0]!), ['a', 'b']);
    });

    it('sorts object keys lexicographically regardless of insertion order', () => {
      const obj1 = { z: 26, a: 1, m: 13 };
      const obj2 = { a: 1, m: 13, z: 26 };

      const canon1 = canonicalizeJson(obj1) as Record<string, unknown>;
      const canon2 = canonicalizeJson(obj2) as Record<string, unknown>;

      assert.deepEqual(Object.keys(canon1), ['a', 'm', 'z']);
      assert.deepEqual(Object.keys(canon2), ['a', 'm', 'z']);
    });

    it('recursively sorts nested objects', () => {
      const nested = {
        outer: { y: 2, x: 1 },
        list: [{ b: 2, a: 1 }],
      };
      const canon = canonicalizeJson(nested) as Record<string, unknown>;
      assert.deepEqual(Object.keys(canon['outer'] as Record<string, unknown>), ['x', 'y']);
      assert.deepEqual(Object.keys((canon['list'] as unknown[])[0] as Record<string, unknown>), [
        'a',
        'b',
      ]);
    });
  });

  describe('stableJsonStringify', () => {
    it('returns "null" for null or undefined', () => {
      assert.equal(stableJsonStringify(null), 'null');
      assert.equal(stableJsonStringify(undefined), 'null');
    });

    it('produces identical string representations for objects with different key order', () => {
      const obj1 = { lat: -1.2251, lon: 116.9438, zoom: 13 };
      const obj2 = { zoom: 13, lon: 116.9438, lat: -1.2251 };

      assert.equal(stableJsonStringify(obj1), stableJsonStringify(obj2));
    });
  });

  describe('hasFieldChanged', () => {
    it('returns false for identical primitives', () => {
      assert.equal(hasFieldChanged('foo', 'foo'), false);
      assert.equal(hasFieldChanged(123, 123), false);
      assert.equal(hasFieldChanged(true, true), false);
      assert.equal(hasFieldChanged(null, null), false);
    });

    it('returns true when primitives differ', () => {
      assert.equal(hasFieldChanged('foo', 'bar'), true);
      assert.equal(hasFieldChanged(123, 456), true);
      assert.equal(hasFieldChanged(true, false), true);
      assert.equal(hasFieldChanged(null, ''), true);
    });

    it('returns false for structurally identical objects with different key orders', () => {
      const before = { lat: -1.2251, lon: 116.9438, zoom: 13 };
      const after = { zoom: 13, lon: 116.9438, lat: -1.2251 };

      assert.equal(hasFieldChanged(before, after), false);
    });

    it('returns true when object properties differ', () => {
      const before = { lat: -1.2251, lon: 116.9438, zoom: 13 };
      const after = { lat: -1.2251, lon: 116.9438, zoom: 14 };

      assert.equal(hasFieldChanged(before, after), true);
    });

    it('returns false for structurally identical nested arrays/objects', () => {
      const before = {
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
      };
      const after = {
        items: [
          { name: 'A', id: 1 },
          { name: 'B', id: 2 },
        ],
      };

      assert.equal(hasFieldChanged(before, after), false);
    });

    it('returns true when nested array items differ', () => {
      const before = { items: [{ id: 1, name: 'A' }] };
      const after = { items: [{ id: 1, name: 'B' }] };

      assert.equal(hasFieldChanged(before, after), true);
    });
  });
});
