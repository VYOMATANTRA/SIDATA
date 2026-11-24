<script setup lang="ts">
/**
 * `/admin/cerita`: management of the Cerita pages (SPEC §2, §3, §8). The default view is a list of
 * page cards (search, Urutkan, Pilih, Tambah). Edit opens one page at `?halaman=<slug>` as a
 * editor: the structure tree (left), the selected section's text and figure (centre) and a live
 * preview of the unsaved draft (right from 1536px, below the editor cards before that). The selected chapter and section live in
 * the URL (`bab`, `bagian`), so a reload keeps them. Every write goes through `ceritaAdmin.store`.
 *
 * The shell header carries the title: the route's `meta` (router/index.ts) on the list, and the open
 * page (breadcrumb, title, headline, "Lihat di situs") in the editor, set by `syncHeader`. The view's
 * own headings start at <h2>. The route is `meta.fullBleed`: AdminLayout does not pad or card the
 * view, so the list and the editor each bring their own spacing.
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
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { BookOpenIcon, EyeIcon, PlusIcon } from '@heroicons/vue/24/outline';
import BaseButton from '../components/common/BaseButton.vue';
import AlertBanner from '../components/common/AlertBanner.vue';
import BaseModal from '../components/common/BaseModal.vue';
import BulkDeleteDialog from '../components/admin/cards/BulkDeleteDialog.vue';
import CardListToolbar from '../components/admin/cards/CardListToolbar.vue';
import CardSearchField from '../components/admin/cards/CardSearchField.vue';
import CardSelectionBar from '../components/admin/cards/CardSelectionBar.vue';
import SelectAllButton from '../components/admin/cards/SelectAllButton.vue';
import SortToggleButton from '../components/admin/cards/SortToggleButton.vue';
import type { BulkResult } from '../components/admin/cards/cardTypes';
import {
  ADMIN_HEADER_TITLE_ID,
  setAdminHeader,
  useAdminHeader,
} from '../composables/useAdminHeader';
import { useCardDragReorder } from '../composables/useCardDragReorder';
import { useCardSelection } from '../composables/useCardSelection';
import CeritaDeleteDialog from '../components/admin/cerita/CeritaDeleteDialog.vue';
import CeritaPageDetailsDialog from '../components/admin/cerita/CeritaPageDetailsDialog.vue';
import CeritaNameDialog from '../components/admin/cerita/CeritaNameDialog.vue';
import CeritaPageCardList from '../components/admin/cerita/CeritaPageCardList.vue';
import CeritaReloadNotice from '../components/admin/cerita/CeritaReloadNotice.vue';
import CeritaLivePreview from '../components/admin/cerita/CeritaLivePreview.vue';
import CeritaSectionPane from '../components/admin/cerita/CeritaSectionPane.vue';
import CeritaStructureTree from '../components/admin/cerita/CeritaStructureTree.vue';
import CeritaChapterOverview from '../components/admin/cerita/CeritaChapterOverview.vue';
import CeritaMoveSectionDialog from '../components/admin/cerita/CeritaMoveSectionDialog.vue';
import { ceritaIds } from '../components/admin/cerita/ceritaDomIds';
import { pendingFigureKind, type PendingFigureKind } from '../composables/figureKindHint';
import { mediaPreviewPath } from '../services/media.service';
import {
  figureBadge,
  plainExcerpt,
  sectionCompleteness,
  thumbnailMediaId,
  type OverviewCard,
} from '../utils/ceritaChapterOverview';
import { dependentsMessage } from '../utils/ceritaAdminMessages';
import { previewFigureOf } from '../utils/ceritaPreviewFigure';
import { useMediaQuery } from '../composables/useMediaQuery';
import type { FigureDraft } from '../utils/ceritaFigureDraft';
import {
  chapterNumberLabel,
  figureTreeLabel,
  sectionNumberLabel,
  type FigureTreeLabel,
} from '../utils/ceritaTreeLabels';
import type { ArticleFigure as ArticleFigureData } from '../types/ceritaArticle';
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

type NameTarget =
  | { kind: 'page-add' }
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

/** A duplicate is in flight (its button is busy). */
const duplicating = ref(false);

// The centre column's section editor reports its own state (see CeritaSectionEditor). A draft that
// is not saved asks before the URL moves to another section or page. Its save is driven from the
// shell header's "Simpan perubahan" through the pane.
const sectionPane = ref<InstanceType<typeof CeritaSectionPane> | null>(null);
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
const structureBusy = computed(
  () =>
    moving.value || nameBusy.value || deleteBusy.value || detailsBusy.value || duplicating.value,
);

// --- Selection in the URL: `?halaman=<slug>&bab=<chapterId>&bagian=<sectionId>` ---

