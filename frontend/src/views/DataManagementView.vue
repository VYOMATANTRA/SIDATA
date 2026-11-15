<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import AlertBanner from '../components/common/AlertBanner.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import IndicatorCard, { type IndicatorCardModel } from '../components/data/IndicatorCard.vue';
import ScalarIndicatorForm from '../components/data/ScalarIndicatorForm.vue';
import TableIndicatorForm, {
  type TableSavePayload,
} from '../components/data/TableIndicatorForm.vue';
import ContentBlockForm from '../components/data/ContentBlockForm.vue';
import CreateDataForm, { type CreateDataPayload } from '../components/data/CreateDataForm.vue';
import TableRowAddForm, { type TableRowAddPayload } from '../components/data/TableRowAddForm.vue';
import {
  INDICATOR_TABLE_KIND_META,
  useIndicatorTablesStore,
  type IndicatorTable,
  type IndicatorTableDetail,
} from '../stores/indicatorTables.store';
import {
  useIndicatorsStore,
  type Indicator,
  type IndicatorPatch,
} from '../stores/indicators.store';
import { useComparisonTemplatesStore } from '../stores/comparisonTemplates.store';
import { usePagesStore } from '../stores/pages.store';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';
import { formatDecimalId } from '../utils/formatNumber';
import { INPUT_CLASSES } from '../utils/formStyles';
import { slugifyLabel, uniqueSlug } from '../utils/slug';
import {
  ROW_ADD_CONFLICT_MESSAGE,
  SLUG_TAKEN_MESSAGE,
  classifyFailure,
  isRetryable,
  toUserMessage,
  type FailureKind,
} from '../utils/userMessages';
import {
  blockDisplayName,
  blockPlacement,
  isBlockShownOnSite,
} from '../components/data/blocks/blockMeta';
import type { BlockSavePayload } from '../components/data/blocks/blockFormShared';

/**
 * CMS entry point for indicator data and content blocks (SPEC §4).
 *
 * Scoped CMS editing:
 * - Scalar indicators (ScalarIndicatorForm)
 * - Matrix tables (TableIndicatorForm)
 * - Content blocks (ContentBlockForm)
 * - Creating a scalar indicator or an empty matrix table from "Tambah Data" (CreateDataForm)
 *
 * Portal settings live on /admin/sistem/konfigurasi, not here.
 */

type TypeFilter = 'all' | 'skalar' | 'matriks';
type ActiveTab = 'indikator' | 'konten';

const indicatorsStore = useIndicatorsStore();
const tablesStore = useIndicatorTablesStore();
const pagesStore = usePagesStore();
const contentBlocksStore = useContentBlocksStore();
const templatesStore = useComparisonTemplatesStore();

const activeTab = ref<ActiveTab>('indikator');
const searchQuery = ref('');
const typeFilter = ref<TypeFilter>('all');

const availableTabs: { id: ActiveTab; label: string }[] = [
  { id: 'indikator', label: 'Indikator & Tabel' },
  { id: 'konten', label: 'Blok Konten & Profil' },
];

function selectTab(tab: (typeof availableTabs)[number]) {
  activeTab.value = tab.id;
  typeFilter.value = 'all';
  searchQuery.value = '';
}

async function handleTabKeydown(event: KeyboardEvent, index: number) {
  const tabs = availableTabs;
  let nextIndex: number | null = null;
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  const next = tabs[nextIndex];
  if (!next) return;
  selectTab(next);
  await nextTick();
  document.getElementById(`tab-${next.id}`)?.focus();
}

const activeScalar = ref<Indicator | null>(null);
const activeTableId = ref<string | null>(null);
const activeTable = ref<IndicatorTableDetail | null>(null);
const activeContentBlock = ref<ContentBlock | null>(null);
/** Set when a content-block save was refused because someone else saved it first. */
const contentBlockStale = ref(false);
/** "Tambah Data" dialog open (indicator tab only). */
const isCreateOpen = ref(false);
/** Failure of the "Tambah baris" form, kept apart from the table form's own error. */
const rowError = ref('');
const rowErrorKind = ref<FailureKind | null>(null);
const addingRow = ref(false);
/** Bumped after a row is added so the row form starts empty. */
const rowFormKey = ref(0);

