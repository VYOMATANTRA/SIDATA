<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import FormErrorSummary from '../../common/FormErrorSummary.vue';
import FormField from '../../common/FormField.vue';
import MediaPhotoField from '../../common/MediaPhotoField.vue';
import CeritaFigurePhotoRow from './CeritaFigurePhotoRow.vue';
import ReorderGripButton from '../cards/ReorderGripButton.vue';
import { useRepeatableRows } from '../../data/blocks/blockFormShared';
import { edgeAt, useCardDragReorder } from '../../../composables/useCardDragReorder';
import { useKeyboardReorder } from '../../../composables/useKeyboardReorder';
import { consumePendingFigureKind } from '../../../composables/figureKindHint';
import { FIGURE_LIMITS } from '../../../services/ceritaFigure.service';
import { CHART_TYPES } from '../../../types/ceritaArticle';
import { isSexOnlyChartType } from '../../../utils/ceritaChart';
import { useCeritaAdminStore } from '../../../stores/ceritaAdmin.store';
import { isSexSplitKind, useIndicatorTablesStore } from '../../../stores/indicatorTables.store';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import {
  CHART_SERIES_LABELS,
  CHART_TYPE_LABELS,
  GALLERY_PHOTOS_MIN,
  TILE_LABELS,
  TILE_ORDER,
  barValueNote as barNote,
  describeFigure,
  draftFromFigure,
  draftSignature,
  emptyBar,
  emptyPhoto,
  figureIds,
  isBlankPhoto,
  photoGroupOf,
  summarizeFigure,
  validateFigureDraft,
  type BarFields,
  type ChartSeriesChoice,
  type ChartTypeChoice,
  type FigureDraft,
  type FigureTile,
  type GrafikSource,
  type PhotoFields,
} from '../../../utils/ceritaFigureDraft';
import type { FailureKind } from '../../../utils/userMessages';

/**
 * Editor for the one figure a Cerita section may have, picked with the "Jenis figur" tiles:
 * "1 gambar" (one photo), "2 gambar" (two photos, stacked), "Galeri" (3 to 12 photos, a carousel)
 * or "Grafik" (a chart of a table in the Data menu, or an uploaded chart picture). Each kind keeps
 * its own draft while the editor is open; switching tiles only asks first when it would drop typed
 * or uploaded content.
 *
 * Rules (SPEC §8): alt text is required for every photo; caption and credit are optional; a group
 * of photos may carry one shared credit that a photo's own credit replaces; gallery photos are ordered
 * on their grip (drag, or Spasi and the arrow keys; the carousel order follows it); nothing is stored
 * until the section's "Simpan perubahan";
 * a "stale" refusal keeps the draft and offers a reload that does not replace it; deleting asks
 * first. The figure has no save button of its own: the section editor's "Simpan perubahan" calls
 * `save()` (exposed) and reads `isDirty()` / `isBusy()`.
 */
const props = defineProps<{ sectionId: string }>();

const emit = defineEmits<{
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
  /** The working copy as typed (unsaved), for the live preview. */
  (e: 'draft-change', draft: FigureDraft): void;
}>();

const store = useCeritaAdminStore();
const tablesStore = useIndicatorTablesStore();

const baseId = useId();
const ids = figureIds(`${baseId}-gambar`);
const tileName = `${baseId}-jenis-figur`;
const sourceName = `${baseId}-sumber-grafik`;

const tile = ref<FigureTile | null>(null);
const grafikSource = ref<GrafikSource>('table');

const photoRows = useRepeatableRows<PhotoFields>([], {
  max: FIGURE_LIMITS.photosMax,
  makeEmpty: emptyPhoto,
  noun: 'foto',
  ids: {
    firstField: ids.photoFile,
    add: ids.addPhoto,
  },
});
const barRows = useRepeatableRows<BarFields>([], {
  max: FIGURE_LIMITS.barsMax,
  makeEmpty: emptyBar,
  noun: 'batang',
  ids: {
    firstField: ids.barLabel,
    add: ids.addBar,
  },
});

/** Photo rows of the group that is not on screen ("1 gambar" or the shared 2/Galeri group). */
const photoStash: Record<'photo' | 'photos', PhotoFields[]> = { photo: [], photos: [] };

const sharedCredit = ref('');
const diagramTitle = ref('');
const diagramSource = ref('');
const diagramImageId = ref<string | null>(null);
const diagramImageAlt = ref('');
const barUnit = ref('');
const chartTableId = ref('');
const chartType = ref<ChartTypeChoice>('bar');
const chartSeries = ref<ChartSeriesChoice>('total');
const chartTitle = ref('');
const chartSource = ref('');

const submitted = ref(false);
const saving = ref(false);
const deleting = ref(false);
const uploadingCount = ref(0);
const serverError = ref('');
/** Failure class of `serverError`, for AlertBanner. */
const serverErrorKind = ref<FailureKind | null>(null);
const stale = ref(false);
/** What the last successful reload found, shown until the draft is saved, reverted or replaced. */
const reloadedSummary = ref<string | null>(null);
const reloading = ref(false);
const confirmingDelete = ref(false);
const deleteError = ref('');
/** Failure class of `deleteError`, for AlertBanner. */
const deleteErrorKind = ref<FailureKind | null>(null);
/** A tile switch that would drop photos waits here until the operator confirms. */
const pendingTile = ref<FigureTile | null>(null);
const statusMessage = ref('');
const summaryHost = ref<HTMLElement | null>(null);
const failureId = `${baseId}-gagal`;
const chartSeriesOptions: readonly ChartSeriesChoice[] = ['total', 'by_sex'];
const deleteKeepButton = ref<InstanceType<typeof BaseButton> | null>(null);
const tileCancelButton = ref<InstanceType<typeof BaseButton> | null>(null);

const stored = computed(() => store.figureFor(props.sectionId));
const storedNote = computed(() =>
  stored.value ? describeFigure(stored.value.figure) : 'Bagian ini belum memiliki gambar.',
);

/** Photo rows as a plain snapshot, so a stash does not share objects with the live rows. */
function snapshotPhotos(): PhotoFields[] {
  return photoRows.rows.value.map((row) => ({
    mediaId: row.mediaId,
    alt: row.alt,
    caption: row.caption,
    credit: row.credit,
  }));
}

const draft = computed<FigureDraft>(() => ({
  tile: tile.value,
  grafikSource: grafikSource.value,
  photos: photoRows.rows.value,
  sharedCredit: sharedCredit.value,
  diagramTitle: diagramTitle.value,
  diagramSource: diagramSource.value,
  diagramImageId: diagramImageId.value,
  diagramImageAlt: diagramImageAlt.value,
  barUnit: barUnit.value,
  bars: barRows.rows.value,
  chartTableId: chartTableId.value,
  chartType: chartType.value,
  chartSeries: chartSeries.value,
  chartTitle: chartTitle.value,
  chartSource: chartSource.value,
}));

