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
 * The siblings are first put in their displayed order (by `sortOrder`, ties by their position in the
 * list given), so an unsorted input cannot make a move act on the wrong neighbour.
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
  // Work on the order the siblings are shown in: by sort value (none last), ties by position.
  const ordered = siblings
    .map((item, position) => ({ item, position }))
    .sort(
      (a, b) =>
        (a.item.sortOrder ?? Number.POSITIVE_INFINITY) -
          (b.item.sortOrder ?? Number.POSITIVE_INFINITY) || a.position - b.position,
    )
    .map((entry) => entry.item);

  const index = ordered.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return null;

  const reordered = [...ordered];
  const [moved] = reordered.splice(index, 1);
  if (!moved) return null;
  reordered.splice(target, 0, moved);

  const stored = ordered.map((item) => item.sortOrder);
  const usable =
    stored.every((value): value is number => typeof value === 'number') &&
    new Set(stored).size === stored.length;
  const slots = usable ? (stored as number[]) : ordered.map((_, position) => position);

  return reordered.map((item, position) => ({
    id: item.id,
    sortOrder: slots[position] ?? position,
  }));
}
