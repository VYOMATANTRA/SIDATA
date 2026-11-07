<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';
import {
  TEMPLATE_CHIPS,
  TREND_CHIP_NAME,
  TREND_SLOT,
  VARIANT_CHIPS,
  chipForSlot,
  chipSegment,
  sanitizeText,
  textSegment,
  trendChipCount,
  type TemplateChip,
  type TemplateSegment,
} from '../../utils/comparisonTemplateSegments';
import { INPUT_CLASSES } from '../../utils/formStyles';

/**
 * Sentence editor for one template field (SPEC §5, §8). The sentence is an ordered list of
 * parts: free-text parts and named chips. Nothing here shows or accepts placeholder syntax; the
 * parent serializes the list to the stored string.
 *
 * Ordering is by buttons (move up/down), never drag-only, and every control is a real
 * <button>/<textarea> at least 44px square.
 */

const props = withDefaults(
  defineProps<{
    modelValue: TemplateSegment[];
    /** `body` carries exactly one "Keterangan perubahan" chip; variants may not carry it. */
    mode: 'body' | 'variant';
    label: string;
    hint?: string;
    /** Correction for this field, shown beside it and announced. */
    error?: string;
    idPrefix: string;
    /** Names this builder in `data-test` hooks; defaults to the mode. */
    field?: string;
    disabled?: boolean;
  }>(),
  { hint: undefined, error: undefined, disabled: false, field: undefined },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: TemplateSegment[]): void }>();

const uid = useId();
const rootId = computed(() => `${props.idPrefix}-${uid}`);
const hintId = computed(() => `${rootId.value}-hint`);
const errorId = computed(() => `${rootId.value}-error`);
const trendNoteId = computed(() => `${rootId.value}-trend-note`);
const announcement = ref('');
const listRef = ref<HTMLElement | null>(null);

const availableChips = computed<readonly TemplateChip[]>(() =>
  props.mode === 'body' ? TEMPLATE_CHIPS : VARIANT_CHIPS,
);
const trendTaken = computed(() => trendChipCount(props.modelValue) >= 1);

function segmentName(segment: TemplateSegment, index: number): string {
  if (segment.kind === 'text') return `teks, bagian ${index + 1}`;
  if (segment.kind === 'chip')
    return `${chipForSlot(segment.slot)?.name ?? 'bagian'}, bagian ${index + 1}`;
  return `bagian tidak dikenali, bagian ${index + 1}`;
}

function update(next: TemplateSegment[]): void {
  emit('update:modelValue', next);
}

function focusSelector(selector: string): void {
  void nextTick(() =>
    listRef.value?.closest('fieldset')?.querySelector<HTMLElement>(selector)?.focus(),
  );
}

function addText(): void {
  const segment = textSegment('');
  update([...props.modelValue, segment]);
  announcement.value = 'Bagian teks ditambahkan.';
  focusSelector(`[data-segment-id="${segment.id}"] textarea`);
}

function addChip(chip: TemplateChip): void {
  if (chip.slot === TREND_SLOT && trendTaken.value) return;
  const segment = chipSegment(chip.slot);
  update([...props.modelValue, segment]);
  announcement.value = `Bagian ${chip.name} ditambahkan.`;
  focusSelector(`[data-segment-id="${segment.id}"] [data-action="remove"]`);
}

function setText(index: number, value: string): void {
  const next = [...props.modelValue];
  const current = next[index];
  if (current?.kind !== 'text') return;
  next[index] = { ...current, text: sanitizeText(value) };
  update(next);
}

function remove(index: number): void {
  const segment = props.modelValue[index];
  if (!segment) return;
  const name =
    segment.kind === 'chip'
      ? (chipForSlot(segment.slot)?.name ?? 'bagian')
      : segment.kind === 'unknown'
        ? 'bagian tidak dikenali'
        : 'teks';
  const remaining = props.modelValue.filter((_, i) => i !== index);
  update(remaining);
  announcement.value = `Bagian ${name} dihapus.`;
  // Land on the row that took this one's place, else the previous row, else the add button.
  const neighbour = remaining[index] ?? remaining[index - 1];
  focusSelector(
    neighbour
      ? `[data-segment-id="${neighbour.id}"] [data-action="remove"]`
      : '[data-action="add-text"]',
  );
}

function move(index: number, delta: -1 | 1): void {
  const target = index + delta;
  if (target < 0 || target >= props.modelValue.length) return;
  const next = [...props.modelValue];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  update(next);
  announcement.value = `Bagian dipindah ke urutan ${target + 1} dari ${next.length}.`;
  // Keep focus on the moved row. The button just used is disabled once the row reaches an
  // end (and focus() on a disabled button is a no-op), so fall back to the opposite move
  // button, then to the row's remove button.
  const row = `[data-segment-id="${item!.id}"]`;
  const same = delta < 0 ? 'up' : 'down';
  const opposite = delta < 0 ? 'down' : 'up';
  void nextTick(() => {
    const scope = listRef.value?.closest('fieldset');
    const candidates = [same, opposite, 'remove'].map((action) =>
      scope?.querySelector<HTMLButtonElement>(`${row} [data-action="${action}"]`),
    );
    candidates.find((button) => button && !button.disabled)?.focus();
  });
}

