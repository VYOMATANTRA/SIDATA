<script setup lang="ts">
import { onMounted } from 'vue';
import { setAdminHeader } from '../composables/useAdminHeader';

onMounted(() => {
  setAdminHeader(
    'Konfigurasi sistem',
    'Pengaturan portal publik dan konfigurasi cuaca operasional.',
  );
});

// TODO: build the settings UI on top of /api/settings/public and /api/settings/weather-config
// (SPEC §7). Audit retention settings currently live at /settings/audit-retention and should be
// folded in here once this view is built out.
</script>

<template>
  <p class="text-sm text-slate-600">Konfigurasi sistem belum dibangun di sini.</p>
</template>
