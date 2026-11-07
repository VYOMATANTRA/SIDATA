import { onMounted, onUnmounted, watch, nextTick, type Ref } from 'vue';

export interface UseDrawerFocusTrapOptions {
  isOpen: Ref<boolean>;
  containerRef: Ref<HTMLElement | null>;
  initialFocusRef?: Ref<HTMLElement | null>;
  onEscape: () => void;
}

function isElementVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert]')) {
    return false;
  }

  // Real browsers support `checkVisibility`; JSDOM does not implement it (nor layout geometry such
  // as `getClientRects()`), so fall back to computed `display` / `visibility` in test environments.
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkVisibilityCSS: true });
  }

  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function isEventFromOpenDialog(event: KeyboardEvent): boolean {
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
    return Array.from(candidates).filter(isElementVisible);
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
