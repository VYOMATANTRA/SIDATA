<script setup lang="ts">
import BaseButton from '../../common/BaseButton.vue';
import BaseModal from '../../common/BaseModal.vue';

/**
 * Delete confirmation for a page, chapter or section. When the server refuses because the record
 * still holds content, `blocked` swaps the confirm button for the plain explanation and a single
 * "Mengerti" button, so nobody retries an action that cannot succeed.
 */
defineProps<{
  open: boolean;
  heading: string;
  /** The question, naming the record. */
  message: string;
  /** What else disappears with it, if anything. */
  consequence?: string;
  confirmLabel: string;
  busy?: boolean;
  /** Approved failure text; for `blocked` it is the dependency sentence. */
  error?: string;
  blocked?: boolean;
  stale?: boolean;
  /** Plain next step shown with a refusal (what to remove first, and where). */
  hint?: string;
  /** Optional shortcut shown with a refusal, e.g. "Buka isi bagian". */
  actionLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'close'): void;
  (e: 'reload'): void;
  (e: 'action'): void;
}>();
</script>

<template>
  <BaseModal :open="open" :title="heading" size="md" :busy="busy" @close="emit('close')">
    <div v-if="open" class="space-y-4" data-test="delete-dialog">
      <p v-if="!blocked" class="text-brand-navy text-sm" data-test="delete-message">
        {{ message }}
      </p>
      <p
        v-if="!blocked && consequence"
        class="text-text-muted text-sm"
        data-test="delete-consequence"
      >
        {{ consequence }}
      </p>

      <p
        v-if="error"
        role="alert"
        class="rounded-btn border-status-error-border bg-status-error-surface text-status-error border px-3 py-2 text-sm"
        data-test="delete-error"
      >
        {{ error }}
      </p>

      <p v-if="blocked && hint" class="text-text-muted text-sm" data-test="delete-hint">
        {{ hint }}
      </p>

      <BaseButton
        v-if="stale"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="busy"
        data-test="delete-reload"
        @click="emit('reload')"
      >
        Muat ulang
      </BaseButton>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="delete-cancel"
          data-autofocus
          @click="emit('close')"
        >
          {{ blocked ? 'Mengerti' : 'Batal' }}
        </BaseButton>
        <BaseButton
          v-if="blocked && actionLabel"
          type="button"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="delete-action"
          @click="emit('action')"
        >
          {{ actionLabel }}
        </BaseButton>
        <BaseButton
          v-if="!blocked"
          type="button"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="delete-confirm"
          @click="emit('confirm')"
        >
          {{ busy ? 'Menghapus…' : confirmLabel }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
