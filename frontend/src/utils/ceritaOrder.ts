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
  const index = displayOrder(siblings).findIndex((item) => item.id === id);
  if (index < 0) return null;
  return moveReorderItems(siblings, id, index + direction);
}

/**
 * Builds the body of a reorder request that puts one sibling at `toIndex` (0-based, in the displayed
 * order), for drag and drop. Same rules as `swapReorderItems`: the server gets every sibling once
 * with unique `sortOrder` values, renumbered only when the stored values are not usable.
 *
 * Returns null when the sibling is unknown, `toIndex` is out of range, or it would stay in place.
 */
export function moveReorderItems(
  siblings: readonly Orderable[],
  id: string,
  toIndex: number,
): ReorderItem[] | null {
  const ordered = displayOrder(siblings);
  const index = ordered.findIndex((item) => item.id === id);
  if (index < 0 || toIndex < 0 || toIndex >= ordered.length || toIndex === index) return null;

  const reordered = [...ordered];
  const [moved] = reordered.splice(index, 1);
  if (!moved) return null;
  reordered.splice(toIndex, 0, moved);

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

/** The siblings in the order they are shown: by sort value (none last), ties by position. */
function displayOrder<T extends Orderable>(siblings: readonly T[]): T[] {
  return siblings
    .map((item, position) => ({ item, position }))
    .sort(
      (a, b) =>
        (a.item.sortOrder ?? Number.POSITIVE_INFINITY) -
          (b.item.sortOrder ?? Number.POSITIVE_INFINITY) || a.position - b.position,
    )
    .map((entry) => entry.item);
}
