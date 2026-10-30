<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
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
import { usePagesStore } from '../stores/pages.store';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';
import { useSettingsStore, type PublicSettings } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth';
import { formatDecimalId } from '../utils/formatNumber';
import { INPUT_CLASSES } from '../utils/formStyles';

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

const activeScalar = ref<Indicator | null>(null);
const activeTableId = ref<string | null>(null);
const activeTable = ref<IndicatorTableDetail | null>(null);
const activeContentBlock = ref<ContentBlock | null>(null);
const isEditingSettings = ref(false);

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
  if (activeTab.value === 'pengaturan') return settingsStore.error;
  return indicatorsStore.error || tablesStore.error;
});

function compareCards(a: IndicatorCardModel, b: IndicatorCardModel): number {
  if (a.type === 'pengaturan') return 1;
  if (b.type === 'pengaturan') return -1;
  const pageA = a.kicker ?? '\uffff';
  const pageB = b.kicker ?? '\uffff';
  const byPage = pageA.localeCompare(pageB, 'id');
  if (byPage !== 0) return byPage;
  if (a.type !== b.type) return a.type === 'skalar' ? -1 : b.type === 'skalar' ? 1 : a.type.localeCompare(b.type, 'id');
  return a.title.localeCompare(b.title, 'id');
}

const cards = computed<IndicatorCardModel[]>(() => {
  const scalarCards: IndicatorCardModel[] = indicatorsStore.indicators.map(
    (indicator: Indicator) => {
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
    },
  );

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
    return Object.values(contentBlocksStore.blocks)
      .map((block) => ({
        id: block.slug,
        type: 'konten' as const,
        title: block.title ?? block.slug,
        kicker: 'Blok Konten',
        sectionLabel: `Tipe: ${block.type} · Slug: ${block.slug}`,
        stats: [
          { label: 'Tipe blok', value: block.type },
          {
            label: 'Terakhir diperbarui',
            value: new Date(block.updatedAt).toLocaleDateString('id-ID'),
          },
        ],
        source: null,
        hedgeNote: null,
        isStale: false,
      }))
      .sort(compareCards);
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
    return `Edit Blok Konten: ${activeContentBlock.value.title ?? activeContentBlock.value.slug}`;
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
  if (activeContentBlock.value) {
    return `Slug: ${activeContentBlock.value.slug} · Tipe: ${activeContentBlock.value.type}`;
  }
  if (isEditingSettings.value) {
    return 'Pengaturan profil institusi, kontak pelayanan, dan titik koordinat peta default.';
  }
  const sectionId = activeScalar.value?.sectionId ?? activeTable.value?.sectionId;
  if (!sectionId) return undefined;
  const parts = pagesStore.breadcrumbParts(sectionId);
  return parts.length > 0 ? parts.join(' › ') : undefined;
});

function announce(message: string): void {
  statusMessage.value = message;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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

onMounted(loadAll);

function openScalar(indicator: Indicator): void {
  serverError.value = '';
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  isEditingSettings.value = false;
  activeScalar.value = indicator;
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
    const indicator = indicatorsStore.indicators.find((item: Indicator) => item.id === card.id);
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
      activeContentBlock.value = block;
    }
    return;
  }

  if (card.type === 'pengaturan') {
    if (!authStore.isAdmin) return;
    if (settingsStore.error || !settingsStore.isLoaded) {
      serverError.value = settingsStore.error
        || 'Pengaturan publik belum siap. Muat ulang halaman lalu coba lagi.';
      return;
    }
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
    serverError.value = errorMessage(error, 'Gagal memuat rincian tabel. Silakan coba lagi.');
  } finally {
    isTableDetailLoading.value = false;
  }
}

function resetEditor(): void {
  activeScalar.value = null;
  activeTableId.value = null;
  activeTable.value = null;
  activeContentBlock.value = null;
  isEditingSettings.value = false;
  isTableDetailLoading.value = false;
  serverError.value = '';
}

async function handleContentBlockSubmit(payload: {
  title: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
}): Promise<void> {
  const target = activeContentBlock.value;
  if (!target) return;

  saving.value = true;
  serverError.value = '';
  try {
    const updated = await contentBlocksStore.updateBlock(target.slug, payload);
    resetEditor();
    announce(`Perubahan blok konten “${updated.title ?? updated.slug}” disimpan.`);
  } catch (error) {
    serverError.value = errorMessage(error, 'Gagal menyimpan perubahan blok konten.');
  } finally {
    saving.value = false;
  }
}

