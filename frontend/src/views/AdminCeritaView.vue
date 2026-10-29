<script setup lang="ts">
import { onMounted } from 'vue';
import { setAdminHeader } from '../composables/useAdminHeader';

onMounted(() => {
  setAdminHeader('Cerita', 'Kelola daftar halaman Cerita, bab, dan urutannya.');
});

// TODO: build page/chapter management UI on top of GET/POST/DELETE /api/pages (SPEC §2, §3).
</script>

<template>
  <p class="text-sm text-slate-600">Manajemen halaman Cerita belum dibangun di sini.</p>
</template>
