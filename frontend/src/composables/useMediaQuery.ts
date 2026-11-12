import { onMounted, onUnmounted, ref, type Ref } from 'vue';

function read(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/**
 * Reactive `matchMedia` result. Reports `false` where media queries are unavailable (tests,
 * very old browsers), so callers fall back to their narrow layout. `useIsDesktop` stays the
 * dedicated helper for the shared `md` breakpoint; this one is for a screen's own breakpoint.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(read(query));
  let list: MediaQueryList | null = null;

  function onChange(event: MediaQueryListEvent): void {
    matches.value = event.matches;
  }

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    list = window.matchMedia(query);
    matches.value = list.matches;
    list.addEventListener?.('change', onChange);
  });

  onUnmounted(() => {
    list?.removeEventListener?.('change', onChange);
  });

  return matches;
}
