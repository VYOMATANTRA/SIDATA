<script setup lang="ts">
/**
 * `/admin/publikasi`: the publication catalog (SPEC §8). Editors and Admins browse the catalog as a
 * single-column list of cards, search it and filter by category, select cards for a bulk delete,
 * drag them (or use Naik / Turun in Urutkan mode) to reorder, and add, edit or remove one publication
 * at a time. The catalog title and intro are edited in a small dialog.
 *
 * Every change builds the full list and saves it through `store.savePublikasiCatalog`
 * (`PUT /api/publikasi/catalog`, with the block's `expectedUpdatedAt`). A bulk delete is one such save,
 * so it is all-or-nothing. A stale write keeps the open dialog's draft and offers "Muat versi terbaru",
 * which replaces the draft only on request.
 *
 * The selection, drag and bulk-delete parts are shared with the Cerita screen (`composables/` and
 * `components/admin/cards/`). Header title and subtitle live in route `meta` (router/index.ts), so this
 * view starts at <h2>.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AlertBanner from '../components/common/AlertBanner.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import BulkDeleteDialog from '../components/admin/cards/BulkDeleteDialog.vue';
import CardListToolbar from '../components/admin/cards/CardListToolbar.vue';
import CardSearchField from '../components/admin/cards/CardSearchField.vue';
import CardSelectionBar from '../components/admin/cards/CardSelectionBar.vue';
import SelectAllButton from '../components/admin/cards/SelectAllButton.vue';
import type { BulkResult } from '../components/admin/cards/cardTypes';
import PublikasiCardList, { type PublikasiRow } from '../components/admin/publikasi/PublikasiCardList.vue';
import PublikasiCatalogInfoForm from '../components/admin/publikasi/PublikasiCatalogInfoForm.vue';
import PublikasiItemForm from '../components/admin/publikasi/PublikasiItemForm.vue';
import { useCardDragReorder, type DragBlock } from '../composables/useCardDragReorder';
import { useCardSelection } from '../composables/useCardSelection';
import { INPUT_CLASSES } from '../utils/formStyles';
import { PUBLICATIONS, type PublicationItem } from '../content/publikasi';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';
import { classifyFailure, toUserMessage, type FailureKind } from '../utils/userMessages';

/** A stored publication: the public shape, plus any other key the server returned untouched. */
type StoredPublication = PublicationItem & Record<string, unknown>;

/** The dialog currently open. Only one is open at a time (the bulk dialog is separate). */
type Dialog =
  | { kind: 'item'; index: number | null }
  | { kind: 'delete'; index: number }
  | { kind: 'info' };

const MAX_ITEMS = 25;
const BLOCK_SLUG = 'publikasi-katalog';
const ids = {
  search: 'publikasi-cari',
  category: 'publikasi-kategori',
  sortToggle: 'publikasi-urutkan',
  selectAll: 'publikasi-pilih-semua',
  bulkDelete: 'publikasi-hapus-terpilih',
  add: 'publikasi-add',
} as const;

const store = useContentBlocksStore();

/** The block the page was last loaded or saved from. Its `updatedAt` is the write token. */
const block = ref<ContentBlock | null>(null);
/** The publications in catalog order, as last stored. Edits build a new list from this. */
const items = ref<StoredPublication[]>([]);

/**
 * Failure of the last catalog load, or null. Kept as a snapshot because the store clears its
 * `error` when a retry starts; keeping the banner mounted lets its focused "Coba lagi" button
 * stay put and show `busy` while the retry runs.
 */
const loadFailure = ref<{ message: string; kind: FailureKind } | null>(null);

const saving = ref(false);
const stale = ref(false);
const saveError = ref<{ message: string; kind: FailureKind } | null>(null);
const status = ref('');
const dialog = ref<Dialog | null>(null);
/** Remounts the item form with a fresh draft each time its dialog opens. */
const itemFormKey = ref(0);
/** True while the open item form uploads a file or a cover, so its dialog cannot close. */
const itemUploading = ref(false);

const query = ref('');
const categoryFilter = ref('');
/** Urutkan mode: Naik / Turun links show on each card (dragging works either way). */
const sorting = ref(false);

/** The bulk delete: the selected cards when the dialog opened, and the report after the run. */
const bulkTarget = ref<{ items: { key: string; title: string }[] } | null>(null);
const bulkResults = ref<BulkResult[] | null>(null);
const bulkStale = ref(false);
const bulkError = ref('');

