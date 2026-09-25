export interface KeyedCacheOptions<K, V> {
  capacity: number;
  onEvict?: (key: K, value: V) => void;
}

export type BoundedLruCacheOptions<K, V> = KeyedCacheOptions<K, V>;

/**
 * In-memory generic bounded cache with Least Recently Used (LRU) eviction policy.
 *
 * Utilizes JavaScript Map iteration order to track recency in O(1) time:
 * - Reads (`get`, `getOrCompute`) move accessed keys to the end (most recently used).
 * - Writes (`set`) move or insert keys at the end.
 * - When size exceeds capacity, the first key (least recently used) is evicted.
 */
export class KeyedLruCache<K, V> {
  public readonly capacity: number;
  private readonly onEvict?: ((key: K, value: V) => void) | undefined;
  private readonly map = new Map<K, V>();

  constructor(optionsOrCapacity: number | KeyedCacheOptions<K, V>) {
    const options =
      typeof optionsOrCapacity === 'number' ? { capacity: optionsOrCapacity } : optionsOrCapacity;

    if (
      typeof options?.capacity !== 'number' ||
      !Number.isFinite(options.capacity) ||
      options.capacity <= 0
    ) {
      throw new TypeError('capacity must be a positive finite number');
    }

    this.capacity = Math.floor(options.capacity);
    this.onEvict = options.onEvict;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Retrieves an item and promotes it to most-recently-used in O(1).
   */
  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  /**
   * Reads an item without modifying its recency.
   */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  /**
   * Inserts or updates an item as most-recently-used, evicting the least recently used
   * item if the cache is at capacity.
   */
  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestVal = this.map.get(oldestKey);
        this.map.delete(oldestKey);
        if (this.onEvict && oldestVal !== undefined) {
          this.onEvict(oldestKey, oldestVal);
        }
      }
    }
    this.map.set(key, value);
    return this;
  }

  /**
   * Retrieves an existing value or computes it via factory if absent,
   * guaranteeing recency bump and capacity bound.
   */
  getOrCompute(key: K, factory: (key: K) => V): V {
    if (this.map.has(key)) {
      return this.get(key)!;
    }
    const computed = factory(key);
    this.set(key, computed);
    return computed;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}

export { KeyedLruCache as BoundedLruCache };
