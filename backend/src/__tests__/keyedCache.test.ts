import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KeyedLruCache, BoundedLruCache } from '../utils/keyedCache.js';

describe('utils/keyedCache KeyedLruCache', () => {
  it('throws on non-positive or non-finite capacity', () => {
    assert.throws(() => new KeyedLruCache(0), TypeError);
    assert.throws(() => new KeyedLruCache(-5), TypeError);
    assert.throws(() => new KeyedLruCache(NaN), TypeError);
    assert.throws(() => new KeyedLruCache(Infinity), TypeError);
    assert.throws(() => new KeyedLruCache({ capacity: 0 }), TypeError);
  });

  it('stores and retrieves entries, promoting recency on get()', () => {
    const cache = new KeyedLruCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    assert.equal(cache.size, 3);
    assert.deepEqual(Array.from(cache.keys()), ['a', 'b', 'c']);

    // Access 'a' -> moves to most recently used (end)
    const val = cache.get('a');
    assert.equal(val, 1);
    assert.deepEqual(Array.from(cache.keys()), ['b', 'c', 'a']);
  });

  it('peek() retrieves value without altering recency', () => {
    const cache = new KeyedLruCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    assert.equal(cache.peek('a'), 1);
    assert.deepEqual(Array.from(cache.keys()), ['a', 'b', 'c']);
  });

  it('evicts the least recently used entry when capacity is exceeded', () => {
    const evicted: Array<{ key: string; value: number }> = [];
    const cache = new BoundedLruCache<string, number>({
      capacity: 3,
      onEvict: (k, v) => evicted.push({ key: k, value: v }),
    });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' to make 'b' the LRU
    cache.get('a');

    // Insert 'd': capacity exceeded -> 'b' should be evicted
    cache.set('d', 4);

    assert.equal(cache.size, 3);
    assert.deepEqual(Array.from(cache.keys()), ['c', 'a', 'd']);
    assert.equal(cache.has('b'), false);
    assert.equal(cache.get('b'), undefined);
    assert.deepEqual(evicted, [{ key: 'b', value: 2 }]);
  });

  it('updating an existing key updates value and promotes recency without triggering onEvict', () => {
    let evictedCount = 0;
    const cache = new KeyedLruCache<string, number>({
      capacity: 2,
      onEvict: () => evictedCount++,
    });

    cache.set('a', 1);
    cache.set('b', 2);

    cache.set('a', 10);
    assert.equal(cache.get('a'), 10);
    assert.deepEqual(Array.from(cache.keys()), ['b', 'a']);
    assert.equal(evictedCount, 0);
  });

  it('getOrCompute returns cached value or executes factory', () => {
    const cache = new KeyedLruCache<string, { data: string }>(2);
    let computeCount = 0;

    const res1 = cache.getOrCompute('x', () => {
      computeCount++;
      return { data: 'first' };
    });
    assert.deepEqual(res1, { data: 'first' });
    assert.equal(computeCount, 1);

    const res2 = cache.getOrCompute('x', () => {
      computeCount++;
      return { data: 'second' };
    });
    assert.deepEqual(res2, { data: 'first' });
    assert.equal(computeCount, 1);
  });

  it('supports delete, clear, entries, values, and iterator', () => {
    const cache = new KeyedLruCache<string, number>(3);
    cache.set('x', 10);
    cache.set('y', 20);

    assert.equal(cache.delete('x'), true);
    assert.equal(cache.delete('non-existent'), false);
    assert.equal(cache.size, 1);

    assert.deepEqual(Array.from(cache.values()), [20]);
    assert.deepEqual(Array.from(cache.entries()), [['y', 20]]);
    assert.deepEqual(Array.from(cache), [['y', 20]]);

    cache.clear();
    assert.equal(cache.size, 0);
    assert.equal(cache.has('y'), false);
  });
});
