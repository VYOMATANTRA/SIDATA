<script setup lang="ts">
/**
 * RT coverage selector for a map point (SPEC §7). Staff pick RT numbers from a grid; they never
 * type an id or a list.
 *
 * - `single` (Ketua RT): a native radio group, because such a point covers exactly one RT.
 * - `multiple` (Bank Sampah, Fasilitas Umum): native checkboxes, because one unit can serve
 *   several RTs.
 *
 * An RT that already has a Ketua RT point is marked in `single` mode (dot, dashed edge and a
 * spoken note) but stays selectable: the parent form words the conflict and blocks saving, so
 * the explanation sits next to the field instead of behind a disabled control that cannot be
 * focused.
 */
import { computed, useId } from 'vue';
import { RT_NUMBERS, formatRtList } from '../../../utils/adminMapPoints';

const props = withDefaults(
  defineProps<{
    modelValue: number[];
    mode: 'single' | 'multiple';
    /** `single` mode only: RT number -> name of the other Ketua RT point that already uses it. */
    takenBy?: ReadonlyMap<number, string>;
    disabled?: boolean;
    error?: string;
  }>(),
  {
    takenBy: () => new Map<number, string>(),
    disabled: false,
    error: undefined,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: number[]): void;
}>();

const baseId = useId();
const hintId = `${baseId}-hint`;
const statusId = `${baseId}-status`;
const errorId = `${baseId}-error`;
const legendNoteId = `${baseId}-legend`;

const selected = computed(() => [...props.modelValue].sort((a, b) => a - b));
const hasTaken = computed(() => props.mode === 'single' && props.takenBy.size > 0);

const hint = computed(() =>
  props.mode === 'single'
    ? 'Titik Ketua RT mencakup tepat satu RT. Pilih RT-nya.'
    : 'Satu titik dapat mencakup beberapa RT. Pilih semua RT yang dilayani.',
);

const statusText = computed(() =>
  selected.value.length === 0
    ? 'Belum ada RT dipilih.'
    : `Dipilih: ${formatRtList(selected.value)}.`,
);

const describedBy = computed(() =>
  [hintId, statusId, hasTaken.value ? legendNoteId : null, props.error ? errorId : null]
    .filter((id): id is string => Boolean(id))
    .join(' '),
);

function isSelected(rt: number): boolean {
  return props.modelValue.includes(rt);
}

function takenName(rt: number): string | undefined {
  return props.mode === 'single' ? props.takenBy.get(rt) : undefined;
}

function choose(rt: number, checked: boolean): void {
  if (props.disabled) return;
  if (props.mode === 'single') {
    emit('update:modelValue', [rt]);
    return;
  }
  const next = checked
    ? [...new Set([...props.modelValue, rt])]
    : props.modelValue.filter((value) => value !== rt);
  emit(
    'update:modelValue',
    next.sort((a, b) => a - b),
  );
}

function clearAll(): void {
  if (props.disabled) return;
  emit('update:modelValue', []);
}
</script>

<template>
  <fieldset
    class="min-w-0 space-y-3 border-0 p-0"
    :aria-describedby="describedBy"
    :aria-invalid="error ? 'true' : undefined"
    data-test="rt-coverage"
  >
    <legend class="text-brand-navy text-sm font-medium">RT yang dicakup</legend>
    <p :id="hintId" class="text-text-muted text-sm leading-snug">{{ hint }}</p>
    <p
      v-if="hasTaken"
      :id="legendNoteId"
      class="text-text-muted text-sm leading-snug"
      data-test="rt-coverage-legend"
    >
      Tanda titik (<span aria-hidden="true">•</span>) berarti RT itu sudah punya titik Ketua RT.
    </p>

    <p
      :id="statusId"
      role="status"
      class="text-brand-navy text-sm font-medium"
      data-test="rt-coverage-status"
    >
      {{ statusText }}
    </p>

    <div
      class="grid max-h-64 grid-cols-5 gap-1.5 overflow-y-auto rounded-card border border-border bg-surface p-2 sm:grid-cols-10"
      data-test="rt-coverage-grid"
    >
      <label v-for="rt in RT_NUMBERS" :key="rt" class="relative block" :data-test="`rt-tile-${rt}`">
        <input
          :type="mode === 'single' ? 'radio' : 'checkbox'"
          :name="mode === 'single' ? `${baseId}-rt` : undefined"
          :value="rt"
          :checked="isSelected(rt)"
          :disabled="disabled"
          class="peer sr-only"
          @change="choose(rt, ($event.target as HTMLInputElement).checked)"
        />
        <span
          class="border-border-strong text-brand-navy hover:bg-surface-hover peer-checked:bg-brand-navy peer-checked:border-brand-navy peer-focus-visible:outline-focus-ring peer-disabled:bg-surface-hover peer-disabled:text-text-muted flex h-10 min-w-0 cursor-pointer items-center justify-center rounded-btn border text-sm font-medium peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-not-allowed"
          :class="{ 'border-dashed': takenName(rt) }"
        >
          <span class="sr-only">RT </span>{{ rt
          }}<span v-if="takenName(rt)" class="ml-0.5" aria-hidden="true">•</span
          ><span v-if="takenName(rt)" class="sr-only">
            , sudah dipakai titik Ketua RT lain</span
          >
        </span>
      </label>
    </div>

    <button
      v-if="mode === 'multiple' && selected.length > 0"
      type="button"
      class="border-border-strong text-brand-navy hover:bg-surface-hover focus-visible:outline-focus-ring min-h-11 rounded-btn border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:text-text-muted"
      :disabled="disabled"
      data-test="rt-coverage-clear"
      @click="clearAll"
    >
      Kosongkan pilihan RT
    </button>

    <div aria-live="polite">
      <p v-if="error" :id="errorId" class="text-status-error text-sm font-medium">
        {{ error }}
      </p>
    </div>
  </fieldset>
</template>