async function handleSettingsSubmit(patch: Partial<PublicSettings>): Promise<void> {
  saving.value = true;
  serverError.value = '';
  try {
    await settingsStore.updatePublicSettings(patch);
    resetEditor();
    announce('Pengaturan publik portal berhasil disimpan.');
  } catch (error) {
    serverError.value = errorMessage(error, 'Gagal menyimpan pengaturan publik.');
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
    serverError.value = errorMessage(error, 'Gagal menyimpan perubahan indikator.');
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
    serverError.value = errorMessage(error, 'Gagal menyimpan perubahan tabel.');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50">
    <!-- Skip link, docs/ACCESSIBILITY.md §3 (2.4.1) -->
    <a
      href="#main-content"
      class="focus:bg-brand-navy focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
    >
      Lewati ke konten utama
    </a>

    <header class="border-b border-slate-200 bg-white">
      <div
        class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8"
      >
        <RouterLink
          to="/"
          class="focus-visible:outline-brand-navy rounded-btn text-brand-navy inline-flex items-center gap-2 px-2 py-1 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Beranda
        </RouterLink>

        <span
          class="bg-brand-navy/5 text-brand-navy rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase"
        >
          Editor / Admin
        </span>
      </div>
    </header>

    <main id="main-content" class="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p class="text-xs font-semibold tracking-widest text-slate-500 uppercase">
          CMS Data &amp; Konten
        </p>
        <h1 class="text-brand-navy mt-1 text-xl font-bold">Data &amp; Konten Portal</h1>
        <p class="mt-1 max-w-2xl text-sm text-slate-600">
          Kelola angka indikator skalar, tabel matriks, narasi blok konten, dan pengaturan publik
          portal.
        </p>
      </div>

      <div class="mt-6 flex border-b border-slate-200" role="tablist" aria-label="Kategori CMS">
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          :id="`tab-${tab.id}`"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`panel-${tab.id}`"
          class="border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
          :class="
            activeTab === tab.id
              ? 'border-brand-navy text-brand-navy font-semibold'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          "
          :data-test="`tab-${tab.id}`"
          @click="
            activeTab = tab.id;
            typeFilter = 'all';
            searchQuery = '';
          "
        >
          {{ tab.label }}
        </button>
      </div>

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

        <p class="text-xs text-slate-600 md:text-right" aria-live="polite" data-test="result-count">
          Menampilkan {{ filteredCards.length }} dari {{ cards.length }} data
        </p>
      </div>

      <div
        v-if="loadError"
        role="alert"
        class="rounded-card mt-6 border border-rose-300 bg-rose-50 px-4 py-3"
      >
        <p class="text-sm font-medium text-rose-900">{{ loadError }}</p>
        <BaseButton variant="secondary" size="sm" class="mt-3" @click="loadAll">
          Coba muat ulang
        </BaseButton>
      </div>

      <p
        v-if="pagesStore.hierarchyError"
        class="rounded-card mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
      >
        Struktur halaman tidak dapat dimuat, jadi asal halaman tiap data tidak ditampilkan. Daftar
        data tetap dapat diedit.
      </p>

      <div role="tabpanel" :id="`panel-${activeTab}`" :aria-labelledby="`tab-${activeTab}`">
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
            {{ cards.length === 0 ? 'Belum ada data indikator' : 'Tidak ada data yang cocok' }}
          </p>
          <p class="mx-auto mt-2 max-w-md text-sm text-slate-600">
            <template v-if="cards.length === 0">
              Data indikator dan tabel matriks belum tersedia untuk lingkungan ini. Setelah datanya
              diisi, kartunya akan muncul di sini dan bisa diedit.
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
      </div>

      <p class="sr-only" aria-live="polite">{{ statusMessage }}</p>
    </main>

    <BaseModal
      :open="isEditorOpen"
      :title="modalTitle"
      :description="modalDescription"
      :size="modalSize"
      :busy="saving"
      @close="resetEditor"
    >
      <p v-if="isTableDetailLoading" class="text-sm text-slate-600" aria-live="polite">
        Memuat rincian tabel…
      </p>

      <ScalarIndicatorForm
        v-else-if="activeScalar"
        :indicator="activeScalar"
        :busy="saving"
        :server-error="serverError"
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
        :block="activeContentBlock"
        :busy="saving"
        :server-error="serverError"
        @submit="handleContentBlockSubmit"
        @cancel="resetEditor"
      />

      <PublicSettingsForm
        v-else-if="isEditingSettings"
        :settings="settingsStore.settings"
        :busy="saving"
        :server-error="serverError"
        @submit="handleSettingsSubmit"
        @cancel="resetEditor"
      />

      <p v-else-if="serverError" role="alert" class="text-sm text-rose-700">
        {{ serverError }}
      </p>
    </BaseModal>
  </div>
</template>
