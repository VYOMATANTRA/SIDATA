import { describe, it, expect, beforeEach } from 'vitest';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';

describe('acquireBodyScrollLock', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('locks the body and restores the original inline overflow on release', () => {
    document.body.style.overflow = 'scroll';
    const release = acquireBodyScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
    release();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps the page locked until the last holder releases (never drops another overlay lock)', () => {
    const releaseDrawer = acquireBodyScrollLock();
    const releaseDialog = acquireBodyScrollLock();

    releaseDrawer();
    expect(document.body.style.overflow).toBe('hidden');

    releaseDialog();
    expect(document.body.style.overflow).toBe('');
  });

  it('releases at most once per handle', () => {
    const releaseA = acquireBodyScrollLock();
    const releaseB = acquireBodyScrollLock();

    releaseA();
    releaseA();
    expect(document.body.style.overflow).toBe('hidden');

    releaseB();
    expect(document.body.style.overflow).toBe('');
  });
});
