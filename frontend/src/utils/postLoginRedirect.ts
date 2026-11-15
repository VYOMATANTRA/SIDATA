import { safeRedirect } from './safeRedirect';

/**
 * Carries the post-login destination across the Google OAuth round trip. The page leaves for
 * Google and comes back to `/auth/callback`, so the query string is lost; sessionStorage (same
 * tab) keeps it. Storage can be blocked (private mode, policy), so every access is guarded: the
 * worst case is that the user lands on the default page.
 */
const STORAGE_KEY = 'sidata_post_login_redirect';

/** Saves the destination when it is safe, otherwise clears any earlier one. */
export function stashPostLoginRedirect(value: unknown): void {
  const safe = safeRedirect(value);
  try {
    if (safe) {
      sessionStorage.setItem(STORAGE_KEY, safe);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: the default destination is used instead.
  }
}

/** Reads and clears the saved destination. Returns it only when it still passes `safeRedirect`. */
export function takePostLoginRedirect(): string | undefined {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return undefined;
  }
  return safeRedirect(stored);
}
