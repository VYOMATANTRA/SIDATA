<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FormField from '../common/FormField.vue';
import FormErrorSummary from '../common/FormErrorSummary.vue';
import BaseButton from '../common/BaseButton.vue';
import type { Indicator, IndicatorPatch } from '../../stores/indicators.store';
import { CHECKBOX_CLASSES, INPUT_CLASSES } from '../../utils/formStyles';

/**
 * Editor/admin form for a scalar indicator figure (SPEC §4, §7).
 *
 * The previous-year pair is gated behind a checkbox rather than always shown, mirroring the
 * wireframe: most figures have no tahun-lalu counterpart, and the backend rejects a half-filled
 * pair (`value_previous` and `period_previous` must be present together or absent together), so
 * an explicit opt-in is also the honest UI. SPEC §5 additionally forbids clearing the pair while
 * a tier-1 comparison template is still attached — see `buildPatch`.
 */

export interface ScalarIndicatorFormProps {
  indicator: Indicator;
  busy?: boolean;
  /** Message returned by the API (conflict, validation, network). */
  serverError?: string;
  /** Prefix for control ids; override only when two forms can be mounted at once. */
  idPrefix?: string;
}

const props = withDefaults(defineProps<ScalarIndicatorFormProps>(), {
  busy: false,
  serverError: '',
  idPrefix: 'indicator',
});

const emit = defineEmits<{
  (e: 'submit', patch: IndicatorPatch): void;
  (e: 'cancel'): void;
}>();

// Mirrors the backend's Decimal(18,4) guard (indicators.service.ts) so the user sees the same
// rule before the request is sent, instead of a round-trip 400.
const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

interface DraftState {
  label: string;
  unit: string;
  valueCurrent: string;
  periodCurrent: string;
  comparisonEnabled: boolean;
  valuePrevious: string;
  periodPrevious: string;
  source: string;
  hedgeNote: string;
  isStale: boolean;
}

const draft = ref<DraftState>(createDraft(props.indicator));
const submitted = ref(false);

function createDraft(indicator: Indicator): DraftState {
  return {
    label: indicator.label,
    unit: indicator.unit ?? '',
    valueCurrent: indicator.valueCurrent,
    periodCurrent: indicator.periodCurrent,
    comparisonEnabled: indicator.valuePrevious !== null && indicator.periodPrevious !== null,
    valuePrevious: indicator.valuePrevious ?? '',
    periodPrevious: indicator.periodPrevious ?? '',
    source: indicator.source ?? '',
    hedgeNote: indicator.hedgeNote ?? '',
    isStale: indicator.isStale,
  };
}

watch(
  () => props.indicator,
  (next) => {
    draft.value = createDraft(next);
    submitted.value = false;
  },
);

const fieldId = (name: string): string => `${props.idPrefix}-${name}`;

const hasAttachedTemplate = computed(() => props.indicator.comparisonTemplateId !== null);

/** SPEC §5/§7: the pair only exists as a pair; a lone half is never a valid state. */
function validateDecimal(value: string, required: boolean, label: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return required ? `${label} wajib diisi.` : undefined;
  }
  if (!DECIMAL_RE.test(trimmed)) {
    return `${label} harus berupa angka desimal (maksimal 14 digit bulat, 4 digit desimal).`;
  }
  return undefined;
}

function validateLength(value: string, max: number, label: string): string | undefined {
  return value.trim().length > max ? `${label} maksimal ${max} karakter.` : undefined;
}

function validateRequired(value: string, label: string): string | undefined {
  return value.trim() === '' ? `${label} wajib diisi.` : undefined;
}

const fieldErrors = computed<Record<string, string | undefined>>(() => {
  const comparisonOn = draft.value.comparisonEnabled;
  return {
    label: validateRequired(draft.value.label, 'Label indikator'),
    unit: validateLength(draft.value.unit, 32, 'Satuan'),
    valueCurrent: validateDecimal(draft.value.valueCurrent, true, 'Nilai sekarang'),
    periodCurrent:
      validateRequired(draft.value.periodCurrent, 'Periode sekarang') ??
      validateLength(draft.value.periodCurrent, 64, 'Periode sekarang'),
    valuePrevious: comparisonOn
      ? validateDecimal(draft.value.valuePrevious, true, 'Nilai tahun lalu')
      : undefined,
    periodPrevious: comparisonOn
      ? (validateRequired(draft.value.periodPrevious, 'Periode tahun lalu') ??
        validateLength(draft.value.periodPrevious, 64, 'Periode tahun lalu'))
      : undefined,
    source: validateLength(draft.value.source, 2000, 'Sumber'),
    hedgeNote: validateLength(draft.value.hedgeNote, 2000, 'Catatan kehati-hatian'),
  };
});

