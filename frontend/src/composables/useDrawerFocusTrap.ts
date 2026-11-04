import { onMounted, onUnmounted, watch, nextTick, type Ref } from 'vue';

export interface UseDrawerFocusTrapOptions {
  isOpen: Ref<boolean>;
  containerRef: Ref<HTMLElement | null>;
  initialFocusRef?: Ref<HTMLElement | null>;
  onEscape: () => void;
}

function isElementVisible(el: HTMLElement, container: HTMLElement | null): boolean {
  if (
    el.closest(
      '[hidden], [inert], .hidden, .invisible, [style*="display: none"], [style*="visibility: hidden"]',
    )
  ) {
    return false;
  }

  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }

  const isDesktopViewport =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 768px)').matches;
  if (isDesktopViewport && el.closest('.md\\:hidden')) {
    return false;
  }

  // In a real browser (or a test that stubs layout metrics), getClientRects() / offsetParent
  // catches any CSS-driven display:none (including responsive classes). JSDOM returns 0 rects
  // and null offsetParent for every element, so only enforce the geometry check when the
  // container itself reports layout metrics or the element overrides getClientRects/offsetParent.
  const containerHasLayout =
    (container?.getClientRects().length ?? 0) > 0 || (container?.offsetParent ?? null) !== null;
  const elementHasOwnLayoutStub =
    Object.prototype.hasOwnProperty.call(el, 'getClientRects') ||
    Object.prototype.hasOwnProperty.call(el, 'offsetParent');

  if (containerHasLayout || elementHasOwnLayoutStub) {
    return el.getClientRects().length > 0 || el.offsetParent !== null;
  }

  return true;
}

function isEventFromOpenDialog(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  const target =
    (event.target instanceof HTMLElement ? event.target : null) ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (target?.closest('[role="dialog"], [role="alertdialog"], dialog')) {
    return true;
  }
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'));
}

/**
 * Traps Tab/Shift+Tab focus inside a mobile drawer while open, moves focus to `initialFocusRef`
 * on open, and closes on Escape unless focus is inside an open modal dialog.
 */
export function useDrawerFocusTrap({
  isOpen,
  containerRef,
  initialFocusRef,
  onEscape,
}: UseDrawerFocusTrapOptions) {
  function getFocusableElements(): HTMLElement[] {
    const container = containerRef.value;
    if (!container) return [];
    const candidates = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    return Array.from(candidates).filter((el) => isElementVisible(el, container));
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen.value) return;

    if (event.key === 'Escape') {
      if (isEventFromOpenDialog(event)) return;
      onEscape();
      return;
    }

    if (event.key === 'Tab') {
      const focusables = getFocusableElements();
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !containerRef.value?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !containerRef.value?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  if (initialFocusRef) {
    watch(isOpen, (open) => {
      if (open) {
        void nextTick(() => initialFocusRef.value?.focus());
      }
    });
  }

  return { getFocusableElements };
}