const isTableDetailLoading = ref(false);
const saving = ref(false);
const serverError = ref('');
/** Failure class of `serverError`, for AlertBanner; null for local notices. */
const serverErrorKind = ref<FailureKind | null>(null);
const statusMessage = ref('');

const isEditorOpen = computed(
  () =>
    isCreateOpen.value ||
    activeScalar.value !== null ||
    activeTableId.value !== null ||
    activeContentBlock.value !== null,
);

const isLoading = computed(() => {
  if (activeTab.value === 'konten') return contentBlocksStore.isLoading;
  return indicatorsStore.isLoading || tablesStore.isLoading;
});

const loadError = computed(() => {
  if (activeTab.value === 'konten') return contentBlocksStore.error;
  return indicatorsStore.error || tablesStore.error;
});

/** Kinds of every failing store on the active tab. */
const loadFailureKinds = computed<FailureKind[]>(() => {
  if (activeTab.value === 'konten') {
    return contentBlocksStore.error ? [contentBlocksStore.errorKind ?? 'unknown'] : [];
  }
  const kinds: FailureKind[] = [];
  if (indicatorsStore.error) kinds.push(indicatorsStore.errorKind ?? 'unknown');
  if (tablesStore.error) kinds.push(tablesStore.errorKind ?? 'unknown');
  return kinds;
});

// When two stores fail with different kinds, prefer a retryable one so "Coba lagi" stays available.
const loadErrorKind = computed<FailureKind | undefined>(() => {
  const kinds = loadFailureKinds.value;
  return kinds.find((kind) => isRetryable(kind)) ?? kinds[0];
});

function compareCards(a: IndicatorCardModel, b: IndicatorCardModel): number {
  const pageA = a.kicker ?? '\uffff';
  const pageB = b.kicker ?? '\uffff';
  const byPage = pageA.localeCompare(pageB, 'id');
  if (byPage !== 0) return byPage;
  if (a.type !== b.type)
    return a.type === 'skalar' ? -1 : b.type === 'skalar' ? 1 : a.type.localeCompare(b.type, 'id');
  return a.title.localeCompare(b.title, 'id');
}

const cards = computed<IndicatorCardModel[]>(() => {
  const scalarCards: IndicatorCardModel[] = indicatorsStore.indicators.map((indicator) => {
    const stats = [
      {
        label: `Nilai Sekarang (${indicator.periodCurrent})`,
        value: formatDecimalId(indicator.valueCurrent),
      },
    ];
    if (indicator.valuePrevious !== null) {
      stats.push({
        label: `Nilai Lalu (${indicator.periodPrevious ?? '—'})`,
        value: formatDecimalId(indicator.valuePrevious),
      });
    }
    return {
      id: indicator.id,
      type: 'skalar',
      title: indicator.label,
      kicker: pagesStore.pageTitleFor(indicator.sectionId),
      sectionLabel: pagesStore.labelFor(indicator.sectionId),
      stats,
      source: indicator.source,
      hedgeNote: indicator.hedgeNote,
      isStale: indicator.isStale,
    };
  });

  const tableCards: IndicatorCardModel[] = tablesStore.tables.map((table: IndicatorTable) => ({
    id: table.id,
    type: 'matriks',
    title: table.title,
    kicker: pagesStore.pageTitleFor(table.sectionId),
    sectionLabel: pagesStore.labelFor(table.sectionId),
    stats: [
      { label: 'Jenis tabel', value: INDICATOR_TABLE_KIND_META[table.kind].label },
      { label: 'Periode', value: table.period },
    ],
    source: table.source,
    hedgeNote: null,
    isStale: false,
  }));

  if (activeTab.value === 'konten') {
    return (
      contentBlocksStore.editableBlocks
        // The publication catalog is managed on /admin/publikasi (uploads and covers live there).
        .filter((block) => block.slug !== 'publikasi-katalog')
        .map((block) => ({
          id: block.slug,
          type: 'konten' as const,
          title: blockDisplayName(block),
          kicker: 'Blok Konten',
          sectionLabel: placementFor(block),
          stats: [
            {
              label: 'Terakhir diperbarui',
              value: formatBlockUpdated(block.updatedAt),
            },
          ],
          source: null,
          hedgeNote: isBlockShownOnSite(block)
            ? null
            : 'Isian tersimpan, tetapi belum muncul di halaman mana pun.',
          isStale: false,
        }))
        .sort(compareCards)
    );
  }

  return [...scalarCards, ...tableCards].sort(compareCards);
});

