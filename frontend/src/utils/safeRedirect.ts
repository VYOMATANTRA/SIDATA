/**
 * Returns `value` when it is a safe in-app path to send the user to after login, else undefined.
 * Accepts only a string that starts with a single "/" (so not "//host"), has no backslash
 * (browsers treat "\\" like "/"), no control characters, no scheme and is not an auth route.
 */
const AUTH_ROUTE_PREFIXES = ['/login', '/register', '/setup-password', '/auth/callback'];

/** True for the auth screens themselves: redirecting back to one would loop. */
function isAuthRoute(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0]!.toLowerCase();
  return AUTH_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

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
  if (isAuthRoute(value)) return undefined;
  return value;
}
