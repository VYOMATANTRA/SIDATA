<script setup lang="ts">
import BaseButton from '../../common/BaseButton.vue';

/**
 * A fixed-height row under the toolbar: the search count while a search runs, and, while at least
 * one card is selected, "N dipilih" with "Hapus semua". Fixed height means nothing above or below it
 * moves when the selection changes.
 */
withDefaults(
  defineProps<{
    selectedCount: number;
    /** Text for the search count, or null when no search runs. */
    searchCount?: string | null;
    busy?: boolean;
    bulkId?: string;
    bulkLabel?: string;
  }>(),
  { searchCount: null, busy: false, bulkId: undefined, bulkLabel: 'Hapus semua' },
);

const emit = defineEmits<{ (e: 'bulk-delete'): void }>();
</script>

<template>
  <div class="flex min-h-11 items-center gap-3" data-test="selection-bar">
    <p v-if="searchCount" class="text-text-muted text-sm" role="status" data-test="search-count">
      {{ searchCount }}
    </p>
    <div v-if="selectedCount > 0" class="ml-auto flex items-center gap-3">
      <span class="text-brand-navy text-sm font-semibold" data-test="selected-count">
        {{ selectedCount }} dipilih
      </span>
      <BaseButton
        :id="bulkId"
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="bulk-delete"
        @click="emit('bulk-delete')"
      >
        {{ bulkLabel }}
      </BaseButton>
    </div>
  </div>
</template>
