/**
 * Recursively normalizes an arbitrary value into a canonical JSON representation
 * where object keys are sorted lexicographically and Dates are represented as ISO strings.
 */
export function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const res: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    res[key] = canonicalizeJson((obj as Record<string, unknown>)[key]);
  }
  return res;
}

/**
 * Returns a stable JSON stringification of any value, insensitive to object key ordering.
 */
export function stableJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  return JSON.stringify(canonicalizeJson(obj));
}

/**
 * Evaluates semantic inequality for audit log diffs and mutation short-circuiting.
 * Uses canonicalized JSON stringification to apply uniform comparison semantics across both
 * scalar fields (string, number, boolean, null) and nested JSON structures without false-positive
 * diffs caused by object key reordering or object reference inequality.
 */
export function hasFieldChanged(before: unknown, after: unknown): boolean {
  return stableJsonStringify(before) !== stableJsonStringify(after);
}
