/**
 * Slug helpers for the CMS create flow. The backend accepts kebab-case `[a-z0-9]+(-[a-z0-9]+)*`
 * up to 100 characters (`SLUG_REGEX` in indicators.service.ts, `TABLE_SLUG_REGEX` in
 * indicatorTables.service.ts) and rejects a duplicate with 409. The operator never types a slug:
 * it is derived from the label and, on a clash with a slug already loaded, given a numeric suffix.
 */

/** Room kept free for a `-NN` collision suffix under the backend's 100-character limit. */
const BASE_MAX_LENGTH = 90;

/**
 * Turns a human label into a kebab-case slug. Diacritics are folded to ASCII ("Kependudukan
 * Ñ" → "kependudukan-n"); anything that is not a-z or 0-9 becomes a single hyphen. A label with
 * no usable characters (for example only symbols) falls back to `fallback`.
 */
export function slugifyLabel(label: string, fallback: string): string {
  const folded = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
  return folded === '' ? fallback : folded;
}

/**
 * Returns `base` when it is free, otherwise `base-2`, `base-3`, … (the first free suffix).
 * `taken` is the set of slugs already in use in the same collection.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
