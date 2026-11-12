<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import BaseModal from '../../common/BaseModal.vue';
import FormField from '../../common/FormField.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';

/**
 * One-line title dialog shared by "add" and "rename" for pages, chapters and sections. The field
 * keeps its text when a save is refused (offline, stale, duplicate), so nothing typed is lost;
 * a "stale" refusal also offers a reload that leaves the text in place.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    heading: string;
    /** Visible label of the field, e.g. "Judul bab". */
    label: string;
    initial?: string;
    submitLabel: string;
    busy?: boolean;
    error?: string;
    stale?: boolean;
    hint?: string;
  }>(),
  { initial: '', busy: false, error: '', stale: false, hint: undefined },
);

const emit = defineEmits<{
  (e: 'submit', title: string): void;
  (e: 'close'): void;
  (e: 'reload'): void;
}>();

const title = ref(props.initial);
const submitted = ref(false);
const fieldId = 'cerita-nama-dialog-judul';

// Each opening starts from `initial`; the text of an earlier opening never carries over.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    title.value = props.initial;
    submitted.value = false;
  },
);

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
const BIDI_CHARS = /[‎‏‪-‮⁦-⁩]/;

const problem = computed(() => {
  const value = title.value.trim();
  if (value === '') return `${props.label} wajib diisi.`;
  if (value.length > 255) return `${props.label} maksimal 255 karakter.`;
  if (/<[a-z!/]/i.test(value)) return `${props.label} tidak boleh memuat tag HTML.`;
  if (CONTROL_CHARS.test(value) || BIDI_CHARS.test(value)) {
    return `${props.label} memuat karakter yang tidak diizinkan.`;
  }
  return undefined;
});

function handleSubmit(): void {
  submitted.value = true;
  if (problem.value || props.busy) return;
  emit('submit', title.value.trim());
}
</script>

<template>
  <BaseModal :open="open" :title="heading" size="md" :busy="busy" @close="emit('close')">
    <!-- Rendered only while open, so a reopened dialog starts from `initial`, not an old draft. -->
    <form
      v-if="open"
      novalidate
      class="space-y-4"
      data-test="name-dialog"
      @submit.prevent="handleSubmit"
    >
      <FormField
        :id="fieldId"
        :label="label"
        :hint="hint"
        :error="submitted ? problem : undefined"
        required
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId"
          v-model="title"
          type="text"
          data-autofocus
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="name-input"
        />
      </FormField>

      <p
        v-if="error"
        role="alert"
        class="rounded-btn border-status-error-border bg-status-error-surface text-status-error border px-3 py-2 text-sm"
        data-test="name-error"
      >
        {{ error }}
      </p>

      <div
        v-if="stale"
        class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
        data-test="name-stale"
      >
        <p class="text-status-warning text-sm">
          Isian Anda masih ada di sini. Memuat versi terbaru tidak menghapus isian Anda.
        </p>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="mt-3 min-h-11"
          :disabled="busy"
          data-test="name-reload"
          @click="emit('reload')"
        >
          Muat versi terbaru
        </BaseButton>
      </div>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="name-cancel"
          @click="emit('close')"
        >
          Batal
        </BaseButton>
        <BaseButton
          type="submit"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="name-submit"
        >
          {{ busy ? 'Menyimpan…' : submitLabel }}
        </BaseButton>
      </div>
    </form>
  </BaseModal>
</template>
