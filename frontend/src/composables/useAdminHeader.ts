import { ref } from 'vue';

/**
 * Module-level (not per-component) state: the header lives in AdminLayout.vue, one level above
 * the routed view that owns the title/subtitle text, so the two need a shared channel rather than
 * props/emit. A view calls `setAdminHeader` in `onMounted`; AdminHeader.vue reads these refs.
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
