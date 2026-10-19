<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FormField from '../common/FormField.vue';
import FormErrorSummary from '../common/FormErrorSummary.vue';
import BaseButton from '../common/BaseButton.vue';
import {
  INDICATOR_TABLE_KIND_META,
  isSexSplitKind,
  type IndicatorTableDetail,
  type IndicatorTablePatch,
  type IndicatorTableRow,
  type IndicatorTableRowPatch,
} from '../../stores/indicatorTables.store';
import { CELL_INPUT_CLASSES, INPUT_CLASSES } from '../../utils/formStyles';

/**
 * Editor/admin form for the four fixed-shape matrix tables (SPEC §4, §7).
 *
 * Two shapes, one component: sex-split kinds (`age_pyramid`, `religion_by_sex`) edit
 * `male`/`female` and derive `total`; single-value kinds (`ethnicity`, `occupation`) edit
 * `total`. Sending the wrong shape returns a 400 from `assertRowCells`, so the form validates
 * it locally first.
 *
 * Kept a real `<table>` with `<th scope>` per `docs/ACCESSIBILITY.md` §2 — never a div grid.
 * On narrow screens the wrapper scrolls horizontally and the row-header column is sticky, so
 * the label you are editing stays visible.
 */

export interface TableSavePayload {
  table: IndicatorTablePatch;
  rows: Array<{ rowId: string; patch: IndicatorTableRowPatch }>;
}

export interface TableIndicatorFormProps {
  table: IndicatorTableDetail;
  busy?: boolean;
  serverError?: string;
  idPrefix?: string;
}

const props = withDefaults(defineProps<TableIndicatorFormProps>(), {
  busy: false,
  serverError: '',
  idPrefix: 'table',
});

const emit = defineEmits<{
  (e: 'submit', payload: TableSavePayload): void;
  (e: 'cancel'): void;
}>();

interface RowDraft {
  label: string;
  male: string;
  female: string;
  total: string;
}

interface TableDraft {
  title: string;
  period: string;
  source: string;
}

const tableDraft = ref<TableDraft>({ title: '', period: '', source: '' });
const rowDrafts = ref<Record<string, RowDraft>>({});
const submitted = ref(false);

const sexSplit = computed(() => isSexSplitKind(props.table.kind));
const kindMeta = computed(() => INDICATOR_TABLE_KIND_META[props.table.kind]);

function resetDrafts(table: IndicatorTableDetail): void {
  tableDraft.value = {
    title: table.title,
    period: table.period,
    source: table.source ?? '',
  };
  const next: Record<string, RowDraft> = {};
  for (const row of table.rows) {
    next[row.id] = {
      label: row.label,
      male: row.male === null ? '' : String(row.male),
      female: row.female === null ? '' : String(row.female),
      total: row.total === null ? '' : String(row.total),
    };
  }
  rowDrafts.value = next;
  submitted.value = false;
}

watch(() => props.table, resetDrafts, { immediate: true });

const fieldId = (name: string): string => `${props.idPrefix}-${name}`;
const rowFieldId = (rowId: string, cell: string): string =>
  `${props.idPrefix}-row-${rowId}-${cell}`;

const numberFormatter = new Intl.NumberFormat('id-ID');

function formatNumber(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value);
}

/** Parses a validated cell draft; `null` when the field is blank. */
function parseCell(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateRequired(value: string, label: string): string | undefined {
  return value.trim() === '' ? `${label} wajib diisi.` : undefined;
}

function validateLength(value: string, max: number, label: string): string | undefined {
  return value.trim().length > max ? `${label} maksimal ${max} karakter.` : undefined;
}

/** Mirrors the service's `nonnegInt` cell rule (integer, 0..2147483647). */
function validateCell(value: string, required: boolean, label: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return required ? `${label} wajib diisi.` : undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    return `${label} harus berupa bilangan bulat 0 atau lebih.`;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed > 2147483647) {
    return `${label} terlalu besar (maksimal 2147483647).`;
  }
  return undefined;
}

interface ErrorEntry {
  fieldId: string;
  message: string;
}

const errorEntries = computed<ErrorEntry[]>(() => {
  const entries: ErrorEntry[] = [];

  const push = (fieldIdValue: string, message: string | undefined) => {
    if (message) entries.push({ fieldId: fieldIdValue, message });
  };

  push(
    fieldId('title'),
    validateRequired(tableDraft.value.title, 'Judul tabel') ??
      validateLength(tableDraft.value.title, 255, 'Judul tabel'),
  );
  push(
    fieldId('period'),
    validateRequired(tableDraft.value.period, 'Periode') ??
      validateLength(tableDraft.value.period, 64, 'Periode'),
  );
  push(fieldId('source'), validateLength(tableDraft.value.source, 2000, 'Sumber data'));

  for (const row of props.table.rows) {
    const draft = rowDrafts.value[row.id];
    if (!draft) continue;
    const rowLabel = draft.label.trim() || row.label;
    push(
      rowFieldId(row.id, 'label'),
      validateRequired(draft.label, 'Label baris') ??
        validateLength(draft.label, 255, 'Label baris'),
    );
    if (sexSplit.value) {
      push(rowFieldId(row.id, 'male'), validateCell(draft.male, true, `Laki-laki (${rowLabel})`));
      push(
        rowFieldId(row.id, 'female'),
        validateCell(draft.female, true, `Perempuan (${rowLabel})`),
      );
    } else {
      push(rowFieldId(row.id, 'total'), validateCell(draft.total, true, `Total (${rowLabel})`));
    }
  }

  return entries;
});

