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
import PublicSettingsForm from '../components/data/PublicSettingsForm.vue';
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
import { useSettingsStore, type PublicSettings } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth';
import { formatDecimalId } from '../utils/formatNumber';
import { INPUT_CLASSES } from '../utils/formStyles';
import { classifyFailure, toUserMessage } from '../utils/userMessages';
import {
  blockDisplayName,
  blockPlacement,
  isBlockShownOnSite,
} from '../components/data/blocks/blockMeta';
import type { BlockSavePayload } from '../components/data/blocks/blockFormShared';

/**
 * CMS entry point for indicator data, content blocks, and public settings (SPEC §3/§4).
 *
 * Scoped CMS editing:
 * - Scalar indicators (ScalarIndicatorForm)
 * - Matrix tables (TableIndicatorForm)
 * - Content blocks (ContentBlockForm)
 * - Public portal settings (PublicSettingsForm, admin-only)
 */

type TypeFilter = 'all' | 'skalar' | 'matriks';
type ActiveTab = 'indikator' | 'konten' | 'pengaturan';

const indicatorsStore = useIndicatorsStore();
const tablesStore = useIndicatorTablesStore();
const pagesStore = usePagesStore();
const contentBlocksStore = useContentBlocksStore();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const templatesStore = useComparisonTemplatesStore();

const activeTab = ref<ActiveTab>('indikator');
const searchQuery = ref('');
const typeFilter = ref<TypeFilter>('all');

const availableTabs = computed(() => {
  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'indikator', label: 'Indikator & Tabel' },
    { id: 'konten', label: 'Blok Konten & Profil' },
  ];
  if (authStore.isAdmin) {
    tabs.push({ id: 'pengaturan', label: 'Pengaturan Publik Portal' });
  }
  return tabs;
});

function selectTab(tab: (typeof availableTabs.value)[number]) {
  activeTab.value = tab.id;
  typeFilter.value = 'all';
  searchQuery.value = '';
}

