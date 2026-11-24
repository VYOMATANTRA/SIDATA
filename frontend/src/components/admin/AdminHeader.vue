<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { Bars3Icon } from '@heroicons/vue/24/outline';
import { ADMIN_HEADER_TITLE_ID, useAdminHeader } from '../../composables/useAdminHeader';
import AdminBreadcrumb from './AdminBreadcrumb.vue';
import { useIsDesktop } from '../../composables/useIsDesktop';

const props = withDefaults(defineProps<{ mobileOpen?: boolean }>(), {
  mobileOpen: false,
});
defineEmits<{ (e: 'openMenu'): void }>();

const route = useRoute();
const { title, subtitle, trail, compact } = useAdminHeader();
const { isDesktop } = useIsDesktop();

// Owns the toggle button (not AdminSidebar.vue) so focus can return here when the drawer closes
// on the same page — via its close button, Escape, backdrop click, or tapping the link for the
// page the user is already viewing (WCAG 2.1 §2.4.3 Focus Order). Compares `route.path` (matching
// AdminLayout.vue's `watch(() => route.path)`) so the two components are complementary: whenever
// `route.path` changes, AdminLayout moves focus to <main>; whenever `route.path` is unchanged
// (even if a query string or hash was cleared), focus returns here so it is never stranded.
const menuToggleRef = ref<HTMLButtonElement | null>(null);
let openedPath = route.path;

watch(
  () => props.mobileOpen,
  (open, wasOpen) => {
    if (open) {
      openedPath = route.path;
      return;
    }
    if (wasOpen && route.path === openedPath) {
      void nextTick(() => menuToggleRef.value?.focus());
    }
  },
);
</script>

<template>
  <header
    class="flex flex-wrap items-start gap-x-3 gap-y-3 border-b border-slate-200 bg-slate-50 px-6 md:px-10"
    :class="compact ? 'py-4' : 'py-8'"
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

    <div class="min-w-0 flex-1 basis-64">
      <AdminBreadcrumb v-if="trail" :trail="trail" class="mb-2" />
      <h1
        :id="ADMIN_HEADER_TITLE_ID"
        tabindex="-1"
        class="tracking-tight text-slate-900 focus:outline-none"
        :class="compact ? 'text-2xl font-bold' : 'text-2xl font-extrabold md:text-3xl'"
        data-test="admin-header-title"
      >
        {{ title }}
      </h1>
      <p v-if="subtitle" class="mt-1.5 text-sm text-slate-600">{{ subtitle }}</p>
    </div>

    <!-- Actions a routed view teleports here (`<Teleport defer to="#admin-header-actions">`). -->
    <div
      id="admin-header-actions"
      class="flex flex-wrap items-center justify-end gap-2 self-center"
      data-test="admin-header-actions"
    ></div>
  </header>
</template>
