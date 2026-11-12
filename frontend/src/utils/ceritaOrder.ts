export interface Orderable {
  id: string;
  sortOrder: number | null;
}

export interface ReorderItem {
  id: string;
  sortOrder: number;
}

/**
 * Builds the body of a reorder request that moves one sibling a step up (-1) or down (+1).
 *
 * The server wants every sibling named exactly once with unique `sortOrder` values. The two
 * moved siblings simply trade their existing values, which keeps every other row untouched. When
 * the stored values are not unique (or missing), the whole list is renumbered 0..n-1 instead,
 * because a request with duplicates would be refused.
 *
 * Returns null when there is nothing to do (an edge row moved outwards or an unknown id).
 */
export function swapReorderItems(
  siblings: readonly Orderable[],
  id: string,
  direction: -1 | 1,
): ReorderItem[] | null {
  const index = siblings.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return null;

  const reordered = [...siblings];
  const [moved] = reordered.splice(index, 1);
  if (!moved) return null;
  reordered.splice(target, 0, moved);

  const stored = siblings.map((item) => item.sortOrder);
  const usable =
    stored.every((value): value is number => typeof value === 'number') &&
    new Set(stored).size === stored.length;
  const slots = usable ? (stored as number[]) : siblings.map((_, position) => position);

  return reordered.map((item, position) => ({
    id: item.id,
    sortOrder: slots[position] ?? position,
  }));
}
