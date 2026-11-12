import { describe, expect, it } from 'vitest';
import { swapReorderItems } from '../utils/ceritaOrder';

const rows = [
  { id: 'a', sortOrder: 0 },
  { id: 'b', sortOrder: 1 },
  { id: 'c', sortOrder: 2 },
];

describe('swapReorderItems', () => {
  it('moves one sibling down and trades the two sort values, naming every sibling once', () => {
    expect(swapReorderItems(rows, 'a', 1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ]);
  });

  it('moves one sibling up', () => {
    expect(swapReorderItems(rows, 'c', -1)).toEqual([
      { id: 'a', sortOrder: 0 },
      { id: 'c', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ]);
  });

  it('keeps gaps in the stored values (deleting leaves gaps)', () => {
    const gapped = [
      { id: 'a', sortOrder: 2 },
      { id: 'b', sortOrder: 5 },
      { id: 'c', sortOrder: 9 },
    ];
    expect(swapReorderItems(gapped, 'b', 1)).toEqual([
      { id: 'a', sortOrder: 2 },
      { id: 'c', sortOrder: 5 },
      { id: 'b', sortOrder: 9 },
    ]);
  });

  it('renumbers the list when stored values are duplicated or missing', () => {
    const duplicated = [
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 1 },
    ];
    expect(swapReorderItems(duplicated, 'a', 1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
    const missing = [
      { id: 'a', sortOrder: null },
      { id: 'b', sortOrder: null },
    ];
    expect(swapReorderItems(missing, 'b', -1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
  });

  it('returns null for an edge move outwards or an unknown id', () => {
    expect(swapReorderItems(rows, 'a', -1)).toBeNull();
    expect(swapReorderItems(rows, 'c', 1)).toBeNull();
    expect(swapReorderItems(rows, 'zzz', 1)).toBeNull();
  });
});
