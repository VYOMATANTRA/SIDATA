import { onMounted, onUnmounted, watch, nextTick, type Ref } from 'vue';

export interface UseDrawerFocusTrapOptions {
  isOpen: Ref<boolean>;
  containerRef: Ref<HTMLElement | null>;
  initialFocusRef?: Ref<HTMLElement | null>;
  onEscape: () => void;
  /**
   * Dialog semantics the drawer carries itself (`containerRef` usually has `role="dialog"` while
   * modal). The Escape guard must not mistake it for "an unrelated dialog is open".
   */
  ignoreDialogRef?: Ref<HTMLElement | null>;
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

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog';
const OPEN_MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], dialog[open]';

/**
 * Whether an Escape press belongs to some other dialog rather than to the caller's own overlay.
 *
 * Deliberately broader than "the event originated in a dialog": while ANY modal dialog is open
 * anywhere in the document it is the topmost layer, so Escape dismisses that dialog and must not
 * also close the drawer underneath (focus may legitimately sit on the body or the drawer while a
 * dialog is open). The caller's own dialog panel (`ignore`) is excluded from both checks, so
 * Escape inside the drawer still closes it.
 */
export function isEventFromOpenDialog(event: KeyboardEvent, ignore?: HTMLElement | null): boolean {
  if (event.defaultPrevented) return true;
  const isOwn = (el: Element | null) =>
    Boolean(el && ignore && (el === ignore || ignore.contains(el)));
  const target =
    (event.target instanceof HTMLElement ? event.target : null) ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const enclosing = target?.closest(DIALOG_SELECTOR) ?? null;
  if (enclosing && !isOwn(enclosing)) {
    return true;
  }
  return Array.from(document.querySelectorAll(OPEN_MODAL_SELECTOR)).some((el) => !isOwn(el));
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
  ignoreDialogRef,
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
      if (isEventFromOpenDialog(event, ignoreDialogRef?.value ?? containerRef.value)) return;
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