const baseline = ref('none');
const dirty = computed(() => draftSignature(draft.value) !== baseline.value);
const busy = computed(() => saving.value || deleting.value);
const uploading = computed(() => uploadingCount.value > 0);
/** Saving, deleting or uploading: the section editor waits for this before it leaves or saves. */
const working = computed(() => busy.value || uploading.value);

watch(working, (value) => emit('busy', value));
// The description belongs to the image: when the image is removed (or replaced by none) it goes too.
watch(diagramImageId, (id) => {
  if (id === null) diagramImageAlt.value = '';
});
watch(dirty, (value) => emit('dirty-change', value), { immediate: true });
watch(draft, (value) => emit('draft-change', value), { immediate: true });

// --- Pages' tables (the Grafik tile reads a table of this page only) ---

/** Every section id of the page this section belongs to; the chart may read any table among them. */
const pageSectionIds = computed<string[]>(() => {
  const found = store.findSection(props.sectionId);
  if (!found) return [props.sectionId];
  return found.page.chapters.flatMap((chapter) => chapter.sections.map((section) => section.id));
});

const pageTables = computed(() =>
  tablesStore.tables.filter((table) => pageSectionIds.value.includes(table.sectionId)),
);

/** Null while the table list has not loaded: the server then checks the table on save. */
const chartTableOptions = computed(() =>
  tablesStore.isLoaded
    ? pageTables.value.map((table) => ({ id: table.id, sexSplit: isSexSplitKind(table.kind) }))
    : null,
);

const selectedTable = computed(() => pageTables.value.find((t) => t.id === chartTableId.value));
/** A stored table that is not in the list (deleted or on another page) still shows, so it is not silently blanked. */
const missingSelectedTable = computed(
  () => chartTableId.value !== '' && tablesStore.isLoaded && !selectedTable.value,
);
const bySexAllowed = computed(
  () => selectedTable.value !== undefined && isSexSplitKind(selectedTable.value.kind),
);
const bySexHint = computed(() => {
  if (chartTableId.value === '') return 'Pilih tabel data dahulu.';
  if (selectedTable.value && !bySexAllowed.value) return 'Tabel ini hanya memuat jumlah total.';
  return null;
});
/** Pyramid, stacked and percent exist only split by sex, so "Jumlah total" is off while one is picked. */
const chartTypeNeedsBySex = computed(() => isSexOnlyChartType(chartType.value));

/** Picking a sex-only type selects the by-sex data with it; the donut keeps whichever data is chosen. */
function pickChartType(type: ChartTypeChoice): void {
  chartType.value = type;
  if (isSexOnlyChartType(type)) chartSeries.value = 'by_sex';
}

function onChartTableChange(tableId: string): void {
  chartTableId.value = tableId;
  // A table without a sex split cannot show "by_sex": fall back to the total rather than refuse.
  if (chartSeries.value === 'by_sex' && !bySexAllowed.value) chartSeries.value = 'total';
}

// --- Loading and baselines ---

function applyDraft(next: FigureDraft): void {
  tile.value = next.tile;
  grafikSource.value = next.grafikSource;
  photoStash.photo = [];
  photoStash.photos = [];
  photoRows.setRows(next.photos);
  sharedCredit.value = next.sharedCredit;
  diagramTitle.value = next.diagramTitle;
  diagramSource.value = next.diagramSource;
  diagramImageId.value = next.diagramImageId;
  diagramImageAlt.value = next.diagramImageAlt;
  barUnit.value = next.barUnit;
  barRows.setRows(next.bars);
  chartTableId.value = next.chartTableId;
  chartType.value = next.chartType;
  chartSeries.value = next.chartSeries;
  chartTitle.value = next.chartTitle;
  chartSource.value = next.chartSource;
  baseline.value = draftSignature(next);
}

/**
 * Shows what is stored now. Unless told otherwise it also records the section token this draft is
 * based on: the first save carries that token, so someone else's save made after this point is
 * refused rather than overwritten. After the editor's own save the store has already chained the
 * token from the save's own answer, so it is left alone.
 */
function loadFromStored(captureToken = true): void {
  applyDraft(draftFromFigure(stored.value?.figure ?? null));
  if (captureToken) store.captureSectionToken(props.sectionId);
}

loadFromStored();

// A reload (or someone else's save) changes what is stored. An untouched draft follows it; a
// draft with edits is kept as it is and only its comparison point moves, so a reload never
// throws away typing.
const storedSignature = computed(() =>
  JSON.stringify([stored.value?.block.id ?? null, stored.value?.figure ?? null]),
);
// The section token the draft follows is read only once the whole reload has finished: the blocks
// can arrive before the page tree, and a token read in between would be the old one.
let followToken = false;
watch(storedSignature, () => {
  if (dirty.value) {
    baseline.value = draftSignature(draftFromFigure(stored.value?.figure ?? null));
    return;
  }
  loadFromStored(false);
  if (store.isLoading) followToken = true;
  else store.captureSectionToken(props.sectionId);
});
watch(
  () => store.isLoading,
  (loading) => {
    if (loading || !followToken) return;
    followToken = false;
    // Only a draft that still has no edits of its own follows the reloaded token.
    if (!dirty.value) store.captureSectionToken(props.sectionId);
  },
);

watch(
  () => props.sectionId,
  () => {
    submitted.value = false;
    reloadedSummary.value = null;
    serverError.value = '';
    serverErrorKind.value = null;
    stale.value = false;
    confirmingDelete.value = false;
    pendingTile.value = null;
    loadFromStored();
  },
);

onMounted(() => {
  // The Data menu hands over a kind chosen in "Tambah bagian baru"; it is used once, and never on
  // top of a figure the section already has.
  const pending = consumePendingFigureKind();
  if (pending && stored.value === null) applyTile(pending);
  void tablesStore.fetchTables(true);
});

const problems = computed(() =>
  submitted.value ? validateFigureDraft(draft.value, ids, chartTableOptions.value).problems : [],
);
const errorByField = computed(() => {
  const map: Record<string, string> = {};
  for (const problem of problems.value) {
    if (!(problem.fieldId in map)) map[problem.fieldId] = problem.message;
  }
  return map;
});

function announce(message: string): void {
  statusMessage.value = '';
  void nextTick(() => {
    statusMessage.value = message;
  });
}

