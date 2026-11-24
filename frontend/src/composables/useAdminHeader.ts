import { ref, type Ref } from 'vue';
import type { BreadcrumbSegment } from '../components/admin/AdminBreadcrumb.vue';

/** Optional extras a view can pass with its header. Anything left out is reset to its default. */
export interface AdminHeaderOptions {
  /**
   * Breadcrumb override shown above the title (for example "Cerita / Kependudukan"). When set, the
   * header renders it instead of the route's `meta.breadcrumb`, and AdminLayout does not render the
   * second breadcrumb on full-bleed routes.
   */
  trail?: BreadcrumbSegment[];
  /** Smaller padding and title, for a dense editor header. */
  compact?: boolean;
}

/**
 * Module-level (not per-component) state: `AdminHeader.vue` lives in `AdminLayout.vue`, one level
 * above the routed view. Static titles and subtitles live in route `meta` (`router/index.ts`) as
 * the single source of truth and are seeded by `AdminLayout.vue` on navigation; a view only calls
 * `setAdminHeader` directly when its subtitle needs to be overridden dynamically at runtime.
 *
 * Every call replaces the whole header state: `trail` and `compact` fall back to "not set" unless
 * the caller passes them, so an editor's breadcrumb cannot leak into the next page.
 */
const title = ref('');
const subtitle = ref('');
const trail = ref<BreadcrumbSegment[] | null>(null);
const compact = ref(false);

/** The shell header's h1. A view moves focus here after it opens a page (the title is its heading). */
export const ADMIN_HEADER_TITLE_ID = 'admin-header-title';

export function useAdminHeader(): {
  title: Ref<string>;
  subtitle: Ref<string>;
  trail: Ref<BreadcrumbSegment[] | null>;
  compact: Ref<boolean>;
} {
  return { title, subtitle, trail, compact };
}

export function setAdminHeader(
  newTitle: string,
  newSubtitle = '',
  options: AdminHeaderOptions = {},
) {
  title.value = newTitle;
  subtitle.value = newSubtitle;
  trail.value = options.trail ?? null;
  compact.value = options.compact ?? false;
}
