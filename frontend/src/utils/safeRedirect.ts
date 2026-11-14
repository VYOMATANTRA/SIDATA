/**
 * Returns `value` when it is a safe in-app path to send the user to after login, else undefined.
 * Accepts only a string that starts with a single "/" (so not "//host"), has no backslash
 * (browsers treat "\\" like "/"), no control characters and no scheme.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  if (value.includes('\\')) return undefined;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return undefined;
  }
  // "/\\t/evil.com" style tricks are covered by the control-character check; a scheme can only
  // appear before the first "/", which a leading "/" already rules out.
  return value;
}
