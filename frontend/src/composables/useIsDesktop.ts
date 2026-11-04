import { ref, onMounted, onUnmounted, type Ref } from 'vue';

export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

function readIsDesktop(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

/**
 * Reactive boolean tracking whether the viewport is at or above the `md` desktop breakpoint
 * (`768px`). Shared by `AdminLayout` and `AdminHeader` so the header menu toggle and the layout's
 * mobile drawer state always agree on whether the sidebar is in desktop-rail or mobile-drawer mode.
 */
export function useIsDesktop(onChange?: (matches: boolean) => void): { isDesktop: Ref<boolean> } {
  const isDesktop = ref(readIsDesktop());
  let mediaQueryList: MediaQueryList | null = null;

  function handleMediaChange(event: MediaQueryListEvent) {
    isDesktop.value = event.matches;
    onChange?.(event.matches);
  }

  onMounted(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
      isDesktop.value = mediaQueryList.matches;
      if (mediaQueryList.matches) {
        onChange?.(true);
      }
      mediaQueryList.addEventListener?.('change', handleMediaChange);
    }
  });

  onUnmounted(() => {
    mediaQueryList?.removeEventListener?.('change', handleMediaChange);
  });

  return { isDesktop };
}
