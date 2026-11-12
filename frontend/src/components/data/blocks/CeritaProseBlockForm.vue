<script setup lang="ts">
import { computed, ref } from 'vue';
import BlockFormShell from './BlockFormShell.vue';
import {
  BLOCK_FORM_DEFAULTS,
  titleBodyEntries,
  validateTitleBody,
  type BlockFormProps,
  type BlockSavePayload,
} from './blockFormShared';

/**
 * Narrative block attached to a Cerita section: title and body only. It has no other fields, so
 * the save sends no metadata and whatever is stored stays untouched.
 */
const props = withDefaults(defineProps<BlockFormProps>(), BLOCK_FORM_DEFAULTS);

const emit = defineEmits<{
  (e: 'submit', payload: BlockSavePayload): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
}>();

const title = ref(props.block.title ?? '');
const body = ref(props.block.body ?? '');
const submitted = ref(false);

const titleBodyErrors = computed(() => validateTitleBody(title.value, body.value));
const errorEntries = computed(() => titleBodyEntries(props.idPrefix, titleBodyErrors.value));

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
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
  />
</template>