async function handleTabKeydown(event: KeyboardEvent, index: number) {
  const tabs = availableTabs.value;
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
const isEditingSettings = ref(false);
const settingsForm = ref<InstanceType<typeof PublicSettingsForm> | null>(null);
const settingsFormDirty = ref(false);
const settingsDiscardPromptOpen = ref(false);
const settingsKeepButton = ref<HTMLButtonElement | null>(null);
/** Control that had focus when the discard prompt opened, so "Tetap di sini" can give it back. */
let settingsFocusBeforePrompt: HTMLElement | null = null;

const isTableDetailLoading = ref(false);
const saving = ref(false);
const serverError = ref('');
const statusMessage = ref('');

const isEditorOpen = computed(
  () =>
    activeScalar.value !== null ||
    activeTableId.value !== null ||
    activeContentBlock.value !== null ||
    isEditingSettings.value,
);

const isLoading = computed(() => {
  if (activeTab.value === 'konten') return contentBlocksStore.isLoading;
  if (activeTab.value === 'pengaturan') return settingsStore.isLoading;
  return indicatorsStore.isLoading || tablesStore.isLoading;
});

const loadError = computed(() => {
  if (activeTab.value === 'konten') return contentBlocksStore.error;
  // The settings tab only links to the configuration page; it loads nothing of its own.
  if (activeTab.value === 'pengaturan') return null;
  return indicatorsStore.error || tablesStore.error;
});

const loadErrorKind = computed(() => {
  if (activeTab.value === 'konten') return contentBlocksStore.errorKind ?? undefined;
  if (activeTab.value === 'pengaturan') return undefined;
  if (indicatorsStore.error) return indicatorsStore.errorKind ?? undefined;
  return tablesStore.errorKind ?? undefined;
});

function compareCards(a: IndicatorCardModel, b: IndicatorCardModel): number {
  if (a.type === 'pengaturan') return 1;
  if (b.type === 'pengaturan') return -1;
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

  if (activeTab.value === 'pengaturan') {
    if (!authStore.isAdmin) return [];
    return [
      {
        id: 'public-settings',
        type: 'pengaturan' as const,
        title: 'Pengaturan Publik Portal',
        kicker: 'Sistem',
        sectionLabel: settingsStore.appName,
        stats: [
          { label: 'Nama Institusi', value: settingsStore.institutionName },
          { label: 'Kontak Telepon', value: settingsStore.contactPhone || '—' },
        ],
        source: null,
        hedgeNote: null,
        isStale: false,
      },
    ];
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
  if (activeContentBlock.value) {
    return `Edit Blok Konten: ${blockDisplayName(activeContentBlock.value)}`;
  }
  if (isEditingSettings.value) {
    return 'Edit Pengaturan Publik Portal';
  }
  return activeTableId.value ? 'Edit Tabel Matriks' : 'Edit Angka Indikator Skalar';
});

const modalSize = computed<'md' | 'xl'>(() =>
  activeTableId.value || activeContentBlock.value || isEditingSettings.value ? 'xl' : 'md',
);

const modalDescription = computed(() => {
  // A content block's own form opens with the "Tampil di: …" line, so the dialog adds none.
  if (activeContentBlock.value) return undefined;
  if (isEditingSettings.value) {
    return 'Pengaturan profil institusi, kontak pelayanan, dan tampilan awal peta.';
  }
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

function errorMessage(error: unknown, action: string, method?: string): string {
  return toUserMessage(error, action, method).message;
}

async function loadAll(): Promise<void> {
  await Promise.allSettled([
    pagesStore.fetchHierarchy(),
    indicatorsStore.fetchIndicators(true),
    tablesStore.fetchTables(true),
    contentBlocksStore.fetchBlocks(true),
    settingsStore.fetchPublicSettings(true),
  ]);
}

onMounted(() => {
  void loadAll();
});

function openScalar(indicator: Indicator): void {
  serverError.value = '';
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  isEditingSettings.value = false;
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
  serverError.value = '';
  activeScalar.value = null;
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  isEditingSettings.value = false;

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

  if (card.type === 'pengaturan') {
    if (!authStore.isAdmin) return;
    if (settingsStore.error || !settingsStore.isLoaded) {
      serverError.value = settingsStore.error
        ? settingsStore.error
        : settingsStore.isLoading
          ? 'Pengaturan publik masih dimuat. Coba lagi sebentar lagi.'
          : 'Pengaturan publik belum siap. Muat ulang halaman lalu coba lagi.';
      return;
    }
    settingsFormDirty.value = false;
    isEditingSettings.value = true;
    return;
  }
}

async function openTable(table: IndicatorTable): Promise<void> {
  serverError.value = '';
  activeScalar.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  isEditingSettings.value = false;
  activeTableId.value = table.id;
  isTableDetailLoading.value = true;
  try {
    activeTable.value = await tablesStore.fetchTableDetail(table.id);
  } catch (error) {
    serverError.value = errorMessage(error, 'memuat rincian tabel', 'GET');
  } finally {
    isTableDetailLoading.value = false;
  }
}

function resetEditor(): void {
  settingsDiscardPromptOpen.value = false;
  settingsFocusBeforePrompt = null;
  activeScalar.value = null;
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  contentBlockStale.value = false;
  isEditingSettings.value = false;
  settingsFormDirty.value = false;
  isTableDetailLoading.value = false;
  serverError.value = '';
  templatesStore.clearSelectorError();
}

async function handleContentBlockSubmit(payload: BlockSavePayload): Promise<void> {
  const target = activeContentBlock.value;
  if (!target) return;

  saving.value = true;
  serverError.value = '';
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
    serverError.value = errorMessage(error, 'menyimpan perubahan blok konten');
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
  serverError.value = '';
  contentBlockStale.value = false;
  activeContentBlock.value = fresh;
  announce('Versi terbaru blok konten dimuat.');
}

/**
 * Batal, Escape, the close button and the backdrop all land here for the settings dialog. A dirty
 * draft asks first; while the prompt is up, Escape, the backdrop and the close button mean "stay".
 */
function requestCloseSettings(): void {
  if (saving.value) return;
  if (settingsDiscardPromptOpen.value) {
    keepEditingSettings();
    return;
  }
  const isDirty = settingsForm.value?.isDirty ?? settingsFormDirty.value;
  if (!isDirty) {
    resetEditor();
    return;
  }
  const active = document.activeElement;
  settingsFocusBeforePrompt = active instanceof HTMLElement ? active : null;
  settingsDiscardPromptOpen.value = true;
  void nextTick(() => settingsKeepButton.value?.focus());
}

function keepEditingSettings(): void {
  settingsDiscardPromptOpen.value = false;
  const target = settingsFocusBeforePrompt;
  settingsFocusBeforePrompt = null;
  void nextTick(() => {
    if (target?.isConnected) target.focus();
    else document.getElementById('settings-appName')?.focus();
  });
}

function handleModalClose(): void {
  if (isEditingSettings.value) requestCloseSettings();
  else resetEditor();
}

async function handleSettingsSubmit(patch: Partial<PublicSettings>): Promise<void> {
  saving.value = true;
  serverError.value = '';
  try {
    await settingsStore.updatePublicSettings(patch);
    resetEditor();
    announce('Pengaturan publik portal berhasil disimpan.');
  } catch (error) {
    serverError.value = errorMessage(error, 'menyimpan pengaturan publik');
  } finally {
    saving.value = false;
  }
}

async function handleScalarSubmit(patch: IndicatorPatch): Promise<void> {
  const target = activeScalar.value;
  if (!target) return;

  saving.value = true;
  serverError.value = '';
  try {
    await indicatorsStore.updateIndicator(target.id, patch);
    resetEditor();
    announce(`Perubahan indikator “${target.label}” disimpan.`);
  } catch (error) {
    serverError.value = errorMessage(error, 'menyimpan perubahan indikator');
  } finally {
    saving.value = false;
  }
}

async function handleTableSubmit(payload: TableSavePayload): Promise<void> {
  const target = activeTable.value;
  if (!target) return;

  saving.value = true;
  serverError.value = '';
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
    serverError.value = errorMessage(error, 'menyimpan perubahan tabel');
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
      tone="warning"
      class="mt-4"
      data-test="page-message"
    />

    <p
      v-if="pagesStore.hierarchyError"
      class="rounded-card mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
    >
      Struktur halaman tidak dapat dimuat, jadi asal halaman tiap data tidak ditampilkan. Daftar
      data tetap dapat diedit.
    </p>

    <div
      v-for="tab in availableTabs"
      :key="tab.id"
      :id="`panel-${tab.id}`"
      role="tabpanel"
      :aria-labelledby="`tab-${tab.id}`"
      :hidden="activeTab !== tab.id"
    >
      <div
        v-if="tab.id === 'pengaturan' && activeTab === tab.id"
        class="rounded-card border-border bg-surface-muted mt-6 space-y-3 border p-6"
        data-test="settings-moved"
      >
        <p class="text-brand-navy text-sm">
          Pengaturan portal kini dikelola di halaman Konfigurasi sistem, bersama tampilan awal peta,
          cuaca, dan masa simpan log.
        </p>
        <router-link
          to="/admin/sistem/konfigurasi"
          class="rounded-btn border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-text-inverse focus-visible:outline-focus-ring inline-flex min-h-11 items-center justify-center border-2 bg-white px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          data-test="settings-moved-link"
        >
          Buka Konfigurasi sistem
        </router-link>
      </div>

      <template v-if="activeTab === tab.id && tab.id !== 'pengaturan'">
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

          <p
            class="text-xs text-slate-600 md:text-right"
            aria-live="polite"
            data-test="result-count"
          >
            Menampilkan {{ filteredCards.length }} dari {{ cards.length }} data
          </p>
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
                  : activeTab === 'pengaturan'
                    ? 'Belum ada pengaturan'
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
              <template v-else-if="activeTab === 'pengaturan'">
                Pengaturan publik belum dikonfigurasi.
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
      :busy="saving"
      @close="handleModalClose"
    >
      <p v-if="isTableDetailLoading" class="text-sm text-slate-600" aria-live="polite">
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

      <TableIndicatorForm
        v-else-if="activeTable"
        :table="activeTable"
        :busy="saving"
        :server-error="serverError"
        @submit="handleTableSubmit"
        @cancel="resetEditor"
      />

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

      <PublicSettingsForm
        v-else-if="isEditingSettings"
        v-show="!settingsDiscardPromptOpen"
        ref="settingsForm"
        :settings="settingsStore.settings"
        :busy="saving"
        :server-error="serverError"
        @submit="handleSettingsSubmit"
        @cancel="requestCloseSettings"
        @dirty-change="settingsFormDirty = $event"
      />

      <AlertBanner v-else-if="serverError" :message="serverError" />

      <div
        v-if="isEditingSettings && settingsDiscardPromptOpen"
        role="alertdialog"
        aria-labelledby="settings-discard-title"
        aria-describedby="settings-discard-body"
        class="space-y-4"
        data-test="settings-discard-prompt"
      >
        <h3 id="settings-discard-title" class="text-brand-navy text-base font-semibold">
          Perubahan belum disimpan
        </h3>
        <p id="settings-discard-body" class="text-brand-navy text-sm">
          Tutup tanpa menyimpan perubahan?
        </p>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            data-test="settings-discard-confirm"
            @click="resetEditor"
          >
            Tutup tanpa menyimpan
          </BaseButton>
          <button
            ref="settingsKeepButton"
            type="button"
            class="bg-brand-navy hover:bg-brand-navy/90 focus-visible:outline-focus-ring rounded-btn min-h-11 px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="settings-discard-keep"
            @click="keepEditingSettings"
          >
            Tetap di sini
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