function focusTile(next: FigureTile | null): void {
  void nextTick(() => {
    const element = next === null ? null : document.getElementById(ids.tile(next));
    if (element instanceof HTMLElement) element.focus();
  });
}

// --- Tiles ---

/** Photos a switch to `next` would drop: the content beyond the two of "2 gambar". */
function photosDroppedBy(next: FigureTile): number {
  if (next !== 'photos-2' || photoGroupOf(tile.value) !== 'photos') return 0;
  return photoRows.rows.value.slice(2).filter((row) => !isBlankPhoto(row)).length;
}

/** Sets the photo rows a tile needs: exactly one, exactly two, or at least three (Galeri). */
function fitPhotoRows(next: FigureTile): void {
  const group = photoGroupOf(next);
  if (!group) return;
  const rows = snapshotPhotos();
  const size = next === 'photo' ? 1 : next === 'photos-2' ? 2 : GALLERY_PHOTOS_MIN;
  const kept = next === 'gallery' ? rows : rows.slice(0, size);
  while (kept.length < size) kept.push(emptyPhoto());
  photoRows.setRows(kept);
}

function applyTile(next: FigureTile): void {
  const from = photoGroupOf(tile.value);
  const to = photoGroupOf(next);
  if (from !== null && from !== to) photoStash[from] = snapshotPhotos();
  if (to !== null && to !== from) photoRows.setRows(photoStash[to]);
  tile.value = next;
  fitPhotoRows(next);
}

function chooseTile(next: FigureTile): void {
  if (next === tile.value) return;
  if (photosDroppedBy(next) > 0) {
    pendingTile.value = next;
    void nextTick(() => {
      const element = tileCancelButton.value?.$el as HTMLElement | undefined;
      element?.focus();
    });
    return;
  }
  applyTile(next);
  announce(`Jenis figur: ${TILE_LABELS[next].title}.`);
}

function onTileChange(next: FigureTile): void {
  if (busy.value || uploading.value) {
    // A radio can only be picked while the group is enabled; restore the shown choice regardless.
    syncTileRadios();
    return;
  }
  chooseTile(next);
}

/** Puts the radio checked state back to the tile in effect (after a refused or cancelled switch). */
function syncTileRadios(): void {
  for (const option of TILE_ORDER) {
    const element = document.getElementById(ids.tile(option));
    if (element instanceof HTMLInputElement) element.checked = option === tile.value;
  }
}

function confirmTile(): void {
  const next = pendingTile.value;
  pendingTile.value = null;
  if (next === null) return;
  applyTile(next);
  announce(`Jenis figur: ${TILE_LABELS[next].title}. Foto di luar jumlah itu dibuang.`);
  focusTile(next);
}

function cancelTile(): void {
  pendingTile.value = null;
  syncTileRadios();
  focusTile(tile.value);
  announce('Jenis figur tidak diubah.');
}

const droppedCount = computed(() =>
  pendingTile.value === null ? 0 : photosDroppedBy(pendingTile.value),
);

// --- Photos (1 gambar, 2 gambar, Galeri) ---

const isPhotoTile = computed(() => photoGroupOf(tile.value) !== null);
const galleryRows = computed(() => (tile.value === 'gallery' ? photoRows.rows.value : []));
const pairRows = computed(() => (tile.value === 'photos-2' ? photoRows.rows.value : []));

function photoCardLabel(index: number): string {
  if (tile.value === 'photo') return 'Gambar';
  if (tile.value === 'photos-2') return index === 0 ? 'Gambar 1 · depan' : 'Gambar 2 · belakang';
  return `Foto ${index + 1}`;
}

function swapPairPhotos(): void {
  if (busy.value || uploading.value || photoRows.rows.value.length !== 2) return;
  const [first, second] = photoRows.rows.value;
  if (!first || !second) return;
  photoRows.rows.value = [second, first];
  photoRows.announcement.value = 'Urutan gambar ditukar: gambar 1 sekarang di belakang.';
  void nextTick(() => {
    document.getElementById(ids.swapPhotos)?.focus();
  });
}

// Gallery order: the grip is dragged, or picked up from the keyboard. Both reach the same draft move.
const dragBlocked = computed(() => (busy.value || uploading.value ? 'busy' : null));
const galleryKeys = computed(() => photoRows.rows.value.map((row) => String(row.uid)));

function moveGalleryPhoto(key: string, toIndex: number): boolean {
  const rows = [...photoRows.rows.value];
  const from = rows.findIndex((row) => String(row.uid) === key);
  if (from < 0) return false;
  const [moved] = rows.splice(from, 1);
  if (!moved) return false;
  rows.splice(toIndex, 0, moved);
  photoRows.rows.value = rows;
  return true;
}

const drag = useCardDragReorder({
  order: galleryKeys,
  blocked: dragBlocked,
  onMove: (key, toIndex) => {
    if (moveGalleryPhoto(key, toIndex)) {
      photoRows.announcement.value = `Foto dipindah ke urutan ${toIndex + 1} dari ${photoRows.rows.value.length}.`;
    }
  },
});

const galleryKb = useKeyboardReorder({
  order: galleryKeys,
  blocked: computed(() => busy.value || uploading.value),
  label: (key) => {
    const index = galleryKeys.value.indexOf(key);
    return `Foto ${index + 1}`;
  },
  noun: 'Foto',
  onMove: (key, toIndex) => moveGalleryPhoto(key, toIndex),
});

/** Chart bars: the same keyboard grip as the gallery; the order is part of the draft. */
const barKeys = computed(() => barRows.rows.value.map((row) => String(row.uid)));

function moveBar(key: string, toIndex: number): boolean {
  const rows = [...barRows.rows.value];
  const from = rows.findIndex((row) => String(row.uid) === key);
  if (from < 0) return false;
  const [moved] = rows.splice(from, 1);
  if (!moved) return false;
  rows.splice(toIndex, 0, moved);
  barRows.rows.value = rows;
  return true;
}

const barKb = useKeyboardReorder({
  order: barKeys,
  blocked: computed(() => busy.value),
  label: (key) => `Batang ${barKeys.value.indexOf(key) + 1}`,
  noun: 'Batang',
  onMove: (key, toIndex) => moveBar(key, toIndex),
});

/** The bar rows in the order to show; a keyboard move previews its place and renumbers them. */
const barsShown = computed(() => barKb.arrange(barRows.rows.value, (row) => String(row.uid)));

function barGripId(uid: string | number): string {
  return `${baseId}-batang-${uid}-pegang`;
}

/** The gallery tiles in the order to show; a keyboard move previews its place and renumbers them. */
const galleryShown = computed(() =>
  galleryKb.arrange(galleryRows.value, (row) => String(row.uid)),
);

