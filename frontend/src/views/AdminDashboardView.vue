<script setup lang="ts">
import { onMounted } from 'vue';
import { setAdminHeader } from '../composables/useAdminHeader';

onMounted(() => {
  setAdminHeader('Beranda', 'Ringkasan aktivitas dan pintasan menuju modul admin.');
});

// TODO: build the real admin dashboard (recent activity, quick links, key stats).
</script>

<template>
  <p class="text-sm text-slate-600">
    Dasbor admin belum dibangun. Gunakan menu di samping untuk mengelola konten.
  </p>
</template>
