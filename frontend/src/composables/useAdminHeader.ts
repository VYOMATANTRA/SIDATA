import { ref } from 'vue';

/**
 * Module-level (not per-component) state: `AdminHeader.vue` lives in `AdminLayout.vue`, one level
 * above the routed view. Static titles and subtitles live in route `meta` (`router/index.ts`) as
 * the single source of truth and are seeded by `AdminLayout.vue` on navigation; a view only calls
 * `setAdminHeader` directly when its subtitle needs to be overridden dynamically at runtime.
 */
const title = ref('');
const subtitle = ref('');

export function useAdminHeader() {
  return { title, subtitle };
}

export function setAdminHeader(newTitle: string, newSubtitle = '') {
  title.value = newTitle;
  subtitle.value = newSubtitle;
}
