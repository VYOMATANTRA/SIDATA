<script setup lang="ts">
import { computed, ref } from 'vue';
import AlertBanner from '../common/AlertBanner.vue';
import BaseButton from '../common/BaseButton.vue';
import FormErrorSummary from '../common/FormErrorSummary.vue';
import FormField from '../common/FormField.vue';
import {
  isSexSplitKind,
  type IndicatorTableKind,
} from '../../stores/indicatorTables.store';
import { CELL_INPUT_CLASSES, INPUT_CLASSES } from '../../utils/formStyles';
import type { FailureKind } from '../../utils/userMessages';

/**
 * "Tambah baris" for an existing matrix table (SPEC §4). A separate `<form>` next to
 * `TableIndicatorForm`, not nested in it: Enter here must add a row, never save the table header.
 *
 * The cell columns follow the kind: sex-split kinds get male and female (total is derived on
 * read), the rest get a single total. A blank cell means "not recorded yet" and is sent as null.
 * The row key is not typed; the view derives it from the label.
 */

export interface TableRowAddPayload {
  label: string;
  male: number | null;
  female: number | null;
  total: number | null;
}

export interface TableRowAddFormProps {
  kind: IndicatorTableKind;
  busy?: boolean;
  serverError?: string;
  serverErrorKind?: FailureKind | null;
  idPrefix?: string;
}

const props = withDefaults(defineProps<TableRowAddFormProps>(), {
  busy: false,
  serverError: '',
  serverErrorKind: null,
  idPrefix: 'table-row-add',
});

const emit = defineEmits<{
  (e: 'submit', payload: TableRowAddPayload): void;
}>();

interface RowDraft {
  label: string;
  male: string;
  female: string;
  total: string;
}

const draft = ref<RowDraft>({ label: '', male: '', female: '', total: '' });
const submitted = ref(false);

const fieldId = (name: string): string => `${props.idPrefix}-${name}`;
const sexSplit = computed(() => isSexSplitKind(props.kind));

function validateCell(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (!/^\d+$/.test(trimmed)) return `${label} harus berupa bilangan bulat 0 atau lebih.`;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed > 2147483647) {
    return `${label} terlalu besar (maksimal 2147483647).`;
  }
  return undefined;
}

const fieldErrors = computed<Record<string, string | undefined>>(() => {
  const d = draft.value;
  const label = d.label.trim();
  const errors: Record<string, string | undefined> = {
    label:
      label === ''
        ? 'Label baris wajib diisi.'
        : label.length > 255
          ? 'Label baris maksimal 255 karakter.'
          : undefined,
  };
  if (sexSplit.value) {
    errors.male = validateCell(d.male, 'Laki-laki');
    errors.female = validateCell(d.female, 'Perempuan');
  } else {
    errors.total = validateCell(d.total, 'Total');
  }
  return errors;
});

const fieldOrder = computed(() =>
  sexSplit.value ? ['label', 'male', 'female'] : ['label', 'total'],
);

const errorEntries = computed(() =>
  fieldOrder.value
    .map((name) => ({ fieldId: fieldId(name), message: fieldErrors.value[name] }))
    .filter((entry): entry is { fieldId: string; message: string } => Boolean(entry.message)),
);

const summaryErrors = computed(() => (submitted.value ? errorEntries.value : []));

function errorFor(name: string): string | undefined {
  return submitted.value ? fieldErrors.value[name] : undefined;
}

function parseCell(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  const d = draft.value;
  emit('submit', {
    label: d.label.trim(),
    male: sexSplit.value ? parseCell(d.male) : null,
    female: sexSplit.value ? parseCell(d.female) : null,
    total: sexSplit.value ? null : parseCell(d.total),
  });
}

/** Clears the draft after the parent confirms the row was added. */
function reset(): void {
  draft.value = { label: '', male: '', female: '', total: '' };
  submitted.value = false;
}

defineExpose({ reset });
</script>

<template>
  <form class="space-y-4" novalidate data-test="table-row-add" @submit.prevent="handleSubmit">
    <h3 class="text-brand-navy text-sm font-semibold tracking-wide uppercase">Tambah Baris</h3>

    <AlertBanner
      v-if="serverError"
      :message="serverError"
      :kind="serverErrorKind ?? undefined"
      data-test="row-add-server-error"
    />

    <FormErrorSummary v-if="summaryErrors.length > 0" :errors="summaryErrors" />

    <FormField
      :id="fieldId('label')"
      label="Label Baris"
      required
      :error="errorFor('label')"
      v-slot="{ describedBy, invalid }"
    >
      <input
        :id="fieldId('label')"
        v-model="draft.label"
        type="text"
        maxlength="255"
        :disabled="busy"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      />
    </FormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <template v-if="sexSplit">
        <FormField
          :id="fieldId('male')"
          label="Laki-laki (opsional)"
          :error="errorFor('male')"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('male')"
            v-model="draft.male"
            type="text"
            inputmode="numeric"
            :disabled="busy"
            :class="CELL_INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
        <FormField
          :id="fieldId('female')"
          label="Perempuan (opsional)"
          :error="errorFor('female')"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('female')"
            v-model="draft.female"
            type="text"
            inputmode="numeric"
            :disabled="busy"
            :class="CELL_INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
      </template>
      <FormField
        v-else
        :id="fieldId('total')"
        label="Total (opsional)"
        :error="errorFor('total')"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('total')"
          v-model="draft.total"
          type="text"
          inputmode="numeric"
          :disabled="busy"
          :class="CELL_INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>
    </div>

    <div class="flex justify-end">
      <BaseButton type="submit" variant="secondary" size="md" :disabled="busy">
        {{ busy ? 'Menambah…' : 'Tambah baris' }}
      </BaseButton>
    </div>
  </form>
</template>