const summaryErrors = computed(() => (submitted.value ? errorEntries.value : []));

/** Live totals from the drafts, not the server — a stale footer while editing would mislead. */
const liveTotals = computed(() => {
  let male = 0;
  let female = 0;
  let total = 0;

  for (const row of props.table.rows) {
    const draft = rowDrafts.value[row.id];
    if (!draft) continue;
    if (sexSplit.value) {
      male += parseCell(draft.male) ?? 0;
      female += parseCell(draft.female) ?? 0;
    } else {
      total += parseCell(draft.total) ?? 0;
    }
  }

  return sexSplit.value
    ? { male, female, total: male + female }
    : { male: null, female: null, total };
});

function derivedRowTotal(row: IndicatorTableRow): number | null {
  const draft = rowDrafts.value[row.id];
  if (!draft) return row.total;
  const male = parseCell(draft.male);
  const female = parseCell(draft.female);
  if (male === null && female === null) return null;
  return (male ?? 0) + (female ?? 0);
}

function buildTablePatch(): IndicatorTablePatch {
  const patch: IndicatorTablePatch = {};
  const title = tableDraft.value.title.trim();
  const period = tableDraft.value.period.trim();
  const source = tableDraft.value.source.trim() === '' ? null : tableDraft.value.source.trim();

  if (title !== props.table.title) patch.title = title;
  if (period !== props.table.period) patch.period = period;
  if (source !== (props.table.source ?? null)) patch.source = source;
  return patch;
}

