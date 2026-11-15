<script setup lang="ts">
/**
 * `/admin/cerita`: management of the Cerita pages (SPEC §2, §3, §8). The default view is a list of
 * page cards (search, Urutkan, Pilih, Tambah). Edit opens one page's structure at
 * `?halaman=<slug>`, where editors add, rename, reorder and delete chapters and sections and fill a
 * section with paragraphs and one figure (a photo, several photos or a diagram).
 *
 * Header title and subtitle live in route `meta` (router/index.ts), seeded by AdminLayout, so
 * this view's own headings start at <h2>.
 *
 * Kept on purpose:
 * - Every ordering action is a pair of buttons, never drag-only.
 * - A refused write never clears a draft; a "stale" refusal offers a reload that leaves it.
 * - Messages are plain Indonesian from `ceritaAdminMessages` / `userMessages`; no status codes,
 *   field names or server strings reach the screen.
 * - Focus goes back where the editor was working after every dialog, add, move, delete and return
 *   to the list.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import {
  ArrowLeftIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline';
import BaseButton from '../components/common/BaseButton.vue';
import AlertBanner from '../components/common/AlertBanner.vue';
import BaseModal from '../components/common/BaseModal.vue';
import CeritaBulkDeleteDialog from '../components/admin/cerita/CeritaBulkDeleteDialog.vue';
import CeritaDeleteDialog from '../components/admin/cerita/CeritaDeleteDialog.vue';
import CeritaPageDetailsDialog from '../components/admin/cerita/CeritaPageDetailsDialog.vue';
import CeritaNameDialog from '../components/admin/cerita/CeritaNameDialog.vue';
import CeritaPageCardList from '../components/admin/cerita/CeritaPageCardList.vue';
import CeritaReloadNotice from '../components/admin/cerita/CeritaReloadNotice.vue';
import CeritaSectionEditor from '../components/admin/cerita/CeritaSectionEditor.vue';
import CeritaStructurePanel from '../components/admin/cerita/CeritaStructurePanel.vue';
import { ceritaIds } from '../components/admin/cerita/ceritaDomIds';
import { dependentsMessage } from '../utils/ceritaAdminMessages';
import type { FailureKind } from '../utils/userMessages';
import type { PageDetailsInput } from '../services/ceritaAdmin.service';
import { useAuthStore } from '../stores/auth';
import {
  useCeritaAdminStore,
  type AdminChapter,
  type AdminPage,
  type AdminSection,
  type WriteOutcome,
} from '../stores/ceritaAdmin.store';

const store = useCeritaAdminStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

type Direction = -1 | 1;

/** One line of the bulk-delete report: what happened to one selected page. */
interface BulkResult {
  slug: string;
  title: string;
  status: 'deleted' | 'blocked' | 'failed';
  message?: string;
}

type NameTarget =
  | { kind: 'page-add' }
  | { kind: 'page-rename'; slug: string; initial: string; token: string }
  | { kind: 'chapter-add'; pageSlug: string }
  | { kind: 'chapter-rename'; id: string; initial: string; token: string }
  | { kind: 'section-add'; chapterId: string }
  | { kind: 'section-rename'; id: string; initial: string; token: string };

// `token` is the record's `updatedAt` as it was when the dialog opened. The first save or delete
// carries it, so a change another editor made since is refused; only the dialog's own reload
// button moves it forward (`reloadFromName` / `reloadFromDelete`).
type DeleteTarget =
  | { kind: 'page'; slug: string; title: string; chapters: number; sections: number; token: string }
  | { kind: 'chapter'; id: string; title: string; sections: number; token: string }
  | { kind: 'section'; id: string; chapterId: string; label: string; token: string };

const statusMessage = ref('');
const actionError = ref('');
/** Failure class of `actionError`, for AlertBanner. */
const actionErrorKind = ref<FailureKind | null>(null);
const actionStale = ref(false);
const reloading = ref(false);
const moving = ref(false);

const nameTarget = ref<NameTarget | null>(null);
const nameBusy = ref(false);
const nameError = ref('');
/** Failure class of `nameError`, for AlertBanner. */
const nameErrorKind = ref<FailureKind | null>(null);
const nameStale = ref(false);

