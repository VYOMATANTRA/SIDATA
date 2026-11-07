<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import PublicLayout from './layouts/PublicLayout.vue';

const route = useRoute();

// Routes opt in with `meta.layout: 'public'`. The layout stays mounted while the visitor moves
// between public pages, so the header, its menu state and the footer are not rebuilt per route.
const usesPublicLayout = computed(() => route.meta.layout === 'public');
</script>

<template>
  <PublicLayout v-if="usesPublicLayout">
    <RouterView />
  </PublicLayout>
  <RouterView v-else />
</template>
