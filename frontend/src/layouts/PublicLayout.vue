<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppNavbar from '../components/common/AppNavbar.vue';
import AppFooter from '../components/common/AppFooter.vue';
import PublicNavigationMenu from '../components/common/PublicNavigationMenu.vue';
import { useSettingsStore } from '../stores/settings.store';
import { usePagesStore } from '../stores/pages.store';
import { useIsDesktop } from '../composables/useIsDesktop';
import { usePublicHeaderState } from '../composables/usePublicHeaderState';
import { publicShellKey } from './publicShell';

/**
 * Base layout of every public page (SPEC §8): skip link, header with the navigation menu, the
 * single `<main id="main-content">` landmark and the footer. The routed view supplies only page
 * content; it must not add its own `<main>`, skip link, navbar or footer.
 *
 * A route sets `meta.headerOverlay` when its hero sits under the header (Home): the header is then
 * transparent at the top of the page and navy once scrolled or while the menu is open (see
 * `usePublicHeaderState`). Every other route gets the navy header.
 */
provide(publicShellKey, true);

const route = useRoute();
const settingsStore = useSettingsStore();
const pagesStore = usePagesStore();

const isOverlay = computed(() => route?.meta?.headerOverlay === true);
const isMenuOpen = ref(false);
const { background } = usePublicHeaderState({ overlay: isOverlay, menuOpen: isMenuOpen });

// While the menu is a modal sheet (mobile), the rest of the page is inert so assistive technology
// and the keyboard stay inside it.
const { isDesktop } = useIsDesktop();
const inertWhenMenuModal = computed(() =>
  isMenuOpen.value && !isDesktop.value ? true : undefined,
);

function handleToggleMenu(open: boolean) {
  isMenuOpen.value = open;
  // Retry the Cerita topics if the first load failed; the menu shows the fallback links meanwhile.
  if (open && !pagesStore.isLoaded && !pagesStore.isHierarchyLoading) {
    void pagesStore.fetchHierarchy();
  }
}

onMounted(() => {
  // Branding and footer contact details come from the same public settings on every route.
  void settingsStore.fetchPublicSettings().catch(() => {});
  void pagesStore.fetchHierarchy();
});
</script>

<template>
  <div
    class="public-shell bg-surface text-brand-navy selection:bg-surface-hover selection:text-brand-navy flex min-h-screen flex-col font-sans"
  >
    <!-- Skip to Content Link per docs/ACCESSIBILITY.md §3 (2.4.1) -->
    <a
      href="#main-content"
      class="focus:rounded-btn focus:bg-brand-navy sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:text-base focus:font-semibold focus:text-white focus:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      :inert="inertWhenMenuModal"
    >
      Lewati ke konten utama
    </a>

    <AppNavbar
      :variant="background"
      :overlay="isOverlay"
      :sticky="true"
      :title="settingsStore.institutionName"
      :subtitle="settingsStore.appName"
      @toggle-menu="handleToggleMenu"
    >
      <template #menu="{ close, open }">
        <PublicNavigationMenu :open="open" @navigate="close" />
      </template>
    </AppNavbar>

    <main
      id="main-content"
      tabindex="-1"
      class="flex-grow focus:outline-none"
      :inert="inertWhenMenuModal"
    >
      <slot />
    </main>

    <AppFooter :inert="inertWhenMenuModal" />
  </div>
</template>

<style>
/* In-page anchors (skip link, hero, chapters) must clear the sticky header. */
.public-shell :where([id]) {
  scroll-margin-top: calc(var(--public-header-height) + 1rem);
}
</style>