// Headline and byline of the chosen page. `token` follows the name dialog's rule: the first save
// carries the `updatedAt` seen when the dialog opened; only its reload button moves it forward.
const detailsTarget = ref<{ slug: string; token: string } | null>(null);
const detailsBusy = ref(false);
const detailsError = ref('');
/** Failure class of `detailsError`, for AlertBanner. */
const detailsErrorKind = ref<FailureKind | null>(null);
const detailsStale = ref(false);
const detailsPage = computed(() =>
  detailsTarget.value ? (store.findPage(detailsTarget.value.slug) ?? null) : null,
);

const deleteTarget = ref<DeleteTarget | null>(null);
const deleteBusy = ref(false);
const deleteError = ref('');
/** Failure class of `deleteError`, for AlertBanner. */
const deleteErrorKind = ref<FailureKind | null>(null);
const deleteBlocked = ref(false);
const deleteStale = ref(false);

const editingSectionId = ref<string | null>(null);
const editorBusy = ref(false);
const editorDirty = ref(false);
const discardPromptOpen = ref(false);
const keepEditingButton = ref<InstanceType<typeof BaseButton> | null>(null);

// The page open in the structure view comes from the URL (`?halaman=<slug>`), so Back and a
// reload land where the editor was. No query means the list.
const detailSlug = computed(() => {
  const raw = route.query.halaman;
  return typeof raw === 'string' && raw !== '' ? raw : null;
});

const pages = computed(() => store.tree);
/** The page whose structure is open; null on the list, and while the slug is not (yet) known. */
const page = computed<AdminPage | null>(() =>
  detailSlug.value ? (store.findPage(detailSlug.value) ?? null) : null,
);
const pageIndex = computed(() => pages.value.findIndex((item) => item.slug === page.value?.slug));
const structureBusy = computed(
  () => moving.value || nameBusy.value || deleteBusy.value || detailsBusy.value,
);
const showInitialLoading = computed(() => !store.hasLoaded && store.isLoading);
/** Mirrors the load-error banner's `v-if` in the template. */
const loadErrorShowing = computed(() => store.loadError !== null && !store.reloadNeeded);

onMounted(() => {
  void store.load();
});

// The store's own selection follows the URL, so its page-level helpers agree with the screen. When
// the structure view closes (Back, the list button, or a delete), the page's Edit button gets focus.
watch(
  detailSlug,
  (slug, previous) => {
    store.selectPage(slug);
    if (slug === null && previous) focusId(ceritaIds.cardEdit(previous));
  },
  { immediate: true },
);

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
  actionErrorKind.value = null;
  actionStale.value = false;
}

const COULD_NOT_RELOAD = 'Belum bisa memuat versi terbaru. Periksa koneksi lalu coba lagi.';

async function reload(): Promise<void> {
  if (reloading.value) return;
  reloading.value = true;
  const loaded = await store.load();
  reloading.value = false;
  if (!loaded) {
    // Nothing new was seen: leave the warning (and its reload button) up and say why. When the
    // load-error banner already shows the failure, a second banner would repeat it, so only announce.
    if (!loadErrorShowing.value) {
      actionError.value = COULD_NOT_RELOAD;
      actionErrorKind.value = 'network';
    }
    announce(COULD_NOT_RELOAD);
    return;
  }
  clearActionError();
  announce('Data terbaru dimuat.');
}

/** Edit on a card: opens the page's structure (a history entry, so the browser Back returns here). */
async function openPage(slug: string): Promise<void> {
  clearActionError();
  await router.push({ name: 'admin-cerita', query: { halaman: slug } });
  await nextTick();
  focusId(ceritaIds.pageHeading);
}

/** "Kembali ke daftar": the list again; the watch on `detailSlug` returns focus to the card. */
function backToList(): void {
  clearActionError();
  void router.push({ name: 'admin-cerita' });
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
      // The new page opens at once, so its first chapter can be added.
      if (result.ok) {
        await router.push({ name: 'admin-cerita', query: { halaman: result.value.slug } });
      }
      break;
    }
    case 'page-rename':
      outcome = await store.renamePage(target.slug, title, target.token);
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
      outcome = await store.renameChapter(target.id, title, target.token);
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
      outcome = await store.renameSection(target.id, title, target.token);
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
  nameErrorKind.value = outcome.kind;
  nameStale.value = outcome.stale;
}

function openDetails(slug: string, token: string): void {
  detailsError.value = '';
  detailsStale.value = false;
  detailsTarget.value = { slug, token };
}

