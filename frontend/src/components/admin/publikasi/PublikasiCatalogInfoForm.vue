<script setup lang="ts">
import { computed, ref } from 'vue';
import FormField from '../../common/FormField.vue';
import FormErrorSummary from '../../common/FormErrorSummary.vue';
import BaseButton from '../../common/BaseButton.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import {
  BODY_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  validateTitleBody,
  type FormErrorEntry,
} from '../../data/blocks/blockFormShared';

/**
 * Judul dan pengantar katalog: the title and intro that sit above the publication grid on
 * `/publikasi`. Edited in a small dialog from `/admin/publikasi`; the title is required here
 * (the server does not fall back to a stored one), the intro is required too.
 */

const props = withDefaults(
  defineProps<{
    title: string;
    body: string;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{
  (e: 'submit', value: { title: string; body: string }): void;
  (e: 'cancel'): void;
}>();

const ID_PREFIX = 'publikasi-katalog';
const title = ref(props.title);
const body = ref(props.body);
const submitted = ref(false);

const errors = computed(() => {
  const found: { title?: string; body?: string } = validateTitleBody(title.value, body.value);
  if (!title.value.trim()) found.title = 'Judul katalog wajib diisi.';
  return found;
});

const entries = computed<FormErrorEntry[]>(() => {
  const list: FormErrorEntry[] = [];
  if (errors.value.title) list.push({ fieldId: `${ID_PREFIX}-title`, message: errors.value.title });
  if (errors.value.body) list.push({ fieldId: `${ID_PREFIX}-body`, message: errors.value.body });
  return list;
});

function handleSubmit(): void {
  submitted.value = true;
  if (entries.value.length > 0 || props.busy) return;
  emit('submit', { title: title.value.trim(), body: body.value.trim() });
}
</script>

<template>
  <form novalidate class="space-y-5" aria-label="Judul dan pengantar katalog" @submit.prevent="handleSubmit">
    <FormErrorSummary v-if="submitted && entries.length > 0" :errors="entries" />

    <FormField
      :id="`${ID_PREFIX}-title`"
      label="Judul katalog"
      hint="Judul yang ditampilkan di atas daftar publikasi."
      :error="submitted ? errors.title : undefined"
      required
      v-slot="{ describedBy, invalid }"
    >
      <input
        :id="`${ID_PREFIX}-title`"
        v-model="title"
        type="text"
        :maxlength="TITLE_MAX_LENGTH"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      />
    </FormField>

    <FormField
      :id="`${ID_PREFIX}-body`"
      label="Pengantar"
      hint="Keterangan singkat di bawah judul. Tidak boleh kosong."
      :error="submitted ? errors.body : undefined"
      required
      v-slot="{ describedBy, invalid }"
    >
      <textarea
        :id="`${ID_PREFIX}-body`"
        v-model="body"
        rows="6"
        :maxlength="BODY_MAX_LENGTH"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      ></textarea>
    </FormField>

    <div class="border-border flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
      <BaseButton
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="info-cancel"
        @click="emit('cancel')"
      >
        Batal
      </BaseButton>
      <BaseButton
        type="submit"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="info-save"
      >
        {{ busy ? 'Menyimpan…' : 'Simpan judul & pengantar' }}
      </BaseButton>
    </div>
  </form>
</template>
