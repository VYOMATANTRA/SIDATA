<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import IndicatorCard, { type IndicatorCardModel } from '../components/data/IndicatorCard.vue';
import ScalarIndicatorForm from '../components/data/ScalarIndicatorForm.vue';
import TableIndicatorForm, {
  type TableSavePayload,
} from '../components/data/TableIndicatorForm.vue';
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
import { formatDecimalId } from '../utils/formatNumber';
import { INPUT_CLASSES } from '../utils/formStyles';

/**
 * CMS entry point for indicator data (issue: "CMS forms for indicators", SPEC §3/§4). Mounted
 * inside AdminLayout, which supplies the page's <main>/<h1>/skip link/breadcrumb — this view
 * only owns its own content.
 *
 * Deliberately scoped: no create/delete, no bulk import. It lists whatever scalar indicators and
 * matrix tables already exist and opens a single accessible edit dialog per type. Creating new
 * rows needs a `sections` management surface that does not exist yet (the seed creates pages and
 * chapters, not sections), so it stays out of this view.
 */

type TypeFilter = 'all' | 'skalar' | 'matriks';

const indicatorsStore = useIndicatorsStore();
const tablesStore = useIndicatorTablesStore();
const pagesStore = usePagesStore();

const searchQuery = ref('');
const typeFilter = ref<TypeFilter>('all');

const activeScalar = ref<Indicator | null>(null);
const activeTableId = ref<string | null>(null);
const activeTable = ref<IndicatorTableDetail | null>(null);
const isTableDetailLoading = ref(false);
const saving = ref(false);
const serverError = ref('');
const statusMessage = ref('');

const isEditorOpen = computed(() => activeScalar.value !== null || activeTableId.value !== null);

const isLoading = computed(() => indicatorsStore.isLoading || tablesStore.isLoading);

const loadError = computed(() => indicatorsStore.error || tablesStore.error);

function compareCards(a: IndicatorCardModel, b: IndicatorCardModel): number {
  const pageA = a.kicker ?? '\uffff';
  const pageB = b.kicker ?? '\uffff';
  const byPage = pageA.localeCompare(pageB, 'id');
  if (byPage !== 0) return byPage;
  if (a.type !== b.type) return a.type === 'skalar' ? -1 : 1;
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

const modalTitle = computed(() =>
  activeTableId.value ? 'Edit Tabel Matriks' : 'Edit Angka Indikator Skalar',
);

const modalSize = computed<'md' | 'xl'>(() => (activeTableId.value ? 'xl' : 'md'));

const modalDescription = computed(() => {
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
  ]);
}

onMounted(loadAll);

function openScalar(indicator: Indicator): void {
  serverError.value = '';
  activeTableId.value = null;
  activeTable.value = null;
  activeScalar.value = indicator;
}

/**
 * Resolves the card back to its store row on click. Doing it here rather than inline in the
 * template keeps the lookup honest: a card whose row has disappeared since render simply does
 * nothing instead of dereferencing `undefined`.
 */
function handleEdit(card: IndicatorCardModel): void {
  if (card.type === 'skalar') {
    const indicator = indicatorsStore.indicators.find((item) => item.id === card.id);
    if (indicator) openScalar(indicator);
    return;
  }

  const table = tablesStore.tables.find((item) => item.id === card.id);
  if (table) void openTable(table);
}

async function openTable(table: IndicatorTable): Promise<void> {
  serverError.value = '';
  activeScalar.value = null;
  activeTable.value = null;
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
  isTableDetailLoading.value = false;
  serverError.value = '';
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
  <div>
    <div>
      <p class="text-xs font-semibold tracking-widest text-slate-500 uppercase">CMS Data</p>
      <h2 class="text-brand-navy mt-1 text-xl font-bold">Data</h2>
      <p class="mt-1 max-w-2xl text-sm text-slate-600">
        Kelola angka indikator skalar dan empat tabel matriks. Angka dimasukkan manual; impor massal
        belum tersedia.
      </p>
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

        <div class="w-full sm:w-52">
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

    <p class="sr-only" aria-live="polite">{{ statusMessage }}</p>

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

      <p v-else-if="serverError" role="alert" class="text-sm text-rose-700">
        {{ serverError }}
      </p>
    </BaseModal>
  </div>
</template>