function closeDetails(): void {
  if (detailsBusy.value) return;
  detailsTarget.value = null;
  detailsError.value = '';
  detailsStale.value = false;
}

async function submitDetails(details: PageDetailsInput): Promise<void> {
  const target = detailsTarget.value;
  if (!target || detailsBusy.value) return;
  detailsBusy.value = true;
  detailsError.value = '';
  detailsStale.value = false;
  const outcome = await store.updatePageDetails(target.slug, details, target.token);
  detailsBusy.value = false;

  if (outcome.ok) {
    detailsTarget.value = null;
    announce('Judul utama dan penulis halaman disimpan.');
    await nextTick();
    focusId(ceritaIds.pageDetails);
    return;
  }
  detailsError.value = outcome.message;
  detailsErrorKind.value = outcome.kind;
  detailsStale.value = outcome.stale;
}

async function reloadFromDetails(): Promise<void> {
  const loaded = await store.load();
  if (!loaded) {
    detailsError.value = COULD_NOT_RELOAD;
    detailsErrorKind.value = null;
    return;
  }
  const target = detailsTarget.value;
  const token = target ? store.findPage(target.slug)?.updatedAt : undefined;
  if (target && token) detailsTarget.value = { ...target, token };
  detailsStale.value = false;
  detailsError.value = '';
}

async function reloadFromName(): Promise<void> {
  const loaded = await store.load();
  if (!loaded) {
    // The stale notice stays, the token is not advanced and the typed title is untouched.
    nameError.value = COULD_NOT_RELOAD;
    nameErrorKind.value = null;
    return;
  }
  const target = nameTarget.value;
  if (target?.kind === 'page-rename') {
    const token = store.findPage(target.slug)?.updatedAt;
    if (token) nameTarget.value = { ...target, token };
  } else if (target?.kind === 'chapter-rename') {
    const token = store.findChapter(target.id)?.chapter.updatedAt;
    if (token) nameTarget.value = { ...target, token };
  } else if (target?.kind === 'section-rename') {
    const token = store.findSection(target.id)?.section.updatedAt;
    if (token) nameTarget.value = { ...target, token };
  }
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

/** Delete for one page: from its card (`target` given) or from the open structure view. */
function openDeletePage(target: AdminPage | null = page.value): void {
  if (!target) return;
  deleteTarget.value = {
    kind: 'page',
    slug: target.slug,
    title: target.title,
    chapters: target.chapters.length,
    sections: target.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0),
    token: target.updatedAt,
  };
  resetDeleteState();
}

function openDeleteChapter(chapter: AdminChapter): void {
  deleteTarget.value = {
    kind: 'chapter',
    id: chapter.id,
    title: chapter.title,
    sections: chapter.sections.length,
    token: chapter.updatedAt,
  };
  resetDeleteState();
}

function openDeleteSection(chapter: AdminChapter, section: AdminSection): void {
  deleteTarget.value = {
    kind: 'section',
    id: section.id,
    chapterId: chapter.id,
    label: sectionLabel(section, chapter),
    token: section.updatedAt,
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
      outcome = await store.removePage(target.slug, target.token);
      message = `Halaman “${target.title}” dihapus.`;
      focus = ceritaIds.addPage;
      break;
    case 'chapter':
      outcome = await store.removeChapter(target.id, target.token);
      message = `Bab “${target.title}” dihapus.`;
      focus = ceritaIds.addChapter;
      break;
    case 'section':
      outcome = await store.removeSection(target.id, target.token);
      message = `Bagian “${target.label}” dihapus.`;
      focus = chapterIdOfSection ? ceritaIds.addSection(chapterIdOfSection) : null;
      break;
  }
  deleteBusy.value = false;

  if (outcome.ok) {
    deleteTarget.value = null;
    announce(message);
    // A page deleted from its own structure view has nothing left to show there: back to the list.
    if (target.kind === 'page' && detailSlug.value === target.slug) {
      await router.replace({ name: 'admin-cerita' });
    }
    await nextTick();
    if (focus) focusId(focus);
    return;
  }
  deleteError.value = outcome.message;
  deleteErrorKind.value = outcome.kind;
  deleteBlocked.value = outcome.blocked;
  deleteStale.value = outcome.stale;
}

