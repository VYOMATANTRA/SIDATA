<script setup lang="ts">
import { inject } from 'vue';
import PublicLayout from '../../layouts/PublicLayout.vue';
import { publicShellKey } from '../../layouts/publicShell';

/**
 * Compatibility wrapper kept so the views that still wrap their content in it need no edits.
 *
 * Routed public pages are mounted inside `PublicLayout` by `App.vue`, which owns the skip link,
 * header, the single `<main>` and the footer: the wrapper then renders its content as-is. Only
 * when a view is mounted on its own (outside the shell) does it wrap the content in the shell, so
 * a page is never rendered without the shared chrome and never with two of it.
 */
const insideShell = inject(publicShellKey, false);
</script>

<template>
  <slot v-if="insideShell" />
  <PublicLayout v-else>
    <slot />
  </PublicLayout>
</template>
