/**
 * Returns the value (normalised) when it is a safe in-app path to send the user to after login,
 * else undefined. Accepts only a string that starts with a single "/" (so not "//host"), has no
 * backslash, no control characters (C0, DEL or C1), no scheme, and does not resolve to an auth
 * route. The path is decoded and its dot segments resolved before the auth-route check, so
 * `/admin/../login`, `/%6cogin` or `/admin/..%2flogin` cannot slip past it.
 */
const AUTH_ROUTE_PREFIXES = ['/login', '/register', '/setup-password', '/auth/callback'];

/** Any origin works: the value is only used for parsing, and the origin is checked to match. */
const PARSE_BASE = 'http://localhost';

/** True for the auth screens themselves: redirecting back to one would loop. */
function isAuthPath(path: string): boolean {
  const lower = path.toLowerCase();
  return AUTH_ROUTE_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`));
}

/** C0 controls, DEL and the C1 range (0x80-0x9f). */
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  if (value.includes('\\') || hasControlCharacter(value)) return undefined;

  let url: URL;
  try {
    url = new URL(value, PARSE_BASE);
  } catch {
    return undefined;
  }
  if (url.origin !== PARSE_BASE) return undefined;

  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  // An encoded delimiter or control character would change how the router reads the path.
  if (/[?#\\]/.test(decoded) || hasControlCharacter(decoded) || decoded.startsWith('//')) {
    return undefined;
  }
  // Resolve dot segments that only appear after decoding ("/a/..%2flogin" means "/login").
  const resolved = new URL(decoded, PARSE_BASE).pathname;
  if (isAuthPath(resolved)) return undefined;

  return `${url.pathname}${url.search}${url.hash}`;
}
