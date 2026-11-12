<script setup lang="ts">
import { computed, ref } from 'vue';
import FormField from '../../common/FormField.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import BlockFormShell from './BlockFormShell.vue';
import {
  BLOCK_FORM_DEFAULTS,
  readString,
  titleBodyEntries,
  validateTitleBody,
  type BlockFormProps,
  type BlockSavePayload,
  type FormErrorEntry,
} from './blockFormShared';

/** Beranda, bagian atas: title, body and an optional background image address. */
const props = withDefaults(defineProps<BlockFormProps>(), BLOCK_FORM_DEFAULTS);

const emit = defineEmits<{
  (e: 'submit', payload: BlockSavePayload): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
}>();

function fieldId(name: string): string {
  return `${props.idPrefix}-${name}`;
}

const title = ref(props.block.title ?? '');
const body = ref(props.block.body ?? '');
// Photo fields stay plain address text for now; the "Pilih foto" picker replaces them later.
const backgroundImage = ref(readString(props.block.metadata, 'backgroundImage'));
const submitted = ref(false);

const titleBodyErrors = computed(() => validateTitleBody(title.value, body.value));

const errorEntries = computed<FormErrorEntry[]>(() =>
  titleBodyEntries(props.idPrefix, titleBodyErrors.value),
);

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  // Hero metadata is the background image only (no badge or call-to-action buttons).
  const bg = backgroundImage.value.trim();
  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
    metadata: bg ? { backgroundImage: bg } : null,
  });
}
</script>

<template>
  <BlockFormShell
    v-model:title="title"
    v-model:body="body"
    :id-prefix="idPrefix"
    :busy="busy"
    :server-error="serverError"
    :submitted="submitted"
    :errors="errorEntries"
    :title-error="titleBodyErrors.title"
    :body-error="titleBodyErrors.body"
    :placement="placement"
    :shown-on-site="shownOnSite"
    :stale="stale"
    @submit="handleSubmit"
    @cancel="emit('cancel')"
    @reload="emit('reload')"
  >
    <FormField
      :id="fieldId('backgroundImage')"
      label="Gambar latar"
      hint="Path relatif (/...) atau URL https. Kosongkan untuk menghapus."
      v-slot="{ describedBy }"
    >
      <input
        :id="fieldId('backgroundImage')"
        v-model="backgroundImage"
        type="text"
        maxlength="500"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
      />
    </FormField>
  </BlockFormShell>
</template>
