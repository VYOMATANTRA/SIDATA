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

const route = useRoute();

/**
 * Each admin route declares `meta.breadcrumb: BreadcrumbSegment[]` for the trail segments after
 * "Beranda" (SPEC: "breadcrumb as <nav aria-label="Breadcrumb"> ... Beranda > section > page").
 * Segments may carry an optional `to` path so parent levels (e.g. "Akun pengguna" on the audit
 * retention page) render as clickable links. Falls back to the route title alone so a route that
 * forgets to set it still renders something sane.
 */
const trail = computed<NormalizedSegment[]>(() => {
  const configured = route.meta.breadcrumb;
  if (Array.isArray(configured)) {
    return configured.map((segment) => (typeof segment === 'string' ? { label: segment } : segment));
  }
  return typeof route.meta.title === 'string' ? [{ label: route.meta.title }] : [];
});
</script>

<template>
  <nav aria-label="Breadcrumb" data-test="admin-breadcrumb">
    <ol class="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
      <li class="flex items-center gap-1.5">
        <RouterLink v-if="trail.length" to="/admin" class="hover:text-brand-navy hover:underline">
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
