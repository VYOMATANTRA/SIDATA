<script setup lang="ts">
import { onMounted } from 'vue';
import { setAdminHeader } from '../composables/useAdminHeader';

onMounted(() => {
  setAdminHeader('Rukun Tetangga', 'Kelola data 100 Ketua RT: nama, kontak, dan alamat.');
});

// TODO: build the rt_leaders edit UI on top of PATCH /api/maps/rt-leaders/:rtNumber (SPEC §7).
</script>

<template>
  <p class="text-sm text-slate-600">Manajemen Rukun Tetangga belum dibangun di sini.</p>
</template>