const fieldOrder = [
  'label',
  'unit',
  'valueCurrent',
  'periodCurrent',
  'valuePrevious',
  'periodPrevious',
  'source',
  'hedgeNote',
];

const errorEntries = computed(() =>
  fieldOrder
    .map((name) => ({ fieldId: fieldId(name), message: fieldErrors.value[name] }))
    .filter((entry): entry is { fieldId: string; message: string } => Boolean(entry.message)),
);

const showErrors = computed(() => submitted.value && errorEntries.value.length > 0);

const summaryErrors = computed(() => (showErrors.value ? errorEntries.value : []));

function isEmptyPayloadValue(value: string): boolean {
  return value.trim() === '';
}

/**
 * Sends every editable field (the service diffs and no-ops unchanged ones, so there is no
 * benefit to sending a sparse patch). The previous-year pair is encoded as:
 *
 * - pair on  → send `valuePrevious`/`periodPrevious`; leave `isComputedComparison` untouched.
 * - pair off → pair values null.
 *
 * `isComputedComparison` is **not** derived from the checkbox. SPEC §5 restricts tier-1 to
 * specific indicators (Jumlah Penduduk, Jumlah Keluarga), and a row may legitimately carry a
 * previous-year pair without being flagged computed. Sending `isComputedComparison: comparisonOn`
 * on every save would flip the flag on an unrelated edit and write an audit diff nobody intended.
 *
 * The one case where the flag must be sent is clearing it: the service rejects
 * `is_computed_comparison` with an empty pair ("membutuhkan value_previous"), and a stored row
 * can legitimately be flagged computed with no pair (computed, no template, no pair yet).
 *
 * - pair off on an indicator that has a template → `comparisonTemplateId: null` in the same
 *   request, which SPEC §5 requires (a template may not outlive its pair).
 */
function buildPatch(): IndicatorPatch {
  const comparisonOn = draft.value.comparisonEnabled;
  const patch: IndicatorPatch = {
    label: draft.value.label.trim(),
    unit: isEmptyPayloadValue(draft.value.unit) ? null : draft.value.unit.trim(),
    valueCurrent: draft.value.valueCurrent.trim(),
    periodCurrent: draft.value.periodCurrent.trim(),
    valuePrevious: comparisonOn ? draft.value.valuePrevious.trim() : null,
    periodPrevious: comparisonOn ? draft.value.periodPrevious.trim() : null,
    isStale: draft.value.isStale,
    source: isEmptyPayloadValue(draft.value.source) ? null : draft.value.source.trim(),
    hedgeNote: isEmptyPayloadValue(draft.value.hedgeNote) ? null : draft.value.hedgeNote.trim(),
  };
  if (!comparisonOn && props.indicator.isComputedComparison) {
    patch.isComputedComparison = false;
  }
  if (!comparisonOn && hasAttachedTemplate.value) {
    patch.comparisonTemplateId = null;
  }
  return patch;
}

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  emit('submit', buildPatch());
}
</script>

