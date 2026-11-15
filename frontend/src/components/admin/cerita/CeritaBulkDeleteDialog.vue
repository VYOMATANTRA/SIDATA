<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import BaseModal from '../../common/BaseModal.vue';

/**
 * Bulk delete for the selected Cerita pages (Pilih mode). Before the run it lists the pages; the
 * view then deletes them one after another and passes back one result per page. A page that still
 * holds content is refused by the server and reported as blocked; the others are reported as
 * deleted. Closing after a run is the only exit, so nobody re-runs a delete by accident.
 */
type BulkStatus = 'deleted' | 'blocked' | 'failed';

const props = defineProps<{
  open: boolean;
  /** The selected pages, in list order, before the run. */
  items: readonly { slug: string; title: string }[];
  busy?: boolean;
  /** Null until the run has finished; then one entry per page that was attempted. */
  results: readonly { slug: string; title: string; status: BulkStatus; message?: string }[] | null;
  /** A page changed since the dialog opened; offer a reload before choosing again. */
  stale?: boolean;
  /** Approved text when the reload after a run failed. */
  error?: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'close'): void;
  (e: 'reload'): void;
}>();

const closeButton = ref<InstanceType<typeof BaseButton> | null>(null);

// After a run the focus moves to the only remaining action, so it does not fall to <body>.
watch(
  () => props.results,
  (results) => {
    if (results === null) return;
    void nextTick(() => (closeButton.value?.$el as HTMLElement | undefined)?.focus());
  },
);

const count = computed(() => props.items.length);
const heading = computed(() =>
  props.results === null ? `Hapus ${count.value} halaman?` : 'Hasil penghapusan halaman',
);
const kept = computed(() => (props.results ?? []).filter((item) => item.status !== 'deleted'));
const deletedCount = computed(() => (props.results ?? []).length - kept.value.length);
const summary = computed(() => {
  if (props.results === null) return '';
  const removed = `${deletedCount.value} halaman dihapus`;
  return kept.value.length === 0 ? `${removed}.` : `${removed}, ${kept.value.length} tidak dihapus.`;
});
</script>

<template>
  <BaseModal :open="open" :title="heading" size="md" :busy="busy" @close="emit('close')">
    <div v-if="open" class="space-y-4" data-test="bulk-delete-dialog">
      <AlertBanner v-if="error" :message="error" data-test="bulk-error" />

      <template v-if="results === null">
        <p class="text-brand-navy text-sm">
          Halaman berikut akan dihapus satu per satu. Tindakan ini tidak bisa dibatalkan.
        </p>
        <p class="text-text-muted text-sm">
          Halaman yang masih berisi paragraf, gambar, angka, atau tabel tidak dapat dihapus dan akan
          dilaporkan.
        </p>
        <ul class="text-brand-navy list-disc space-y-1 pl-5 text-sm" data-test="bulk-items">
          <li v-for="item in items" :key="item.slug">{{ item.title }}</li>
        </ul>
      </template>

      <template v-else>
        <p class="text-brand-navy text-sm font-semibold" role="status" data-test="bulk-summary">
          {{ summary }}
        </p>
        <AlertBanner
          v-if="kept.length > 0"
          tone="warning"
          :message="`${kept.length} halaman belum dihapus. Lihat alasannya di bawah.`"
          live="polite"
          data-test="bulk-banner"
        />
        <ul class="space-y-2 text-sm" data-test="bulk-results">
          <li
            v-for="item in results"
            :key="item.slug"
            class="rounded-card border-border border p-3"
            :data-status="item.status"
          >
            <span class="text-brand-navy font-semibold break-words">{{ item.title }}</span>
            <span class="text-brand-navy block">
              {{ item.status === 'deleted' ? 'Dihapus.' : `Tidak dihapus. ${item.message ?? ''}` }}
            </span>
          </li>
        </ul>
        <p v-if="stale" class="text-text-muted text-sm" data-test="bulk-stale">
          Ada halaman yang berubah sejak dibuka. Muat ulang, lalu pilih lagi halaman yang ingin
          dihapus.
        </p>
      </template>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <template v-if="results === null">
          <BaseButton
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="busy"
            data-test="bulk-cancel"
            data-autofocus
            @click="emit('close')"
          >
            Batal
          </BaseButton>
          <BaseButton
            type="button"
            size="md"
            class="min-h-11"
            :disabled="busy || count === 0"
            data-test="bulk-confirm"
            @click="emit('confirm')"
          >
            {{ busy ? 'Menghapus…' : `Hapus ${count} halaman` }}
          </BaseButton>
        </template>
        <template v-else>
          <BaseButton
            v-if="stale"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            data-test="bulk-reload"
            @click="emit('reload')"
          >
            Muat ulang
          </BaseButton>
          <BaseButton
            ref="closeButton"
            type="button"
            size="md"
            class="min-h-11"
            data-test="bulk-close"
            @click="emit('close')"
          >
            Tutup
          </BaseButton>
        </template>
      </div>
    </div>
  </BaseModal>
</template>