const filteredCards = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return cards.value.filter((card) => {
    if (typeFilter.value !== 'all' && card.type !== typeFilter.value) return false;
    if (query === '') return true;
    const haystack = [card.title, card.kicker, card.sectionLabel, card.source];
    return haystack.some((value) => value?.toLowerCase().includes(query));
  });
});

const modalTitle = computed(() => {
  if (isCreateOpen.value) return 'Tambah Data';
  if (activeContentBlock.value) {
    return `Edit Blok Konten: ${blockDisplayName(activeContentBlock.value)}`;
  }
  return activeTableId.value ? 'Edit Tabel Matriks' : 'Edit Angka Indikator Skalar';
});

const modalSize = computed<'md' | 'lg' | 'xl'>(() => {
  if (isCreateOpen.value) return 'lg';
  return activeTableId.value || activeContentBlock.value ? 'xl' : 'md';
});

const modalDescription = computed(() => {
  if (isCreateOpen.value) {
    return 'Pilih jenis data dan bagian halaman tempat data ini tampil.';
  }
  // A content block's own form opens with the "Tampil di: …" line, so the dialog adds none.
  if (activeContentBlock.value) return undefined;
  const sectionId = activeScalar.value?.sectionId ?? activeTable.value?.sectionId;
  if (!sectionId) return undefined;
  const parts = pagesStore.breadcrumbParts(sectionId);
  return parts.length > 0 ? parts.join(' › ') : undefined;
});

function placementFor(block: ContentBlock): string {
  const parts = block.sectionId ? pagesStore.breadcrumbParts(block.sectionId) : [];
  return blockPlacement(block, parts.length > 0 ? parts.join(' › ') : null);
}

function formatBlockUpdated(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('id-ID');
}

function announce(message: string): void {
  statusMessage.value = message;
}

/** Shows a local notice (no failure class) or a store message with its kind. */
function setServerError(message: string, kind: FailureKind | null = null): void {
  serverError.value = message;
  serverErrorKind.value = message ? kind : null;
}

function setServerFailure(error: unknown, action: string, method?: string): void {
  const failure = toUserMessage(error, action, method);
  setServerError(failure.message, failure.kind);
}

async function loadAll(): Promise<void> {
  await Promise.allSettled([
    pagesStore.fetchHierarchy(),
    indicatorsStore.fetchIndicators(true),
    tablesStore.fetchTables(true),
    contentBlocksStore.fetchBlocks(true),
  ]);
}

onMounted(() => {
  void loadAll();
});

function openScalar(indicator: Indicator): void {
  setServerError('');
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  activeScalar.value = indicator;
  templatesStore.clearSelectorError();
  // Only a computed-comparison indicator can be given a template, so only then is the list
  // worth fetching. Editors may read it; a failure shows beside the selector, not as a blocker.
  if (indicator.isComputedComparison) {
    void templatesStore.fetchTemplates({ force: true, forSelector: true });
  }
}

/**
 * Resolves the card back to its store row on click. Doing it here rather than inline in the
 * template keeps the lookup honest: a card whose row has disappeared since render simply does
 * nothing instead of dereferencing `undefined`.
 */