async function reloadFromDelete(): Promise<void> {
  const loaded = await store.load();
  if (!loaded) {
    deleteError.value = COULD_NOT_RELOAD;
    deleteErrorKind.value = null;
    return;
  }
  const target = deleteTarget.value;
  if (target?.kind === 'page') {
    const token = store.findPage(target.slug)?.updatedAt;
    if (token) deleteTarget.value = { ...target, token };
  } else if (target?.kind === 'chapter') {
    const token = store.findChapter(target.id)?.chapter.updatedAt;
    if (token) deleteTarget.value = { ...target, token };
  } else if (target?.kind === 'section') {
    const token = store.findSection(target.id)?.section.updatedAt;
    if (token) deleteTarget.value = { ...target, token };
  }
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
  const counts = sectionIds.map((id) => ({ id, ...store.contentCountsFor(id) }));
  const holding = counts
    .filter((item) => item.paragraphs + item.figures > 0)
    .map((item) => item.id);
  const paragraphs = counts.reduce((sum, item) => sum + item.paragraphs, 0);
  const figures = counts.reduce((sum, item) => sum + item.figures, 0);
  if (holding.length === 0) return null;
  const subject = target.kind === 'page' ? 'Halaman' : target.kind === 'chapter' ? 'Bab' : 'Bagian';
  const names = holding
    .map((id) => store.findSection(id))
    .filter((found): found is NonNullable<typeof found> => Boolean(found))
    .map((found) => sectionLabel(found.section, found.chapter));
  return {
    message: dependentsMessage(subject, {
      contentBlocks: paragraphs,
      figures,
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
// The local "still holds content" notice has no failure kind of its own; only a server refusal does.
const deleteShownErrorKind = computed(() =>
  deleteError.value ? (deleteErrorKind.value ?? undefined) : undefined,
);
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
    actionErrorKind.value = outcome.kind;
    actionStale.value = outcome.stale;
    return;
  }
  onDone();
}

/** Moves one page; the two ids are the buttons that move it (list card or structure view). */
function movePageBySlug(slug: string, direction: Direction, upId: string, downId: string): void {
  const target = store.findPage(slug);
  if (!target) return;
  void runMove(
    () => store.movePage(slug, direction),
    () => {
      const index = pages.value.findIndex((item) => item.slug === slug);
      announce(`Halaman “${target.title}” dipindah ke urutan ${index + 1} dari ${pages.value.length}.`);
      focusAfterMove(upId, downId, index, pages.value.length, direction);
    },
  );
}

function movePage(direction: Direction): void {
  const current = page.value;
  if (!current) return;
  movePageBySlug(current.slug, direction, ceritaIds.pageUp, ceritaIds.pageDown);
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

// --- Cerita list (the default view) ---

const query = ref('');
/** Urutkan mode: Naik / Turun buttons show on each card (drag works either way). */
const sorting = ref(false);
/** Checked cards. Checkboxes are always shown; only cards the list shows are ever selected. */
const selectedSlugs = ref<string[]>([]);
/** Card being dragged (Urutkan mode) and the card it hovers, with the side the drop would land. */
const dragSlug = ref<string | null>(null);
const dropTarget = ref<{ slug: string; edge: 'before' | 'after' } | null>(null);
/** The drag hovers the zone after the last card (drop there = the end of the list). */
const dropAtEnd = ref(false);
const bulkTarget = ref<{ items: { slug: string; title: string; token: string }[] } | null>(null);
const bulkRunning = ref(false);
const bulkResults = ref<BulkResult[] | null>(null);
const bulkStale = ref(false);
const bulkError = ref('');

const filteredPages = computed(() => {
  const term = query.value.trim().toLowerCase();
  return term ? pages.value.filter((item) => item.title.toLowerCase().includes(term)) : pages.value;
});
const firstSlug = computed(() => pages.value[0]?.slug ?? null);
const lastSlug = computed(() => pages.value[pages.value.length - 1]?.slug ?? null);
const listBusy = computed(() => moving.value || deleteBusy.value || bulkRunning.value);
/**
 * Why dragging is off right now: a search filter hides part of the order, and a save in flight
 * would race the next drop. Null means the grip can be dragged, in Urutkan mode or not.
 */
const dragBlock = computed<'search' | 'busy' | null>(() => {
  if (query.value.trim() !== '') return 'search';
  if (listBusy.value) return 'busy';
  return null;
});

// A selection only ever covers pages the list shows: a page hidden by the search, or removed
// elsewhere, is dropped so "Hapus terpilih" cannot touch what the editor cannot see.
watch([query, pages], () => {
  const visible = new Set(filteredPages.value.map((item) => item.slug));
  const kept = selectedSlugs.value.filter((slug) => visible.has(slug));
  if (kept.length !== selectedSlugs.value.length) selectedSlugs.value = kept;
});

function toggleSorting(): void {
  sorting.value = !sorting.value;
  clearDrag();
}

function toggleSelected(slug: string): void {
  selectedSlugs.value = selectedSlugs.value.includes(slug)
    ? selectedSlugs.value.filter((item) => item !== slug)
    : [...selectedSlugs.value, slug];
}

/** Select-all acts on the cards the list shows (after the search), never on hidden ones. */
// While something is selected, "Tambah Cerita" is hidden with `invisible`: its slot keeps the
// toolbar still, and a hidden control leaves the focus order and the accessibility tree. If the
// focused control is one that disappears (Tambah or Hapus semua), focus moves to select-all.
watch(
  () => selectedSlugs.value.length,
  (count, previous) => {
    if (count === previous) return;
    const active = document.activeElement?.id;
    if (active === ceritaIds.bulkDelete || active === ceritaIds.addPage) {
      void nextTick(() => focusId(ceritaIds.selectAll));
    }
  },
);

const selectedVisibleCount = computed(
  () => filteredPages.value.filter((item) => selectedSlugs.value.includes(item.slug)).length,
);
/** none / some / all, for the tri-state select-all button. */
const selectAllState = computed<'none' | 'some' | 'all'>(() => {
  const visible = filteredPages.value.length;
  if (selectedVisibleCount.value === 0) return 'none';
  return selectedVisibleCount.value === visible ? 'all' : 'some';
});

function toggleSelectAll(): void {
  const visible = filteredPages.value.map((item) => item.slug);
  if (selectAllState.value === 'all') {
    selectedSlugs.value = selectedSlugs.value.filter((slug) => !visible.includes(slug));
    announce('Pilihan Cerita dibatalkan.');
    return;
  }
  selectedSlugs.value = [...new Set([...selectedSlugs.value, ...visible])];
  announce(`${visible.length} Cerita dipilih.`);
}

// --- Drag and drop: the grip works at any time except during a search or a save (`dragBlock`).
// Naik / Turun in Urutkan mode do the same reorder from the keyboard and on touch. ---

function clearDrag(): void {
  dragSlug.value = null;
  dropTarget.value = null;
  dropAtEnd.value = false;
}

function startDrag(slug: string): void {
  if (dragBlock.value) return;
  dragSlug.value = slug;
  dropTarget.value = null;
}

function hoverDrop(slug: string, edge: 'before' | 'after'): void {
  dropAtEnd.value = false;
  if (!dragSlug.value || dragSlug.value === slug) {
    dropTarget.value = null;
    return;
  }
  dropTarget.value = { slug, edge };
}

function hoverEnd(): void {
  dropTarget.value = null;
  dropAtEnd.value = dragSlug.value !== null;
}

/** Drop after the last card: the dragged card becomes the last one. */
function dropEnd(): void {
  const dragged = dragSlug.value;
  clearDrag();
  if (!dragged) return;
  const last = pages.value[pages.value.length - 1]?.slug;
  if (!last || last === dragged) return;
  placeDragged(dragged, pages.value.length - 1);
}

/**
 * Saves the drop: the dragged card goes before or after the card it was dropped on. Positions are
 * taken from the full order, so a search filter cannot shift the result.
 */
function dropOn(slug: string, edge: 'before' | 'after'): void {
  const dragged = dragSlug.value;
  clearDrag();
  if (!dragged || dragged === slug) return;
  const from = pages.value.findIndex((item) => item.slug === dragged);
  const anchor = pages.value.findIndex((item) => item.slug === slug);
  if (from < 0 || anchor < 0) return;
  let toIndex = edge === 'before' ? anchor : anchor + 1;
  if (from < toIndex) toIndex -= 1;
  placeDragged(dragged, toIndex);
}

/** Saves a drop at `toIndex` (0-based, full order) and announces and focuses the result. */
function placeDragged(dragged: string, toIndex: number): void {
  const from = pages.value.findIndex((item) => item.slug === dragged);
  if (from < 0 || toIndex === from) return;
  const direction: Direction = toIndex > from ? 1 : -1;
  const title = pages.value[from]?.title ?? '';
  void runMove(
    () => store.placePage(dragged, toIndex),
    () => {
      const index = pages.value.findIndex((item) => item.slug === dragged);
      announce(`Halaman “${title}” dipindah ke urutan ${index + 1} dari ${pages.value.length}.`);
      focusAfterMove(
        ceritaIds.cardUp(dragged),
        ceritaIds.cardDown(dragged),
        index,
        pages.value.length,
        direction,
      );
    },
  );
}

function moveListPage(slug: string, direction: Direction): void {
  movePageBySlug(slug, direction, ceritaIds.cardUp(slug), ceritaIds.cardDown(slug));
}

function openDeleteFromList(slug: string): void {
  openDeletePage(store.findPage(slug) ?? null);
}

function openBulkDelete(): void {
  const items = pages.value
    .filter((item) => selectedSlugs.value.includes(item.slug))
    .map((item) => ({ slug: item.slug, title: item.title, token: item.updatedAt }));
  if (items.length === 0) return;
  bulkResults.value = null;
  bulkStale.value = false;
  bulkError.value = '';
  bulkTarget.value = { items };
}

function closeBulk(): void {
  if (bulkRunning.value) return;
  bulkTarget.value = null;
  bulkResults.value = null;
  bulkStale.value = false;
  bulkError.value = '';
  // The button that opened the dialog may now be disabled (nothing selected), so pick a live one.
  void nextTick(() =>
    focusId(selectedSlugs.value.length > 0 ? ceritaIds.bulkDelete : ceritaIds.selectAll),
  );
}

/**
 * Deletes the selected pages one after another, each with the token it had when the dialog
 * opened. A page that still holds content is refused by the server and reported as blocked; a
 * page that changed since is reported as stale. Every page gets one line in the report.
 */
async function confirmBulkDelete(): Promise<void> {
  const target = bulkTarget.value;
  if (!target || bulkRunning.value) return;
  bulkRunning.value = true;
  bulkStale.value = false;
  bulkError.value = '';
  const results: BulkResult[] = [];
  for (const item of target.items) {
    const outcome = await store.removePage(item.slug, item.token);
    if (outcome.ok) {
      results.push({ slug: item.slug, title: item.title, status: 'deleted' });
      selectedSlugs.value = selectedSlugs.value.filter((slug) => slug !== item.slug);
    } else {
      results.push({
        slug: item.slug,
        title: item.title,
        status: outcome.blocked ? 'blocked' : 'failed',
        message: outcome.message,
      });
      if (outcome.stale) bulkStale.value = true;
    }
  }
  bulkRunning.value = false;
  bulkResults.value = results;
  const deleted = results.filter((item) => item.status === 'deleted').length;
  announce(`${deleted} halaman dihapus, ${results.length - deleted} tidak dapat dihapus.`);
}

/** Loads the latest pages after a stale report; the editor then opens the dialog again. */
async function reloadBulk(): Promise<void> {
  const loaded = await store.load();
  if (!loaded) {
    bulkError.value = COULD_NOT_RELOAD;
    return;
  }
  bulkStale.value = false;
  bulkError.value = '';
  announce('Data terbaru dimuat. Tutup jendela ini lalu pilih lagi halaman yang ingin dihapus.');
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
    <p class="sr-only" role="status" aria-live="polite" data-test="status">{{ statusMessage }}</p>

    <CeritaReloadNotice v-if="!authStore.sessionEnded" />

    <AlertBanner
      v-if="store.loadError && !store.reloadNeeded"
      :message="store.loadError"
      :kind="store.loadErrorKind ?? undefined"
      :busy="store.isLoading"
      data-test="load-error"
      @retry="store.load()"
    />

    <AlertBanner
      v-if="actionError"
      :message="actionError"
      :kind="actionErrorKind ?? undefined"
      data-test="action-error"
    >
      <template v-if="actionStale" #action>
        <BaseButton
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="reloading"
          data-test="action-reload"
          @click="reload"
        >
          {{ reloading ? 'Memuat…' : 'Muat ulang' }}
        </BaseButton>
      </template>
    </AlertBanner>

    <p v-if="showInitialLoading" class="text-text-muted text-sm" role="status" data-test="loading">
      Memuat halaman Cerita…
    </p>

    <section
      v-else-if="store.hasLoaded && detailSlug === null"
      aria-labelledby="cerita-judul-daftar"
      class="space-y-4"
      data-test="list-view"
    >
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2
          id="cerita-judul-daftar"
          class="text-brand-navy flex items-center gap-2 text-xl font-semibold"
        >
          <BookOpenIcon class="h-6 w-6 shrink-0" aria-hidden="true" />
          Cerita
        </h2>

        <!-- Phones: every control full width in one column; from md: one row, right-aligned. -->
        <div
          class="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center md:justify-end"
          data-test="toolbar"
        >
          <div class="relative w-full md:w-auto">
            <label :for="ceritaIds.search" class="sr-only">Cari Cerita</label>
            <MagnifyingGlassIcon
              class="text-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
              data-test="search-icon"
            />
            <input
              :id="ceritaIds.search"
              v-model="query"
              type="search"
              placeholder="Cari Cerita"
              autocomplete="off"
              class="rounded-btn border-border-strong text-brand-navy placeholder:text-text-muted focus-visible:outline-focus-ring min-h-11 w-full border bg-surface py-2 pr-3 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 md:w-56"
              data-test="search"
            />
          </div>
          <BaseButton
            :id="ceritaIds.sortToggle"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11 w-full md:w-auto"
            :aria-pressed="sorting ? 'true' : 'false'"
            :disabled="listBusy"
            data-test="sort-toggle"
            @click="toggleSorting"
          >
            Urutkan Cerita
          </BaseButton>
          <BaseButton
            :id="ceritaIds.selectAll"
            type="button"
            role="checkbox"
            :variant="selectedSlugs.length > 0 ? 'primary' : 'secondary'"
            size="md"
            class="min-h-11 w-full min-w-[12.5rem] md:w-auto"
            :aria-checked="selectAllState === 'some' ? 'mixed' : selectAllState === 'all' ? 'true' : 'false'"
            :disabled="listBusy || pages.length === 0"
            data-test="select-all"
            @click="toggleSelectAll"
          >
            <template #leftIcon>
              <svg viewBox="0 0 20 20" class="h-4 w-4" aria-hidden="true" focusable="false">
                <rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" />
                <path v-if="selectAllState === 'all'" d="M6.5 10.5l2.4 2.4 4.6-4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path v-else-if="selectAllState === 'some'" d="M6.5 10h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </template>
            {{ selectAllState === 'all' ? 'Batal pilih semua' : 'Pilih semua' }}
          </BaseButton>
          <BaseButton
            :id="ceritaIds.addPage"
            type="button"
            size="md"
            class="min-h-11 w-full md:w-auto"
            :class="selectedSlugs.length > 0 ? 'invisible' : ''"
            :disabled="listBusy"
            data-test="add-page"
            @click="openName({ kind: 'page-add' })"
          >
            <template #leftIcon>
              <PlusIcon class="h-4 w-4" aria-hidden="true" />
            </template>
            Tambah Cerita
          </BaseButton>
        </div>
      </div>

      <!--
        A fixed-height row: the search count and the bulk actions come and go here, so nothing
        above or below it moves. The bulk group exists only while at least one card is selected.
      -->
      <div class="flex min-h-11 items-center gap-3" data-test="selection-bar">
        <p
          v-if="query.trim() !== ''"
          class="text-text-muted text-sm"
          role="status"
          data-test="search-count"
        >
          Menampilkan {{ filteredPages.length }} dari {{ pages.length }} Cerita.
        </p>
        <div v-if="selectedSlugs.length > 0" class="ml-auto flex items-center gap-3">
          <span class="text-brand-navy text-sm font-semibold" data-test="selected-count">
            {{ selectedSlugs.length }} dipilih
          </span>
          <BaseButton
            :id="ceritaIds.bulkDelete"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="listBusy"
            data-test="bulk-delete"
            @click="openBulkDelete"
          >
            Hapus semua
          </BaseButton>
        </div>
      </div>

      <CeritaPageCardList
        :pages="filteredPages"
        :total-count="pages.length"
        :first-slug="firstSlug"
        :last-slug="lastSlug"
        :sorting="sorting"
        :drag-block="dragBlock"
        :selected-slugs="selectedSlugs"
        :drag-slug="dragSlug"
        :drop-target="dropTarget"
        :busy="listBusy"
        @edit="openPage"
        @delete="openDeleteFromList"
        @move="moveListPage"
        @toggle="toggleSelected"
        @drag-start="startDrag"
        @drag-end="clearDrag"
        @drag-over="hoverDrop"
        :drop-at-end="dropAtEnd"
        @drop="dropOn"
        @drag-over-end="hoverEnd"
        @drop-end="dropEnd"
      />
    </section>

    <div v-else-if="store.hasLoaded" class="space-y-6" data-test="detail-view">
      <div>
        <BaseButton
          :id="ceritaIds.backToList"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          data-test="back-to-list"
          @click="backToList"
        >
          <template #leftIcon>
            <ArrowLeftIcon class="h-4 w-4" aria-hidden="true" />
          </template>
          Kembali ke daftar
        </BaseButton>
      </div>

      <p class="text-text-muted max-w-3xl text-sm">
        Atur bab dan bagian halaman ini, lalu isi setiap bagian dengan paragraf dan satu gambar.
        Perubahan langsung tampil di situs setelah disimpan.
      </p>

      <p
        v-if="!page"
        class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
        role="status"
        data-test="page-missing"
      >
        Halaman ini tidak ditemukan. Mungkin sudah dihapus. Pilih “Kembali ke daftar” untuk memilih
        Cerita yang lain.
      </p>

      <CeritaStructurePanel
        v-else
        :page="page"
        :is-first-page="pageIndex <= 0"
        :is-last-page="pageIndex === pages.length - 1"
        :busy="structureBusy"
        @rename-page="
          openName({
            kind: 'page-rename',
            slug: page.slug,
            initial: page.title,
            token: page.updatedAt,
          })
        "
        @edit-page-details="openDetails(page.slug, page.updatedAt)"
        @move-page="movePage"
        @delete-page="openDeletePage"
        @add-chapter="openName({ kind: 'chapter-add', pageSlug: page.slug })"
        @rename-chapter="
          (chapter) =>
            openName({
              kind: 'chapter-rename',
              id: chapter.id,
              initial: chapter.title,
              token: chapter.updatedAt,
            })
        "
        @move-chapter="moveChapter"
        @delete-chapter="openDeleteChapter"
        @add-section="(chapter) => openName({ kind: 'section-add', chapterId: chapter.id })"
        @open-section="openEditor"
        @rename-section="
          (section) =>
            openName({
              kind: 'section-rename',
              id: section.id,
              initial: section.title ?? '',
              token: section.updatedAt,
            })
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
      :error-kind="nameErrorKind ?? undefined"
      :stale="nameStale"
      @submit="submitName"
      @close="closeName"
      @reload="reloadFromName"
    />

    <CeritaPageDetailsDialog
      :open="detailsTarget !== null"
      :page-title="detailsPage?.title ?? ''"
      :headline="detailsPage?.headline ?? null"
      :byline-author="detailsPage?.bylineAuthor ?? null"
      :byline-affiliation="detailsPage?.bylineAffiliation ?? null"
      :busy="detailsBusy"
      :error="detailsError"
      :error-kind="detailsErrorKind ?? undefined"
      :stale="detailsStale"
      @submit="submitDetails"
      @close="closeDetails"
      @reload="reloadFromDetails"
    />

    <CeritaDeleteDialog
      :open="deleteTarget !== null"
      :heading="deleteDialog.heading"
      :message="deleteDialog.message"
      :consequence="deleteDialog.consequence"
      :confirm-label="deleteDialog.confirm"
      :busy="deleteBusy"
      :error="deleteShownError"
      :error-kind="deleteShownErrorKind"
      :blocked="deleteShownBlocked"
      :stale="deleteStale"
      :hint="deleteHint"
      :action-label="deleteTarget?.kind === 'section' ? 'Buka isi bagian' : undefined"
      @action="openEditorFromDelete"
      @confirm="confirmDelete"
      @close="closeDelete"
      @reload="reloadFromDelete"
    />

    <CeritaBulkDeleteDialog
      :open="bulkTarget !== null"
      :items="bulkTarget?.items ?? []"
      :busy="bulkRunning"
      :results="bulkResults"
      :stale="bulkStale"
      :error="bulkError"
      @confirm="confirmBulkDelete"
      @close="closeBulk"
      @reload="reloadBulk"
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
