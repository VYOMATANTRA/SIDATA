<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import AdminSidebar from '../components/admin/AdminSidebar.vue';
import AdminHeader from '../components/admin/AdminHeader.vue';
import AlertBanner from '../components/common/AlertBanner.vue';
import BaseLink from '../components/common/BaseLink.vue';
import { useAuthStore } from '../stores/auth';
import AdminBreadcrumb from '../components/admin/AdminBreadcrumb.vue';
import { setAdminHeader } from '../composables/useAdminHeader';
import { useIsDesktop } from '../composables/useIsDesktop';

const route = useRoute();
const authStore = useAuthStore();

const loginLocation = computed(() => ({
  path: '/login',
  query: { redirect: route.fullPath },
}));

const isMobileSidebarOpen = ref(false);
const mainRef = ref<HTMLElement | null>(null);
// The admin shell is `h-dvh` and scrolls this inner container, so the router's window-level
// scroll reset is a no-op here; the path-change watcher below resets it instead.
const contentShellRef = ref<HTMLElement | null>(null);

function openMobileSidebar() {
  isMobileSidebarOpen.value = true;
}

function closeMobileSidebar() {
  isMobileSidebarOpen.value = false;
}

// Close the mobile drawer automatically if the viewport widens to the desktop breakpoint (768px)
// while the drawer is open, so the content shell is never left with `inert` and an active focus
// trap after the sidebar switches to the permanent desktop rail.
useIsDesktop((matchesDesktop) => {
  if (matchesDesktop && isMobileSidebarOpen.value) {
    closeMobileSidebar();
  }
});

// Seeds the header from route meta on every navigation so there is never a stale title/subtitle;
// a routed view can still override with a dynamic subtitle in its own onMounted (runs after this).
// Also closes the mobile sidebar drawer so a tapped link doesn't leave it open over the new page,
// resets the inner content scroller to the top, and moves focus to <main> on subsequent path
// changes unless the new view has already placed focus inside <main>. Watches route.path (not fullPath) so a view that syncs filters/search to
// the query string or hash doesn't retrigger this and wipe out a dynamic subtitle.
watch(
  () => route.path,
  (newPath, oldPath) => {
    const title = typeof route.meta.title === 'string' ? route.meta.title : '';
    const subtitle = typeof route.meta.subtitle === 'string' ? route.meta.subtitle : '';
    setAdminHeader(title, subtitle);
    closeMobileSidebar();
    if (oldPath !== undefined && newPath !== oldPath) {
      if (contentShellRef.value) contentShellRef.value.scrollTop = 0;
      void nextTick(() => {
        // Reset again once the new view has rendered, then focus without letting the browser
        // scroll the inner scroller to reveal <main> (a plain focus() scrolled it past the h1).
        if (contentShellRef.value) contentShellRef.value.scrollTop = 0;
        const active = document.activeElement as HTMLElement | null;
        if (!active || !mainRef.value?.contains(active)) {
          mainRef.value?.focus({ preventScroll: true });
        }
      });
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-dvh bg-slate-50">
    <a
      href="#admin-main-content"
      class="focus:ring-brand-indigo focus:rounded-btn sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:ring-2 focus:outline-none"
    >
      Lewati ke konten utama
    </a>

    <!-- Backdrop behind the mobile sidebar drawer; clicking it closes the drawer. -->
    <div
      v-if="isMobileSidebarOpen"
      class="fixed inset-0 z-30 bg-slate-900/50 md:hidden"
      data-test="admin-sidebar-backdrop"
      @click="closeMobileSidebar"
    ></div>

    <AdminSidebar :mobile-open="isMobileSidebarOpen" @close="closeMobileSidebar" />

    <div
      ref="contentShellRef"
      class="flex min-w-0 flex-1 flex-col overflow-y-auto"
      :inert="isMobileSidebarOpen ? true : undefined"
      data-test="admin-content-shell"
    >
      <AdminHeader :mobile-open="isMobileSidebarOpen" @open-menu="openMobileSidebar" />

      <main
        id="admin-main-content"
        ref="mainRef"
        class="flex-1 px-6 py-6 focus:outline-none md:px-10 md:py-8"
        tabindex="-1"
      >
        <AlertBanner
          v-if="authStore.sessionEnded"
          class="mb-4"
          tone="warning"
          live="polite"
          message="Sesi Anda telah berakhir. Masuk kembali untuk melanjutkan; isian yang belum disimpan tetap ada di halaman ini."
          data-test="session-ended-banner"
        >
          <template #action>
            <BaseLink
              :to="loginLocation"
              label="Masuk kembali"
              size="md"
              :with-arrow="false"
              data-test="session-ended-login"
            />
          </template>
        </AlertBanner>
        <div class="rounded-card border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <AdminBreadcrumb class="mb-6" />
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