function queryId(name: 'bab' | 'bagian'): string | null {
  const raw = route.query[name];
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

/** The section in the centre column: only one that belongs to the open page. */
const selectedFound = computed(() => {
  const id = queryId('bagian');
  if (!id || !page.value) return undefined;
  const found = store.findSection(id);
  return found && found.page.slug === page.value.slug ? found : undefined;
});
const selectedSection = computed<AdminSection | null>(() => selectedFound.value?.section ?? null);
/** The chapter that holds the selected section, or the one the URL names when it exists here. */
const selectedChapterId = computed<string | null>(() => {
  if (selectedFound.value) return selectedFound.value.chapter.id;
  const id = queryId('bab');
  return id && page.value?.chapters.some((chapter) => chapter.id === id) ? id : null;
});
/**
 * The chapter overview: a chapter named in the URL with no section (`?bab=<id>` alone). Null when a
 * section is named (its editor, or the missing-section notice, takes the centre) or the chapter is
 * not on the open page.
 */
const overviewInfo = computed<{ chapter: AdminChapter; index: number } | null>(() => {
  if (!page.value || queryId('bagian') !== null) return null;
  const id = queryId('bab');
  if (!id) return null;
  const index = page.value.chapters.findIndex((chapter) => chapter.id === id);
  const chapter = index >= 0 ? page.value.chapters[index] : undefined;
  return chapter ? { chapter, index } : null;
});
const overviewChapter = computed<AdminChapter | null>(() => overviewInfo.value?.chapter ?? null);
const overviewChapterNumber = computed(() =>
  overviewInfo.value
    ? chapterNumberLabel(overviewInfo.value.chapter.number, overviewInfo.value.index)
    : '',
);
/** Other chapters of the page (the targets of a move), with the labels the move dialog shows. */
function chapterTargetsFor(chapterId: string): { id: string; label: string }[] {
  return (page.value?.chapters ?? [])
    .map((chapter, index) => ({ chapter, index }))
    .filter((item) => item.chapter.id !== chapterId)
    .map((item) => ({
      id: item.chapter.id,
      label: `Bab ${chapterNumberLabel(item.chapter.number, item.index)} · ${item.chapter.title}`,
    }));
}
/** A section id in the URL that the open page does not have (deleted, or another page's). */
const sectionMissing = computed(
  () => queryId('bagian') !== null && store.hasLoaded && selectedSection.value === null,
);

function sectionLabelIn(section: AdminSection, index: number): string {
  return section.title?.trim() ? section.title : `Bagian ${index + 1}`;
}

/** Every section of the open page in reading order, with its number and title for prev and next. */
const flatSections = computed(() =>
  (page.value?.chapters ?? []).flatMap((chapter, chapterIndex) =>
    chapter.sections.map((section, sectionIndex) => ({
      chapter,
      section,
      number: sectionNumberLabel(chapterNumberLabel(chapter.number, chapterIndex), sectionIndex),
      title: sectionLabelIn(section, sectionIndex),
    })),
  ),
);
const selectedPosition = computed(() =>
  flatSections.value.findIndex((item) => item.section.id === selectedSection.value?.id),
);
const prevSection = computed(() =>
  selectedPosition.value > 0 ? (flatSections.value[selectedPosition.value - 1] ?? null) : null,
);
const nextSection = computed(() =>
  selectedPosition.value >= 0 && selectedPosition.value < flatSections.value.length - 1
    ? (flatSections.value[selectedPosition.value + 1] ?? null)
    : null,
);

/** What the centre column's header needs about the selected section. */
const selectedMeta = computed(() => {
  const found = selectedFound.value;
  if (!found || !page.value) return null;
  const chapterIndex = page.value.chapters.findIndex((item) => item.id === found.chapter.id);
  const sectionIndex = found.chapter.sections.findIndex((item) => item.id === found.section.id);
  const chapterNumber = chapterNumberLabel(found.chapter.number, chapterIndex);
  return {
    chapterLabel: `Bab ${chapterNumber} · ${found.chapter.title}`,
    sectionNumber: sectionNumberLabel(chapterNumber, sectionIndex),
    title: sectionLabelIn(found.section, sectionIndex),
  };
});

/** The figure label the tree shows for a section (`Figur kosong` is a warning). */
function figureSummary(sectionId: string): FigureTreeLabel {
  return figureTreeLabel(store.figureFor(sectionId)?.figure ?? null);
}

/**
 * The section's UNSAVED draft as the live preview reads it: the title and body from the text card and
 * the figure from the figure card. Each card reports its working copy (immediately and on change);
 * until a card has reported, the preview falls back to the stored title and an empty figure.
 */
const textDraft = ref<{ title: string; body: string } | null>(null);
const figureDraft = ref<FigureDraft | null>(null);
/**
 * The preview panel: open by default from 1536px, where it is the third column and cannot be
 * collapsed; below that it starts collapsed and the user opens it. The live preview (and its iframe)
 * mounts only while the panel is open.
 */
const wideEditor = useMediaQuery('(min-width: 1536px)');
const previewOpen = ref(false);
function onPreviewToggle(event: Event): void {
  previewOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}
const previewTitle = computed(() => textDraft.value?.title ?? selectedMeta.value?.title ?? '');
const previewBody = computed(() => textDraft.value?.body ?? '');
const previewFigure = computed<ArticleFigureData | null>(() =>
  figureDraft.value ? previewFigureOf(figureDraft.value) : null,
);
const showInitialLoading = computed(() => !store.hasLoaded && store.isLoading);
/** Mirrors the load-error banner's `v-if` in the template. */
const loadErrorShowing = computed(() => store.loadError !== null && !store.reloadNeeded);

// --- Shell header ---
// An open page takes the shell header: its breadcrumb (Cerita / title), its title and its headline
// (or the fallback hint) in the compact header. The list and a page that is still loading use the
// route's own title and subtitle, which AdminLayout also restores on navigation.
const PAGE_HEADER_FALLBACK = 'Perubahan langsung tampil di situs setelah disimpan.';

const { trail: headerTrail } = useAdminHeader();

function routeHeader(): { title: string; subtitle: string } {
  return { title: route.meta.title ?? '', subtitle: route.meta.subtitle ?? '' };
}

function syncHeader(): void {
  const open = page.value;
  if (open) {
    setAdminHeader(open.title, open.headline || PAGE_HEADER_FALLBACK, {
      trail: [{ label: 'Cerita', to: '/admin/cerita' }, { label: open.title }],
      compact: true,
    });
    return;
  }
  const header = routeHeader();
  setAdminHeader(header.title, header.subtitle);
}

watch(
  () => [page.value?.title, page.value?.headline, detailSlug.value],
  () => syncHeader(),
  { immediate: true },
);

onMounted(() => {
  void store.load();
});

// The store's own selection follows the URL, so its page-level helpers agree with the screen. When
// the structure view closes (Back, the list button, or a delete), the page's Edit button gets focus.
watch(
  detailSlug,
  (slug, previous) => {
    store.selectPage(slug);
    // A section is selected by its `bagian` query, which a page change does not carry, so the editor
    // closes with it. (An unsaved draft was already confirmed by the route-update guard.)
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
  focusId(ADMIN_HEADER_TITLE_ID);
}

/**
 * "Kembali ke daftar": the list again; the watch on `detailSlug` returns focus to the card. Only the
 * notice for a missing page offers it now: an open page is left with the breadcrumb's "Cerita" link,
 * which runs the same unsaved-changes guard as the route updates.
 */
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
      focus = ADMIN_HEADER_TITLE_ID;
      message = `Halaman “${title}” ditambahkan.`;
      // The new page opens at once, so its first chapter can be added.
      if (result.ok) {
        await router.push({ name: 'admin-cerita', query: { halaman: result.value.slug } });
      }
      break;
    }
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
      if (result.ok) {
        // The new section opens at once, so its paragraphs and figure can be filled in.
        await openSectionById(result.value.id);
        focus = ceritaIds.sectionHeading;
      }
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

/**
 * "Info cerita" save: the page title first (only when it changed, through the same rename the list
 * uses), then the headline and byline. Both carry the page's token; after a rename the token moves
 * to the renamed page's, so the details save does not refuse its own write.
 */
async function submitDetails(details: PageDetailsInput, title: string): Promise<void> {
  const target = detailsTarget.value;
  if (!target || detailsBusy.value) return;
  detailsBusy.value = true;
  detailsError.value = '';
  detailsStale.value = false;

  let token = target.token;
  let renamed = false;
  const current = store.findPage(target.slug);
  if (current && title !== current.title) {
    const rename = await store.renamePage(target.slug, title, token);
    if (!rename.ok) {
      detailsBusy.value = false;
      detailsError.value = rename.message;
      detailsErrorKind.value = rename.kind;
      detailsStale.value = rename.stale;
      return;
    }
    renamed = true;
    token = store.findPage(target.slug)?.updatedAt ?? token;
    detailsTarget.value = { ...target, token };
  }

  const outcome = await store.updatePageDetails(target.slug, details, token);
  detailsBusy.value = false;

  if (outcome.ok) {
    detailsTarget.value = null;
    announce(
      renamed
        ? `Judul halaman diubah menjadi “${title}”. Judul utama dan penulis halaman disimpan.`
        : 'Judul utama dan penulis halaman disimpan.',
    );
    await nextTick();
    focusId(ceritaIds.pageDetails);
    return;
  }
  // The title is a separate write: tell the user it already went through.
  detailsError.value = renamed
    ? `Judul halaman sudah diubah menjadi “${title}”, tetapi judul utama dan penulis belum tersimpan. ${outcome.message}`
    : outcome.message;
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
  if (target?.kind === 'chapter-rename') {
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
      // "Tambah Cerita" is hidden while cards are selected; then focus goes to select-all instead.
      focus = selectedSlugs.value.length > 0 ? ceritaIds.selectAll : ceritaIds.addPage;
      break;
    case 'chapter':
      outcome = await store.removeChapter(target.id, target.token);
      message = `Bab “${target.title}” dihapus.`;
      focus = ceritaIds.addChapter;
      break;
    case 'section':
      outcome = await store.removeSection(target.id, target.token);
      message = `Bagian “${target.label}” dihapus.`;
      // The overview of this chapter stays on screen when the section was not open (or was the open one).
      focus =
        chapterIdOfSection &&
        queryId('bab') === chapterIdOfSection &&
        (queryId('bagian') === null || queryId('bagian') === target.id)
          ? ceritaIds.overviewLabel
          : chapterIdOfSection
            ? ceritaIds.addSection(chapterIdOfSection)
            : null;
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
    // The chapter whose overview is open is gone: the URL drops it and the page's structure shows.
    if (target.kind === 'chapter' && queryId('bab') === target.id) {
      await router.replace({
        name: 'admin-cerita',
        query: { halaman: detailSlug.value ?? undefined },
      });
    }
    // The open section is gone: its draft goes with it (no discard question), and the URL drops it.
    if (target.kind === 'section' && queryId('bagian') === target.id) {
      editorDirty.value = false;
      await router.replace({
        name: 'admin-cerita',
        query: { halaman: detailSlug.value ?? undefined, bab: chapterIdOfSection ?? undefined },
      });
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
  void openSectionById(found.section.id);
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

/** Runs one move; true when it saved. A refused, failed or superseded move reports false. */
async function runMove(action: () => Promise<WriteOutcome>, onDone: () => void): Promise<boolean> {
  if (moving.value) return false;
  moving.value = true;
  clearActionError();
  const outcome = await action();
  moving.value = false;
  if (!outcome.ok) {
    actionError.value = outcome.message;
    actionErrorKind.value = outcome.kind;
    actionStale.value = outcome.stale;
    return false;
  }
  onDone();
  return true;
}

/** Moves one page; the two ids are the buttons that move it (list card or structure view). */
function movePageBySlug(slug: string, direction: Direction, upId: string, downId: string): void {
  const target = store.findPage(slug);
  if (!target) return;
  void runMove(
    () => store.movePage(slug, direction),
    () => {
      const index = pages.value.findIndex((item) => item.slug === slug);
      announce(
        `Halaman “${target.title}” dipindah ke urutan ${index + 1} dari ${pages.value.length}.`,
      );
      focusAfterMove(upId, downId, index, pages.value.length, direction);
    },
  );
}

// --- Cerita list (the default view) ---

const query = ref('');
/** Urutkan mode: Naik / Turun buttons show on each card (drag works either way). */
const sorting = ref(false);
const bulkTarget = ref<{ items: { key: string; title: string }[] } | null>(null);
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

/** The cards the list shows, in order; selection and select-all act on these only. */
const visibleSlugs = computed(() => filteredPages.value.map((item) => item.slug));
// A selection only ever covers pages the list shows: `useCardSelection` drops a page that is hidden by
// the search or removed elsewhere, so "Hapus semua" cannot touch what the editor cannot see.
const selection = useCardSelection(visibleSlugs);
const selectedSlugs = selection.selected;
const selectAllState = selection.selectAllState;

function toggleSorting(): void {
  sorting.value = !sorting.value;
  drag.clearDrag();
}

function toggleSelected(slug: string): void {
  selection.toggle(slug);
}

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

/** Select-all acts on the cards the list shows (after the search), never on hidden ones. */
function toggleSelectAll(): void {
  // With no match there is nothing to select, so nothing is announced as selected (the button is
  // disabled too).
  if (visibleSlugs.value.length === 0) {
    announce('Tidak ada Cerita yang cocok dengan pencarian ini.');
    return;
  }
  const result = selection.toggleSelectAll();
  if (result === 'cleared') {
    announce('Pilihan Cerita dibatalkan.');
    return;
  }
  announce(`${filteredPages.value.length} Cerita dipilih.`);
}

// --- Drag and drop: the grip works at any time except during a search or a save (`dragBlock`).
// Naik / Turun in Urutkan mode do the same reorder from the keyboard and on touch. The state and
// the index maths are in `useCardDragReorder`; this view saves the move.
const drag = useCardDragReorder({
  order: computed(() => pages.value.map((item) => item.slug)),
  blocked: dragBlock,
  onMove: (slug, toIndex) => placeDragged(slug, toIndex),
});
const dragSlug = drag.dragKey;
const dropTarget = drag.dropTarget;
const dropAtEnd = drag.dropAtEnd;
const clearDrag = drag.clearDrag;
const startDrag = drag.startDrag;
const hoverDrop = drag.hoverDrop;
const hoverEnd = drag.hoverEnd;
const dropOn = drag.dropOn;
const dropEnd = drag.dropEnd;

/** Saves a drop at `toIndex` (0-based, full order) and announces and focuses the result. */
function placeDragged(dragged: string, toIndex: number): void {
  const from = pages.value.findIndex((item) => item.slug === dragged);
  if (from < 0 || toIndex === from) return;
  const title = pages.value[from]?.title ?? '';
  void runMove(
    () => store.placePage(dragged, toIndex),
    () => {
      const index = pages.value.findIndex((item) => item.slug === dragged);
      announce(`Halaman “${title}” dipindah ke urutan ${index + 1} dari ${pages.value.length}.`);
      // Naik / Turun exist only in Urutkan mode, so a drop (any mode) keeps focus on the card's Edit.
      // Pointer drop: the moved card's Edit button, without scrolling the list.
      void nextTick(() =>
        document.getElementById(ceritaIds.cardEdit(dragged))?.focus({ preventScroll: true }),
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
    .map((item) => ({ key: item.slug, title: item.title }));
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
    // The store holds each page's current token (a previous delete reloads the tree), so none is sent.
    const outcome = await store.removePage(item.key);
    if (outcome.ok) {
      results.push({ key: item.key, title: item.title, status: 'deleted' });
      selectedSlugs.value = selectedSlugs.value.filter((slug) => slug !== item.key);
    } else {
      results.push({
        key: item.key,
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

// --- Order in the tree and the overview (grips: drag, or the keyboard; both reach the same saves) ---

function placeChapterDragged(
  chapter: AdminChapter,
  toIndex: number,
  done?: (ok: boolean) => void,
): void {
  const current = page.value;
  if (!current) {
    done?.(false);
    return;
  }
  void runMove(
    () => store.placeChapter(current.slug, chapter.id, toIndex),
    () => {
      const chapters = store.findPage(current.slug)?.chapters ?? [];
      const index = chapters.findIndex((item) => item.id === chapter.id);
      announce(`Bab “${chapter.title}” dipindah ke urutan ${index + 1} dari ${chapters.length}.`);
      // The grip keeps focus, so a keyboard user can move the chapter again.
      focusId(ceritaIds.treeChapterGrip(chapter.id));
    },
  ).then((ok) => done?.(ok));
}

function placeSectionDragged(
  chapter: AdminChapter,
  section: AdminSection,
  toIndex: number,
  done?: (ok: boolean) => void,
): void {
  void runMove(
    () => store.placeSection(chapter.id, section.id, toIndex),
    () => {
      const sections = store.findChapter(chapter.id)?.chapter.sections ?? [];
      const index = sections.findIndex((item) => item.id === section.id);
      announce(
        `Bagian “${sectionLabel(section, chapter)}” dipindah ke urutan ${index + 1} dari ${sections.length}.`,
      );
      focusId(ceritaIds.treeSectionGrip(section.id));
    },
  ).then((ok) => done?.(ok));
}

// --- Section selection and section actions (centre column) ---

function deleteSelected(): void {
  const found = selectedFound.value;
  if (found) openDeleteSection(found.chapter, found.section);
}

/** "Simpan perubahan" in the shell header: saves the open section's unsaved text and figure. */
function saveSection(): void {
  void sectionPane.value?.save();
}

/** Opens a section in the centre column. Unsaved work is guarded by the route hooks below. */
async function selectSection(chapter: AdminChapter, section: AdminSection): Promise<boolean> {
  const slug = detailSlug.value ?? page.value?.slug;
  if (!slug) return false;
  clearActionError();
  const failure = await router.push({
    name: 'admin-cerita',
    query: { halaman: slug, bab: chapter.id, bagian: section.id },
  });
  return !failure;
}

async function openSectionById(sectionId: string): Promise<boolean> {
  const found = store.findSection(sectionId);
  if (!found) return false;
  return selectSection(found.chapter, found.section);
}

/** Prev / next buttons: open the neighbour and move focus to the new section heading. */
async function goToSection(
  item: { chapter: AdminChapter; section: AdminSection } | null,
): Promise<void> {
  if (!item) return;
  if (await selectSection(item.chapter, item.section)) focusId(ceritaIds.sectionHeading);
}

async function duplicateSelected(): Promise<void> {
  const found = selectedFound.value;
  if (!found || structureBusy.value) return;
  duplicating.value = true;
  clearActionError();
  const outcome = await store.duplicateSection(found.section.id);
  duplicating.value = false;
  if (!outcome.ok) {
    actionError.value = outcome.message;
    actionErrorKind.value = outcome.kind;
    actionStale.value = outcome.stale;
    return;
  }
  // The copy opens at once: its paragraphs and figure are its own, so they can be changed freely.
  const copy = store.findSection(outcome.value.id);
  announce(`Bagian “${found.section.title ?? 'tanpa judul'}” digandakan. Salinan dibuka.`);
  if (copy && (await selectSection(copy.chapter, copy.section))) {
    focusId(ceritaIds.sectionHeading);
  }
}

// --- Chapter overview (centre column when a chapter is open and no section is) ---

const titleSaving = ref(false);
const overviewTitleError = ref('');
const overviewTitleErrorKind = ref<FailureKind | null>(null);
const overviewTitleStale = ref(false);
const addSectionBusy = ref(false);
const addSectionError = ref('');
const addSectionErrorKind = ref<FailureKind | null>(null);
/** The section "Pindahkan ke bab lain…" is open for, with the chapter it is in and its label. */
const relocate = ref<{ sectionId: string; chapterId: string; title: string } | null>(null);
const relocateBusy = ref(false);
const relocateError = ref('');
const relocateErrorKind = ref<FailureKind | null>(null);
const relocateStale = ref(false);

const overviewCards = computed<OverviewCard[]>(() => {
  const info = overviewInfo.value;
  if (!info) return [];
  const chapterNumber = chapterNumberLabel(info.chapter.number, info.index);
  return info.chapter.sections.map((section, sectionIndex) => {
    const figure = store.figureFor(section.id)?.figure ?? null;
    const paragraphs = store.paragraphsFor(section.id);
    const mediaId = thumbnailMediaId(figure);
    const number = sectionNumberLabel(chapterNumber, sectionIndex);
    return {
      section,
      number,
      title: sectionLabelIn(section, sectionIndex),
      excerpt: plainExcerpt(paragraphs[0]?.body),
      figureBadge: figureBadge(figure),
      completeness: sectionCompleteness({
        title: section.title,
        paragraphCount: paragraphs.length,
        figure,
      }),
      thumbPath: mediaId ? mediaPreviewPath(mediaId) : null,
      thumbAlt: `Pratinjau gambar bagian ${number}`,
    };
  });
});

/** Name of a section in the open chapter, for announcements and dialogs. */
function overviewLabelOf(section: AdminSection): string {
  return overviewChapter.value
    ? sectionLabel(section, overviewChapter.value)
    : (section.title ?? '');
}

/** A chapter row in the tree: opens its overview (the URL keeps no section). */
async function selectChapter(chapter: AdminChapter): Promise<void> {
  const slug = detailSlug.value ?? page.value?.slug;
  if (!slug) return;
  clearActionError();
  const failure = await router.push({
    name: 'admin-cerita',
    query: { halaman: slug, bab: chapter.id },
  });
  if (!failure) announce(`Ringkasan bab “${chapter.title}” dibuka.`);
}

/** "Edit bagian" on an overview card: opens the section in the centre column. */
async function openOverviewSection(section: AdminSection): Promise<void> {
  const chapter = overviewChapter.value;
  if (chapter) await selectSection(chapter, section);
}

async function saveOverviewTitle(title: string): Promise<void> {
  const chapter = overviewChapter.value;
  if (!chapter || titleSaving.value) return;
  titleSaving.value = true;
  overviewTitleError.value = '';
  overviewTitleErrorKind.value = null;
  overviewTitleStale.value = false;
  // The chapter's token is the one the screen loaded; a stale refusal keeps the typed title.
  const outcome = await store.renameChapter(chapter.id, title, chapter.updatedAt);
  titleSaving.value = false;
  if (outcome.ok) {
    announce(`Judul bab diubah menjadi “${title}”.`);
    return;
  }
  overviewTitleError.value = outcome.message;
  overviewTitleErrorKind.value = outcome.kind;
  overviewTitleStale.value = outcome.stale;
}

/** Loads the latest data after a stale title refusal; the typed title stays where it is. */
async function reloadFromOverview(): Promise<void> {
  const loaded = await store.load();
  if (!loaded) {
    overviewTitleError.value = COULD_NOT_RELOAD;
    overviewTitleErrorKind.value = null;
    return;
  }
  overviewTitleError.value = '';
  overviewTitleStale.value = false;
}

function placeOverviewSection(
  section: AdminSection,
  toIndex: number,
  done?: (ok: boolean) => void,
): void {
  const chapter = overviewChapter.value;
  if (!chapter) {
    done?.(false);
    return;
  }
  void runMove(
    () => store.placeSection(chapter.id, section.id, toIndex),
    () => {
      const sections = store.findChapter(chapter.id)?.chapter.sections ?? [];
      const index = sections.findIndex((item) => item.id === section.id);
      announce(
        `Bagian “${overviewLabelOf(section)}” dipindah ke urutan ${index + 1} dari ${sections.length}.`,
      );
      focusId(ceritaIds.overviewCardGrip(section.id));
    },
  ).then((ok) => done?.(ok));
}

async function duplicateOverviewSection(section: AdminSection): Promise<void> {
  if (structureBusy.value) return;
  duplicating.value = true;
  clearActionError();
  const outcome = await store.duplicateSection(section.id);
  duplicating.value = false;
  if (!outcome.ok) {
    actionError.value = outcome.message;
    actionErrorKind.value = outcome.kind;
    actionStale.value = outcome.stale;
    return;
  }
  // The copy is appended to this chapter; the overview stays open and the copy's title takes focus.
  announce(`Bagian “${overviewLabelOf(section)}” digandakan. Salinan ada di akhir bab ini.`);
  await nextTick();
  focusId(ceritaIds.overviewCardTitle(outcome.value.id));
}

function deleteOverviewSection(section: AdminSection): void {
  const chapter = overviewChapter.value;
  if (chapter) openDeleteSection(chapter, section);
}

function openRelocate(section: AdminSection): void {
  const chapter = overviewChapter.value;
  if (!chapter) return;
  relocateError.value = '';
  relocateErrorKind.value = null;
  relocateStale.value = false;
  relocate.value = {
    sectionId: section.id,
    chapterId: chapter.id,
    title: overviewLabelOf(section),
  };
}

function closeRelocate(): void {
  if (relocateBusy.value) return;
  const sectionId = relocate.value?.sectionId ?? null;
  relocate.value = null;
  relocateError.value = '';
  relocateErrorKind.value = null;
  relocateStale.value = false;
  if (sectionId) void nextTick(() => focusId(ceritaIds.overviewCardTitle(sectionId)));
}

/** Moves the section to the chosen chapter of the same page; the overview stays on its chapter. */
async function submitRelocate(targetChapterId: string): Promise<void> {
  const target = relocate.value;
  if (!target || relocateBusy.value) return;
  relocateBusy.value = true;
  relocateError.value = '';
  relocateStale.value = false;
  const outcome = await store.moveSectionToChapter(target.sectionId, targetChapterId);
  relocateBusy.value = false;
  if (!outcome.ok) {
    relocateError.value = outcome.message;
    relocateErrorKind.value = outcome.kind;
    relocateStale.value = outcome.stale;
    return;
  }
  const destIndex = page.value?.chapters.findIndex((item) => item.id === targetChapterId) ?? -1;
  const dest = store.findChapter(targetChapterId)?.chapter;
  const destLabel = dest
    ? `Bab ${chapterNumberLabel(dest.number, destIndex)} · ${dest.title}`
    : 'bab yang dipilih';
  relocate.value = null;
  announce(`Bagian “${target.title}” dipindah ke ${destLabel}.`);
  await nextTick();
  focusId(ceritaIds.overviewLabel);
}

async function reloadFromRelocate(): Promise<void> {
  const loaded = await store.load();
  if (!loaded) {
    relocateError.value = COULD_NOT_RELOAD;
    relocateErrorKind.value = null;
    return;
  }
  relocateStale.value = false;
  relocateError.value = '';
}

/**
 * "Tambah bagian baru": creates the section, hands the chosen figure kind to the figure editor
 * (`pendingFigureKind`, set just before the section opens) and opens it.
 */
async function addSectionFromOverview(
  title: string,
  kind: PendingFigureKind | null,
): Promise<void> {
  const chapter = overviewChapter.value;
  if (!chapter || addSectionBusy.value) return;
  addSectionBusy.value = true;
  addSectionError.value = '';
  addSectionErrorKind.value = null;
  const result = await store.addSection(chapter.id, title);
  addSectionBusy.value = false;
  if (!result.ok) {
    addSectionError.value = result.message;
    addSectionErrorKind.value = result.kind;
    return;
  }
  pendingFigureKind.value = kind;
  const opened = await openSectionById(result.value.id);
  if (!opened) {
    pendingFigureKind.value = null;
    announce(`Bagian “${title}” ditambahkan.`);
    return;
  }
  announce(`Bagian “${title}” ditambahkan dan dibuka untuk diisi.`);
  await nextTick();
  focusId(ceritaIds.sectionHeading);
}

// --- Section editor guard (the centre column keeps its own draft) ---

const SECTION_GONE_MESSAGE =
  'Bagian yang dibuka sudah tidak ada. Pilih bagian lain dari struktur cerita.';

// A section that disappears while open (deleted by someone else) is reported once.
watch(sectionMissing, (missing) => {
  if (missing) announce(SECTION_GONE_MESSAGE);
});

// A different section starts with no draft: the editor reports its own state again.
watch(selectedSection, (next, previous) => {
  if (next?.id === previous?.id) return;
  textDraft.value = null;
  figureDraft.value = null;
  editorBusy.value = false;
  editorDirty.value = false;
  discardPromptOpen.value = false;
});

let beforeUnloadAttached = false;
let pendingRouteLeave: ((allow: boolean) => void) | null = null;

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (selectedSection.value && editorDirty.value) {
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

watch(editorDirty, (dirty) => {
  if (dirty) addBeforeUnload();
  else removeBeforeUnload();
});

/** Holds a navigation until the editor's question is answered; the promise resolves that answer. */
function askBeforeLeaving(): Promise<boolean> {
  discardPromptOpen.value = true;
  void nextTick(() => (keepEditingButton.value?.$el as HTMLElement | undefined)?.focus());
  return new Promise<boolean>((resolve) => {
    pendingRouteLeave?.(false);
    pendingRouteLeave = resolve;
  });
}

/** "Buang perubahan": the draft is dropped and the held navigation goes ahead. */
function discardDraft(): void {
  discardPromptOpen.value = false;
  editorDirty.value = false;
  if (pendingRouteLeave) {
    pendingRouteLeave(true);
    pendingRouteLeave = null;
  }
}

/** "Tetap di sini" (or Escape / backdrop): the navigation is cancelled and the draft stays. */
function keepEditing(): void {
  discardPromptOpen.value = false;
  if (pendingRouteLeave) {
    pendingRouteLeave(false);
    pendingRouteLeave = null;
  }
}

onBeforeRouteLeave(() => {
  if (editorBusy.value) return false;
  if (!selectedSection.value || !editorDirty.value) return true;
  return askBeforeLeaving();
});

// Back and Forward, and a section change, only change the query, so the component stays mounted and
// the leave guard above does not run. The same question is asked here.
onBeforeRouteUpdate((to, from) => {
  if (
    to.query['halaman'] === from.query['halaman'] &&
    to.query['bagian'] === from.query['bagian']
  ) {
    return true;
  }
  if (editorBusy.value) return false;
  if (!editorDirty.value) return true;
  return askBeforeLeaving();
});

onUnmounted(() => {
  removeBeforeUnload();
  pendingRouteLeave?.(false);
  pendingRouteLeave = null;
  // Hands the shell header back to the route's own title (the editor's trail must not outlive it).
  // Only while the header is still the editor's: a next view may already have set its own.
  if (headerTrail.value) {
    const header = routeHeader();
    setAdminHeader(header.title, header.subtitle);
  }
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <p class="sr-only" role="status" aria-live="polite" data-test="status">{{ statusMessage }}</p>

    <div class="space-y-4 px-6 pt-4 md:px-10">
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
    </div>

    <p
      v-if="showInitialLoading"
      class="text-text-muted px-6 text-sm md:px-10"
      role="status"
      data-test="loading"
    >
      Memuat halaman Cerita…
    </p>

    <section
      v-else-if="store.hasLoaded && detailSlug === null"
      aria-labelledby="cerita-judul-daftar"
      class="rounded-card mx-6 mb-6 space-y-4 border border-slate-200 bg-white p-6 shadow-sm md:mx-10 md:mb-8 md:p-8"
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
        <CardListToolbar :hide-add="selectedSlugs.length > 0">
          <template #search>
            <CardSearchField
              v-model="query"
              :id="ceritaIds.search"
              label="Cari Cerita"
              placeholder="Cari Cerita"
            />
          </template>
          <template #sort>
            <SortToggleButton
              :id="ceritaIds.sortToggle"
              :pressed="sorting"
              label="Urutkan Cerita"
              :disabled="listBusy"
              @click="toggleSorting"
            />
          </template>
          <template #select-all>
            <SelectAllButton
              :id="ceritaIds.selectAll"
              :state="selectAllState"
              :filled="selectedSlugs.length > 0"
              :disabled="listBusy || filteredPages.length === 0"
              data-test="select-all"
              @click="toggleSelectAll"
            />
          </template>
          <template #add="{ hiddenClass }">
            <BaseButton
              :id="ceritaIds.addPage"
              type="button"
              size="md"
              class="min-h-11 w-full md:w-auto"
              :class="hiddenClass"
              :disabled="listBusy"
              data-test="add-page"
              @click="openName({ kind: 'page-add' })"
            >
              <template #leftIcon>
                <PlusIcon class="h-4 w-4" aria-hidden="true" />
              </template>
              Tambah Cerita
            </BaseButton>
          </template>
        </CardListToolbar>
      </div>

      <!--
        A fixed-height row: the search count and the bulk actions come and go here, so nothing
        above or below it moves. The bulk group exists only while at least one card is selected.
      -->
      <CardSelectionBar
        :selected-count="selectedSlugs.length"
        :search-count="
          query.trim() !== ''
            ? `Menampilkan ${filteredPages.length} dari ${pages.length} Cerita.`
            : null
        "
        :busy="listBusy"
        :bulk-id="ceritaIds.bulkDelete"
        @bulk-delete="openBulkDelete"
      />

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

    <div v-else-if="store.hasLoaded" class="flex min-h-0 flex-1 flex-col" data-test="detail-view">
      <!-- The page's actions sit in the shell header (AdminHeader), beside its title. -->
      <Teleport v-if="page" defer to="#admin-header-actions">
        <BaseButton
          variant="secondary"
          size="md"
          class="min-h-11"
          :href="`/cerita/${page.slug}`"
          target="_blank"
          rel="noopener noreferrer"
          data-test="page-public-link"
        >
          <template #leftIcon>
            <EyeIcon class="h-4 w-4" aria-hidden="true" />
          </template>
          Lihat di situs<span class="sr-only"> (dibuka di tab baru)</span>
        </BaseButton>
      </Teleport>
      <Teleport v-if="selectedSection && selectedMeta" defer to="#admin-header-actions">
        <BaseButton
          variant="primary"
          size="md"
          class="min-h-11"
          :disabled="!editorDirty || editorBusy"
          data-test="section-save"
          @click="saveSection"
        >
          {{ editorBusy ? 'Menyimpan…' : 'Simpan perubahan' }}
        </BaseButton>
      </Teleport>

      <div
        v-if="!page"
        class="rounded-card border-border-strong text-text-muted m-6 border border-dashed p-4 text-sm"
        role="status"
        data-test="page-missing"
      >
        <p>Halaman ini tidak ditemukan. Mungkin sudah dihapus.</p>
        <BaseButton
          :id="ceritaIds.backToList"
          type="button"
          variant="secondary"
          size="md"
          class="mt-3 min-h-11"
          data-test="back-to-list"
          @click="backToList"
        >
          Kembali ke daftar
        </BaseButton>
      </div>

      <div
        v-else
        class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_400px] md:grid-cols-[340px_minmax(0,1fr)]"
        data-test="editor-columns"
      >
        <aside
          aria-label="Struktur cerita"
          class="border-border self-start bg-white p-4 md:sticky md:top-0 md:max-h-dvh md:overflow-y-auto md:border-r"
          data-test="tree-column"
        >
          <CeritaStructureTree
            :page="page"
            :selected-chapter-id="selectedChapterId"
            :selected-section-id="selectedSection?.id ?? null"
            :overview-chapter-id="overviewChapter?.id ?? null"
            :busy="structureBusy"
            :figure-summary="figureSummary"
            @info="openDetails(page.slug, page.updatedAt)"
            @select-chapter="selectChapter"
            @select-section="(chapter, section) => selectSection(chapter, section)"
            @add-chapter="openName({ kind: 'chapter-add', pageSlug: page.slug })"
            @add-section="(chapter) => openName({ kind: 'section-add', chapterId: chapter.id })"
            @rename-chapter="
              (chapter) =>
                openName({
                  kind: 'chapter-rename',
                  id: chapter.id,
                  initial: chapter.title,
                  token: chapter.updatedAt,
                })
            "
            @delete-chapter="openDeleteChapter"
            @place-chapter="placeChapterDragged"
            @rename-section="
              (chapter, section) =>
                openName({
                  kind: 'section-rename',
                  id: section.id,
                  initial: section.title ?? '',
                  token: section.updatedAt,
                })
            "
            @delete-section="openDeleteSection"
            @place-section="placeSectionDragged"
          />
        </aside>

        <div
          class="min-w-0 space-y-6 p-4 2xl:p-8 md:col-start-2 md:row-start-1 md:p-6"
          data-test="section-column"
        >
          <CeritaSectionPane
            v-if="selectedSection && selectedMeta"
            :section-id="selectedSection.id"
            :chapter-label="selectedMeta.chapterLabel"
            :section-number="selectedMeta.sectionNumber"
            :dirty="editorDirty"
            ref="sectionPane"
            :busy="structureBusy"
            :duplicating="duplicating"
            :prev="prevSection ? { number: prevSection.number, title: prevSection.title } : null"
            :next="nextSection ? { number: nextSection.number, title: nextSection.title } : null"
            @duplicate="duplicateSelected"
            @delete="deleteSelected"
            @prev="goToSection(prevSection)"
            @next="goToSection(nextSection)"
            @busy="editorBusy = $event"
            @dirty-change="editorDirty = $event"
            @draft-change="textDraft = $event"
            @figure-draft-change="figureDraft = $event"
          />
          <CeritaChapterOverview
            v-else-if="overviewInfo"
            :chapter="overviewInfo.chapter"
            :position="overviewInfo.index + 1"
            :total="page.chapters.length"
            :cards="overviewCards"
            :other-chapters-count="page.chapters.length - 1"
            :busy="structureBusy || titleSaving || addSectionBusy || relocateBusy"
            :chapter-number="overviewChapterNumber"
            :title-error="overviewTitleError || undefined"
            :title-error-kind="overviewTitleErrorKind ?? undefined"
            :title-stale="overviewTitleStale"
            :add-error="addSectionError || undefined"
            :add-error-kind="addSectionErrorKind ?? undefined"
            :add-busy="addSectionBusy"
            @save-title="saveOverviewTitle"
            @reload="reloadFromOverview"
            @chapter-delete="openDeleteChapter(overviewInfo.chapter)"
            @edit-section="openOverviewSection"
            @relocate-section="openRelocate"
            @duplicate-section="duplicateOverviewSection"
            @delete-section="deleteOverviewSection"
            @place-section="placeOverviewSection"
            @add-section="addSectionFromOverview"
          />
          <p
            v-else-if="sectionMissing"
            class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
            role="status"
            data-test="section-missing"
          >
            {{ SECTION_GONE_MESSAGE }}
          </p>
          <div
            v-else
            class="rounded-card border-border-strong text-text-muted space-y-2 border border-dashed p-6 text-sm"
            data-test="section-prompt"
          >
            <p>Pilih bagian di struktur cerita untuk mengisi paragraf dan gambarnya.</p>
            <p v-if="flatSections.length === 0">
              Belum ada bagian. Pilih “Tambah bagian” pada sebuah bab.
            </p>
          </div>
        </div>

        <details
          class="rounded-card border-border m-4 border bg-white 2xl:sticky 2xl:top-0 2xl:col-start-3 2xl:row-start-1 2xl:m-0 2xl:max-h-dvh 2xl:self-start 2xl:overflow-y-auto 2xl:rounded-none 2xl:border-0 2xl:border-l md:col-start-2 md:row-start-2 md:mx-6 md:mb-6"
          :open="wideEditor"
          data-test="preview-panel"
          @toggle="onPreviewToggle"
        >
          <summary
            class="text-brand-navy focus-visible:outline-focus-ring flex min-h-11 cursor-pointer items-center px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 2xl:hidden"
          >
            Pratinjau langsung
          </summary>
          <div class="p-4 2xl:p-6 md:p-6">
            <CeritaLivePreview
              v-if="previewOpen && selectedSection && selectedMeta"
              :section-title="previewTitle"
              :body="previewBody"
              :chapter-label="selectedMeta.chapterLabel"
              :figure="previewFigure"
            />
            <p v-else-if="previewOpen" class="text-text-muted text-sm">
              Pratinjau muncul setelah sebuah bagian dipilih.
            </p>
          </div>
        </details>
      </div>
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
      :title="detailsPage?.title ?? ''"
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

    <BulkDeleteDialog
      :open="bulkTarget !== null"
      noun="halaman"
      :items="bulkTarget?.items ?? []"
      :busy="bulkRunning"
      :results="bulkResults"
      :stale="bulkStale"
      :error="bulkError"
      @confirm="confirmBulkDelete"
      @close="closeBulk"
      @reload="reloadBulk"
    >
      <template #intro>
        <p class="text-brand-navy text-sm">
          Halaman berikut akan dihapus satu per satu. Tindakan ini tidak bisa dibatalkan.
        </p>
        <p class="text-text-muted text-sm">
          Halaman yang masih berisi paragraf, gambar, angka, atau tabel akan dilewati. Setelah
          selesai, halaman itu ditampilkan sebagai “tidak dapat dihapus” dalam daftar hasil, beserta
          alasannya.
        </p>
      </template>
    </BulkDeleteDialog>

    <CeritaMoveSectionDialog
      :open="relocate !== null"
      :section-title="relocate?.title ?? ''"
      :targets="relocate ? chapterTargetsFor(relocate.chapterId) : []"
      :busy="relocateBusy"
      :error="relocateError"
      :error-kind="relocateErrorKind ?? undefined"
      :stale="relocateStale"
      @submit="submitRelocate"
      @close="closeRelocate"
      @reload="reloadFromRelocate"
    />

    <BaseModal
      :open="discardPromptOpen"
      title="Perubahan belum disimpan"
      description="Paragraf atau gambar di bagian ini belum disimpan. Buang perubahan tersebut?"
      size="md"
      @close="keepEditing"
    >
      <div
        class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
        data-test="discard-dialog"
      >
        <BaseButton
          variant="secondary"
          size="md"
          class="min-h-11"
          data-test="discard-confirm"
          @click="discardDraft"
        >
          Buang perubahan
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
    </BaseModal>
  </div>
</template>