function galleryGripId(uid: string | number): string {
  return `${baseId}-galeri-${uid}-pegang`;
}

function onCardDragOver(event: DragEvent, key: string): void {
  if (!drag.dragKey.value) return;
  drag.hoverDrop(key, edgeAt(event));
}

function onCardDrop(event: DragEvent, key: string): void {
  drag.dropOn(key, edgeAt(event));
}

function dropClass(key: string): string {
  const keyed = galleryKb.edgeOf(key);
  const target = drag.dropTarget.value;
  const edge = keyed ?? (target && target.key === key ? target.edge : null);
  if (!edge) return '';
  return edge === 'before' ? 'border-t-4 border-brand-navy' : 'border-b-4 border-brand-navy';
}

function addGalleryPhoto(): void {
  photoRows.add();
}

// --- Save, reload, revert, delete ---

function onUploading(value: boolean): void {
  uploadingCount.value = Math.max(0, uploadingCount.value + (value ? 1 : -1));
}

function focusSummary(): void {
  void nextTick(() => {
    const target = serverError.value
      ? document.getElementById(failureId)
      : summaryHost.value?.querySelector<HTMLElement>('[role="alert"]');
    target?.focus();
  });
}

/**
 * Saves the figure when it has a problem-free draft. Called by the section editor's "Simpan
 * perubahan"; resolves true when the figure is saved (or the save reached the server and only the
 * reload failed), false when nothing was saved. The failure stays on screen beside the figure.
 */
async function save(): Promise<boolean> {
  if (busy.value) return false;
  if (uploading.value) {
    serverError.value = 'Tunggu unggahan foto selesai, lalu simpan.';
    serverErrorKind.value = null;
    focusSummary();
    return false;
  }
  submitted.value = true;
  serverError.value = '';
  serverErrorKind.value = null;
  stale.value = false;

  const result = validateFigureDraft(draft.value, ids, chartTableOptions.value);
  if (result.problems.length > 0 || !result.figure) {
    focusSummary();
    return false;
  }

  saving.value = true;
  const outcome = await store.saveFigure(props.sectionId, result.figure);
  saving.value = false;

  if (outcome.ok) {
    submitted.value = false;
    reloadedSummary.value = null;
    if (outcome.refreshFailed) {
      // Saved, but what the screen holds is still the old figure. Keep the draft (it is what was
      // just saved) and do not show the old data over it; the reload notice offers the reload. The
      // draft now matches what is saved, so it is not "unsaved" any more.
      baseline.value = draftSignature(draft.value);
      return true;
    }
    loadFromStored(false);
    return true;
  }
  serverError.value = outcome.message;
  serverErrorKind.value = outcome.kind;
  stale.value = outcome.stale;
  // A fresh conflict makes any earlier "reloaded" summary describe a version that is no longer current.
  if (outcome.stale) reloadedSummary.value = null;
  focusSummary();
  return false;
}

async function reload(): Promise<void> {
  if (reloading.value) return;
  reloading.value = true;
  const loaded = await store.load();
  reloading.value = false;

  if (!loaded) {
    // Nothing new was seen, so the draft must not move onto a newer token: saving would replace
    // a version the editor never looked at. The notice stays and the save is still refused.
    serverError.value =
      store.loadError ?? 'Versi terbaru belum bisa dimuat. Periksa koneksi lalu coba lagi.';
    serverErrorKind.value = store.loadErrorKind;
    announce('Versi terbaru belum bisa dimuat. Isian Anda masih ada.');
    focusSummary();
    return;
  }

  // Only a successful explicit reload moves the draft onto the fresh token; the draft itself stays.
  store.captureSectionToken(props.sectionId);
  stale.value = false;
  serverError.value = '';
  serverErrorKind.value = null;
  reloadedSummary.value = summarizeFigure(stored.value?.figure ?? null, stored.value !== null);
  announce(
    `Versi terbaru dimuat: ${reloadedSummary.value}. Jika Anda menyimpan sekarang, gambar Anda menggantikan versi itu.`,
  );
}

function revert(): void {
  submitted.value = false;
  reloadedSummary.value = null;
  serverError.value = '';
  serverErrorKind.value = null;
  stale.value = false;
  pendingTile.value = null;
  loadFromStored();
  announce('Perubahan gambar dibatalkan.');
}

function askDelete(): void {
  deleteError.value = '';
  deleteErrorKind.value = null;
  confirmingDelete.value = true;
  void nextTick(() => {
    const element = deleteKeepButton.value?.$el as HTMLElement | undefined;
    element?.focus();
  });
}

function cancelDelete(): void {
  confirmingDelete.value = false;
  deleteError.value = '';
  deleteErrorKind.value = null;
}

async function confirmDelete(): Promise<void> {
  if (busy.value) return;
  deleting.value = true;
  deleteError.value = '';
  deleteErrorKind.value = null;
  const outcome = await store.removeFigure(props.sectionId);
  deleting.value = false;
  if (outcome.ok) {
    confirmingDelete.value = false;
    submitted.value = false;
    reloadedSummary.value = null;
    serverError.value = '';
    serverErrorKind.value = null;
    stale.value = false;
    // The store has already dropped the figure from its data even if the reload failed, so this
    // shows the empty state; the reload notice (store.reloadNeeded) offers the reload.
    loadFromStored(false);
    announce(
      outcome.refreshFailed
        ? 'Gambar dihapus, tetapi halaman belum bisa dimuat ulang.'
        : 'Gambar dihapus dari bagian ini.',
    );
    await nextTick();
    document.getElementById(ids.tile('photo'))?.focus();
    return;
  }
  deleteError.value = outcome.message;
  deleteErrorKind.value = outcome.kind;
  stale.value = outcome.stale;
  if (outcome.stale) reloadedSummary.value = null;
}

/** The reason the last save was refused, in plain words, for the section editor's partial-save message. */
function failure(): string {
  return serverError.value || 'Periksa isian gambar yang ditandai.';
}

/**
 * Another editor's text write moved the section, and the figure changed under this draft too: the
 * figure shows its stale notice, so saving again needs its own "Muat versi terbaru" first.
 */
function markStale(): void {
  stale.value = true;
  reloadedSummary.value = null;
}

defineExpose({ isDirty: () => dirty.value, isBusy: () => working.value, save, failure, markStale });
</script>

