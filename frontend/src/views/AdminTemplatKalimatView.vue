<script setup lang="ts">
import { onMounted } from 'vue';
import { setAdminHeader } from '../composables/useAdminHeader';

onMounted(() => {
  setAdminHeader('Templat kalimat', 'Kelola templat kalimat perbandingan tier-1 (SPEC §5).');
});

// TODO: build comparison_templates CRUD UI on top of /api/comparison-templates (SPEC §5, §7).
</script>

<template>
  <p class="text-sm text-slate-600">Manajemen templat kalimat belum dibangun di sini.</p>
</template>
