<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import PublicLayout from './layouts/PublicLayout.vue';

const route = useRoute();
const hasNavigated = ref(false);

watch(
  () => route.path,
  (newPath, oldPath) => {
    if (oldPath !== undefined && newPath !== oldPath) {
      hasNavigated.value = true;
    }
  },
  { flush: 'sync' },
);

// Routes opt in with `meta.layout: 'public'`. The layout stays mounted while the visitor moves
// between public pages, so the header, its menu state and the footer are not rebuilt per route.
const usesPublicLayout = computed(() => route.meta.layout === 'public');
</script>

<template>
  <PublicLayout v-if="usesPublicLayout" :focus-on-mount="hasNavigated">
    <RouterView />
  </PublicLayout>
  <RouterView v-else />
</template>
