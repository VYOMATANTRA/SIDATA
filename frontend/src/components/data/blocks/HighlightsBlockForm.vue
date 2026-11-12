<script setup lang="ts">
import { computed, ref } from 'vue';
import FormField from '../../common/FormField.vue';
import BaseButton from '../../common/BaseButton.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import BlockFormShell from './BlockFormShell.vue';
import CollectionRowActions from './CollectionRowActions.vue';
import {
  BLOCK_FORM_DEFAULTS,
  titleBodyEntries,
  useRepeatableRows,
  validateTitleBody,
  type BlockFormProps,
  type BlockSavePayload,
  type FormErrorEntry,
} from './blockFormShared';

/**
 * Potensi unggulan: a short list of points, each a title and a description. Saved as
 * `metadata.items[] = { title, desc }`. No public page reads this block yet (decision D1), so the
 * dialog header says so rather than implying the Beranda changes.
 */
const props = withDefaults(defineProps<BlockFormProps>(), BLOCK_FORM_DEFAULTS);

const emit = defineEmits<{
  (e: 'submit', payload: BlockSavePayload): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
}>();

const MAX_ITEMS = 10;
const TITLE_MAX = 100;
const DESC_MAX = 500;

interface HighlightDraft {
  title: string;
  desc: string;
}

function fieldId(name: string): string {
  return `${props.idPrefix}-${name}`;
}

function readItems(meta: Record<string, unknown> | null): HighlightDraft[] {
  const raw = meta?.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      title: typeof row.title === 'string' ? row.title : '',
      desc: typeof row.desc === 'string' ? row.desc : '',
    };
  });
}

const title = ref(props.block.title ?? '');
const body = ref(props.block.body ?? '');
const submitted = ref(false);

const { rows, announcement, isFull, add, remove, move } = useRepeatableRows<HighlightDraft>(
  readItems(props.block.metadata),
  {
    max: MAX_ITEMS,
    makeEmpty: () => ({ title: '', desc: '' }),
    noun: 'poin',
    ids: {
      firstField: (i) => fieldId(`item-title-${i}`),
      moveUp: (i) => fieldId(`item-up-${i}`),
      moveDown: (i) => fieldId(`item-down-${i}`),
      add: fieldId('item-add'),
    },
  },
);

const titleBodyErrors = computed(() => validateTitleBody(title.value, body.value));

const fieldErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {};
  rows.value.forEach((row, index) => {
    const label = `Poin ${index + 1}`;
    if (!row.title.trim()) {
      errors[`item-title-${index}`] = `${label}: judul wajib diisi.`;
    } else if (row.title.trim().length > TITLE_MAX) {
      errors[`item-title-${index}`] = `${label}: judul maksimal ${TITLE_MAX} karakter.`;
    }
    if (!row.desc.trim()) {
      errors[`item-desc-${index}`] = `${label}: deskripsi wajib diisi.`;
    } else if (row.desc.trim().length > DESC_MAX) {
      errors[`item-desc-${index}`] = `${label}: deskripsi maksimal ${DESC_MAX} karakter.`;
    }
  });
  return errors;
});

const errorEntries = computed<FormErrorEntry[]>(() => [
  ...titleBodyEntries(props.idPrefix, titleBodyErrors.value),
  ...rows.value.flatMap((_, i) =>
    [`item-title-${i}`, `item-desc-${i}`]
      .map((name) => ({ fieldId: fieldId(name), message: fieldErrors.value[name] }))
      .filter((entry): entry is FormErrorEntry => Boolean(entry.message)),
  ),
]);

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
    metadata: {
      items: rows.value.map((row) => ({ title: row.title.trim(), desc: row.desc.trim() })),
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
      <legend class="text-brand-navy px-1 text-sm font-semibold">Poin unggulan</legend>
      <p class="text-text-muted text-sm">
        Maksimal {{ MAX_ITEMS }} poin. Judul maksimal {{ TITLE_MAX }} karakter, deskripsi maksimal
        {{ DESC_MAX }} karakter.
      </p>

      <p
        v-if="rows.length === 0"
        class="rounded-btn border-border-strong bg-surface text-text-muted border border-dashed px-3 py-4 text-sm"
        data-test="highlights-empty"
      >
        Belum ada poin. Pilih “Tambah poin” untuk menambahkan.
      </p>

      <ol class="space-y-4">
        <li
          v-for="(row, index) in rows"
          :key="row.uid"
          class="rounded-btn border-border bg-surface space-y-3 border p-3"
        >
          <p class="text-brand-navy text-sm font-semibold">Poin {{ index + 1 }}</p>
          <FormField
            :id="fieldId(`item-title-${index}`)"
            label="Judul"
            :error="submitted ? fieldErrors[`item-title-${index}`] : undefined"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="fieldId(`item-title-${index}`)"
              v-model="row.title"
              type="text"
              :maxlength="TITLE_MAX"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            />
          </FormField>
          <FormField
            :id="fieldId(`item-desc-${index}`)"
            label="Deskripsi"
            :error="submitted ? fieldErrors[`item-desc-${index}`] : undefined"
            v-slot="{ describedBy, invalid }"
          >
            <textarea
              :id="fieldId(`item-desc-${index}`)"
              v-model="row.desc"
              rows="3"
              :maxlength="DESC_MAX"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            ></textarea>
          </FormField>
          <CollectionRowActions
            :row-label="`poin ${index + 1}`"
            :is-first="index === 0"
            :is-last="index === rows.length - 1"
            :busy="busy"
            :move-up-id="fieldId(`item-up-${index}`)"
            :move-down-id="fieldId(`item-down-${index}`)"
            :remove-id="fieldId(`item-remove-${index}`)"
            @move-up="move(index, -1)"
            @move-down="move(index, 1)"
            @remove="remove(index)"
          />
        </li>
      </ol>

      <div class="flex flex-wrap items-center gap-3">
        <BaseButton
          :id="fieldId('item-add')"
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy || isFull()"
          @click="add"
        >
          Tambah poin
        </BaseButton>
        <p v-if="isFull()" class="text-text-muted text-sm" data-test="highlights-full">
          Sudah mencapai batas {{ MAX_ITEMS }} poin.
        </p>
      </div>
      <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
    </fieldset>
  </BlockFormShell>
</template>
