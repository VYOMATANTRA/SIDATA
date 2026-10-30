<script setup lang="ts">
import { onMounted } from 'vue';
import { setAdminHeader } from '../composables/useAdminHeader';

onMounted(() => {
  setAdminHeader('Peta', 'Kelola titik spasial, cakupan RT, dan data Ketua RT.');
});

// TODO: build the map editor UI on top of /api/maps/points and /api/maps/rt-leaders (SPEC §7).
</script>

<template>
  <p class="text-sm text-slate-600">Manajemen peta belum dibangun di sini.</p>
</template>