function buildRowPatch(row: IndicatorTableRow): IndicatorTableRowPatch | null {
  const draft = rowDrafts.value[row.id];
  if (!draft) return null;

  const patch: IndicatorTableRowPatch = {};
  const label = draft.label.trim();
  if (label !== row.label) patch.label = label;

  if (sexSplit.value) {
    const male = parseCell(draft.male);
    const female = parseCell(draft.female);
    if (male !== row.male) patch.male = male;
    if (female !== row.female) patch.female = female;
  } else {
    const total = parseCell(draft.total);
    if (total !== row.total) patch.total = total;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

const changedRows = computed(() =>
  props.table.rows
    .map((row) => ({ rowId: row.id, patch: buildRowPatch(row) }))
    .filter(
      (entry): entry is { rowId: string; patch: IndicatorTableRowPatch } => entry.patch !== null,
    ),
);

const hasChanges = computed(() => {
  return Object.keys(buildTablePatch()).length > 0 || changedRows.value.length > 0;
});

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;
  if (!hasChanges.value) return;

  emit('submit', {
    table: buildTablePatch(),
    rows: changedRows.value,
  });
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
      <legend class="text-sm font-semibold tracking-wide text-brand-navy uppercase">
        Identitas Tabel
      </legend>

      <div
        class="bg-brand-navy/5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card px-4 py-3 text-sm text-slate-700"
      >
        <span class="font-medium text-brand-navy">{{ kindMeta.label }}</span>
        <span
          class="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold tracking-wide text-brand-navy uppercase"
        >
          {{ table.kind }}
        </span>
        <span class="text-xs text-slate-500">{{ kindMeta.description }}</span>
      </div>

      <FormField
        :id="fieldId('title')"
        label="Judul Tabel"
        required
        :error="
          submitted ? errorEntries.find((e) => e.fieldId === fieldId('title'))?.message : undefined
        "
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('title')"
          v-model="tableDraft.title"
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
          hint="Periode tunggal, misalnya Juni 2024."
          :error="
            submitted
              ? errorEntries.find((e) => e.fieldId === fieldId('period'))?.message
              : undefined
          "
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('period')"
            v-model="tableDraft.period"
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
          label="Sumber Data"
          hint="Asal angka, misalnya Prodeskel."
          :error="
            submitted
              ? errorEntries.find((e) => e.fieldId === fieldId('source'))?.message
              : undefined
          "
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('source')"
            v-model="tableDraft.source"
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

    <fieldset>
      <legend class="text-sm font-semibold tracking-wide text-brand-navy uppercase">
        Baris Data
      </legend>
      <p class="mt-1 text-xs text-slate-500">
        {{ table.rows.length }} baris.
        <template v-if="sexSplit">
          Total tiap baris dihitung dari laki-laki + perempuan dan tidak disimpan terpisah.
        </template>
        <template v-else>Setiap baris memakai satu nilai total.</template>
      </p>

      <div class="mt-3 overflow-x-auto rounded-card border border-slate-200">
        <table class="w-full min-w-[34rem] border-collapse text-sm">
          <caption class="sr-only">
            Baris data
            {{
              kindMeta.label
            }},
            {{
              table.period
            }}. Kolom label menempel saat digulir mendatar.
          </caption>
          <thead>
            <tr
              class="bg-slate-100 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase"
            >
              <th scope="col" class="sticky left-0 z-10 bg-slate-100 px-4 py-3 whitespace-nowrap">
                Label
              </th>
              <template v-if="sexSplit">
                <th scope="col" class="px-3 py-3 whitespace-nowrap">Laki-laki</th>
                <th scope="col" class="px-3 py-3 whitespace-nowrap">Perempuan</th>
                <th scope="col" class="px-3 py-3 whitespace-nowrap">Total</th>
              </template>
              <th v-else scope="col" class="px-3 py-3 whitespace-nowrap">Total</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-200">
            <tr v-for="(row, index) in table.rows" :key="row.id" class="align-top">
              <th
                scope="row"
                class="sticky left-0 z-10 min-w-[14rem] bg-white px-4 py-2 text-left font-normal"
              >
                <label :for="rowFieldId(row.id, 'label')" class="sr-only">
                  Label baris {{ index + 1 }}
                </label>
                <input
                  :id="rowFieldId(row.id, 'label')"
                  v-model="rowDrafts[row.id]!.label"
                  type="text"
                  maxlength="255"
                  :disabled="busy"
                  :class="CELL_INPUT_CLASSES"
                  :aria-invalid="
                    submitted && errorEntries.some((e) => e.fieldId === rowFieldId(row.id, 'label'))
                      ? 'true'
                      : undefined
                  "
                />
              </th>

              <template v-if="sexSplit">
                <td class="px-3 py-2">
                  <label :for="rowFieldId(row.id, 'male')" class="sr-only">
                    {{ rowDrafts[row.id]?.label || row.label }} — laki-laki
                  </label>
                  <input
                    :id="rowFieldId(row.id, 'male')"
                    v-model="rowDrafts[row.id]!.male"
                    type="text"
                    inputmode="numeric"
                    :disabled="busy"
                    :class="CELL_INPUT_CLASSES"
                    :aria-invalid="
                      submitted &&
                      errorEntries.some((e) => e.fieldId === rowFieldId(row.id, 'male'))
                        ? 'true'
                        : undefined
                    "
                  />
                </td>
                <td class="px-3 py-2">
                  <label :for="rowFieldId(row.id, 'female')" class="sr-only">
                    {{ rowDrafts[row.id]?.label || row.label }} — perempuan
                  </label>
                  <input
                    :id="rowFieldId(row.id, 'female')"
                    v-model="rowDrafts[row.id]!.female"
                    type="text"
                    inputmode="numeric"
                    :disabled="busy"
                    :class="CELL_INPUT_CLASSES"
                    :aria-invalid="
                      submitted &&
                      errorEntries.some((e) => e.fieldId === rowFieldId(row.id, 'female'))
                        ? 'true'
                        : undefined
                    "
                  />
                </td>
                <td
                  class="px-3 py-2 text-sm font-medium text-slate-700 tabular-nums"
                  data-test="derived-total"
                >
                  {{ formatNumber(derivedRowTotal(row)) }}
                </td>
              </template>

              <td v-else class="px-3 py-2">
                <label :for="rowFieldId(row.id, 'total')" class="sr-only">
                  {{ rowDrafts[row.id]?.label || row.label }} — total
                </label>
                <input
                  :id="rowFieldId(row.id, 'total')"
                  v-model="rowDrafts[row.id]!.total"
                  type="text"
                  inputmode="numeric"
                  :disabled="busy"
                  :class="CELL_INPUT_CLASSES"
                  :aria-invalid="
                    submitted && errorEntries.some((e) => e.fieldId === rowFieldId(row.id, 'total'))
                      ? 'true'
                      : undefined
                  "
                />
              </td>
            </tr>
          </tbody>

          <tfoot>
            <tr class="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
              <th scope="row" class="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left">Total</th>
              <template v-if="sexSplit">
                <td class="px-3 py-3 tabular-nums">{{ formatNumber(liveTotals.male) }}</td>
                <td class="px-3 py-3 tabular-nums">{{ formatNumber(liveTotals.female) }}</td>
                <td class="px-3 py-3 tabular-nums">{{ formatNumber(liveTotals.total) }}</td>
              </template>
              <td v-else class="px-3 py-3 tabular-nums">{{ formatNumber(liveTotals.total) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </fieldset>

    <div class="border-t border-slate-200 pt-4">
      <p v-if="!hasChanges" class="mb-3 text-xs text-slate-500" aria-live="polite">
        Belum ada perubahan pada tabel ini.
      </p>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton variant="secondary" size="md" :disabled="busy" @click="emit('cancel')">
          Batal
        </BaseButton>
        <BaseButton type="submit" size="md" :disabled="busy || !hasChanges">
          {{ busy ? 'Menyimpan…' : 'Simpan' }}
        </BaseButton>
      </div>
    </div>
  </form>
</template>