function handleEdit(card: IndicatorCardModel): void {
  setServerError('');
  activeScalar.value = null;
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;

  if (card.type === 'skalar') {
    const indicator = indicatorsStore.indicators.find((item) => item.id === card.id);
    if (indicator) openScalar(indicator);
    return;
  }

  if (card.type === 'matriks') {
    const table = tablesStore.tables.find((item) => item.id === card.id);
    if (table) void openTable(table);
    return;
  }

  if (card.type === 'konten') {
    const block = contentBlocksStore.blocks[card.id];
    if (block) {
      contentBlockStale.value = false;
      activeContentBlock.value = block;
    }
    return;
  }
}

async function openTable(table: IndicatorTable): Promise<void> {
  setServerError('');
  rowError.value = '';
  rowErrorKind.value = null;
  activeScalar.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  activeTableId.value = table.id;
  isTableDetailLoading.value = true;
  try {
    activeTable.value = await tablesStore.fetchTableDetail(table.id);
  } catch (error) {
    setServerFailure(error, 'memuat rincian tabel', 'GET');
  } finally {
    isTableDetailLoading.value = false;
  }
}

function openCreate(): void {
  setServerError('');
  activeScalar.value = null;
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  isCreateOpen.value = true;
}

function resetEditor(): void {
  isCreateOpen.value = false;
  rowError.value = '';
  rowErrorKind.value = null;
  addingRow.value = false;
  activeScalar.value = null;
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  contentBlockStale.value = false;
  isTableDetailLoading.value = false;
  setServerError('');
  templatesStore.clearSelectorError();
}

async function handleContentBlockSubmit(payload: BlockSavePayload): Promise<void> {
  const target = activeContentBlock.value;
  if (!target) return;

  saving.value = true;
  setServerError('');
  try {
    const updated = await contentBlocksStore.updateBlock(target.slug, {
      ...payload,
      // The precondition that stops a stale tab from overwriting someone else's save.
      ...(typeof target.updatedAt === 'string' ? { expectedUpdatedAt: target.updatedAt } : {}),
    });
    resetEditor();
    announce(`Perubahan blok konten “${blockDisplayName(updated)}” disimpan.`);
  } catch (error) {
    // The dialog stays open with every field as typed; nothing is cleared on a failed save.
    setServerFailure(error, 'menyimpan perubahan blok konten');
    if (classifyFailure(error).kind === 'stale') {
      contentBlockStale.value = true;
      // Refresh the list behind the dialog; the open draft is untouched until the editor asks.
      void contentBlocksStore.fetchBlocks(true);
    }
  } finally {
    saving.value = false;
  }
}

/** "Muat versi terbaru" after a stale save: swaps in the stored block and drops the old draft. */
async function handleContentBlockReload(): Promise<void> {
  const target = activeContentBlock.value;
  if (!target) return;
  await contentBlocksStore.fetchBlocks(true);
  const fresh = contentBlocksStore.serverBlocks[target.slug];
  if (!fresh) {
    resetEditor();
    announce('Blok konten ini tidak ditemukan lagi. Daftar sudah dimuat ulang.');
    return;
  }
  setServerError('');
  contentBlockStale.value = false;
  activeContentBlock.value = fresh;
  announce('Versi terbaru blok konten dimuat.');
}

/**
 * Saves a new indicator or an empty matrix table. The slug is derived from the label/title and
 * made unique against the lists already loaded. On success the dialog closes; a matrix table then
 * opens its row editor. On failure the dialog stays open and `CreateDataForm` keeps every field.
 */
