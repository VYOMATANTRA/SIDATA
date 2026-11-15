<script setup lang="ts">
import { ref } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import { useCeritaAdminStore } from '../../../stores/ceritaAdmin.store';

/**
 * Shown when a change was saved but the lists could not be reloaded afterwards, so what is on
 * screen may be out of date. It says so plainly and offers the reload; until it succeeds, a
 * further save is refused by the server as out of date rather than overwriting anything.
 */
const store = useCeritaAdminStore();
const reloading = ref(false);

async function reload(): Promise<void> {
  if (reloading.value) return;
  reloading.value = true;
  await store.load();
  reloading.value = false;
}
</script>

<template>
  <AlertBanner
    v-if="store.reloadNeeded"
    tone="warning"
    message="Perubahan Anda sudah tersimpan, tetapi daftar belum bisa dimuat ulang. Muat ulang agar tampilan sesuai sebelum mengubah yang lain."
    data-test="reload-notice"
  >
    <template #action>
      <BaseButton
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="reloading"
        data-test="reload-notice-button"
        @click="reload"
      >
        {{ reloading ? 'Memuat…' : 'Muat ulang' }}
      </BaseButton>
    </template>
  </AlertBanner>
</template>
