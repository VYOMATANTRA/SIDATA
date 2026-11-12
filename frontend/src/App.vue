<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterView, START_LOCATION, useRoute, useRouter } from 'vue-router';
import PublicLayout from './layouts/PublicLayout.vue';

const router = useRouter();
const route = useRoute();
const navigationSeq = ref(0);

router.afterEach((to, from, failure) => {
  if (failure || from === START_LOCATION) return;
  if (to.path !== from.path) {
    navigationSeq.value += 1;
  }
});

// Routes opt in with `meta.layout: 'public'`. The layout stays mounted while the visitor moves
// between public pages, so the header, its menu state and the footer are not rebuilt per route.
const usesPublicLayout = computed(() => route.meta.layout === 'public');
</script>

<template>
  <PublicLayout
    v-if="usesPublicLayout"
    :navigation-seq="navigationSeq"
    :focus-on-mount="navigationSeq > 0"
  >
    <RouterView />
  </PublicLayout>
  <RouterView v-else />
</template>
