<script setup lang="ts">
import { useAdminHeader } from '../../composables/useAdminHeader';

const { title, subtitle } = useAdminHeader();
</script>

<template>
  <header class="border-b border-slate-200 bg-slate-50 px-6 py-8 md:px-10" data-test="admin-header">
    <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
      {{ title }}
    </h1>
    <p v-if="subtitle" class="mt-1.5 text-sm text-slate-600">{{ subtitle }}</p>
  </header>
</template>
