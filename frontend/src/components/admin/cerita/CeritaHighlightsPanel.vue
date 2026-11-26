<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import CardDropIndicator from '../cards/CardDropIndicator.vue';
import ReorderGripButton from '../cards/ReorderGripButton.vue';
import {
  edgeAt,
  useCardDragReorder,
  type DragBlock,
} from '../../../composables/useCardDragReorder';
import { useKeyboardReorder } from '../../../composables/useKeyboardReorder';
import { useCeritaAdminStore, type AdminPage } from '../../../stores/ceritaAdmin.store';
import {
  formatIndicatorValue,
  useIndicatorsStore,
  type Indicator,
} from '../../../stores/indicators.store';
import { chapterNumberLabel, sectionNumberLabel } from '../../../utils/ceritaTreeLabels';
import { MAX_STAT_HIGHLIGHTS, moveHighlight, sameIds } from '../../../utils/statHighlights';
import type { FailureKind } from '../../../utils/userMessages';

/**
 * "Statistik unggulan (maks. 4)" on a topic: the up-to-four indicators its landing card shows, in
 * the order the editor sets. The list is a draft until "Simpan": reorder it on the grip (drag, or
 * the keyboard), remove, or add from the topic's indicators grouped by Bab and Bagian. The panel
 * owns the draft; the store owns the write, and a save also reloads the page hierarchy so the
 * page's token stays current for the chapter and section writes below it.
 */

const props = defineProps<{ page: AdminPage }>();

const FALLBACK_MESSAGE =
  'Belum dipilih — beranda menampilkan 4 statistik pertama sesuai urutan isi. Simpan untuk menetapkannya.';
const LIMIT_HINT = 'Sudah 4 statistik. Hapus salah satu untuk menambah.';

const cerita = useCeritaAdminStore();
const indicatorsStore = useIndicatorsStore();

const uid = useId();
const headingId = `${uid}-judul`;
const addId = `${uid}-tambah`;
const limitHintId = `${uid}-batas`;
const pickerId = `${uid}-pilih`;
const pickerLabelId = `${uid}-pilih-judul`;
const closeId = `${uid}-tutup`;
const saveId = `${uid}-simpan`;

function gripId(indicatorId: string): string {
  return `${uid}-grip-${indicatorId}`;
}

// --- Server state and the draft ---

/** The list as the server holds it, and the page token the next save sends. */
const serverIds = ref<string[]>([]);
const serverIsFallback = ref(false);
const token = ref<string | null>(null);
const draft = ref<string[]>([]);

const loading = ref(false);
const loadError = ref<{ message: string; kind: FailureKind } | null>(null);
const saving = ref(false);
const saveError = ref<{ message: string; kind: FailureKind; stale: boolean } | null>(null);
const pickerOpen = ref(false);
/** Polite status for add, remove, save and reload; the keyboard reorder has its own region. */
const announcement = ref('');

// While the server only falls back to the first four, Simpan stays enabled so one click pins them.
const dirty = computed(
  () => serverIsFallback.value || !sameIds(draft.value, serverIds.value),
);
const atLimit = computed(() => draft.value.length >= MAX_STAT_HIGHLIGHTS);
const ready = computed(() => token.value !== null && indicatorsStore.isLoaded);

// --- The topic's indicators ---

const indicatorsById = computed(
  () => new Map(indicatorsStore.indicators.map((item) => [item.id, item] as const)),
);

const topicSectionIds = computed(
  () =>
    new Set(props.page.chapters.flatMap((chapter) => chapter.sections.map((section) => section.id))),
);