async function handleCreateSubmit(payload: CreateDataPayload): Promise<void> {
  saving.value = true;
  setServerError('');
  try {
    if (payload.type === 'skalar') {
      const taken = new Set(indicatorsStore.indicators.map((item) => item.slug));
      const slug = uniqueSlug(slugifyLabel(payload.input.label, 'indikator'), taken);
      const created = await indicatorsStore.createIndicator({
        ...payload.input,
        sectionId: payload.sectionId,
        slug,
      });
      resetEditor();
      announce(`Indikator “${created.label}” ditambahkan.`);
      return;
    }

    const taken = new Set(tablesStore.tables.map((item) => item.slug));
    const slug = uniqueSlug(slugifyLabel(payload.input.title, 'tabel'), taken);
    const created = await tablesStore.createTable({
      ...payload.input,
      sectionId: payload.sectionId,
      slug,
    });
    resetEditor();
    announce(`Tabel “${created.title}” dibuat. Formulir tabel terbuka.`);
    await openTable(created);
  } catch (error) {
    if (classifyFailure(error).status === 409) {
      // Someone else took the generated address. Reload both lists so the next save picks a free one.
      void Promise.allSettled([indicatorsStore.fetchIndicators(true), tablesStore.fetchTables(true)]);
      setServerError(`Gagal menyimpan data baru. ${SLUG_TAKEN_MESSAGE}`, 'conflict');
    } else {
      setServerFailure(error, 'menyimpan data baru');
    }
  } finally {
    saving.value = false;
  }
}

/**
 * "Tambah baris" on an open matrix table. The row key is derived from the label and made unique
 * within the table. The table detail is refetched, so totals and the row list come from the
 * server. On failure the row draft stays as typed and the table form's drafts are untouched.
 */
async function handleRowAdd(payload: TableRowAddPayload): Promise<void> {
  const target = activeTable.value;
  if (!target) return;

  addingRow.value = true;
  rowError.value = '';
  rowErrorKind.value = null;
  try {
    const taken = new Set(target.rows.map((row) => row.rowKey));
    // rowKey is capped at 64 characters by the backend; keep room for a collision suffix.
    const base = slugifyLabel(payload.label, 'baris').slice(0, 60).replace(/-+$/, '');
    const rowKey = uniqueSlug(base, taken);
    activeTable.value = await tablesStore.createTableRow(target.id, {
      rowKey,
      label: payload.label,
      male: payload.male,
      female: payload.female,
      total: payload.total,
    });
    rowFormKey.value += 1;
    announce(`Baris “${payload.label}” ditambahkan.`);
  } catch (error) {
    if (classifyFailure(error).status === 409) {
      try {
        activeTable.value = await tablesStore.fetchTableDetail(target.id);
      } catch {
        // The reload failed too; the banner below still explains what to do.
      }
      rowError.value = `Gagal menambah baris. ${ROW_ADD_CONFLICT_MESSAGE}`;
      rowErrorKind.value = 'conflict';
    } else {
      const failure = toUserMessage(error, 'menambah baris', 'POST');
      rowError.value = failure.message;
      rowErrorKind.value = failure.kind;
    }
  } finally {
    addingRow.value = false;
  }
}

async function handleScalarSubmit(patch: IndicatorPatch): Promise<void> {
  const target = activeScalar.value;
  if (!target) return;

  saving.value = true;
  setServerError('');
  try {
    await indicatorsStore.updateIndicator(target.id, patch);
    resetEditor();
    announce(`Perubahan indikator “${target.label}” disimpan.`);
  } catch (error) {
    setServerFailure(error, 'menyimpan perubahan indikator');
  } finally {
    saving.value = false;
  }
}

