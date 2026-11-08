import * as scrollLockModule from '../../utils/bodyScrollLock';
import { vi } from 'vitest';

const trackedReleases: Array<() => void> = [];
let trackerInstalled = false;

/**
 * Installs a spy on `acquireBodyScrollLock` that records every returned release handle so
 * test cleanup can release any locks leaked by aborted or failed tests without relying on
 * production module internals.
 */
export function installScrollLockTracker(): void {
  if (trackerInstalled) return;
  trackerInstalled = true;
  const original = scrollLockModule.acquireBodyScrollLock;
  vi.spyOn(scrollLockModule, 'acquireBodyScrollLock').mockImplementation(() => {
    const release = original();
    trackedReleases.push(release);
    return release;
  });
}

/**
 * Releases all unreleased scroll locks tracked during test execution and restores body overflow.
 */
export function cleanupBodyScrollLocks(): void {
  while (trackedReleases.length > 0) {
    const release = trackedReleases.pop();
    release?.();
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
  }
}
