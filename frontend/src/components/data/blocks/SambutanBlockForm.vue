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

/** Sambutan Lurah: title, body, name, official title and an optional portrait address. */
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
const authorName = ref(readString(props.block.metadata, 'authorName'));
const authorTitle = ref(readString(props.block.metadata, 'authorTitle'));
// Photo fields stay plain address text for now; the "Pilih foto" picker replaces them later.
const authorPhotoUrl = ref(readString(props.block.metadata, 'photoUrl'));
const submitted = ref(false);

const titleBodyErrors = computed(() => validateTitleBody(title.value, body.value));

const errorEntries = computed<FormErrorEntry[]>(() =>
  titleBodyEntries(props.idPrefix, titleBodyErrors.value),
);

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
    metadata: {
      ...props.block.metadata,
      authorName: authorName.value.trim() || undefined,
      authorTitle: authorTitle.value.trim() || undefined,
      photoUrl: authorPhotoUrl.value.trim() || undefined,
    },
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
    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-sm font-semibold">Informasi Pimpinan</legend>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField :id="fieldId('author-name')" label="Nama Pimpinan" v-slot="{ describedBy }">
          <input
            :id="fieldId('author-name')"
            v-model="authorName"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField :id="fieldId('author-title')" label="Jabatan Resmi" v-slot="{ describedBy }">
          <input
            :id="fieldId('author-title')"
            v-model="authorTitle"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>
      </div>

      <FormField
        :id="fieldId('author-photo')"
        label="URL Foto Pimpinan (Opsional)"
        v-slot="{ describedBy }"
      >
        <input
          :id="fieldId('author-photo')"
          v-model="authorPhotoUrl"
          type="text"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
        />
      </FormField>
    </fieldset>
  </BlockFormShell>
</template>