async function handleTableSubmit(payload: TableSavePayload): Promise<void> {
  const target = activeTable.value;
  if (!target) return;

  saving.value = true;
  setServerError('');
  try {
    // One atomic PATCH: the header and every changed row commit together or not at all, so
    // there is no partial write to reconcile here.
    await tablesStore.saveTableDetail(target.id, payload);
    resetEditor();
    announce(`Perubahan tabel “${target.title}” disimpan.`);
  } catch (error) {
    // Deliberately no refetch. Replacing `activeTable` would hand the form a new `table` prop,
    // and its watcher resets every draft — the failed row and the rows that were never sent.
    // The request wrote nothing, so the drafts are still exactly what the editor typed.
    setServerFailure(error, 'menyimpan perubahan tabel');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div class="mt-6 flex border-b border-slate-200" role="tablist" aria-label="Kategori CMS">
      <button
        v-for="(tab, tabIndex) in availableTabs"
        :key="tab.id"
        :id="`tab-${tab.id}`"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        class="border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
        :class="
          activeTab === tab.id
            ? 'border-brand-navy text-brand-navy font-semibold'
            : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
        "
        :data-test="`tab-${tab.id}`"
        @click="selectTab(tab)"
        @keydown="handleTabKeydown($event, tabIndex)"
      >
        {{ tab.label }}
      </button>
    </div>

    <AlertBanner
      v-if="loadError"
      :message="loadError"
      :kind="loadErrorKind"
      :busy="isLoading"
      class="mt-6"
      data-test="load-error"
      @retry="loadAll"
    />

    <AlertBanner
      v-if="serverError && !isEditorOpen && serverError !== loadError"
      :message="serverError"
      :kind="serverErrorKind ?? undefined"
      tone="warning"
      class="mt-4"
      data-test="page-message"
    />

    <!-- A notice, not a blocking failure: the page list still works without the hierarchy. -->
    <AlertBanner
      v-if="pagesStore.hierarchyError"
      tone="warning"
      live="polite"
      class="mt-4"
      message="Struktur halaman tidak dapat dimuat, jadi asal halaman tiap data tidak ditampilkan. Daftar data tetap dapat diedit."
      :kind="pagesStore.hierarchyErrorKind ?? undefined"
      data-test="hierarchy-error"
    />

    <div
      v-for="tab in availableTabs"
      :key="tab.id"
      :id="`panel-${tab.id}`"
      role="tabpanel"
      :aria-labelledby="`tab-${tab.id}`"
      :hidden="activeTab !== tab.id"
    >
      <template v-if="activeTab === tab.id">
        <p
          v-if="tab.id === 'konten'"
          class="text-text-muted mt-6 text-sm"
          data-test="publikasi-moved"
        >
          Katalog publikasi dikelola di halaman
          <router-link
            to="/admin/publikasi"
            class="text-brand-navy focus-visible:outline-focus-ring rounded-xs font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="publikasi-moved-link"
            >Publikasi</router-link
          >, bersama unggahan berkas dan sampulnya.
        </p>
        <div class="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <form
            role="search"
            aria-label="Saring daftar data"
            class="flex w-full flex-col gap-3 sm:flex-row sm:items-end md:w-auto"
            @submit.prevent
          >
            <div class="w-full sm:w-72">
              <label for="data-search" class="block text-xs font-medium text-slate-600">
                Cari data
              </label>
              <input
                id="data-search"
                v-model="searchQuery"
                type="search"
                placeholder="Nama indikator, halaman, atau sumber"
                :class="INPUT_CLASSES"
                class="mt-1"
              />
            </div>

            <div v-if="activeTab === 'indikator'" class="w-full sm:w-52">
              <label for="data-type" class="block text-xs font-medium text-slate-600">
                Tipe data
              </label>
              <select id="data-type" v-model="typeFilter" :class="INPUT_CLASSES" class="mt-1">
                <option value="all">Semua Tipe Data</option>
                <option value="skalar">Skalar</option>
                <option value="matriks">Matriks</option>
              </select>
            </div>
          </form>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center md:justify-end">
            <p
              class="text-xs text-slate-600 md:text-right"
              aria-live="polite"
              data-test="result-count"
            >
              Menampilkan {{ filteredCards.length }} dari {{ cards.length }} data
            </p>
            <BaseButton
              v-if="activeTab === 'indikator'"
              size="md"
              class="w-full sm:w-auto"
              data-test="data-create-open"
              @click="openCreate"
            >
              Tambah Data
            </BaseButton>
          </div>
        </div>

        <p
          v-if="isLoading && cards.length === 0"
          class="mt-10 text-sm text-slate-600"
          aria-live="polite"
        >
          Memuat data…
        </p>

        <div
          v-else-if="filteredCards.length === 0"
          class="rounded-card mt-10 border border-dashed border-slate-300 bg-white px-6 py-12 text-center"
        >
          <p class="text-base font-semibold text-slate-800">
            {{
              cards.length === 0
                ? activeTab === 'konten'
                  ? 'Belum ada data blok konten'
                  : 'Belum ada data indikator'
                : 'Tidak ada data yang cocok'
            }}
          </p>
          <p class="mx-auto mt-2 max-w-md text-sm text-slate-600">
            <template v-if="cards.length === 0">
              <template v-if="activeTab === 'konten'">
                Blok konten belum tersedia untuk lingkungan ini. Setelah dimigrasikan atau diisi,
                kartunya akan muncul di sini dan bisa diedit.
              </template>
              <template v-else>
                Data indikator dan tabel matriks belum tersedia untuk lingkungan ini. Setelah
                datanya diisi, kartunya akan muncul di sini dan bisa diedit.
              </template>
            </template>
            <template v-else>
              Ubah kata kunci pencarian atau pilih tipe data lain untuk melihat data yang lain.
            </template>
          </p>
          <BaseButton
            v-if="cards.length > 0"
            variant="secondary"
            size="sm"
            class="mt-4"
            @click="
              searchQuery = '';
              typeFilter = 'all';
            "
          >
            Kosongkan filter
          </BaseButton>
        </div>

        <template v-else>
          <h2 class="sr-only">Daftar data</h2>

          <ul class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <li v-for="card in filteredCards" :key="`${card.type}-${card.id}`" class="h-full">
              <IndicatorCard :card="card" @edit="handleEdit(card)" />
            </li>
          </ul>
        </template>
      </template>
    </div>

    <p class="sr-only" aria-live="polite">{{ statusMessage }}</p>
    <BaseModal
      :open="isEditorOpen"
      :title="modalTitle"
      :description="modalDescription"
      :size="modalSize"
      :busy="saving || addingRow"
      @close="resetEditor"
    >
      <CreateDataForm
        v-if="isCreateOpen"
        :busy="saving"
        :server-error="serverError"
        :server-error-kind="serverErrorKind"
        @submit="handleCreateSubmit"
        @cancel="resetEditor"
      />

      <p v-else-if="isTableDetailLoading" class="text-sm text-slate-600" aria-live="polite">
        Memuat rincian tabel…
      </p>

      <ScalarIndicatorForm
        v-else-if="activeScalar"
        :indicator="activeScalar"
        :busy="saving"
        :server-error="serverError"
        :templates="templatesStore.templates"
        :templates-error="templatesStore.selectorError ?? ''"
        @submit="handleScalarSubmit"
        @cancel="resetEditor"
      />

      <div v-else-if="activeTable" class="space-y-8">
        <TableIndicatorForm
          :table="activeTable"
          :busy="saving"
          :server-error="serverError"
          @submit="handleTableSubmit"
          @cancel="resetEditor"
        />

        <div class="border-t border-slate-200 pt-6">
          <TableRowAddForm
            :key="rowFormKey"
            :kind="activeTable.kind"
            :busy="saving || addingRow"
            :server-error="rowError"
            :server-error-kind="rowErrorKind"
            @submit="handleRowAdd"
          />
        </div>
      </div>

      <ContentBlockForm
        v-else-if="activeContentBlock"
        :key="`${activeContentBlock.slug}:${activeContentBlock.updatedAt}`"
        :block="activeContentBlock"
        :busy="saving"
        :server-error="serverError"
        :stale="contentBlockStale"
        :section-label="
          activeContentBlock.sectionId
            ? pagesStore.breadcrumbParts(activeContentBlock.sectionId).join(' › ') || undefined
            : undefined
        "
        @submit="handleContentBlockSubmit"
        @cancel="resetEditor"
        @reload="handleContentBlockReload"
      />

      <AlertBanner
        v-else-if="serverError"
        :message="serverError"
        :kind="serverErrorKind ?? undefined"
      />

    </BaseModal>
  </div>
</template>