const BUTTON =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-btn border border-border-strong bg-surface px-3 text-sm font-medium text-brand-navy transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-text-muted disabled:hover:bg-surface-hover';
</script>

<template>
  <fieldset
    :id="idPrefix"
    tabindex="-1"
    class="rounded-card border-border border p-4"
    :aria-describedby="
      [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
    "
    :data-test="`builder-${field ?? mode}`"
  >
    <legend class="text-brand-navy px-1 text-sm font-semibold">{{ label }}</legend>

    <p v-if="hint" :id="hintId" class="text-text-muted text-xs leading-snug">{{ hint }}</p>

    <ol ref="listRef" class="mt-3 space-y-2" :aria-label="`Bagian-bagian ${label.toLowerCase()}`">
      <li
        v-if="modelValue.length === 0"
        class="rounded-btn border-border-strong text-text-muted border border-dashed px-3 py-3 text-sm"
        data-test="builder-empty"
      >
        Belum ada bagian. Tambahkan teks atau pilih salah satu bagian otomatis di bawah.
      </li>

      <li
        v-for="(segment, index) in modelValue"
        :key="segment.id"
        :data-segment-id="segment.id"
        class="rounded-btn border-border bg-surface flex flex-col gap-2 border p-2 sm:flex-row sm:items-start"
        :data-kind="segment.kind"
      >
        <div class="min-w-0 flex-1">
          <template v-if="segment.kind === 'text'">
            <label :for="`${rootId}-text-${segment.id}`" class="sr-only">
              Teks, bagian {{ index + 1 }}
            </label>
            <textarea
              :id="`${rootId}-text-${segment.id}`"
              :value="segment.text"
              rows="2"
              :disabled="disabled"
              :class="INPUT_CLASSES"
              placeholder="Ketik teks biasa di sini"
              @input="setText(index, ($event.target as HTMLTextAreaElement).value)"
            />
          </template>

          <template v-else-if="segment.kind === 'chip'">
            <p class="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                class="border-border-strong bg-surface-muted text-brand-navy inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold"
                data-test="chip"
              >
                {{ chipForSlot(segment.slot)?.name }}
              </span>
              <span class="text-text-muted text-xs">{{ chipForSlot(segment.slot)?.help }}</span>
            </p>
          </template>

          <template v-else>
            <p
              class="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1"
              data-test="unknown-chip"
            >
              <span
                class="border-status-warning-border bg-status-warning-surface text-status-warning inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold"
              >
                <ExclamationTriangleIcon class="h-4 w-4" aria-hidden="true" />
                Bagian tidak dikenali
              </span>
              <span class="text-text-muted text-xs">
                Bagian ini tidak bisa dipakai dan harus dihapus sebelum menyimpan.
              </span>
            </p>
          </template>
        </div>

        <div
          class="flex shrink-0 gap-1.5"
          role="group"
          :aria-label="`Atur ${segmentName(segment, index)}`"
        >
          <button
            type="button"
            data-action="up"
            :class="BUTTON"
            :disabled="disabled || index === 0"
            :aria-label="`Pindahkan ${segmentName(segment, index)} ke atas`"
            @click="move(index, -1)"
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            data-action="down"
            :class="BUTTON"
            :disabled="disabled || index === modelValue.length - 1"
            :aria-label="`Pindahkan ${segmentName(segment, index)} ke bawah`"
            @click="move(index, 1)"
          >
            <span aria-hidden="true">↓</span>
          </button>
          <button
            type="button"
            data-action="remove"
            :class="BUTTON"
            :disabled="disabled"
            :aria-label="`Hapus ${segmentName(segment, index)}`"
            @click="remove(index)"
          >
            Hapus
          </button>
        </div>
      </li>
    </ol>

    <div
      class="mt-3 flex flex-wrap gap-2"
      role="group"
      :aria-label="`Tambah bagian ke ${label.toLowerCase()}`"
    >
      <button
        type="button"
        data-action="add-text"
        :class="BUTTON"
        :disabled="disabled"
        @click="addText"
      >
        Tambah teks
      </button>
      <button
        v-for="chip in availableChips"
        :key="chip.slot"
        type="button"
        :data-chip="chip.slot"
        :class="BUTTON"
        :disabled="disabled || (chip.slot === TREND_SLOT && trendTaken)"
        :aria-describedby="chip.slot === TREND_SLOT && trendTaken ? trendNoteId : undefined"
        @click="addChip(chip)"
      >
        Tambah {{ chip.name }}
      </button>
    </div>

    <p class="text-text-muted mt-2 text-xs" data-test="space-hint">
      Spasi di antara bagian tidak ditambahkan otomatis — ketik sendiri di bagian teks.
    </p>

    <p
      v-if="mode === 'body' && trendTaken"
      :id="trendNoteId"
      class="text-text-muted mt-2 text-xs"
      data-test="trend-note"
    >
      Bagian "{{ TREND_CHIP_NAME }}" sudah ada dan hanya boleh satu. Hapus yang lama bila ingin
      memindahkannya.
    </p>

    <p
      :id="errorId"
      class="text-status-error mt-2 text-xs font-medium"
      aria-live="polite"
      data-test="builder-error"
    >
      <template v-if="error">{{ error }}</template>
    </p>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </fieldset>
</template>
