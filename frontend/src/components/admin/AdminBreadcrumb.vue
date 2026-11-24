<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';

export type BreadcrumbSegment = string | { label: string; to?: string };

declare module 'vue-router' {
  interface RouteMeta {
    breadcrumb?: BreadcrumbSegment[];
    title?: string;
    subtitle?: string;
    navActiveFor?: string;
    requiresAuth?: boolean;
    requiresAdmin?: boolean;
    requiresEditor?: boolean;
  }
}

interface NormalizedSegment {
  label: string;
  to?: string;
}

/**
 * `trail` replaces the route's `meta.breadcrumb` when the header shows the editor's own trail
 * (`setAdminHeader(..., { trail })`). An override has no "Beranda" link: it starts at its first
 * segment, as the design's "Cerita / Kependudukan" does.
 */
const props = defineProps<{ trail?: BreadcrumbSegment[] | null }>();

const route = useRoute();
const override = computed(() => Array.isArray(props.trail) && props.trail.length > 0);

/**
 * Each admin route declares `meta.breadcrumb: BreadcrumbSegment[]` for the trail segments after
 * "Beranda" (SPEC: "breadcrumb as <nav aria-label="Breadcrumb"> ... Beranda > section > page").
 * Segments may carry an optional `to` path so parent levels (e.g. "Akun pengguna" on the audit
 * retention page) render as clickable links. Falls back to the route title alone so a route that
 * forgets to set it still renders something sane.
 */
const trail = computed<NormalizedSegment[]>(() => {
  const configured = override.value ? props.trail : route.meta.breadcrumb;
  if (Array.isArray(configured)) {
    return configured.map((segment) =>
      typeof segment === 'string' ? { label: segment } : segment,
    );
  }
  return typeof route.meta.title === 'string' ? [{ label: route.meta.title }] : [];
});
</script>

<template>
  <nav aria-label="Breadcrumb" data-test="admin-breadcrumb">
    <ol class="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
      <li v-if="!override" class="flex items-center gap-1.5">
        <!-- aria-current-value="false": an ancestor link that is also the current URL (the Cerita list
             while a page is open) must not be announced as the current page. -->
        <RouterLink
          v-if="trail.length"
          to="/admin"
          aria-current-value="false"
          class="hover:text-brand-navy hover:underline"
        >
          Beranda
        </RouterLink>
        <span v-else aria-current="page">Beranda</span>
        <span v-if="trail.length" aria-hidden="true">/</span>
      </li>
      <li
        v-for="(segment, index) in trail"
        :key="`${index}-${segment.to ?? segment.label}`"
        class="flex items-center gap-1.5"
      >
        <RouterLink
          v-if="segment.to && index < trail.length - 1"
          :to="segment.to"
          aria-current-value="false"
          class="hover:text-brand-navy hover:underline"
        >
          {{ segment.label }}
        </RouterLink>
        <span v-else :aria-current="index === trail.length - 1 ? 'page' : undefined">
          {{ segment.label }}
        </span>
        <span v-if="index < trail.length - 1" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>
