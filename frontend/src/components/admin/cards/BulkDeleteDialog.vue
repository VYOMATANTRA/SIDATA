<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import BaseModal from '../../common/BaseModal.vue';
import type { BulkResult } from './cardTypes';

/**
 * Bulk delete for the selected cards. Before the run it lists the items (the `intro` slot says how
 * the run behaves); the view then deletes and passes back one result per item. Each result line says
 * "Dihapus." or "Tidak dapat dihapus." with the reason. Closing after a run is the only exit, so
 * nobody re-runs a delete by accident. `noun` is the Indonesian noun for the items ("halaman",
 * "publikasi") used in every sentence.
 */
const props = defineProps<{
  open: boolean;
  noun: string;
  /** The selected items, in list order, before the run. */
  items: readonly { key: string; title: string }[];
  busy?: boolean;
  /** Null until the run has finished; then one entry per item that was attempted. */
  results: readonly BulkResult[] | null;
  /** An item changed since the dialog opened; offer a reload before choosing again. */
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
  props.results === null ? `Hapus ${count.value} ${props.noun}?` : `Hasil penghapusan ${props.noun}`,
);
const kept = computed(() => (props.results ?? []).filter((item) => item.status !== 'deleted'));
const deletedCount = computed(() => (props.results ?? []).length - kept.value.length);
const summary = computed(() => {
  if (props.results === null) return '';
  const removed = `${deletedCount.value} ${props.noun} dihapus`;
  return kept.value.length === 0
    ? `${removed}.`
    : `${removed}, ${kept.value.length} tidak dapat dihapus.`;
});
</script>

<template>
  <BaseModal :open="open" :title="heading" size="md" :busy="busy" @close="emit('close')">
    <div v-if="open" class="space-y-4" data-test="bulk-delete-dialog">
      <AlertBanner v-if="error" :message="error" data-test="bulk-error" />

      <template v-if="results === null">
        <slot name="intro" />
        <ul class="text-brand-navy list-disc space-y-1 pl-5 text-sm" data-test="bulk-items">
          <li v-for="item in items" :key="item.key">{{ item.title }}</li>
        </ul>
      </template>

      <template v-else>
        <p class="text-brand-navy text-sm font-semibold" role="status" data-test="bulk-summary">
          {{ summary }}
        </p>
        <AlertBanner
          v-if="kept.length > 0"
          tone="warning"
          :message="`${kept.length} ${noun} belum dihapus. Lihat alasannya di bawah.`"
          live="polite"
          data-test="bulk-banner"
        />
        <ul class="space-y-2 text-sm" data-test="bulk-results">
          <li
            v-for="item in results"
            :key="item.key"
            class="rounded-card border-border border p-3"
            :data-status="item.status"
          >
            <span class="text-brand-navy font-semibold break-words">{{ item.title }}</span>
            <span class="text-brand-navy block">
              {{ item.status === 'deleted' ? 'Dihapus.' : `Tidak dapat dihapus. ${item.message ?? ''}` }}
            </span>
          </li>
        </ul>
        <p v-if="stale" class="text-text-muted text-sm" data-test="bulk-stale">
          Ada {{ noun }} yang berubah sejak dibuka. Muat ulang, lalu pilih lagi yang ingin dihapus.
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
            {{ busy ? 'Menghapus…' : `Hapus ${count} ${noun}` }}
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
