import { describe, expect, it } from 'vitest';
import {
  MAX_STAT_HIGHLIGHTS,
  mergeHighlightIds,
  moveHighlight,
  sameIds,
  statPageSlugs,
} from '../utils/statHighlights';

describe('statHighlights helpers', () => {
  it('caps the landing card at four statistics', () => {
    expect(MAX_STAT_HIGHLIGHTS).toBe(4);
  });

  it('lists the waste topic under both of its slugs, the topic’s own slug first', () => {
    expect(statPageSlugs('persampahan')).toEqual([
      'persampahan',
      'persampahan-dan-bank-sampah-unit',
    ]);
    expect(statPageSlugs('Persampahan-dan-Bank-Sampah-Unit')).toEqual([
      'persampahan-dan-bank-sampah-unit',
      'persampahan',
    ]);
    expect(statPageSlugs('kependudukan')).toEqual(['kependudukan']);
  });

  it('merges id lists in order, drops repeats and keeps at most four', () => {
    expect(mergeHighlightIds([['a', 'b'], ['b', 'c', 'd', 'e']])).toEqual(['a', 'b', 'c', 'd']);
    expect(mergeHighlightIds([[], ['x']])).toEqual(['x']);
  });

  it('moves an id to a 0-based index after removing it, and reports no-op moves as null', () => {
    expect(moveHighlight(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveHighlight(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveHighlight(['a', 'b', 'c'], 'b', 1)).toBeNull();
    expect(moveHighlight(['a', 'b', 'c'], 'z', 0)).toBeNull();
    expect(moveHighlight(['a', 'b', 'c'], 'a', 3)).toBeNull();
  });

  it('compares id lists by content and order', () => {
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameIds(['a'], ['a', 'b'])).toBe(false);
  });
});
