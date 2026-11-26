/**
 * Landing-card statistics per topic (SPEC §8, "Statistik unggulan"). Pure helpers shared by the
 * public indicators store, the landing page, the highlights store and the Cerita editor panel.
 */

/** A topic's landing card shows at most this many statistics. */
export const MAX_STAT_HIGHLIGHTS = 4;

/** The two slugs of the waste topic: the landing card and the stat page read both. */
const WASTE_TOPIC_SLUGS = ['persampahan', 'persampahan-dan-bank-sampah-unit'] as const;

/**
 * The page slugs whose indicators belong to a topic, the topic's own slug first. Only the waste
 * topic has an alias; every other slug stands for itself.
 */
export function statPageSlugs(pageSlug: string): string[] {
  const target = pageSlug.toLowerCase();
  if ((WASTE_TOPIC_SLUGS as readonly string[]).includes(target)) {
    return [target, ...WASTE_TOPIC_SLUGS.filter((slug) => slug !== target)];
  }
  return [target];
}

/**
 * Concatenates id lists in order, drops repeats and keeps at most `MAX_STAT_HIGHLIGHTS`. Used for
 * the waste topic, whose two slugs are merged into one card.
 */
export function mergeHighlightIds(lists: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }
  }
  return merged.slice(0, MAX_STAT_HIGHLIGHTS);
}

/** Moves `id` to `toIndex` (0-based, after removing it), the way a drop does. Null when nothing moves. */
export function moveHighlight(
  ids: readonly string[],
  id: string,
  toIndex: number,
): string[] | null {
  const from = ids.indexOf(id);
  if (from < 0 || toIndex < 0 || toIndex >= ids.length || toIndex === from) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(toIndex, 0, id);
  return next;
}

/** True when both lists hold the same ids in the same order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