// A card needs a stable key for selection and drag, even before the server has given it an id (the
// built-in defaults are never saved). The key is remembered per object, so it survives reorders and
// removals of other cards.
const keyByItem = new WeakMap<StoredPublication, string>();
let keySequence = 0;
function keyOf(item: StoredPublication): string {
  if (typeof item.id === 'string' && item.id !== '') return item.id;
  let key = keyByItem.get(item);
  if (!key) {
    keySequence += 1;
    key = `new-${keySequence}`;
    keyByItem.set(item, key);
  }
  return key;
}

function readPublications(meta: Record<string, unknown> | null): StoredPublication[] {
  const raw = meta?.publications;
  // Only a block that never stored a list shows the built-in catalog; a saved [] stays empty.
  if (!Array.isArray(raw)) return PUBLICATIONS.map((item) => ({ ...item }) as StoredPublication);
  return raw.map((item) => ({ ...(item as StoredPublication) }));
}

function applyBlock(next: ContentBlock): void {
  block.value = next;
  items.value = readPublications(next.metadata);
}

async function loadCatalog(): Promise<void> {
  await store.fetchBlocks(true);
  const found = store.serverBlocks[BLOCK_SLUG] ?? null;
  if (found) applyBlock(found);
  else block.value = null;
  loadFailure.value =
    block.value === null && store.error !== null
      ? { message: store.error, kind: store.errorKind ?? 'unknown' }
      : null;
}

onMounted(loadCatalog);

