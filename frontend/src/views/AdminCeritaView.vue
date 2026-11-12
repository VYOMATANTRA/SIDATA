<script setup lang="ts">
/**
 * `/admin/cerita`: management of the Cerita pages (SPEC §2, §3, §8). Editors and Admins add,
 * rename, reorder and delete pages, chapters and sections, and fill a section with paragraphs
 * and one figure (a photo, several photos or a diagram).
 *
 * Header title and subtitle live in route `meta` (router/index.ts), seeded by AdminLayout, so
 * this view's own headings start at <h2>.
 *
 * Kept on purpose:
 * - Every ordering action is a pair of buttons, never drag-only.
 * - A refused write never clears a draft; a "stale" refusal offers a reload that leaves it.
 * - Messages are plain Indonesian from `ceritaAdminMessages` / `userMessages`; no status codes,
 *   field names or server strings reach the screen.
 * - Focus goes back where the editor was working after every dialog, add, move and delete.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import CeritaDeleteDialog from '../components/admin/cerita/CeritaDeleteDialog.vue';
import CeritaNameDialog from '../components/admin/cerita/CeritaNameDialog.vue';
import CeritaPageList from '../components/admin/cerita/CeritaPageList.vue';
import CeritaSectionEditor from '../components/admin/cerita/CeritaSectionEditor.vue';
import CeritaStructurePanel from '../components/admin/cerita/CeritaStructurePanel.vue';
import { ceritaIds } from '../components/admin/cerita/ceritaDomIds';
import { dependentsMessage } from '../utils/ceritaAdminMessages';
import {
  useCeritaAdminStore,
  type AdminChapter,
  type AdminSection,
  type WriteOutcome,
} from '../stores/ceritaAdmin.store';

const store = useCeritaAdminStore();

type Direction = -1 | 1;

type NameTarget =
  | { kind: 'page-add' }
  | { kind: 'page-rename'; slug: string; initial: string }
  | { kind: 'chapter-add'; pageSlug: string }
  | { kind: 'chapter-rename'; id: string; initial: string }
  | { kind: 'section-add'; chapterId: string }
  | { kind: 'section-rename'; id: string; initial: string };

type DeleteTarget =
  | { kind: 'page'; slug: string; title: string; chapters: number; sections: number }
  | { kind: 'chapter'; id: string; title: string; sections: number }
  | { kind: 'section'; id: string; chapterId: string; label: string };

const statusMessage = ref('');
const actionError = ref('');
const actionStale = ref(false);
const reloading = ref(false);
const moving = ref(false);

const nameTarget = ref<NameTarget | null>(null);
const nameBusy = ref(false);
const nameError = ref('');
const nameStale = ref(false);

const deleteTarget = ref<DeleteTarget | null>(null);
const deleteBusy = ref(false);
const deleteError = ref('');
const deleteBlocked = ref(false);
const deleteStale = ref(false);

const editingSectionId = ref<string | null>(null);
const editorBusy = ref(false);
const editorDirty = ref(false);
const discardPromptOpen = ref(false);
const keepEditingButton = ref<InstanceType<typeof BaseButton> | null>(null);

const pages = computed(() => store.tree);
const page = computed(() => store.selectedPage);
const pageIndex = computed(() => pages.value.findIndex((item) => item.slug === page.value?.slug));
const structureBusy = computed(() => moving.value || nameBusy.value || deleteBusy.value);
const showInitialLoading = computed(() => !store.hasLoaded && store.isLoading);

onMounted(() => {
  void store.load();
});

function announce(message: string): void {
  // Clearing first makes an identical repeat message announce again.
  statusMessage.value = '';
  void nextTick(() => {
    statusMessage.value = message;
  });
}

function focusId(id: string): void {
  void nextTick(() => document.getElementById(id)?.focus());
}

function clearActionError(): void {
  actionError.value = '';
  actionStale.value = false;
}

async function reload(): Promise<void> {
  if (reloading.value) return;
  reloading.value = true;
  clearActionError();
  await store.load();
  reloading.value = false;
  announce('Data terbaru dimuat.');
}

function selectPage(slug: string): void {
  store.selectPage(slug);
  clearActionError();
  focusId(ceritaIds.pageHeading);
}

// --- Add / rename dialog ---

const nameDialog = computed(() => {
  const target = nameTarget.value;
  switch (target?.kind) {
    case 'page-add':
      return {
        heading: 'Tambah halaman',
        label: 'Judul halaman',
        submit: 'Tambah halaman',
        initial: '',
        hint: 'Alamat halaman dibuat otomatis dari judul dan tidak berubah saat judul diganti.',
      };
    case 'page-rename':
      return {
        heading: 'Ubah judul halaman',
        label: 'Judul halaman',
        submit: 'Simpan judul',
        initial: target.initial,
        hint: 'Alamat halaman tidak berubah, sehingga tautan yang sudah dibagikan tetap berfungsi.',
      };
    case 'chapter-add':
      return {
        heading: 'Tambah bab',
        label: 'Judul bab',
        submit: 'Tambah bab',
        initial: '',
        hint: undefined,
      };
    case 'chapter-rename':
      return {
        heading: 'Ubah judul bab',
        label: 'Judul bab',
        submit: 'Simpan judul',
        initial: target.initial,
        hint: undefined,
      };
    case 'section-add':
      return {
        heading: 'Tambah bagian',
        label: 'Judul bagian',
        submit: 'Tambah bagian',
        initial: '',
        hint: undefined,
      };
    case 'section-rename':
      return {
        heading: 'Ubah judul bagian',
        label: 'Judul bagian',
        submit: 'Simpan judul',
        initial: target.initial,
        hint: undefined,
      };
    default:
      return { heading: '', label: '', submit: '', initial: '', hint: undefined };
  }
});

function openName(target: NameTarget): void {
  nameError.value = '';
  nameStale.value = false;
  nameTarget.value = target;
}

function closeName(): void {
  if (nameBusy.value) return;
  nameTarget.value = null;
  nameError.value = '';
  nameStale.value = false;
}

async function afterDialog(focus: string | null): Promise<void> {
  nameTarget.value = null;
  await nextTick();
  if (focus) focusId(focus);
}

async function submitName(title: string): Promise<void> {
  const target = nameTarget.value;
  if (!target || nameBusy.value) return;
  nameBusy.value = true;
  nameError.value = '';
  nameStale.value = false;

  let outcome: WriteOutcome<unknown>;
  let focus: string | null = null;
  let message = '';
  switch (target.kind) {
    case 'page-add': {
      const result = await store.addPage(title);
      outcome = result;
      focus = ceritaIds.pageHeading;
      message = `Halaman “${title}” ditambahkan.`;
      break;
    }
    case 'page-rename':
      outcome = await store.renamePage(target.slug, title);
      focus = ceritaIds.pageRename;
      message = `Judul halaman diubah menjadi “${title}”.`;
      break;
    case 'chapter-add': {
      const result = await store.addChapter(target.pageSlug, title);
      outcome = result;
      if (result.ok) focus = ceritaIds.addSection(result.value.id);
      message = `Bab “${title}” ditambahkan.`;
      break;
    }
    case 'chapter-rename':
      outcome = await store.renameChapter(target.id, title);
      focus = ceritaIds.chapterRename(target.id);
      message = `Judul bab diubah menjadi “${title}”.`;
      break;
    case 'section-add': {
      const result = await store.addSection(target.chapterId, title);
      outcome = result;
      if (result.ok) focus = ceritaIds.sectionOpen(result.value.id);
      message = `Bagian “${title}” ditambahkan.`;
      break;
    }
    case 'section-rename':
      outcome = await store.renameSection(target.id, title);
      focus = ceritaIds.sectionRename(target.id);
      message = `Judul bagian diubah menjadi “${title}”.`;
      break;
  }
  nameBusy.value = false;

  if (outcome.ok) {
    announce(message);
    await afterDialog(focus);
    return;
  }
  nameError.value = outcome.message;
  nameStale.value = outcome.stale;
}

async function reloadFromName(): Promise<void> {
  await store.load();
  nameStale.value = false;
  nameError.value = '';
}

// --- Delete dialog ---

const deleteDialog = computed(() => {
  const target = deleteTarget.value;
  switch (target?.kind) {
    case 'page': {
      const parts: string[] = [];
      if (target.chapters > 0) parts.push(`${target.chapters} bab`);
      if (target.sections > 0) parts.push(`${target.sections} bagian`);
      return {
        heading: 'Hapus halaman?',
        message: `Hapus halaman “${target.title}”? Tindakan ini tidak bisa dibatalkan.`,
        consequence:
          parts.length > 0
            ? `${parts.join(' dan ')} yang masih kosong di dalamnya ikut terhapus. Halaman yang masih berisi paragraf, gambar, angka, atau tabel tidak dapat dihapus.`
            : undefined,
        confirm: `Hapus halaman “${target.title}”`,
      };
    }
    case 'chapter':
      return {
        heading: 'Hapus bab?',
        message: `Hapus bab “${target.title}”? Tindakan ini tidak bisa dibatalkan.`,
        consequence:
          target.sections > 0
            ? `${target.sections} bagian yang masih kosong di dalamnya ikut terhapus. Bab yang masih berisi paragraf, gambar, angka, atau tabel tidak dapat dihapus.`
            : undefined,
        confirm: `Hapus bab “${target.title}”`,
      };
    case 'section':
      return {
        heading: 'Hapus bagian?',
        message: `Hapus bagian “${target.label}”? Tindakan ini tidak bisa dibatalkan.`,
        consequence:
          'Bagian yang masih berisi paragraf, gambar, angka, atau tabel tidak dapat dihapus.',
        confirm: `Hapus bagian “${target.label}”`,
      };
    default:
      return { heading: '', message: '', consequence: undefined, confirm: '' };
  }
});

function sectionLabel(section: AdminSection, chapter: AdminChapter): string {
  const index = chapter.sections.findIndex((item) => item.id === section.id);
  return section.title?.trim() ? section.title : `Bagian ${index + 1}`;
}

function openDeletePage(): void {
  const current = page.value;
  if (!current) return;
  deleteTarget.value = {
    kind: 'page',
    slug: current.slug,
    title: current.title,
    chapters: current.chapters.length,
    sections: current.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0),
  };
  resetDeleteState();
}

function openDeleteChapter(chapter: AdminChapter): void {
  deleteTarget.value = {
    kind: 'chapter',
    id: chapter.id,
    title: chapter.title,
    sections: chapter.sections.length,
  };
  resetDeleteState();
}

function openDeleteSection(chapter: AdminChapter, section: AdminSection): void {
  deleteTarget.value = {
    kind: 'section',
    id: section.id,
    chapterId: chapter.id,
    label: sectionLabel(section, chapter),
  };
  resetDeleteState();
}

function resetDeleteState(): void {
  deleteError.value = '';
  deleteBlocked.value = false;
  deleteStale.value = false;
}

function closeDelete(): void {
  if (deleteBusy.value) return;
  deleteTarget.value = null;
  resetDeleteState();
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value;
  if (!target || deleteBusy.value) return;
  deleteBusy.value = true;
  resetDeleteState();

  let outcome: WriteOutcome<unknown>;
  let message = '';
  let focus: string | null = null;
  const chapterIdOfSection = target.kind === 'section' ? target.chapterId : null;
  switch (target.kind) {
    case 'page':
      outcome = await store.removePage(target.slug);
      message = `Halaman “${target.title}” dihapus.`;
      focus = store.selectedPage ? ceritaIds.pageHeading : ceritaIds.addPage;
      break;
    case 'chapter':
      outcome = await store.removeChapter(target.id);
      message = `Bab “${target.title}” dihapus.`;
      focus = ceritaIds.addChapter;
      break;
    case 'section':
      outcome = await store.removeSection(target.id);
      message = `Bagian “${target.label}” dihapus.`;
      focus = chapterIdOfSection ? ceritaIds.addSection(chapterIdOfSection) : null;
      break;
  }
  deleteBusy.value = false;

  if (outcome.ok) {
    deleteTarget.value = null;
    announce(message);
    await nextTick();
    if (target.kind === 'page')
      focus = store.selectedPage ? ceritaIds.pageHeading : ceritaIds.addPage;
    if (focus) focusId(focus);
    return;
  }
  deleteError.value = outcome.message;
  deleteBlocked.value = outcome.blocked;
  deleteStale.value = outcome.stale;
}

async function reloadFromDelete(): Promise<void> {
  await store.load();
  resetDeleteState();
}

// What the loaded data already shows blocking a delete: paragraphs and the figure of the
// section(s) concerned. The dialog says so at once instead of letting the editor hit a refusal;
// the server's own refusal (it also counts figures, indicators and tables) is still handled.
const deleteLocalBlock = computed(() => {
  const target = deleteTarget.value;
  if (!target) return null;
  let sectionIds: string[] = [];
  if (target.kind === 'section') sectionIds = [target.id];
  if (target.kind === 'chapter') {
    sectionIds = store.findChapter(target.id)?.chapter.sections.map((item) => item.id) ?? [];
  }
  if (target.kind === 'page') {
    sectionIds =
      store
        .findPage(target.slug)
        ?.chapters.flatMap((chapter) => chapter.sections.map((item) => item.id)) ?? [];
  }
  const holding = sectionIds.filter((id) => store.contentCountFor(id) > 0);
  const count = holding.reduce((sum, id) => sum + store.contentCountFor(id), 0);
  if (count === 0) return null;
  const subject = target.kind === 'page' ? 'Halaman' : target.kind === 'chapter' ? 'Bab' : 'Bagian';
  const names = holding
    .map((id) => store.findSection(id))
    .filter((found): found is NonNullable<typeof found> => Boolean(found))
    .map((found) => sectionLabel(found.section, found.chapter));
  return {
    message: dependentsMessage(subject, {
      contentBlocks: count,
      indicators: 0,
      indicatorTables: 0,
    }),
    names,
  };
});

const SECTION_HINT =
  'Buka isi bagian, lalu hapus semua paragraf dan gambarnya. Angka dan tabel dipindahkan lewat menu Data.';

const deleteShownBlocked = computed(() => deleteBlocked.value || deleteLocalBlock.value !== null);
const deleteShownError = computed(() => deleteError.value || deleteLocalBlock.value?.message || '');
const deleteHint = computed(() => {
  if (!deleteShownBlocked.value) return undefined;
  const target = deleteTarget.value;
  if (target?.kind === 'section') return SECTION_HINT;
  const names = deleteLocalBlock.value?.names ?? [];
  const shown = names.slice(0, 5).join(', ');
  const rest = names.length > 5 ? ` dan ${names.length - 5} bagian lain` : '';
  return names.length > 0
    ? `Bagian yang masih berisi: ${shown}${rest}. Buka isi bagian itu dan hapus paragraf serta gambarnya terlebih dahulu.`
    : undefined;
});

function openEditorFromDelete(): void {
  const target = deleteTarget.value;
  if (!target || target.kind !== 'section') return;
  const found = store.findSection(target.id);
  deleteTarget.value = null;
  resetDeleteState();
  if (!found) return;
  void nextTick(() => openEditor(found.section));
}

// --- Moves ---

function focusAfterMove(
  upId: string,
  downId: string,
  newIndex: number,
  total: number,
  direction: Direction,
): void {
  const canKeepGoing = direction === -1 ? newIndex > 0 : newIndex < total - 1;
  focusId(direction === -1 ? (canKeepGoing ? upId : downId) : canKeepGoing ? downId : upId);
}

async function runMove(action: () => Promise<WriteOutcome>, onDone: () => void): Promise<void> {
  if (moving.value) return;
  moving.value = true;
  clearActionError();
  const outcome = await action();
  moving.value = false;
  if (!outcome.ok) {
    actionError.value = outcome.message;
    actionStale.value = outcome.stale;
    return;
  }
  onDone();
}

function movePage(direction: Direction): void {
  const current = page.value;
  if (!current) return;
  void runMove(
    () => store.movePage(current.slug, direction),
    () => {
      const index = pages.value.findIndex((item) => item.slug === current.slug);
      announce(
        `Halaman “${current.title}” dipindah ke urutan ${index + 1} dari ${pages.value.length}.`,
      );
      focusAfterMove(ceritaIds.pageUp, ceritaIds.pageDown, index, pages.value.length, direction);
    },
  );
}

function moveChapter(chapter: AdminChapter, direction: Direction): void {
  const current = page.value;
  if (!current) return;
  void runMove(
    () => store.moveChapter(current.slug, chapter.id, direction),
    () => {
      const chapters = store.findPage(current.slug)?.chapters ?? [];
      const index = chapters.findIndex((item) => item.id === chapter.id);
      announce(`Bab “${chapter.title}” dipindah ke urutan ${index + 1} dari ${chapters.length}.`);
      focusAfterMove(
        ceritaIds.chapterUp(chapter.id),
        ceritaIds.chapterDown(chapter.id),
        index,
        chapters.length,
        direction,
      );
    },
  );
}

function moveSection(chapter: AdminChapter, section: AdminSection, direction: Direction): void {
  void runMove(
    () => store.moveSection(chapter.id, section.id, direction),
    () => {
      const sections = store.findChapter(chapter.id)?.chapter.sections ?? [];
      const index = sections.findIndex((item) => item.id === section.id);
      announce(
        `Bagian “${sectionLabel(section, chapter)}” dipindah ke urutan ${index + 1} dari ${sections.length}.`,
      );
      focusAfterMove(
        ceritaIds.sectionUp(section.id),
        ceritaIds.sectionDown(section.id),
        index,
        sections.length,
        direction,
      );
    },
  );
}

// --- Section editor dialog ---

const editingSection = computed(() =>
  editingSectionId.value ? store.findSection(editingSectionId.value) : undefined,
);
const editorTitle = computed(() => {
  const found = editingSection.value;
  return found ? `Isi bagian: ${sectionLabel(found.section, found.chapter)}` : 'Isi bagian';
});
const editorDescription = computed(() => {
  const found = editingSection.value;
  return found ? `${found.page.title} › ${found.chapter.title}` : undefined;
});

function openEditor(section: AdminSection): void {
  discardPromptOpen.value = false;
  editorDirty.value = false;
  editingSectionId.value = section.id;
  addBeforeUnload();
}

function closeEditor(): void {
  editingSectionId.value = null;
  editorBusy.value = false;
  editorDirty.value = false;
  discardPromptOpen.value = false;
  removeBeforeUnload();
  if (pendingRouteLeave) {
    pendingRouteLeave(true);
    pendingRouteLeave = null;
  }
}

// Close button, Escape and backdrop all land here. A save in flight is never interrupted (the
// dialog also refuses while `busy`); an edit that is not saved yet asks first.
function requestCloseEditor(): void {
  if (editorBusy.value) return;
  if (discardPromptOpen.value) {
    keepEditing();
    return;
  }
  if (editorDirty.value) {
    discardPromptOpen.value = true;
    void nextTick(() => (keepEditingButton.value?.$el as HTMLElement | undefined)?.focus());
    return;
  }
  closeEditor();
}

function keepEditing(): void {
  discardPromptOpen.value = false;
  if (pendingRouteLeave) {
    pendingRouteLeave(false);
    pendingRouteLeave = null;
  }
}

// A section deleted elsewhere while its editor is open: close it rather than edit nothing.
watch(editingSection, (found) => {
  if (editingSectionId.value && !found && store.hasLoaded) {
    closeEditor();
    announce('Bagian yang sedang dibuka sudah dihapus oleh orang lain.');
  }
});

let beforeUnloadAttached = false;
let pendingRouteLeave: ((allow: boolean) => void) | null = null;

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (editingSectionId.value && editorDirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}

function addBeforeUnload(): void {
  if (beforeUnloadAttached || typeof window === 'undefined') return;
  window.addEventListener('beforeunload', handleBeforeUnload);
  beforeUnloadAttached = true;
}

function removeBeforeUnload(): void {
  if (!beforeUnloadAttached || typeof window === 'undefined') return;
  window.removeEventListener('beforeunload', handleBeforeUnload);
  beforeUnloadAttached = false;
}

onBeforeRouteLeave(() => {
  if (editorBusy.value) return false;
  if (!editingSectionId.value || !editorDirty.value) return true;
  discardPromptOpen.value = true;
  void nextTick(() => (keepEditingButton.value?.$el as HTMLElement | undefined)?.focus());
  return new Promise<boolean>((resolve) => {
    pendingRouteLeave?.(false);
    pendingRouteLeave = resolve;
  });
});

onUnmounted(() => {
  removeBeforeUnload();
  pendingRouteLeave?.(false);
  pendingRouteLeave = null;
});
</script>

<template>
  <div class="space-y-6">
    <p class="text-text-muted max-w-3xl text-sm">
      Atur halaman Cerita, bab, dan bagiannya, lalu isi setiap bagian dengan paragraf dan satu
      gambar. Perubahan langsung tampil di situs setelah disimpan.
    </p>

    <p class="sr-only" role="status" aria-live="polite" data-test="status">{{ statusMessage }}</p>

    <div
      v-if="store.loadError"
      role="alert"
      class="rounded-card border-status-error-border bg-status-error-surface border p-4"
      data-test="load-error"
    >
      <p class="text-status-error text-sm font-semibold">{{ store.loadError }}</p>
      <BaseButton
        variant="secondary"
        size="md"
        class="mt-3 min-h-11"
        :disabled="store.isLoading"
        data-test="load-retry"
        @click="store.load()"
      >
        {{ store.isLoading ? 'Memuat ulang…' : 'Coba lagi' }}
      </BaseButton>
    </div>

    <div
      v-if="actionError"
      role="alert"
      class="rounded-card border-status-error-border bg-status-error-surface space-y-3 border p-4"
      data-test="action-error"
    >
      <p class="text-status-error text-sm font-semibold">{{ actionError }}</p>
      <BaseButton
        v-if="actionStale"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="reloading"
        data-test="action-reload"
        @click="reload"
      >
        {{ reloading ? 'Memuat…' : 'Muat ulang' }}
      </BaseButton>
    </div>

    <p v-if="showInitialLoading" class="text-text-muted text-sm" role="status" data-test="loading">
      Memuat halaman Cerita…
    </p>

    <div
      v-else-if="store.hasLoaded"
      class="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start"
    >
      <CeritaPageList
        :pages="pages"
        :selected-slug="page?.slug ?? null"
        :busy="structureBusy"
        @select="selectPage"
        @add="openName({ kind: 'page-add' })"
      />

      <CeritaStructurePanel
        v-if="page"
        :page="page"
        :is-first-page="pageIndex <= 0"
        :is-last-page="pageIndex === pages.length - 1"
        :busy="structureBusy"
        @rename-page="openName({ kind: 'page-rename', slug: page.slug, initial: page.title })"
        @move-page="movePage"
        @delete-page="openDeletePage"
        @add-chapter="openName({ kind: 'chapter-add', pageSlug: page.slug })"
        @rename-chapter="
          (chapter) => openName({ kind: 'chapter-rename', id: chapter.id, initial: chapter.title })
        "
        @move-chapter="moveChapter"
        @delete-chapter="openDeleteChapter"
        @add-section="(chapter) => openName({ kind: 'section-add', chapterId: chapter.id })"
        @open-section="openEditor"
        @rename-section="
          (section) =>
            openName({ kind: 'section-rename', id: section.id, initial: section.title ?? '' })
        "
        @move-section="moveSection"
        @delete-section="
          (section) => {
            const found = store.findSection(section.id);
            if (found) openDeleteSection(found.chapter, section);
          }
        "
      />
    </div>

    <CeritaNameDialog
      :open="nameTarget !== null"
      :heading="nameDialog.heading"
      :label="nameDialog.label"
      :initial="nameDialog.initial"
      :submit-label="nameDialog.submit"
      :hint="nameDialog.hint"
      :busy="nameBusy"
      :error="nameError"
      :stale="nameStale"
      @submit="submitName"
      @close="closeName"
      @reload="reloadFromName"
    />

    <CeritaDeleteDialog
      :open="deleteTarget !== null"
      :heading="deleteDialog.heading"
      :message="deleteDialog.message"
      :consequence="deleteDialog.consequence"
      :confirm-label="deleteDialog.confirm"
      :busy="deleteBusy"
      :error="deleteShownError"
      :blocked="deleteShownBlocked"
      :stale="deleteStale"
      :hint="deleteHint"
      :action-label="deleteTarget?.kind === 'section' ? 'Buka isi bagian' : undefined"
      @action="openEditorFromDelete"
      @confirm="confirmDelete"
      @close="closeDelete"
      @reload="reloadFromDelete"
    />

    <BaseModal
      :open="editingSectionId !== null"
      :title="editorTitle"
      :description="editorDescription"
      size="xl"
      :busy="editorBusy"
      @close="requestCloseEditor"
    >
      <!-- v-show, not v-if, while the question is up: drafts must survive "Tetap di sini". -->
      <CeritaSectionEditor
        v-if="editingSectionId"
        v-show="!discardPromptOpen"
        :section-id="editingSectionId"
        @busy="editorBusy = $event"
        @dirty-change="editorDirty = $event"
      />

      <div
        v-if="editingSectionId && discardPromptOpen"
        role="alertdialog"
        aria-labelledby="cerita-buang-judul"
        aria-describedby="cerita-buang-isi"
        class="space-y-4"
        data-test="discard-dialog"
      >
        <h3 id="cerita-buang-judul" class="text-brand-navy text-base font-semibold">
          Perubahan belum disimpan
        </h3>
        <p id="cerita-buang-isi" class="text-brand-navy text-sm">
          Tutup tanpa menyimpan perubahan?
        </p>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            data-test="discard-confirm"
            @click="closeEditor"
          >
            Tutup tanpa menyimpan
          </BaseButton>
          <BaseButton
            ref="keepEditingButton"
            size="md"
            class="min-h-11"
            data-test="discard-keep"
            @click="keepEditing"
          >
            Tetap di sini
          </BaseButton>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