<template>
  <form class="space-y-6" novalidate @submit.prevent="handleSubmit">
    <FormErrorSummary
      v-if="summaryErrors.length > 0 || serverError"
      :errors="summaryErrors"
      :form-error="serverError"
    />

    <fieldset class="space-y-4">
      <legend class="text-brand-navy text-sm font-semibold tracking-wide uppercase">
        Identitas Indikator
      </legend>

      <FormField
        :id="fieldId('label')"
        label="Indikator"
        required
        :error="submitted ? fieldErrors.label : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('label')"
          v-model="draft.label"
          type="text"
          maxlength="500"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>

      <FormField
        :id="fieldId('unit')"
        label="Satuan (opsional)"
        hint="Misalnya jiwa, KK, atau persen. Dipakai pada kalimat perbandingan otomatis."
        :error="submitted ? fieldErrors.unit : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('unit')"
          v-model="draft.unit"
          type="text"
          maxlength="32"
          class="sm:max-w-xs"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>
    </fieldset>

    <fieldset class="space-y-4">
      <legend class="text-brand-navy text-sm font-semibold tracking-wide uppercase">
        Nilai &amp; Periode Saat Ini
      </legend>

      <div class="grid gap-4 sm:grid-cols-2">
        <FormField
          :id="fieldId('value-current')"
          label="Nilai Sekarang"
          required
          :error="submitted ? fieldErrors.valueCurrent : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('value-current')"
            v-model="draft.valueCurrent"
            type="text"
            inputmode="decimal"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>

        <FormField
          :id="fieldId('period-current')"
          label="Periode Sekarang"
          required
          :error="submitted ? fieldErrors.periodCurrent : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('period-current')"
            v-model="draft.periodCurrent"
            type="text"
            maxlength="64"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset class="rounded-card border border-slate-200 bg-slate-50/70 p-4">
      <legend class="text-brand-navy px-1 text-sm font-semibold tracking-wide uppercase">
        Nilai Pembanding Tahun Lalu
      </legend>

      <div class="mt-1 flex items-start gap-3">
        <input
          :id="fieldId('comparison-enabled')"
          v-model="draft.comparisonEnabled"
          type="checkbox"
          :class="CHECKBOX_CLASSES"
          class="mt-0.5"
        />
        <label :for="fieldId('comparison-enabled')" class="text-sm font-medium text-slate-800">
          Aktifkan Nilai Pembanding Tahun Lalu
        </label>
      </div>

      <p class="mt-1.5 text-xs leading-snug text-slate-500">
        Aktifkan hanya bila ada angka tahun lalu yang benar-benar sebanding. Angka ini disimpan
        sebagai pembanding; kalimat perbandingan otomatis hanya dirender pada indikator yang sudah
        memakai template perbandingan.
      </p>

      <p
        v-if="indicator.isComputedComparison"
        class="rounded-btn mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
        data-test="computed-note"
      >
        Indikator ini sudah ditandai sebagai perbandingan terkomputasi. Menonaktifkan pembanding
        akan menghapus tanda tersebut.
      </p>

      <p
        v-if="hasAttachedTemplate && draft.comparisonEnabled"
        class="rounded-btn mt-2 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        data-test="template-detach-warning"
      >
        Indikator ini memakai template perbandingan. Menonaktifkan pembanding akan melepas template
        tersebut, karena template tidak boleh dibiarkan tanpa angka pembanding.
      </p>

      <div v-if="draft.comparisonEnabled" class="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField
          :id="fieldId('value-previous')"
          label="Nilai Tahun Lalu"
          required
          :error="submitted ? fieldErrors.valuePrevious : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('value-previous')"
            v-model="draft.valuePrevious"
            type="text"
            inputmode="decimal"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>

        <FormField
          :id="fieldId('period-previous')"
          label="Periode Tahun Lalu"
          required
          :error="submitted ? fieldErrors.periodPrevious : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('period-previous')"
            v-model="draft.periodPrevious"
            type="text"
            maxlength="64"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
      </div>

      <p
        v-if="indicator.comparison"
        class="rounded-btn mt-3 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
        data-test="comparison-preview"
      >
        <span class="font-medium text-slate-700">Kalimat perbandingan saat ini:</span>
        “{{ indicator.comparison.text }}”
      </p>
    </fieldset>

    <fieldset class="space-y-4">
      <legend class="text-brand-navy text-sm font-semibold tracking-wide uppercase">
        Sumber, Catatan &amp; Status
      </legend>

      <FormField
        :id="fieldId('source')"
        label="Sumber Data"
        hint="Asal angka, misalnya Prodeskel atau sensus kelurahan."
        :error="submitted ? fieldErrors.source : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('source')"
          v-model="draft.source"
          type="text"
          maxlength="2000"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>

      <FormField
        :id="fieldId('hedge-note')"
        label="Catatan Kehati-hatian (opsional)"
        hint="Ditampilkan bersama angka agar klaim tidak dibaca berlebihan, misalnya penanda periode data."
        :error="submitted ? fieldErrors.hedgeNote : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <textarea
          :id="fieldId('hedge-note')"
          v-model="draft.hedgeNote"
          rows="2"
          maxlength="2000"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>

      <div class="rounded-card flex items-start gap-3 border border-slate-200 bg-slate-50/70 p-4">
        <input
          :id="fieldId('is-stale')"
          v-model="draft.isStale"
          type="checkbox"
          :class="CHECKBOX_CLASSES"
          class="mt-0.5"
        />
        <div>
          <label :for="fieldId('is-stale')" class="text-sm font-medium text-slate-800">
            Tandai sebagai data berumur (stale)
          </label>
          <p class="mt-1 text-xs leading-snug text-slate-500">
            Pakai untuk angka lama yang belum diperbarui, misalnya data Potensi Juni 2024 tanpa
            pembanding tahun lalu.
          </p>
        </div>
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