const topicBySection = computed(() => {
  const bySection = new Map<string, Indicator[]>();
  for (const item of indicatorsStore.indicators) {
    if (!topicSectionIds.value.has(item.sectionId)) continue;
    const list = bySection.get(item.sectionId) ?? [];
    list.push(item);
    bySection.set(item.sectionId, list);
  }
  for (const list of bySection.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return bySection;
});

const topicCount = computed(() =>
  [...topicBySection.value.values()].reduce((total, list) => total + list.length, 0),
);

function valueTextOf(item: Indicator): string {
  return [formatIndicatorValue(item.valueCurrent, item.unit), item.unit ?? '']
    .filter((part) => part !== '')
    .join(' ');
}

function labelOf(indicatorId: string): string {
  return indicatorsById.value.get(indicatorId)?.label ?? 'Statistik tidak ditemukan';
}

interface HighlightRow {
  id: string;
  label: string;
  valueText: string;
}

const chosenRows = computed<HighlightRow[]>(() =>
  draft.value.map((id) => {
    const item = indicatorsById.value.get(id);
    return item
      ? { id, label: item.label, valueText: valueTextOf(item) }
      : { id, label: 'Statistik tidak ditemukan', valueText: '' };
  }),
);

interface PickerSection {
  id: string;
  label: string;
  items: Indicator[];
}

interface PickerChapter {
  id: string;
  label: string;
  sections: PickerSection[];
}

/** The topic's indicators not yet chosen, grouped by Bab and Bagian in the book's order. */
const pickerChapters = computed<PickerChapter[]>(() => {
  const chosen = new Set(draft.value);
  return props.page.chapters
    .map((chapter, chapterIndex) => {
      const chapterNumber = chapterNumberLabel(chapter.number, chapterIndex);
      const sections = chapter.sections
        .map((section, sectionIndex) => ({
          id: section.id,
          label: `Bagian ${sectionNumberLabel(chapterNumber, sectionIndex)}${
            section.title ? ` · ${section.title}` : ''
          }`,
          items: (topicBySection.value.get(section.id) ?? []).filter(
            (item) => !chosen.has(item.id),
          ),
        }))
        .filter((section) => section.items.length > 0);
      return { id: chapter.id, label: `Bab ${chapterNumber} · ${chapter.title}`, sections };
    })
    .filter((chapter) => chapter.sections.length > 0);
});

// --- Editing the draft ---

function announce(message: string): void {
  announcement.value = message;
}

function focusById(id: string): void {
  void nextTick(() => document.getElementById(id)?.focus());
}

function moveTo(indicatorId: string, toIndex: number): void {
  const next = moveHighlight(draft.value, indicatorId, toIndex);
  if (next) draft.value = next;
}

function positionOf(indicatorId: string): number {
  return draft.value.indexOf(indicatorId) + 1;
}

const keyboard = useKeyboardReorder({
  order: computed(() => draft.value),
  blocked: computed(() => saving.value),
  label: (id) => `Statistik ${positionOf(id)}: ${labelOf(id)}`,
  noun: 'Statistik',
  onMove: (id, toIndex) => {
    moveTo(id, toIndex);
  },
});

const drag = useCardDragReorder({
  order: computed(() => draft.value),
  blocked: computed<DragBlock>(() => (saving.value ? 'busy' : null)),
  onMove: (id, toIndex) => moveTo(id, toIndex),
});

/** The rows in the order to show; a keyboard move previews its place and renumbers the rows. */
const shownRows = computed(() =>
  keyboard
    .arrange(chosenRows.value, (row) => row.id)
    .map((row, index) => ({ ...row, position: index + 1 })),
);

function edgeFor(indicatorId: string): 'before' | 'after' | null {
  const keyed = keyboard.edgeOf(indicatorId);
  if (keyed) return keyed;
  const target = drag.dropTarget.value;
  return target && target.key === indicatorId ? target.edge : null;
}

function addIndicator(indicatorId: string): void {
  if (atLimit.value || draft.value.includes(indicatorId)) return;
  draft.value = [...draft.value, indicatorId];
  announce(`${labelOf(indicatorId)} ditambahkan sebagai statistik ${draft.value.length}.`);
  // The picker's button for this indicator is gone, and at the limit "Tambah" is disabled. Either
  // way the focus moves to something still reachable: the new row's grip, or the next pick.
  if (atLimit.value) {
    pickerOpen.value = false;
    focusById(gripId(indicatorId));
    return;
  }
  void nextTick(() => {
    const next = document
      .getElementById(pickerId)
      ?.querySelector<HTMLElement>('[data-picker-item]');
    (next ?? document.getElementById(closeId))?.focus();
  });
}

function removeIndicator(indicatorId: string): void {
  const label = labelOf(indicatorId);
  draft.value = draft.value.filter((id) => id !== indicatorId);
  announce(`${label} dihapus. ${draft.value.length} statistik dipilih.`);
  // The row's "Hapus" button is gone; "Tambah statistik" is enabled again below the limit.
  focusById(addId);
}

function togglePicker(): void {
  pickerOpen.value = !pickerOpen.value;
}

function closePicker(): void {
  pickerOpen.value = false;
  focusById(addId);
}

// --- Loading and saving ---

let loadSeq = 0;

/**
 * Reads the server's list and token. `resetDraft` replaces the draft with the server list; a
 * reload after a stale refusal keeps the draft so the editor can review it and save again.
 */
async function loadServer(resetDraft: boolean): Promise<boolean> {
  const slug = props.page.slug;
  const seq = ++loadSeq;
  loading.value = true;
  const outcome = await cerita.loadHighlights(slug);
  if (seq !== loadSeq || slug !== props.page.slug) return false;
  loading.value = false;
  if (!outcome.ok) {
    loadError.value = { message: outcome.message, kind: outcome.kind };
    return false;
  }
  loadError.value = null;
  serverIds.value = [...outcome.value.indicatorIds];
  serverIsFallback.value = outcome.value.isFallback;
  token.value = outcome.value.pageUpdatedAt;
  if (resetDraft) draft.value = [...serverIds.value];
  return true;
}

function loadIndicators(force = false): void {
  void indicatorsStore.fetchIndicators(force);
}

function start(): void {
  saveError.value = null;
  pickerOpen.value = false;
  announcement.value = '';
  loadIndicators();
  void loadServer(true);
}

function retryLoad(): void {
  loadIndicators(true);
  void loadServer(true);
}

async function reloadAfterStale(): Promise<void> {
  const ok = await loadServer(false);
  if (ok) {
    saveError.value = null;
    announce('Versi terbaru dimuat. Pilihan Anda tetap dipertahankan; simpan lagi bila sudah sesuai.');
    focusById(saveId);
  }
}

async function save(): Promise<void> {
  if (!dirty.value || saving.value || token.value === null) return;
  saving.value = true;
  saveError.value = null;
  const outcome = await cerita.saveHighlights(props.page.slug, [...draft.value], token.value);
  if (outcome.ok) {
    serverIds.value = [...outcome.value.indicatorIds];
    serverIsFallback.value = outcome.value.isFallback;
    token.value = outcome.value.pageUpdatedAt;
    draft.value = [...serverIds.value];
    saving.value = false;
    announce('Statistik unggulan disimpan.');
    // "Simpan" is disabled now that nothing is unsaved; hand the focus to the heading.
    focusById(headingId);
    return;
  }
  saving.value = false;
  saveError.value = {
    message: outcome.message,
    kind: outcome.kind,
    stale: outcome.stale,
  };
  focusById(saveId);
}

// Start for the topic on mount and whenever the editor opens another topic.
watch(() => props.page.slug, start, { immediate: true });

// Another write moved the page (a rename, for instance): refresh the token and the server list, and
// keep the draft. A save in flight answers its own token, so it is left alone.
watch(
  () => props.page.updatedAt,
  (updatedAt) => {
    if (saving.value || token.value === null || updatedAt === token.value) return;
    void loadServer(false);
  },
);
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="border-border space-y-4 rounded-card border bg-white p-4 md:p-6"
    data-test="highlights-panel"
  >
    <h2 :id="headingId" tabindex="-1" class="text-brand-navy text-lg font-semibold">
      Statistik unggulan (maks. 4)
    </h2>
    <p class="text-text-muted text-sm">
      Statistik ini tampil di kartu topik pada beranda, sesuai urutan di sini. Simpan untuk
      menerapkan perubahan.
    </p>

    <AlertBanner
      v-if="loadError"
      :message="loadError.message"
      :kind="loadError.kind"
      data-test="highlights-load-error"
      @retry="retryLoad"
    />
    <AlertBanner
      v-if="indicatorsStore.error"
      :message="indicatorsStore.error"
      :kind="indicatorsStore.errorKind ?? undefined"
      data-test="highlights-indicators-error"
      @retry="loadIndicators(true)"
    />
    <p
      v-if="!ready && !loadError && !indicatorsStore.error"
      role="status"
      class="text-text-muted text-sm"
      data-test="highlights-loading"
    >
      Memuat statistik unggulan…
    </p>

    <template v-if="ready">
      <AlertBanner
        v-if="serverIsFallback"
        tone="info"
        live="polite"
        :message="FALLBACK_MESSAGE"
        data-test="highlights-fallback"
      />
      <AlertBanner
        v-if="saveError"
        :message="saveError.message"
        :kind="saveError.kind"
        data-test="highlights-save-error"
      >
        <template v-if="saveError.stale" #action>
          <BaseButton
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="saving || loading"
            data-test="highlights-reload"
            @click="reloadAfterStale"
          >
            Muat versi terbaru
          </BaseButton>
        </template>
      </AlertBanner>

      <p class="sr-only" role="status" aria-live="polite" data-test="highlights-status">
        {{ announcement }}
      </p>
      <span class="sr-only" role="status" aria-live="polite" data-test="highlights-reorder-status">{{
        keyboard.announcement.value
      }}</span>

      <p
        v-if="shownRows.length === 0"
        class="rounded-btn border-border-strong text-text-muted border border-dashed p-3 text-sm"
        data-test="highlights-empty"
      >
        Belum ada statistik yang dipilih.
      </p>

      <ol
        v-else
        aria-label="Statistik unggulan yang dipilih"
        class="space-y-2"
        data-test="highlights-list"
      >
        <li
          v-for="row in shownRows"
          :key="row.id"
          class="border-border rounded-btn relative flex items-center gap-3 border bg-white p-3"
          data-test="highlights-item"
          @dragover="
            (event) => {
              event.preventDefault();
              if (drag.dragKey.value) drag.hoverDrop(row.id, edgeAt(event));
            }
          "
          @drop.prevent="drag.dropOn(row.id, edgeAt($event))"
        >
          <CardDropIndicator v-if="edgeFor(row.id)" :edge="edgeFor(row.id) ?? 'before'" />
          <ReorderGripButton
            :id="gripId(row.id)"
            :label="`Pindahkan statistik ${row.position}: ${row.label}`"
            :data-text="row.label"
            :disabled="saving"
            :carried="keyboard.isCarried(row.id)"
            @drag-start="drag.startDrag(row.id)"
            @drag-end="drag.clearDrag()"
            @keydown="keyboard.onGripKeydown($event, row.id)"
            @blur="keyboard.onGripBlur($event, row.id)"
          />
          <span
            class="text-text-muted w-6 shrink-0 text-center text-sm font-semibold tabular-nums"
            data-test="highlight-position"
          >
            {{ row.position }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-brand-navy text-sm font-semibold break-words">{{ row.label }}</p>
            <p v-if="row.valueText" class="text-text-muted text-sm">{{ row.valueText }}</p>
          </div>
          <span
            v-if="serverIsFallback"
            class="text-text-muted rounded-btn shrink-0 border border-current px-2 py-0.5 text-xs font-semibold"
            data-test="highlight-auto"
          >
            Otomatis
          </span>
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            class="min-h-11 shrink-0"
            data-test="highlight-remove"
            @click="removeIndicator(row.id)"
          >
            Hapus<span class="sr-only">: {{ row.label }}</span>
          </BaseButton>
        </li>
      </ol>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-2">
          <BaseButton
            :id="addId"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="atLimit"
            :aria-expanded="pickerOpen ? 'true' : 'false'"
            :aria-controls="pickerOpen ? pickerId : undefined"
            :aria-describedby="atLimit ? limitHintId : undefined"
            data-test="highlights-add"
            @click="togglePicker"
          >
            Tambah statistik
          </BaseButton>
          <p v-if="atLimit" :id="limitHintId" class="text-text-muted text-sm">
            {{ LIMIT_HINT }}
          </p>
        </div>
        <BaseButton
          :id="saveId"
          type="button"
          variant="primary"
          size="md"
          class="min-h-11"
          :disabled="!dirty || saving"
          data-test="highlights-save"
          @click="save"
        >
          Simpan
        </BaseButton>
      </div>

      <div
        v-if="pickerOpen"
        :id="pickerId"
        role="region"
        :aria-labelledby="pickerLabelId"
        class="border-border space-y-4 rounded-card border p-4"
        data-test="highlights-picker"
        @keydown.esc="closePicker"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p :id="pickerLabelId" class="text-brand-navy text-sm font-semibold">
            Pilih statistik dari topik ini
          </p>
          <BaseButton
            :id="closeId"
            type="button"
            variant="secondary"
            size="sm"
            class="min-h-11"
            @click="closePicker"
          >
            Tutup daftar
          </BaseButton>
        </div>
        <p
          v-if="pickerChapters.length === 0"
          class="text-text-muted text-sm"
          data-test="highlights-picker-empty"
        >
          {{
            topicCount === 0
              ? 'Topik ini belum memiliki angka indikator.'
              : 'Semua statistik topik ini sudah dipilih.'
          }}
        </p>
        <div
          v-for="chapter in pickerChapters"
          :key="chapter.id"
          role="group"
          :aria-labelledby="`${uid}-bab-${chapter.id}`"
          class="space-y-3"
        >
          <p
            :id="`${uid}-bab-${chapter.id}`"
            class="text-text-muted text-xs font-semibold tracking-wide uppercase"
          >
            {{ chapter.label }}
          </p>
          <div
            v-for="section in chapter.sections"
            :key="section.id"
            role="group"
            :aria-labelledby="`${uid}-bagian-${section.id}`"
            class="space-y-2 pl-3"
          >
            <p :id="`${uid}-bagian-${section.id}`" class="text-text-muted text-sm font-medium">
              {{ section.label }}
            </p>
            <ul class="space-y-2">
              <li v-for="item in section.items" :key="item.id">
                <BaseButton
                  type="button"
                  variant="secondary"
                  size="md"
                  class="min-h-11 w-full justify-start text-left"
                  data-picker-item
                  :disabled="atLimit"
                  @click="addIndicator(item.id)"
                >
                  {{ item.label }}<template v-if="valueTextOf(item)"> — {{ valueTextOf(item) }}</template>
                </BaseButton>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
