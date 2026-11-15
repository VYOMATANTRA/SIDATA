<script setup lang="ts">
import { computed, ref } from 'vue';
import AlertBanner from '../common/AlertBanner.vue';
import BaseButton from '../common/BaseButton.vue';
import FormErrorSummary from '../common/FormErrorSummary.vue';
import FormField from '../common/FormField.vue';
import SectionPicker from './SectionPicker.vue';
import {
  INDICATOR_TABLE_KIND_META,
  INDICATOR_TABLE_KINDS,
  type IndicatorTableCreateInput,
  type IndicatorTableKind,
} from '../../stores/indicatorTables.store';
import type { IndicatorCreateInput } from '../../stores/indicators.store';
import { CHECKBOX_CLASSES, INPUT_CLASSES } from '../../utils/formStyles';
import type { FailureKind } from '../../utils/userMessages';

/**
 * "Tambah Data" form (SPEC §4): one dialog for a scalar indicator or an empty matrix table.
 *
 * The operator picks the type and the section, then fills only that type's fields. A matrix
 * table is created with no rows; the view then opens `TableIndicatorForm` for it. The slug is not
 * typed here: the view derives it from the label or title at save time (see `utils/slug.ts`).
 *
 * The draft lives in this component, so a failed save (which only changes `serverError`) leaves
 * every field as typed. The parent unmounts the form on close, which discards the draft on purpose.
 */

export type CreateDataPayload =
  | {
      type: 'skalar';
      sectionId: string;
      input: Omit<IndicatorCreateInput, 'sectionId' | 'slug'>;
    }
  | {
      type: 'matriks';
      sectionId: string;
      input: Omit<IndicatorTableCreateInput, 'sectionId' | 'slug'>;
    };

export interface CreateDataFormProps {
  busy?: boolean;
  /** Approved failure text from the parent (AlertBanner), already worded for a failed save. */
  serverError?: string;
  serverErrorKind?: FailureKind | null;
  idPrefix?: string;
}

const props = withDefaults(defineProps<CreateDataFormProps>(), {
  busy: false,
  serverError: '',
  serverErrorKind: null,
  idPrefix: 'create-data',
});

const emit = defineEmits<{
  (e: 'submit', payload: CreateDataPayload): void;
  (e: 'cancel'): void;
}>();

type DataType = 'skalar' | 'matriks';

interface DraftState {
  type: DataType;
  sectionId: string;
  label: string;
  unit: string;
  valueCurrent: string;
  periodCurrent: string;
  comparisonEnabled: boolean;
  valuePrevious: string;
  periodPrevious: string;
  kind: IndicatorTableKind | '';
  title: string;
  period: string;
  source: string;
}

// Same rule as the backend's Decimal(18,4) guard and ScalarIndicatorForm, so the operator sees it
// before a round-trip.
const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

const draft = ref<DraftState>({
  type: 'skalar',
  sectionId: '',
  label: '',
  unit: '',
  valueCurrent: '',
  periodCurrent: '',
  comparisonEnabled: false,
  valuePrevious: '',
  periodPrevious: '',
  kind: '',
  title: '',
  period: '',
  source: '',
});
const submitted = ref(false);

const fieldId = (name: string): string => `${props.idPrefix}-${name}`;
const isScalar = computed(() => draft.value.type === 'skalar');
const isMatrix = computed(() => draft.value.type === 'matriks');

const kindOptions = INDICATOR_TABLE_KINDS.map((kind) => ({
  value: kind,
  label: INDICATOR_TABLE_KIND_META[kind].label,
}));

const selectedKindDescription = computed(() =>
  draft.value.kind === '' ? '' : INDICATOR_TABLE_KIND_META[draft.value.kind].description,
);

function validateRequired(value: string, label: string): string | undefined {
  return value.trim() === '' ? `${label} wajib diisi.` : undefined;
}

function validateLength(value: string, max: number, label: string): string | undefined {
  return value.trim().length > max ? `${label} maksimal ${max} karakter.` : undefined;
}

function validateDecimal(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return `${label} wajib diisi.`;
  if (!DECIMAL_RE.test(trimmed)) {
    return `${label} harus berupa angka desimal dengan titik (mis. 12.5), maksimal 14 digit bulat dan 4 digit desimal.`;
  }
  return undefined;
}

