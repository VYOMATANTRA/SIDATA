<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';

const route = useRoute();

/**
 * Each admin route declares `meta.breadcrumb: string[]` for the trail segments after "Beranda"
 * (SPEC: "breadcrumb as <nav aria-label="Breadcrumb"> ... Beranda > section > page"). Falls back
 * to the route title alone so a route that forgets to set it still renders something sane.
 */
const trail = computed<string[]>(() => {
  const configured = route.meta.breadcrumb;
  if (Array.isArray(configured)) return configured as string[];
  return typeof route.meta.title === 'string' ? [route.meta.title] : [];
});
</script>

<template>
  <nav aria-label="Breadcrumb" data-test="admin-breadcrumb">
    <ol class="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
      <li class="flex items-center gap-1.5">
        <RouterLink to="/admin" class="hover:text-brand-navy hover:underline">Beranda</RouterLink>
        <span v-if="trail.length" aria-hidden="true">/</span>
      </li>
      <li v-for="(segment, index) in trail" :key="segment" class="flex items-center gap-1.5">
        <span :aria-current="index === trail.length - 1 ? 'page' : undefined">{{ segment }}</span>
        <span v-if="index < trail.length - 1" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>
