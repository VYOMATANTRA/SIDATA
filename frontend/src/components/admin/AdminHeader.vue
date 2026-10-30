<script setup lang="ts">
import { Bars3Icon } from '@heroicons/vue/24/outline';
import { useAdminHeader } from '../../composables/useAdminHeader';

defineEmits<{ (e: 'openMenu'): void }>();

const { title, subtitle } = useAdminHeader();
</script>

<template>
  <header
    class="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-6 py-8 md:px-10"
    data-test="admin-header"
  >
    <button
      type="button"
      class="focus-visible:ring-brand-indigo rounded-btn mt-0.5 inline-flex shrink-0 items-center justify-center border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none md:hidden"
      aria-label="Buka menu navigasi"
      aria-controls="admin-sidebar-nav-list"
      data-test="admin-mobile-menu-toggle"
      @click="$emit('openMenu')"
    >
      <Bars3Icon class="h-5 w-5" aria-hidden="true" />
    </button>

    <div class="min-w-0">
      <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
        {{ title }}
      </h1>
      <p v-if="subtitle" class="mt-1.5 text-sm text-slate-600">{{ subtitle }}</p>
    </div>
  </header>
</template>