<template>
  <div class="@container space-y-5" data-test="figure-editor">
    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>
    <p class="sr-only" role="status" aria-live="polite">{{ photoRows.announcement.value }}</p>
    <p class="sr-only" role="status" aria-live="polite">{{ barRows.announcement.value }}</p>

    <div ref="summaryHost">
      <FormErrorSummary :errors="problems" />
    </div>

    <div v-if="serverError" :id="failureId" tabindex="-1" class="outline-none">
      <AlertBanner
        :message="serverError"
        :kind="serverErrorKind ?? undefined"
        data-test="figure-save-error"
      />
    </div>

    <div
      v-if="stale"
      class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
      data-test="figure-stale-notice"
    >
      <p class="text-status-warning text-sm">
        Orang lain sudah mengubah gambar di bagian ini. Isian Anda masih ada di formulir ini. Memuat
        versi terbaru tidak menghapus isian Anda, tetapi jika Anda lalu menyimpan, gambar Anda
        menggantikan versi orang lain tersebut.
      </p>
      <BaseButton
        type="button"
        variant="secondary"
        size="sm"
        class="mt-3 min-h-11"
        :disabled="reloading || busy"
        data-test="figure-reload"
        @click="reload"
      >
        {{ reloading ? 'Memuat…' : 'Muat versi terbaru' }}
      </BaseButton>
    </div>

    <div
      v-if="reloadedSummary"
      class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
      data-test="figure-reloaded-notice"
    >
      <p class="text-status-warning text-sm">
        Versi terbaru dimuat: {{ reloadedSummary }}. Isian Anda tidak berubah. Jika Anda menyimpan
        sekarang, gambar Anda menggantikan versi itu.
      </p>
    </div>

    <fieldset :disabled="busy || uploading" data-test="figure-tiles">
      <legend class="sr-only">Jenis figur</legend>
      <div class="grid grid-cols-2 gap-2.5 @min-[480px]:grid-cols-4">
        <div v-for="option in TILE_ORDER" :key="option" class="relative">
          <input
            :id="ids.tile(option)"
            type="radio"
            :name="tileName"
            :value="option"
            :checked="tile === option"
            class="peer sr-only"
            :data-test="`kind-${option}`"
            @change="onTileChange(option)"
          />
          <label
            :for="ids.tile(option)"
            class="rounded-card border-border text-brand-navy peer-checked:border-brand-navy peer-checked:bg-brand-navy peer-focus-visible:outline-focus-ring hover:bg-surface-muted peer-checked:hover:bg-brand-navy flex min-h-[76px] cursor-pointer flex-col items-start gap-1 border-2 bg-white p-3 text-left peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
          >
            <svg
              v-if="option === 'photo'"
              class="h-[22px] w-[22px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="2"></rect>
              <path d="M3 16l5-5 4 4 3-3 6 6"></path>
            </svg>
            <svg
              v-else-if="option === 'photos-2'"
              class="h-[22px] w-[22px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="12" height="10" rx="1.5"></rect>
              <rect x="10" y="10" width="12" height="10" rx="1.5"></rect>
            </svg>
            <svg
              v-else-if="option === 'gallery'"
              class="h-[22px] w-[22px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="6" y="5" width="12" height="13" rx="1.5"></rect>
              <path d="M3 7v9M21 7v9"></path>
              <path d="M10 21h.01M12 21h.01M14 21h.01" stroke-linecap="round"></path>
            </svg>
            <svg
              v-else
              class="h-[22px] w-[22px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 3v18h18"></path>
              <path d="M7 15l4-4 3 3 5-6"></path>
            </svg>
            <span class="text-sm font-semibold">{{ TILE_LABELS[option].title }}</span>
            <span class="text-[12px] opacity-90">{{ TILE_LABELS[option].description }}</span>
          </label>
        </div>
      </div>
    </fieldset>
    <p class="text-text-muted text-sm" data-test="figure-stored-note">
      {{ tile === null ? 'Pilih jenis figur untuk mulai menambahkan gambar.' : storedNote }}
    </p>

    <div
      v-if="pendingTile"
      role="alertdialog"
      :aria-labelledby="`${baseId}-pindah-judul`"
      :aria-describedby="`${baseId}-pindah-isi`"
      class="rounded-card border-border-strong bg-surface-muted space-y-3 border p-4"
      data-test="tile-confirm"
    >
      <p :id="`${baseId}-pindah-judul`" class="text-brand-navy text-sm font-semibold">
        Pindah ke {{ TILE_LABELS[pendingTile].title }}?
      </p>
      <p :id="`${baseId}-pindah-isi`" class="text-text-muted text-sm">
        {{ droppedCount }} foto yang sudah terisi di luar dua foto pertama akan dibuang dari
        formulir. Foto yang belum disimpan tidak bisa dikembalikan.
      </p>
      <div class="flex flex-wrap gap-3">
        <BaseButton
          ref="tileCancelButton"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          data-test="tile-confirm-cancel"
          @click="cancelTile"
        >
          Batal
        </BaseButton>
        <BaseButton
          type="button"
          variant="primary"
          size="md"
          class="min-h-11"
          data-test="tile-confirm-ok"
          @click="confirmTile"
        >
          Ya, pindah
        </BaseButton>
      </div>
    </div>

    <template v-if="isPhotoTile">
      <div v-if="tile === 'photo'" data-test="figure-photos">
        <CeritaFigurePhotoRow
          v-if="photoRows.rows.value[0]"
          v-model:media-id="photoRows.rows.value[0].mediaId"
          v-model:alt="photoRows.rows.value[0].alt"
          v-model:caption="photoRows.rows.value[0].caption"
          v-model:credit="photoRows.rows.value[0].credit"
          variant="single"
          :index="0"
          :label="photoCardLabel(0)"
          :ids="ids"
          :errors="errorByField"
          :show-actions="false"
          :is-first="true"
          :is-last="true"
          :busy="busy || uploading"
          caption-label="Keterangan"
          credit-label="Sumber / kredit"
          @uploading="onUploading"
        />
      </div>

      <div v-else-if="tile === 'photos-2'" class="space-y-4" data-test="figure-photos">
        <div class="grid items-start gap-4 @min-[560px]:grid-cols-2">
          <CeritaFigurePhotoRow
            v-for="(row, index) in pairRows"
            :key="row.uid"
            v-model:media-id="row.mediaId"
            v-model:alt="row.alt"
            v-model:caption="row.caption"
            v-model:credit="row.credit"
            variant="pair"
            :index="index"
            :label="photoCardLabel(index)"
            :ids="ids"
            :errors="errorByField"
            :show-actions="false"
            :group-credit="true"
            :is-first="index === 0"
            :is-last="index === pairRows.length - 1"
            :busy="busy || uploading"
            caption-label="Keterangan"
            credit-label="Sumber / kredit"
            @uploading="onUploading"
          >
            <template v-if="index === 0" #actions>
              <BaseButton
                :id="ids.swapPhotos"
                type="button"
                variant="ghost"
                size="md"
                class="min-h-11 text-sm"
                :disabled="busy || uploading"
                data-test="swap-photos"
                @click="swapPairPhotos"
              >
                Tukar urutan
              </BaseButton>
            </template>
          </CeritaFigurePhotoRow>
        </div>
        <FormField
          :id="ids.sharedCredit"
          label="Sumber / kredit untuk semua gambar"
          hint="Opsional. Dipakai untuk setiap gambar yang tidak punya sumber sendiri."
          :error="errorByField[ids.sharedCredit]"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="ids.sharedCredit"
            v-model="sharedCredit"
            type="text"
            :class="INPUT_CLASSES"
            :disabled="busy || uploading"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            data-test="shared-credit"
          />
        </FormField>
        <p v-if="errorByField[ids.swapPhotos]" class="text-status-error text-[12px] font-medium">
          {{ errorByField[ids.swapPhotos] }}
        </p>
      </div>

      <div v-else class="space-y-4" data-test="figure-photos">
        <div class="grid grid-cols-2 gap-3 @min-[560px]:grid-cols-4">
          <div
            v-for="(row, index) in galleryShown"
            :key="row.uid"
            :class="dropClass(String(row.uid))"
            class="rounded-card"
            :data-test="`gallery-card-${index}`"
            @dragover.prevent="onCardDragOver($event, String(row.uid))"
            @drop.prevent="onCardDrop($event, String(row.uid))"
          >
            <CeritaFigurePhotoRow
              v-model:media-id="row.mediaId"
              v-model:alt="row.alt"
              v-model:caption="row.caption"
              v-model:credit="row.credit"
              variant="gallery"
              :index="index"
              :label="photoCardLabel(index)"
              :ids="ids"
              :errors="errorByField"
              :show-actions="true"
              :show-grip="true"
              :group-credit="true"
              :dragging="drag.dragKey.value === String(row.uid)"
              caption-label="Keterangan"
              credit-label="Sumber / kredit"
              :grip-id="galleryGripId(row.uid)"
              :grip-label="`Pindahkan foto ${index + 1}`"
              :grip-carried="galleryKb.isCarried(String(row.uid))"
              :busy="busy || uploading"
              @remove="photoRows.remove(photoRows.rows.value.findIndex((item) => item.uid === row.uid))"
              @uploading="onUploading"
              @grip-start="drag.startDrag(String(row.uid))"
              @grip-end="drag.clearDrag()"
              @grip-keydown="galleryKb.onGripKeydown($event, String(row.uid))"
              @grip-blur="galleryKb.onGripBlur($event, String(row.uid))"
            />
          </div>
          <button
            :id="ids.addPhoto"
            type="button"
            class="rounded-card border-border-strong text-brand-navy hover:bg-surface-muted focus-visible:outline-focus-ring bg-surface-muted flex min-h-40 flex-col items-center justify-center gap-1.5 border-2 border-dashed px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="busy || uploading || photoRows.isFull()"
            data-test="add-photo"
            @click="addGalleryPhoto"
          >
            <span aria-hidden="true" class="text-2xl leading-none">+</span>
            Tambah gambar
          </button>
        </div>
        <span class="sr-only" role="status" aria-live="polite" data-test="gallery-reorder-status">{{
          galleryKb.announcement.value
        }}</span>
        <FormField
          :id="ids.sharedCredit"
          label="Sumber / kredit untuk semua gambar"
          hint="Opsional. Dipakai untuk setiap gambar yang tidak punya sumber sendiri."
          :error="errorByField[ids.sharedCredit]"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="ids.sharedCredit"
            v-model="sharedCredit"
            type="text"
            :class="INPUT_CLASSES"
            :disabled="busy || uploading"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            data-test="shared-credit"
          />
        </FormField>
        <p class="text-text-muted text-[12px]">
          Urutan di sini = urutan di korsel. {{ photoRows.rows.value.length }} dari
          {{ FIGURE_LIMITS.photosMax }} foto (minimal {{ GALLERY_PHOTOS_MIN }}).
        </p>
        <p v-if="errorByField[ids.addPhoto]" class="text-status-error text-[12px] font-medium">
          {{ errorByField[ids.addPhoto] }}
        </p>
      </div>
    </template>

    <template v-else-if="tile === 'chart'">
      <div class="grid items-start gap-5 @min-[560px]:grid-cols-2">
        <div class="space-y-5">
          <fieldset
            class="space-y-2"
            :disabled="busy || uploading"
            data-test="figure-grafik-source"
          >
            <legend class="text-brand-navy mb-2 text-sm font-semibold">Sumber grafik</legend>
            <label
              v-for="source in ['table', 'upload'] as GrafikSource[]"
              :key="source"
              :for="ids.grafikSource(source)"
              class="rounded-btn flex min-h-11 cursor-pointer items-start gap-3 border p-3"
              :class="
                grafikSource === source
                  ? 'border-brand-navy bg-brand-navy/5'
                  : 'border-border-strong bg-white'
              "
            >
              <input
                :id="ids.grafikSource(source)"
                v-model="grafikSource"
                type="radio"
                :name="sourceName"
                :value="source"
                class="text-brand-navy focus-visible:outline-focus-ring mt-1 h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                :data-test="`grafik-source-${source}`"
              />
              <span class="flex flex-col">
                <span class="text-brand-navy text-sm font-semibold">
                  {{ source === 'table' ? 'Dari tabel di menu Data' : 'Unggah gambar grafik' }}
                </span>
                <span class="text-text-muted text-[12px]">
                  {{
                    source === 'table'
                      ? 'Grafik ikut berubah saat data diperbarui'
                      : 'PNG atau SVG yang sudah jadi'
                  }}
                </span>
              </span>
            </label>
          </fieldset>

          <template v-if="grafikSource === 'table'">
            <FormField
              :id="ids.chartTable"
              label="Tabel data"
              hint="Hanya tabel dari halaman ini. Tabel baru dibuat di menu Data."
              :error="errorByField[ids.chartTable]"
              required
              v-slot="{ describedBy, invalid }"
            >
              <select
                :id="ids.chartTable"
                :value="chartTableId"
                :class="INPUT_CLASSES"
                :disabled="busy || uploading"
                :aria-describedby="describedBy"
                :aria-invalid="invalid ? 'true' : undefined"
                data-test="chart-table"
                @change="onChartTableChange(($event.target as HTMLSelectElement).value)"
              >
                <option value="">Pilih tabel…</option>
                <option v-if="missingSelectedTable" :value="chartTableId">
                  Tabel yang tersimpan tidak ada di halaman ini
                </option>
                <option v-for="table in pageTables" :key="table.id" :value="table.id">
                  {{ table.title }} ({{ table.period }})
                </option>
              </select>
            </FormField>
            <AlertBanner
              v-if="tablesStore.error"
              :message="tablesStore.error"
              :kind="tablesStore.errorKind ?? undefined"
              data-test="chart-tables-error"
            />
            <p
              v-else-if="chartTableOptions !== null && pageTables.length === 0"
              class="text-text-muted text-sm"
              data-test="chart-tables-empty"
            >
              Belum ada tabel data di halaman ini. Tambahkan tabel di menu Data, lalu kembali ke
              sini.
            </p>
            <p v-else-if="chartTableOptions === null" class="text-text-muted text-sm" role="status">
              Daftar tabel sedang dimuat…
            </p>
          </template>
        </div>

        <div v-if="grafikSource === 'table'" class="space-y-5" data-test="figure-chart">
          <fieldset class="space-y-2" :disabled="busy || uploading">
            <legend class="text-brand-navy mb-2 text-sm font-semibold">Jenis grafik</legend>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="type in CHART_TYPES"
                :key="type"
                type="button"
                :aria-pressed="chartType === type"
                :disabled="
                  isSexOnlyChartType(type) ? !bySexAllowed || busy || uploading : undefined
                "
                :aria-describedby="
                  isSexOnlyChartType(type) && bySexHint
                    ? `${ids.chartSeries('by_sex')}-hint`
                    : undefined
                "
                class="rounded-btn focus-visible:outline-focus-ring flex min-h-11 items-center border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                :class="
                  chartType === type
                    ? 'border-brand-navy bg-brand-navy text-white'
                    : 'border-border-strong text-brand-navy bg-white'
                "
                :data-test="`chart-type-${type}`"
                @click="pickChartType(type)"
              >
                {{ CHART_TYPE_LABELS[type] }}
              </button>
            </div>
            <p
              v-if="chartTypeNeedsBySex"
              :id="`${ids.chartSeries('total')}-hint`"
              class="text-text-muted text-[12px]"
              data-test="chart-type-hint"
            >
              Jenis grafik ini hanya bisa menurut jenis kelamin.
            </p>
          </fieldset>

          <fieldset class="space-y-2" :disabled="busy || uploading">
            <legend class="text-brand-navy mb-2 text-sm font-semibold">Data</legend>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="series in chartSeriesOptions"
                :key="series"
                type="button"
                :aria-pressed="chartSeries === series"
                :disabled="
                  series === 'by_sex'
                    ? !bySexAllowed || busy || uploading
                    : chartTypeNeedsBySex || undefined
                "
                :aria-describedby="
                  series === 'by_sex' && bySexHint
                    ? `${ids.chartSeries('by_sex')}-hint`
                    : series === 'total' && chartTypeNeedsBySex
                      ? `${ids.chartSeries('total')}-hint`
                      : undefined
                "
                class="rounded-btn focus-visible:outline-focus-ring flex min-h-11 items-center border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                :class="
                  chartSeries === series
                    ? 'border-brand-navy bg-brand-navy text-white'
                    : 'border-border-strong text-brand-navy bg-white'
                "
                :data-test="`chart-series-${series}`"
                @click="chartSeries = series"
              >
                {{ CHART_SERIES_LABELS[series] }}
              </button>
            </div>
            <p
              v-if="bySexHint"
              :id="`${ids.chartSeries('by_sex')}-hint`"
              class="text-text-muted text-[12px]"
              data-test="chart-series-hint"
            >
              {{ bySexHint }}
            </p>
            <p
              v-if="errorByField[ids.chartSeries('by_sex')]"
              class="text-status-error text-[12px] font-medium"
            >
              {{ errorByField[ids.chartSeries('by_sex')] }}
            </p>
          </fieldset>

          <FormField
            :id="ids.chartTitle"
            label="Judul grafik"
            hint="Maksimal 120 karakter."
            :error="errorByField[ids.chartTitle]"
            required
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="ids.chartTitle"
              v-model="chartTitle"
              type="text"
              :class="INPUT_CLASSES"
              :disabled="busy || uploading"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
              data-test="chart-title"
            />
          </FormField>

          <FormField
            :id="ids.chartSource"
            label="Sumber data (opsional)"
            hint="Cantumkan sumbernya, misalnya nama publikasi dan tahunnya. Untuk data menurut waktu, tulis periodenya, misalnya “Berdasarkan data Juni 2024”."
            :error="errorByField[ids.chartSource]"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="ids.chartSource"
              v-model="chartSource"
              type="text"
              :class="INPUT_CLASSES"
              :disabled="busy || uploading"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
              data-test="chart-source"
            />
          </FormField>
        </div>

        <div v-else class="space-y-5 @min-[560px]:col-span-2" data-test="figure-diagram">
          <FormField
            :id="ids.diagramTitle"
            label="Judul grafik"
            :error="errorByField[ids.diagramTitle]"
            required
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="ids.diagramTitle"
              v-model="diagramTitle"
              type="text"
              :class="INPUT_CLASSES"
              :disabled="busy"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
              data-test="diagram-title"
            />
          </FormField>

          <FormField
            :id="ids.diagramSource"
            label="Sumber data (opsional)"
            hint="Contoh: nama publikasi dan tahunnya."
            :error="errorByField[ids.diagramSource]"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="ids.diagramSource"
              v-model="diagramSource"
              type="text"
              :class="INPUT_CLASSES"
              :disabled="busy"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
              data-test="diagram-source"
            />
          </FormField>

          <p class="text-text-muted text-sm">
            Grafik unggahan membutuhkan gambar, data batang, atau keduanya.
          </p>

          <fieldset class="rounded-card border-border space-y-4 border p-4">
            <legend class="text-brand-navy px-1 text-sm font-semibold">Gambar grafik</legend>
            <MediaPhotoField
              v-model="diagramImageId"
              purpose="cerita"
              label="Gambar grafik"
              :input-id="ids.diagramImage"
              :disabled="busy"
              :error="errorByField[ids.diagramImage]"
              preview-alt="Pratinjau gambar grafik"
              @busy="onUploading"
            />
            <FormField
              v-if="diagramImageId"
              :id="ids.diagramImageAlt"
              label="Teks alternatif gambar grafik"
              hint="Jelaskan isi grafik untuk pembaca yang tidak bisa melihatnya."
              :error="errorByField[ids.diagramImageAlt]"
              required
              v-slot="{ describedBy, invalid }"
            >
              <textarea
                :id="ids.diagramImageAlt"
                v-model="diagramImageAlt"
                rows="2"
                :class="INPUT_CLASSES"
                :disabled="busy"
                :aria-describedby="describedBy"
                :aria-invalid="invalid ? 'true' : undefined"
                data-test="diagram-image-alt"
              ></textarea>
            </FormField>
          </fieldset>

          <fieldset class="rounded-card border-border space-y-4 border p-4" :disabled="busy">
            <legend class="text-brand-navy px-1 text-sm font-semibold">Data batang</legend>

            <FormField
              :id="ids.barUnit"
              label="Satuan (opsional)"
              hint="Contoh: jiwa, KK, atau persen."
              :error="errorByField[ids.barUnit]"
              v-slot="{ describedBy, invalid }"
            >
              <input
                :id="ids.barUnit"
                v-model="barUnit"
                type="text"
                :class="INPUT_CLASSES"
                :aria-describedby="describedBy"
                :aria-invalid="invalid ? 'true' : undefined"
                data-test="bar-unit"
              />
            </FormField>

            <p v-if="barRows.rows.value.length === 0" class="text-text-muted text-sm">
              Belum ada data batang.
            </p>
            <span class="sr-only" role="status" aria-live="polite" data-test="bar-reorder-status">{{
              barKb.announcement.value
            }}</span>

            <div
              v-for="(bar, index) in barsShown"
              :key="bar.uid"
              class="border-border space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
              :class="barKb.isCarried(String(bar.uid)) ? 'rounded-card ring-brand-navy ring-2' : ''"
              data-test="bar-row"
            >
              <div class="flex items-center gap-2">
                <ReorderGripButton
                  :id="barGripId(bar.uid)"
                  :label="`Pindahkan batang ${index + 1}`"
                  :data-text="`Batang ${index + 1}`"
                  :disabled="busy"
                  :carried="barKb.isCarried(String(bar.uid))"
                  data-test="bar-grip"
                  @keydown="barKb.onGripKeydown($event, String(bar.uid))"
                  @blur="barKb.onGripBlur($event, String(bar.uid))"
                />
                <span class="text-text-muted text-[12px] font-semibold" data-test="bar-number">
                  Batang {{ index + 1 }}
                </span>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <FormField
                  :id="ids.barLabel(index)"
                  :label="`Nama batang ${index + 1}`"
                  :error="errorByField[ids.barLabel(index)]"
                  v-slot="{ describedBy, invalid }"
                >
                  <input
                    :id="ids.barLabel(index)"
                    v-model="bar.label"
                    type="text"
                    :class="INPUT_CLASSES"
                    :aria-describedby="describedBy"
                    :aria-invalid="invalid ? 'true' : undefined"
                    data-test="bar-label"
                  />
                </FormField>
                <FormField
                  :id="ids.barValue(index)"
                  :label="`Angka batang ${index + 1}`"
                  hint="Titik untuk ribuan, koma untuk desimal. Contoh: 1.234,5."
                  :error="errorByField[ids.barValue(index)]"
                  v-slot="{ describedBy, invalid }"
                >
                  <input
                    :id="ids.barValue(index)"
                    v-model="bar.value"
                    type="text"
                    inputmode="decimal"
                    :class="INPUT_CLASSES"
                    :aria-describedby="
                      [describedBy, barNote(bar.value) ? `${ids.barValue(index)}-note` : undefined]
                        .filter(Boolean)
                        .join(' ') || undefined
                    "
                    :aria-invalid="invalid ? 'true' : undefined"
                    data-test="bar-value"
                  />
                  <p
                    v-if="barNote(bar.value)"
                    :id="`${ids.barValue(index)}-note`"
                    class="text-text-muted mt-1.5 text-[12px]"
                    data-test="bar-value-note"
                  >
                    {{ barNote(bar.value) }}
                  </p>
                </FormField>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <BaseButton
                  :id="ids.barRemove(index)"
                  type="button"
                  variant="secondary"
                  size="sm"
                  class="min-h-11"
                  :disabled="busy"
                  @click="barRows.remove(barRows.rows.value.findIndex((item) => item.uid === bar.uid))"
                >
                  Hapus <span class="sr-only">batang {{ index + 1 }}</span>
                </BaseButton>
              </div>
            </div>

            <div class="space-y-2">
              <BaseButton
                :id="ids.addBar"
                type="button"
                variant="secondary"
                size="md"
                class="min-h-11"
                :disabled="busy || barRows.isFull()"
                data-test="add-bar"
                @click="barRows.add()"
              >
                Tambah batang
              </BaseButton>
              <p v-if="errorByField[ids.addBar]" class="text-status-error text-[12px] font-medium">
                {{ errorByField[ids.addBar] }}
              </p>
            </div>
          </fieldset>
        </div>
      </div>
    </template>

    <div
      v-if="dirty || stored"
      class="border-border flex flex-wrap items-center gap-2 border-t pt-4"
    >
      <BaseButton
        v-if="dirty"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="busy"
        data-test="figure-revert"
        @click="revert"
      >
        Batalkan perubahan gambar
      </BaseButton>
      <BaseButton
        v-if="stored && !confirmingDelete"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="busy"
        data-test="figure-delete"
        @click="askDelete"
      >
        Hapus gambar
      </BaseButton>
    </div>

    <div
      v-if="confirmingDelete"
      role="alertdialog"
      :aria-labelledby="`${baseId}-hapus-judul`"
      class="rounded-card border-border-strong bg-surface-muted space-y-3 border p-4"
      data-test="figure-delete-confirm"
    >
      <p :id="`${baseId}-hapus-judul`" class="text-brand-navy text-sm font-semibold">
        Hapus gambar dari bagian ini?
      </p>
      <p class="text-text-muted text-sm">
        Gambar dan teks alternatif, keterangan, serta datanya dilepas dari bagian ini. Foto yang
        sudah diunggah tidak lagi dipakai dan akan dibersihkan otomatis.
      </p>
      <AlertBanner
        v-if="deleteError"
        :message="deleteError"
        :kind="deleteErrorKind ?? undefined"
        data-test="figure-delete-error"
      />
      <div class="flex flex-wrap gap-3">
        <BaseButton
          ref="deleteKeepButton"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="deleting"
          data-test="figure-delete-cancel"
          @click="cancelDelete"
        >
          Batal
        </BaseButton>
        <BaseButton
          type="button"
          variant="primary"
          size="md"
          class="min-h-11"
          :disabled="deleting"
          data-test="figure-delete-confirm-button"
          @click="confirmDelete"
        >
          {{ deleting ? 'Menghapus…' : 'Ya, hapus gambar' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
