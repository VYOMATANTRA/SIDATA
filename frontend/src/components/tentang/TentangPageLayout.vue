<script setup lang="ts">
import AppNavbar from '../common/AppNavbar.vue';
import AppFooter from '../common/AppFooter.vue';
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white font-sans text-brand-navy">
    <!-- Skip to Content Link per docs/ACCESSIBILITY.md §3 (2.4.1) -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-btn focus:bg-brand-navy focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
    >
      Lewati ke konten utama
    </a>

    <AppNavbar variant="navy" />

    <!-- Main Content Landmark -->
    <main id="main-content" class="flex-grow">
      <slot />
    </main>

    <AppFooter />
  </div>
</template>
