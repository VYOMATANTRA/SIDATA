<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { Bars3Icon } from '@heroicons/vue/24/outline';
import { useAdminHeader } from '../../composables/useAdminHeader';

const props = withDefaults(defineProps<{ mobileOpen?: boolean; restoreFocusOnClose?: boolean }>(), {
  mobileOpen: false,
  restoreFocusOnClose: true,
});
defineEmits<{ (e: 'openMenu'): void }>();

const route = useRoute();
const { title, subtitle } = useAdminHeader();

// Only render the mobile drawer toggle below the md breakpoint (768px) so assistive tech on
// desktop never encounters a button announcing aria-expanded="false" for a sidebar that is
// permanently visible on desktop.
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

function readIsDesktop(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

const isDesktop = ref(readIsDesktop());
let desktopMediaQueryList: MediaQueryList | null = null;

function handleDesktopMediaChange(event: MediaQueryListEvent) {
  isDesktop.value = event.matches;
}

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    desktopMediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
    isDesktop.value = desktopMediaQueryList.matches;
    desktopMediaQueryList.addEventListener?.('change', handleDesktopMediaChange);
  }
});

onUnmounted(() => {
  desktopMediaQueryList?.removeEventListener?.('change', handleDesktopMediaChange);
});

// Owns the toggle button (not AdminSidebar.vue) so focus can return here when the drawer is
// dismissed via its close button, Escape, or the backdrop click (WCAG 2.1 §2.4.3 Focus Order).
// Skips restoring focus when the drawer closed because the user navigated to another route —
// pulling focus back to the header menu button after tapping a link forces keyboard and
// screen-reader users to tab past the header again to reach the new page's content.
const menuToggleRef = ref<HTMLButtonElement | null>(null);
let openedFullPath = route.fullPath;

watch(
  () => props.mobileOpen,
  (open, wasOpen) => {
    if (open) {
      openedFullPath = route.fullPath;
      return;
    }
    if (wasOpen && props.restoreFocusOnClose && route.fullPath === openedFullPath) {
      void nextTick(() => menuToggleRef.value?.focus());
    }
  },
);
</script>

<template>
  <header
    class="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-6 py-8 md:px-10"
    data-test="admin-header"
  >
    <button
      v-if="!isDesktop"
      ref="menuToggleRef"
      type="button"
      class="focus-visible:ring-brand-indigo rounded-btn mt-0.5 inline-flex shrink-0 items-center justify-center border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none md:hidden"
      :aria-expanded="mobileOpen"
      aria-controls="admin-sidebar"
      aria-label="Menu navigasi"
      data-test="admin-mobile-menu-toggle"
      @click="$emit('openMenu')"
    >
      <Bars3Icon class="h-5 w-5" aria-hidden="true" />
    </button>

    <div class="min-w-0">
      <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
        {{ title }}
      </h1>
      <p v-if="subtitle" class="mt-1.5 text-sm text-slate-600">{{ subtitle }}</p>
    </div>
  </header>
</template>