/** Per-field messages for the fields of the selected type only. */
const fieldErrors = computed<Record<string, string | undefined>>(() => {
  const d = draft.value;
  const errors: Record<string, string | undefined> = {
    sectionId: validateRequired(d.sectionId, 'Bagian'),
  };
  if (isScalar.value) {
    errors.label =
      validateRequired(d.label, 'Label indikator') ??
      validateLength(d.label, 500, 'Label indikator');
    errors.unit = validateLength(d.unit, 32, 'Satuan');
    errors.valueCurrent = validateDecimal(d.valueCurrent, 'Nilai sekarang');
    errors.periodCurrent =
      validateRequired(d.periodCurrent, 'Periode sekarang') ??
      validateLength(d.periodCurrent, 64, 'Periode sekarang');
    if (d.comparisonEnabled) {
      errors.valuePrevious = validateDecimal(d.valuePrevious, 'Nilai tahun lalu');
      errors.periodPrevious =
        validateRequired(d.periodPrevious, 'Periode tahun lalu') ??
        validateLength(d.periodPrevious, 64, 'Periode tahun lalu');
    }
    errors.source = validateLength(d.source, 2000, 'Sumber data');
  } else {
    errors.kind = d.kind === '' ? 'Pilih jenis tabel terlebih dahulu.' : undefined;
    errors.title =
      validateRequired(d.title, 'Judul tabel') ?? validateLength(d.title, 255, 'Judul tabel');
    errors.period =
      validateRequired(d.period, 'Periode') ?? validateLength(d.period, 64, 'Periode');
    errors.source = validateLength(d.source, 2000, 'Sumber data');
  }
  return errors;
});

/** Field order for the summary and for focus; only the fields of the selected type are listed. */
const fieldOrder = computed(() =>
  isScalar.value
    ? ['sectionId', 'label', 'unit', 'valueCurrent', 'periodCurrent', 'valuePrevious', 'periodPrevious', 'source']
    : ['sectionId', 'kind', 'title', 'period', 'source'],
);

/** The section error is announced against the last select of SectionPicker (Bagian). */
const sectionSelectId = (): string => `${fieldId('lokasi')}-section`;

const errorEntries = computed(() =>
  fieldOrder.value
    .map((name) => ({
      fieldId: name === 'sectionId' ? sectionSelectId() : fieldId(name),
      message: fieldErrors.value[name],
    }))
    .filter((entry): entry is { fieldId: string; message: string } => Boolean(entry.message)),
);

const summaryErrors = computed(() => (submitted.value ? errorEntries.value : []));

function errorFor(name: string): string | undefined {
  return submitted.value ? fieldErrors.value[name] : undefined;
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function buildPayload(): CreateDataPayload {
  const d = draft.value;
  if (d.type === 'skalar') {
    const comparisonOn = d.comparisonEnabled;
    return {
      type: 'skalar',
      sectionId: d.sectionId,
      input: {
        label: d.label.trim(),
        unit: trimmedOrNull(d.unit),
        valueCurrent: d.valueCurrent.trim(),
        periodCurrent: d.periodCurrent.trim(),
        // The pair is sent together or not at all (the service rejects a half pair).
        valuePrevious: comparisonOn ? d.valuePrevious.trim() : null,
        periodPrevious: comparisonOn ? d.periodPrevious.trim() : null,
        source: trimmedOrNull(d.source),
      },
    };
  }
  return {
    type: 'matriks',
    sectionId: d.sectionId,
    input: {
      title: d.title.trim(),
      kind: d.kind as IndicatorTableKind,
      period: d.period.trim(),
      source: trimmedOrNull(d.source),
    },
  };
}

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  emit('submit', buildPayload());
}
</script>