const categories = computed(() =>
  [...new Set(items.value.map((item) => item.category.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'id'),
  ),
);

// A category that no longer exists (its last publication was removed) cannot stay selected.
watch(categories, (list) => {
  if (categoryFilter.value && !list.includes(categoryFilter.value)) categoryFilter.value = '';
});

const filtering = computed(() => query.value.trim() !== '' || categoryFilter.value !== '');
const isFull = computed(() => items.value.length >= MAX_ITEMS);
const listBusy = computed(() => saving.value);

const visibleRows = computed<PublikasiRow[]>(() => {
  const needle = query.value.trim().toLowerCase();
  return items.value
    .map((publication, index) => ({ key: keyOf(publication), publication, index }))
    .filter(({ publication }) => {
      if (categoryFilter.value && publication.category.trim() !== categoryFilter.value) {
        return false;
      }
      if (!needle) return true;
      return [publication.title, publication.category, publication.description].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
});

/** Select-all and the selection act on the cards the list shows, never on hidden ones. */
const visibleKeys = computed(() => visibleRows.value.map((row) => row.key));
const selection = useCardSelection(visibleKeys);
const selected = selection.selected;
const selectAllState = selection.selectAllState;

/** Why dragging is off: a search or filter hides part of the order, or a save is running. */
const dragBlock = computed<DragBlock>(() => {
  if (filtering.value) return 'search';
  if (listBusy.value) return 'busy';
  return null;
});

const itemKeys = computed(() => items.value.map(keyOf));
const drag = useCardDragReorder({
  order: itemKeys,
  blocked: dragBlock,
  onMove: (key, toIndex) => void placeByKey(key, toIndex),
});
const dragKey = drag.dragKey;
const dropTarget = drag.dropTarget;
const dropAtEnd = drag.dropAtEnd;

const itemDraft = computed<Record<string, unknown> | null>(() => {
  const current = dialog.value;
  if (current?.kind !== 'item' || current.index === null) return null;
  return items.value[current.index] ?? null;
});

const deleteTarget = computed<StoredPublication | null>(() => {
  const current = dialog.value;
  if (current?.kind !== 'delete') return null;
  return items.value[current.index] ?? null;
});

const itemDialogTitle = computed(() =>
  dialog.value?.kind === 'item' && dialog.value.index === null
    ? 'Tambah publikasi'
    : 'Ubah publikasi',
);

function openDialog(next: Dialog): void {
  saveError.value = null;
  stale.value = false;
  itemUploading.value = false;
  if (next.kind === 'item') itemFormKey.value += 1;
  dialog.value = next;
}

function closeDialog(): void {
  if (saving.value) return;
  dialog.value = null;
  saveError.value = null;
  stale.value = false;
}

function openAdd(): void {
  if (isFull.value) return;
  openDialog({ kind: 'item', index: null });
}

function openEdit(index: number): void {
  openDialog({ kind: 'item', index });
}

function openDelete(index: number): void {
  openDialog({ kind: 'delete', index });
}

function openInfo(): void {
  openDialog({ kind: 'info' });
}

/**
 * Saves the whole catalog. On success the block snapshot and the list are replaced by the stored
 * result and the open item dialog closes; on failure every field stays as typed and the error is
 * shown in the open dialog, or on the page when the save came from a card action.
 */
async function saveCatalog(
  next: { title?: string; body?: string; publications: StoredPublication[] },
  message: string,
): Promise<boolean> {
  const target = block.value;
  if (!target || saving.value) return false;
  saving.value = true;
  saveError.value = null;
  stale.value = false;
  status.value = '';
  try {
    const saved = await store.savePublikasiCatalog({
      title: next.title ?? target.title ?? '',
      body: next.body ?? target.body,
      publications: next.publications,
      expectedUpdatedAt: target.updatedAt,
    });
    applyBlock(saved);
    dialog.value = null;
    status.value = message;
    return true;
  } catch (error) {
    const failure = toUserMessage(error, 'menyimpan katalog publikasi', 'PUT');
    saveError.value = { message: failure.message, kind: failure.kind };
    stale.value = classifyFailure(error).kind === 'stale';
    return false;
  } finally {
    saving.value = false;
  }
}

async function handleItemSubmit(publication: Record<string, unknown>): Promise<void> {
  const current = dialog.value;
  if (current?.kind !== 'item') return;
  const next = [...items.value];
  const saved = publication as StoredPublication;
  if (current.index === null) {
    if (next.length >= MAX_ITEMS) return;
    next.push(saved);
  } else {
    next[current.index] = saved;
  }
  await saveCatalog(
    { publications: next },
    current.index === null
      ? `Publikasi “${saved.title.trim()}” ditambahkan.`
      : `Perubahan publikasi “${saved.title.trim()}” disimpan.`,
  );
}

async function confirmDelete(): Promise<void> {
  const current = dialog.value;
  const target = deleteTarget.value;
  if (current?.kind !== 'delete' || !target) return;
  const removedTitle = target.title.trim();
  const saved = await saveCatalog(
    { publications: items.value.filter((_, i) => i !== current.index) },
    `Publikasi “${removedTitle}” dihapus.`,
  );
  if (saved) {
    // The card that held the focus is gone; the "Tambah" button is the stable place to land.
    void nextTick(() => document.getElementById(ids.add)?.focus());
  }
}

/** Moves one publication to `toIndex` (0-based, catalog order) and saves the list. */
async function placeByKey(key: string, toIndex: number): Promise<void> {
  const from = items.value.findIndex((item) => keyOf(item) === key);
  if (from < 0 || toIndex === from || toIndex < 0 || toIndex >= items.value.length) return;
  const next = [...items.value];
  const [moved] = next.splice(from, 1);
  if (!moved) return;
  next.splice(toIndex, 0, moved);
  const direction = toIndex > from ? 1 : -1;
  const saved = await saveCatalog(
    { publications: next },
    `Publikasi “${moved.title.trim()}” dipindah ke posisi ${toIndex + 1}.`,
  );
  if (saved) focusMovedCard(toIndex, direction);
}

function movePublication(index: number, direction: -1 | 1): void {
  if (filtering.value || saving.value) return;
  const current = items.value[index];
  if (!current) return;
  void placeByKey(keyOf(current), index + direction);
}

/** Keeps keyboard focus on the moved card, on the same arrow when it can still move that way. */
function focusMovedCard(index: number, direction: -1 | 1): void {
  void nextTick(() => {
    const same = document.getElementById(
      `publikasi-card-${index}-${direction < 0 ? 'up' : 'down'}`,
    );
    const other = document.getElementById(
      `publikasi-card-${index}-${direction < 0 ? 'down' : 'up'}`,
    );
    const target = [same, other].find(
      (element): element is HTMLButtonElement =>
        element instanceof HTMLButtonElement && !element.disabled,
    );
    (target ?? document.getElementById(`publikasi-card-${index}-ubah`))?.focus();
  });
}

async function saveInfo(value: { title: string; body: string }): Promise<void> {
  await saveCatalog(
    { title: value.title, body: value.body, publications: items.value },
    'Judul dan pengantar katalog disimpan.',
  );
}

/** "Muat versi terbaru": replaces the draft with the stored catalog, only when the editor asks. */
async function reloadCatalog(): Promise<void> {
  await store.fetchBlocks(true);
  const found = store.serverBlocks[BLOCK_SLUG] ?? null;
  if (found) applyBlock(found);
  else block.value = null;
  dialog.value = null;
  saveError.value = null;
  stale.value = false;
  status.value = 'Versi terbaru katalog publikasi dimuat. Perubahan yang belum disimpan dibuang.';
}

function clearFilters(): void {
  query.value = '';
  categoryFilter.value = '';
}

// --- Selection and bulk delete ---

function toggleSorting(): void {
  sorting.value = !sorting.value;
  drag.clearDrag();
}

function toggleSelectAll(): void {
  const result = selection.toggleSelectAll();
  if (result === 'cleared') {
    status.value = 'Pilihan publikasi dibatalkan.';
    return;
  }
  status.value = `${visibleRows.value.length} publikasi dipilih.`;
}

// While something is selected, "Tambah Publikasi" is hidden (`invisible`, its slot keeps the row
// still). If the focused control is one that disappears, focus moves to select-all.
watch(
  () => selected.value.length,
  (count, previous) => {
    if (count === previous) return;
    const active = document.activeElement?.id;
    if (active === ids.bulkDelete || active === ids.add) {
      void nextTick(() => document.getElementById(ids.selectAll)?.focus());
    }
  },
);

function openBulkDelete(): void {
  const picked = items.value
    .filter((item) => selected.value.includes(keyOf(item)))
    .map((item) => ({ key: keyOf(item), title: item.title.trim() }));
  if (picked.length === 0) return;
  bulkResults.value = null;
  bulkStale.value = false;
  bulkError.value = '';
  bulkTarget.value = { items: picked };
}

function closeBulk(): void {
  if (saving.value) return;
  bulkTarget.value = null;
  bulkResults.value = null;
  bulkStale.value = false;
  bulkError.value = '';
  // The button that opened the dialog may now be disabled (nothing selected), so pick a live one.
  void nextTick(() =>
    document
      .getElementById(selected.value.length > 0 ? ids.bulkDelete : ids.selectAll)
      ?.focus(),
  );
}

/**
 * Removes the selected publications with one catalog save. Either all of them are removed or none
 * (the save is atomic), so the report has one line per selected publication with the same outcome.
 */
async function confirmBulkDelete(): Promise<void> {
  const target = bulkTarget.value;
  if (!target || saving.value) return;
  const keys = new Set(target.items.map((item) => item.key));
  const next = items.value.filter((item) => !keys.has(keyOf(item)));
  const saved = await saveCatalog(
    { publications: next },
    `${target.items.length} publikasi dihapus.`,
  );
  if (saved) {
    bulkResults.value = target.items.map((item) => ({
      key: item.key,
      title: item.title,
      status: 'deleted',
    }));
    return;
  }
  const failure = saveError.value;
  bulkStale.value = stale.value;
  bulkError.value = '';
  bulkResults.value = target.items.map((item) => ({
    key: item.key,
    title: item.title,
    status: 'failed',
    message: failure?.message ?? '',
  }));
  saveError.value = null;
  stale.value = false;
}

/** Loads the latest catalog after a stale report; the editor then selects and deletes again. */
async function reloadFromBulk(): Promise<void> {
  await reloadCatalog();
  bulkTarget.value = null;
  bulkResults.value = null;
  bulkStale.value = false;
  bulkError.value = '';
}
</script>

<template>
  <div class="space-y-6">
    <p
      v-if="store.isLoading && !block && !loadFailure"
      class="text-text-muted text-sm"
      role="status"
    >
      Memuat katalog publikasi…
    </p>
    <AlertBanner
      v-else-if="!block && loadFailure"
      :message="loadFailure.message"
      :kind="loadFailure.kind"
      :busy="store.isLoading"
      data-test="publikasi-unavailable"
      @retry="loadCatalog"
    />
    <p
      v-else-if="!block"
      class="rounded-card border-border bg-surface-muted text-text-muted border px-4 py-3 text-sm"
      data-test="publikasi-unavailable"
    >
      Katalog publikasi belum tersedia untuk lingkungan ini.
    </p>

    <template v-else>
      <section aria-labelledby="katalog-judul" class="space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="katalog-judul" class="text-brand-navy text-lg font-semibold break-words">
              {{ block.title || 'Katalog publikasi' }}
            </h2>
            <p class="text-text-muted mt-1 max-w-3xl text-sm whitespace-pre-line">
              {{ block.body }}
            </p>
          </div>
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            class="min-h-11"
            :disabled="saving"
            data-test="info-open"
            @click="openInfo"
          >
            Ubah judul &amp; pengantar
          </BaseButton>
        </div>
        <p class="text-text-muted max-w-3xl text-sm">
          Ini daftar yang warga lihat di halaman Publikasi. Setiap perubahan langsung disimpan dan
          tampil di halaman Publikasi. Berkas yang diunggah baru tampil setelah publikasinya
          disimpan.
        </p>
      </section>

      <AlertBanner
        v-if="saveError && dialog === null && bulkTarget === null"
        :message="saveError.message"
        :kind="saveError.kind"
        data-test="page-error"
      >
        <template v-if="stale" #action>
          <BaseButton
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="saving"
            data-test="catalog-reload"
            @click="reloadCatalog"
          >
            Muat versi terbaru
          </BaseButton>
        </template>
      </AlertBanner>

      <CardListToolbar :hide-add="selected.length > 0">
        <template #search>
          <CardSearchField
            v-model="query"
            :id="ids.search"
            label="Cari publikasi"
            placeholder="Cari publikasi"
          />
        </template>
        <template #filters>
          <div class="w-full md:w-56">
            <label :for="ids.category" class="sr-only">Kategori</label>
            <select
              :id="ids.category"
              v-model="categoryFilter"
              :class="INPUT_CLASSES"
              class="min-h-11 w-full"
              data-test="category-filter"
            >
              <option value="">Semua Kategori</option>
              <option v-for="category in categories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
          </div>
        </template>
        <template #sort>
          <BaseButton
            :id="ids.sortToggle"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11 w-full md:w-auto"
            :aria-pressed="sorting ? 'true' : 'false'"
            :disabled="listBusy"
            data-test="sort-toggle"
            @click="toggleSorting"
          >
            Urutkan Publikasi
          </BaseButton>
        </template>
        <template #select-all>
          <SelectAllButton
            :id="ids.selectAll"
            :state="selectAllState"
            :primary="selected.length > 0"
            :disabled="listBusy || items.length === 0"
            @click="toggleSelectAll"
          />
        </template>
        <template #add="{ hiddenClass }">
          <BaseButton
            :id="ids.add"
            type="button"
            size="md"
            class="min-h-11 w-full md:w-auto"
            :class="hiddenClass"
            :disabled="saving || isFull"
            data-test="publikasi-add"
            @click="openAdd"
          >
            Tambah Publikasi
          </BaseButton>
        </template>
      </CardListToolbar>

      <CardSelectionBar
        :selected-count="selected.length"
        :search-count="
          filtering
            ? `Menampilkan ${visibleRows.length} dari ${items.length} publikasi. Hapus pencarian dan saringan untuk mengubah urutan.`
            : null
        "
        :busy="listBusy"
        :bulk-id="ids.bulkDelete"
        @bulk-delete="openBulkDelete"
      />

      <p v-if="isFull" class="text-text-muted text-sm" data-test="publications-full">
        Sudah mencapai batas {{ MAX_ITEMS }} publikasi.
      </p>

      <div
        v-if="items.length === 0"
        class="rounded-card border-border-strong bg-surface text-text-muted border border-dashed px-6 py-12 text-center"
        data-test="publications-empty"
      >
        <p class="text-brand-navy text-base font-semibold">Belum ada publikasi</p>
        <p class="mx-auto mt-2 max-w-md text-sm">
          Halaman Publikasi akan menampilkan daftar kosong sampai ada publikasi yang ditambahkan.
        </p>
      </div>

      <div
        v-else-if="visibleRows.length === 0"
        class="rounded-card border-border-strong bg-surface text-text-muted border border-dashed px-6 py-12 text-center"
        data-test="publications-no-match"
      >
        <p class="text-brand-navy text-base font-semibold">Tidak ada publikasi yang cocok</p>
        <p class="mx-auto mt-2 max-w-md text-sm">
          Ubah kata kunci pencarian atau pilih kategori lain untuk melihat publikasi yang lain.
        </p>
        <BaseButton type="button" variant="secondary" size="sm" class="mt-4" @click="clearFilters">
          Kosongkan filter
        </BaseButton>
      </div>

      <PublikasiCardList
        v-else
        :rows="visibleRows"
        :total-count="items.length"
        :filtering="filtering"
        :sorting="sorting"
        :drag-block="dragBlock"
        :selected-keys="selected"
        :drag-key="dragKey"
        :drop-target="dropTarget"
        :drop-at-end="dropAtEnd"
        :busy="listBusy"
        @edit="openEdit"
        @delete="openDelete"
        @move="movePublication"
        @toggle="selection.toggle"
        @drag-start="drag.startDrag"
        @drag-end="drag.clearDrag"
        @drag-over="drag.hoverDrop"
        @drop="drag.dropOn"
        @drag-over-end="drag.hoverEnd"
        @drop-end="drag.dropEnd"
      />
    </template>

    <p class="sr-only" role="status" aria-live="polite" data-test="publikasi-status">
      {{ status }}
    </p>

    <BaseModal
      :open="dialog?.kind === 'item'"
      :title="itemDialogTitle"
      description="Tampil di: halaman Publikasi (daftar dokumen)."
      size="lg"
      :busy="saving || itemUploading"
      @close="closeDialog"
    >
      <AlertBanner
        v-if="saveError"
        :message="saveError.message"
        :kind="saveError.kind"
        class="mb-5"
        data-test="dialog-error"
      >
        <template v-if="stale" #action>
          <BaseButton
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="saving"
            data-test="catalog-reload"
            @click="reloadCatalog"
          >
            Muat versi terbaru
          </BaseButton>
        </template>
      </AlertBanner>
      <PublikasiItemForm
        v-if="dialog?.kind === 'item'"
        :key="itemFormKey"
        :publication="itemDraft"
        :busy="saving"
        @submit="handleItemSubmit"
        @cancel="closeDialog"
        @busy="itemUploading = $event"
      />
    </BaseModal>

    <BaseModal
      :open="dialog?.kind === 'delete'"
      title="Hapus publikasi?"
      size="md"
      :busy="saving"
      @close="closeDialog"
    >
      <div v-if="deleteTarget" class="space-y-4" data-test="delete-dialog">
        <p class="text-brand-navy text-sm">
          Hapus publikasi “{{ deleteTarget.title.trim() }}”? Tindakan ini tidak bisa dibatalkan.
        </p>

        <AlertBanner
          v-if="saveError"
          :message="saveError.message"
          :kind="saveError.kind"
          data-test="dialog-error"
        >
          <template v-if="stale" #action>
            <BaseButton
              type="button"
              variant="secondary"
              size="md"
              class="min-h-11"
              :disabled="saving"
              data-test="catalog-reload"
              @click="reloadCatalog"
            >
              Muat versi terbaru
            </BaseButton>
          </template>
        </AlertBanner>

        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="saving"
            data-test="delete-cancel"
            @click="closeDialog"
          >
            Batal
          </BaseButton>
          <BaseButton
            type="button"
            size="md"
            class="min-h-11"
            :disabled="saving"
            data-test="confirm-delete"
            @click="confirmDelete"
          >
            {{ saving ? 'Menghapus…' : `Hapus “${deleteTarget.title.trim()}”` }}
          </BaseButton>
        </div>
      </div>
    </BaseModal>

    <BaseModal
      :open="dialog?.kind === 'info'"
      title="Ubah judul & pengantar"
      description="Judul dan pengantar tampil di atas daftar publikasi di halaman Publikasi."
      size="md"
      :busy="saving"
      @close="closeDialog"
    >
      <AlertBanner
        v-if="saveError"
        :message="saveError.message"
        :kind="saveError.kind"
        class="mb-5"
        data-test="dialog-error"
      >
        <template v-if="stale" #action>
          <BaseButton
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="saving"
            data-test="catalog-reload"
            @click="reloadCatalog"
          >
            Muat versi terbaru
          </BaseButton>
        </template>
      </AlertBanner>
      <PublikasiCatalogInfoForm
        v-if="dialog?.kind === 'info' && block"
        :title="block.title ?? ''"
        :body="block.body"
        :busy="saving"
        @submit="saveInfo"
        @cancel="closeDialog"
      />
    </BaseModal>

    <BulkDeleteDialog
      :open="bulkTarget !== null"
      noun="publikasi"
      :items="bulkTarget?.items ?? []"
      :busy="saving"
      :results="bulkResults"
      :stale="bulkStale"
      :error="bulkError"
      @confirm="confirmBulkDelete"
      @close="closeBulk"
      @reload="reloadFromBulk"
    >
      <template #intro>
        <p class="text-brand-navy text-sm">
          Publikasi berikut dihapus sekaligus dalam satu penyimpanan katalog. Penghapusan ini
          semua atau tidak sama sekali: jika penyimpanan gagal, tidak ada publikasi yang dihapus.
          Tindakan ini tidak bisa dibatalkan.
        </p>
      </template>
    </BulkDeleteDialog>
  </div>
</template>
