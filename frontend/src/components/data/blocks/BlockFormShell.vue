<script setup lang="ts">
import { computed } from 'vue';
import FormField from '../../common/FormField.vue';
import FormErrorSummary from '../../common/FormErrorSummary.vue';
import BaseButton from '../../common/BaseButton.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import { HIDDEN_BLOCK_NOTE } from './blockMeta';
import type { FormErrorEntry } from './blockFormShared';

/**
 * Frame shared by every content-block form: placement header, error summary, the title and body
 * fields every block has, a slot for the block's own fields, and the Batal / Simpan footer.
 * It owns no validation: the per-block form computes its errors (so it can order them with its
 * own fields) and passes them in.
 */
const props = withDefaults(
  defineProps<{
    idPrefix: string;
    busy?: boolean;
    serverError?: string;
    submitted: boolean;
    /** Ordered errors for the summary, shown only after the first submit attempt. */
    errors: ReadonlyArray<FormErrorEntry>;
    titleError?: string;
    bodyError?: string;
    placement?: string;
    shownOnSite?: boolean;
    stale?: boolean;
    titleHint?: string;
    titleRequired?: boolean;
    bodyLabel?: string;
    bodyHint?: string;
    bodyRows?: number;
  }>(),
  {
    busy: false,
    serverError: '',
    titleError: undefined,
    bodyError: undefined,
    placement: '',
    shownOnSite: true,
    stale: false,
    titleHint: 'Judul utama yang ditampilkan di atas konten (opsional).',
    titleRequired: false,
    bodyLabel: 'Isi Konten',
    bodyHint: 'Narasi atau paragraf utama untuk blok konten ini.',
    bodyRows: 5,
  },
);

const title = defineModel<string>('title', { required: true });
const body = defineModel<string>('body', { required: true });

const emit = defineEmits<{
  (e: 'submit'): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
}>();

const summaryErrors = computed(() => (props.submitted ? props.errors : []));

function fieldId(name: string): string {
  return `${props.idPrefix}-${name}`;
}
</script>

<template>
  <form novalidate class="space-y-5" @submit.prevent="emit('submit')">
    <div v-if="placement" class="rounded-card border-border bg-surface-muted border px-4 py-3">
      <p class="text-brand-navy text-sm font-semibold" data-test="block-placement">
        {{ placement }}
      </p>
      <p v-if="!shownOnSite" class="text-text-muted mt-1 text-sm" data-test="block-hidden-note">
        {{ HIDDEN_BLOCK_NOTE }}
      </p>
    </div>

    <FormErrorSummary
      v-if="summaryErrors.length > 0 || serverError"
      :errors="summaryErrors"
      :form-error="serverError"
    />

    <div
      v-if="stale"
      class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
      data-test="block-stale-notice"
    >
      <p class="text-status-warning text-sm">
        Isian Anda masih ada di formulir ini. Memuat versi terbaru akan mengganti isian yang belum
        disimpan.
      </p>
      <BaseButton
        type="button"
        variant="secondary"
        size="sm"
        class="mt-3 min-h-11"
        :disabled="busy"
        data-test="block-reload"
        @click="emit('reload')"
      >
        Muat versi terbaru
      </BaseButton>
    </div>

    <FormField
      :id="fieldId('title')"
      label="Judul Blok"
      :hint="titleHint"
      :required="titleRequired"
      :error="submitted ? titleError : undefined"
      v-slot="{ describedBy, invalid }"
    >
      <input
        :id="fieldId('title')"
        v-model="title"
        type="text"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      />
    </FormField>

    <FormField
      :id="fieldId('body')"
      :label="bodyLabel"
      :hint="bodyHint"
      :error="submitted ? bodyError : undefined"
      required
      v-slot="{ describedBy, invalid }"
    >
      <textarea
        :id="fieldId('body')"
        v-model="body"
        :rows="bodyRows"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
        required
      ></textarea>
    </FormField>

    <slot />

    <div class="border-border flex items-center justify-end gap-3 border-t pt-3">
      <BaseButton variant="secondary" size="md" :disabled="busy" @click="emit('cancel')">
        Batal
      </BaseButton>
      <BaseButton type="submit" variant="primary" size="md" :disabled="busy">
        {{ busy ? 'Menyimpan…' : 'Simpan Perubahan' }}
      </BaseButton>
    </div>
  </form>
</template>
