<script setup lang="ts">
import { onMounted } from 'vue';
import { setAdminHeader } from '../composables/useAdminHeader';

onMounted(() => {
  setAdminHeader('Publikasi', 'Kelola materi publikasi, infografis, dan dokumen terkait.');
});

// TODO: no backend resource exists yet for Publikasi (SPEC §8) — build once scope is confirmed.
</script>

<template>
  <p class="text-sm text-slate-600">Manajemen publikasi belum dibangun di sini.</p>
</template>
