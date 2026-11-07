import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import { useRoute } from 'vue-router';

/** Scroll distance (px) past which the overlaying header stops being transparent. */
export const HEADER_SCROLL_THRESHOLD_PX = 64;

export type PublicHeaderBackground = 'transparent' | 'navy';

export interface UsePublicHeaderStateOptions {
  /** True on routes whose header overlays a hero (Home); interior pages are always navy. */
  overlay: Ref<boolean> | ComputedRef<boolean>;
  /** True while the navigation menu is open: the header is navy so the open panel reads as one. */
  menuOpen: Ref<boolean>;
}

/**
 * Background state of the public header.
 *
 * - overlay route, at the top, menu closed: `transparent` (foreground stays white)
 * - overlay route scrolled past `HEADER_SCROLL_THRESHOLD_PX`, or menu open: `navy`
 * - any other route: `navy`
 *
 * Background and foreground are separate concerns: only the background changes here, the
 * foreground is white in every state. The scroll position is re-read on mount (a refresh restores
 * a scrolled position), on `scroll` / `resize` / `pageshow` (bfcache back/forward) and after each
 * route change. The listener is passive and writes reactive state only when the threshold is
 * crossed.
 */
export function usePublicHeaderState({ overlay, menuOpen }: UsePublicHeaderStateOptions) {
  const route = useRoute();
  const isScrolled = ref(false);

  function readScrolled(): boolean {
    return typeof window !== 'undefined' && window.scrollY > HEADER_SCROLL_THRESHOLD_PX;
  }

  function sync() {
    const next = readScrolled();
    if (next !== isScrolled.value) {
      isScrolled.value = next;
    }
  }

  onMounted(() => {
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    window.addEventListener('pageshow', sync);
  });

  onUnmounted(() => {
    window.removeEventListener('scroll', sync);
    window.removeEventListener('resize', sync);
    window.removeEventListener('pageshow', sync);
  });

  // A route change can move the scroll position (or swap the page under it) without a scroll event
  // on this tick, so re-read once the new view has rendered.
  watch(
    () => route?.fullPath,
    () => {
      void nextTick(sync);
    },
  );

  const background = computed<PublicHeaderBackground>(() =>
    overlay.value && !isScrolled.value && !menuOpen.value ? 'transparent' : 'navy',
  );

  return { isScrolled, background };
}
