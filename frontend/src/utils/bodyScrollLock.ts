/**
 * Reference-counted `document.body` scroll lock shared by every overlay (modal dialogs, the mobile
 * navigation drawer).
 *
 * The first holder remembers the original inline `overflow` and sets `hidden`; the last holder to
 * release restores it. Each handle releases at most once, so an overlay can only ever drop its own
 * lock: closing the drawer while a dialog is still open keeps the page locked, and the reverse.
 */
let holders = 0;
let previousOverflow = '';

export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (holders === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}

/**
 * TEST ONLY. Drops every outstanding lock and restores `document.body.style.overflow`, so a test
 * that fails before releasing its lock cannot leak the module-level holder count into later tests.
 * Never call this from application code.
 */
export function resetBodyScrollLockForTests(): void {
  holders = 0;
  if (typeof document !== 'undefined') document.body.style.overflow = previousOverflow;
  previousOverflow = '';
}