<template>
  <form class="space-y-6" novalidate @submit.prevent="handleSubmit">
    <AlertBanner
      v-if="serverError"
      :message="serverError"
      :kind="serverErrorKind ?? undefined"
      data-test="create-server-error"
    />

    <FormErrorSummary v-if="summaryErrors.length > 0" :errors="summaryErrors" />

    <fieldset class="space-y-3">
      <legend class="text-brand-navy text-sm font-semibold tracking-wide uppercase">
        Jenis Data
      </legend>

      <div class="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <div class="flex items-center gap-2">
          <input
            :id="fieldId('type-skalar')"
            v-model="draft.type"
            type="radio"
            name="create-data-type"
            value="skalar"
            :disabled="busy"
            :class="CHECKBOX_CLASSES"
          />
          <label :for="fieldId('type-skalar')" class="text-sm font-medium text-slate-800">
            Skalar (satu angka)
          </label>
        </div>
        <div class="flex items-center gap-2">
          <input
            :id="fieldId('type-matriks')"
            v-model="draft.type"
            type="radio"
            name="create-data-type"
            value="matriks"
            :disabled="busy"
            :class="CHECKBOX_CLASSES"
          />
          <label :for="fieldId('type-matriks')" class="text-sm font-medium text-slate-800">
            Matriks (tabel)
          </label>
        </div>
      </div>
    </fieldset>

    <SectionPicker
      v-model="draft.sectionId"
      :id-prefix="fieldId('lokasi')"
      :disabled="busy"
      :error="errorFor('sectionId')"
    />

    <fieldset v-if="isScalar" class="space-y-4" data-test="scalar-fields">
      <legend class="text-brand-navy text-sm font-semibold tracking-wide uppercase">
        Isi Indikator
      </legend>

      <FormField
        :id="fieldId('label')"
        label="Label Indikator"
        required
        :error="errorFor('label')"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('label')"
          v-model="draft.label"
          type="text"
          maxlength="500"
          :disabled="busy"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <FormField
          :id="fieldId('unit')"
          label="Satuan (opsional)"
          hint="Misalnya jiwa, KK, atau persen."
          :error="errorFor('unit')"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('unit')"
            v-model="draft.unit"
            type="text"
            maxlength="32"
            :disabled="busy"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>

        <FormField
          :id="fieldId('period-current')"
          label="Periode Sekarang"
          required
          hint="Misalnya 2026 atau Juni 2024."
          :error="errorFor('periodCurrent')"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('period-current')"
            v-model="draft.periodCurrent"
            type="text"
            maxlength="64"
            :disabled="busy"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
      </div>

      <FormField
        :id="fieldId('value-current')"
        label="Nilai Sekarang"
        required
        hint="Pakai titik sebagai pemisah desimal, misalnya 12.5 (bukan 12,5)."
        :error="errorFor('valueCurrent')"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('value-current')"
          v-model="draft.valueCurrent"
          type="text"
          inputmode="decimal"
          :disabled="busy"
          :class="INPUT_CLASSES"
          class="sm:max-w-xs"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>

      <div class="rounded-card border border-slate-200 bg-slate-50/70 p-4">
        <div class="flex items-start gap-3">
          <input
            :id="fieldId('comparison-enabled')"
            v-model="draft.comparisonEnabled"
            type="checkbox"
            :disabled="busy"
            :class="CHECKBOX_CLASSES"
            class="mt-0.5"
          />
          <label
            :for="fieldId('comparison-enabled')"
            class="text-sm font-medium text-slate-800"
          >
            Ada nilai tahun lalu untuk dibandingkan
          </label>
        </div>

        <div v-if="draft.comparisonEnabled" class="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField
            :id="fieldId('value-previous')"
            label="Nilai Tahun Lalu"
            required
            hint="Pakai titik sebagai pemisah desimal."
            :error="errorFor('valuePrevious')"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="fieldId('value-previous')"
              v-model="draft.valuePrevious"
              type="text"
              inputmode="decimal"
              :disabled="busy"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            />
          </FormField>

          <FormField
            :id="fieldId('period-previous')"
            label="Periode Tahun Lalu"
            required
            :error="errorFor('periodPrevious')"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="fieldId('period-previous')"
              v-model="draft.periodPrevious"
              type="text"
              maxlength="64"
              :disabled="busy"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            />
          </FormField>
        </div>
      </div>

      <FormField
        :id="fieldId('source')"
        label="Sumber Data (opsional)"
        hint="Asal angka, misalnya Prodeskel atau sensus kelurahan."
        :error="errorFor('source')"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('source')"
          v-model="draft.source"
          type="text"
          maxlength="2000"
          :disabled="busy"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>
    </fieldset>

    <fieldset v-else-if="isMatrix" class="space-y-4" data-test="matrix-fields">
      <legend class="text-brand-navy text-sm font-semibold tracking-wide uppercase">
        Isi Tabel
      </legend>

      <p class="text-text-muted rounded-btn border border-slate-200 bg-white px-3 py-2 text-xs">
        Tabel dibuat tanpa baris. Setelah disimpan, formulir tabel langsung terbuka.
      </p>

      <FormField
        :id="fieldId('kind')"
        label="Jenis Tabel"
        required
        :hint="selectedKindDescription || undefined"
        :error="errorFor('kind')"
        v-slot="{ describedBy, invalid }"
      >
        <select
          :id="fieldId('kind')"
          v-model="draft.kind"
          :disabled="busy"
          :class="INPUT_CLASSES"
          class="sm:max-w-md"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        >
          <option value="">Pilih jenis tabel</option>
          <option v-for="option in kindOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </FormField>

      <FormField
        :id="fieldId('title')"
        label="Judul Tabel"
        required
        :error="errorFor('title')"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('title')"
          v-model="draft.title"
          type="text"
          maxlength="255"
          :disabled="busy"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <FormField
          :id="fieldId('period')"
          label="Periode"
          required
          hint="Misalnya Juni 2024."
          :error="errorFor('period')"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('period')"
            v-model="draft.period"
            type="text"
            maxlength="64"
            :disabled="busy"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>

        <FormField
          :id="fieldId('source')"
          label="Sumber Data (opsional)"
          :error="errorFor('source')"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('source')"
            v-model="draft.source"
            type="text"
            maxlength="2000"
            :disabled="busy"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
      </div>
    </fieldset>

    <div
      class="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"
    >
      <BaseButton variant="secondary" size="md" :disabled="busy" @click="emit('cancel')">
        Batal
      </BaseButton>
      <BaseButton type="submit" size="md" :disabled="busy">
        {{ busy ? 'Menyimpan…' : 'Simpan' }}
      </BaseButton>
    </div>
  </form>
</template>
