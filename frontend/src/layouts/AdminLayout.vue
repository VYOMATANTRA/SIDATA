<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AdminSidebar from '../components/admin/AdminSidebar.vue';
import AdminHeader from '../components/admin/AdminHeader.vue';
import AdminBreadcrumb from '../components/admin/AdminBreadcrumb.vue';
import { setAdminHeader } from '../composables/useAdminHeader';

const route = useRoute();

const isMobileSidebarOpen = ref(false);
const restoreFocusOnClose = ref(true);

function openMobileSidebar() {
  restoreFocusOnClose.value = true;
  isMobileSidebarOpen.value = true;
}

function closeMobileSidebar(reason: 'dismiss' | 'navigate' = 'dismiss') {
  restoreFocusOnClose.value = reason === 'dismiss';
  isMobileSidebarOpen.value = false;
}

// Seeds the header from route meta on every navigation so there is never a stale title; the
// routed view can still override with a dynamic subtitle in its own onMounted (runs after this).
// Also closes the mobile sidebar drawer so a tapped link doesn't leave it open over the new page.
// Watches route.path (not fullPath) so a view that syncs filters/search to the query string or
// hash doesn't retrigger this and wipe out the subtitle the view already set.
watch(
  () => route.path,
  () => {
    const title = typeof route.meta.title === 'string' ? route.meta.title : '';
    setAdminHeader(title, '');
    closeMobileSidebar('navigate');
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
      @click="closeMobileSidebar('dismiss')"
    ></div>

    <AdminSidebar :mobile-open="isMobileSidebarOpen" @close="closeMobileSidebar" />

    <div
      class="flex min-w-0 flex-1 flex-col overflow-y-auto"
      :inert="isMobileSidebarOpen ? true : undefined"
      data-test="admin-content-shell"
    >
      <AdminHeader
        :mobile-open="isMobileSidebarOpen"
        :restore-focus-on-close="restoreFocusOnClose"
        @open-menu="openMobileSidebar"
      />

      <main id="admin-main-content" class="flex-1 px-6 py-6 md:px-10 md:py-8" tabindex="-1">
        <div class="rounded-card border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <AdminBreadcrumb class="mb-6" />
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
