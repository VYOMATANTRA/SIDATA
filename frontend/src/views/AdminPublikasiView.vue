<script setup lang="ts">
/**
 * `/admin/publikasi`: the publication catalog (SPEC §8). Editors and Admins browse the catalog as
 * a grid, search it, filter by category, and add, edit, reorder or remove one publication at a
 * time. Each publication has an uploaded PDF/DOCX or an https link, an optional cover, page count
 * and publication month. The catalog title and intro are edited in a small dialog.
 *
 * Every change builds the full list and saves it through `store.savePublikasiCatalog`
 * (`PUT /api/publikasi/catalog`, with the block's `expectedUpdatedAt`). A stale write keeps the
 * open dialog's draft and offers "Muat versi terbaru", which replaces the draft only on request.
 *
 * Header title and subtitle live in route `meta` (router/index.ts), so this view starts at <h2>.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AlertBanner from '../components/common/AlertBanner.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import PublikasiCard from '../components/admin/publikasi/PublikasiCard.vue';
import PublikasiCatalogInfoForm from '../components/admin/publikasi/PublikasiCatalogInfoForm.vue';
import PublikasiItemForm from '../components/admin/publikasi/PublikasiItemForm.vue';
import { INPUT_CLASSES } from '../utils/formStyles';
import {
  PUBLICATIONS,
  publicationMetaLine,
  type PublicationItem,
} from '../content/publikasi';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';
import { classifyFailure, toUserMessage, type FailureKind } from '../utils/userMessages';

/** A stored publication: the public shape, plus any other key the server returned untouched. */
type StoredPublication = PublicationItem & Record<string, unknown>;

/** The dialog currently open. Only one is open at a time. */
type Dialog =
  | { kind: 'item'; index: number | null }
  | { kind: 'delete'; index: number }
  | { kind: 'info' };

const MAX_ITEMS = 25;
const BLOCK_SLUG = 'publikasi-katalog';

const store = useContentBlocksStore();

/** The block the page was last loaded or saved from. Its `updatedAt` is the write token. */
const block = ref<ContentBlock | null>(null);
/** The publications in display order, as last stored. Edits build a new list from this. */
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

const visibleRows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return items.value
    .map((publication, index) => ({ publication, index }))
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

const isFull = computed(() => items.value.length >= MAX_ITEMS);

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
 * result and the dialog closes; on failure every field stays as typed and the error is shown in
 * the open dialog, or on the page when the save came from a card action.
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
    void nextTick(() => document.getElementById('publikasi-add')?.focus());
  }
}

async function movePublication(index: number, direction: -1 | 1): Promise<void> {
  const target = index + direction;
  if (filtering.value || saving.value) return;
  if (target < 0 || target >= items.value.length) return;
  const next = [...items.value];
  const [moved] = next.splice(index, 1);
  if (!moved) return;
  next.splice(target, 0, moved);
  const saved = await saveCatalog(
    { publications: next },
    `Publikasi “${moved.title.trim()}” dipindah ke posisi ${target + 1}.`,
  );
  if (saved) focusMovedCard(target, direction);
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
    (target ?? document.getElementById(`publikasi-card-${index}-edit`))?.focus();
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
          Ini daftar yang warga lihat di halaman Publikasi. Setiap perubahan langsung disimpan
          dan tampil di halaman Publikasi. Berkas yang diunggah baru tampil setelah publikasinya
          disimpan.
        </p>
      </section>

      <AlertBanner
        v-if="saveError && dialog === null"
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

      <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <form
          role="search"
          aria-label="Saring daftar publikasi"
          class="flex w-full flex-col gap-3 sm:flex-row sm:items-end md:w-auto"
          @submit.prevent
        >
          <div class="w-full sm:w-72">
            <label for="publikasi-search" class="text-text-muted block text-xs font-medium">
              Cari publikasi
            </label>
            <input
              id="publikasi-search"
              v-model="query"
              type="search"
              placeholder="Judul, kategori, atau deskripsi"
              :class="INPUT_CLASSES"
              class="mt-1"
            />
          </div>
          <div class="w-full sm:w-56">
            <label for="publikasi-category" class="text-text-muted block text-xs font-medium">
              Kategori
            </label>
            <select
              id="publikasi-category"
              v-model="categoryFilter"
              :class="INPUT_CLASSES"
              class="mt-1"
            >
              <option value="">Semua Kategori</option>
              <option v-for="category in categories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
          </div>
        </form>

        <BaseButton
          id="publikasi-add"
          type="button"
          size="md"
          class="min-h-11 w-full md:w-auto"
          :disabled="saving || isFull"
          data-test="publikasi-add"
          @click="openAdd"
        >
          Tambah Publikasi
        </BaseButton>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-text-muted text-sm" aria-live="polite" data-test="result-count">
          Menampilkan {{ visibleRows.length }} dari {{ items.length }} publikasi
        </p>
        <p v-if="filtering" class="text-text-muted text-sm">
          Hapus pencarian dan saringan untuk mengubah urutan.
        </p>
        <p v-if="isFull" class="text-text-muted text-sm" data-test="publications-full">
          Sudah mencapai batas {{ MAX_ITEMS }} publikasi.
        </p>
      </div>

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

      <ul v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-test="publication-grid">
        <li v-for="row in visibleRows" :key="row.index" class="h-full">
          <PublikasiCard
            :id-prefix="`publikasi-card-${row.index}`"
            :publication="row.publication"
            :can-move-up="!filtering && row.index > 0"
            :can-move-down="!filtering && row.index < items.length - 1"
            :busy="saving"
            @edit="openEdit(row.index)"
            @delete="openDelete(row.index)"
            @move-up="movePublication(row.index, -1)"
            @move-down="movePublication(row.index, 1)"
          />
        </li>
      </ul>
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
        <p v-if="publicationMetaLine(deleteTarget)" class="text-text-muted text-sm">
          {{ publicationMetaLine(deleteTarget) }}
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
  </div>
</template>
