import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as api from '../services/ceritaAdmin.service';
import * as figureApi from '../services/ceritaFigure.service';
import { figureFromBlock, type SectionFigure } from '../services/ceritaFigure.service';
import { useContentBlocksStore, type ContentBlock } from './contentBlocks.store';
import {
  usePagesStore,
  type HierarchyChapter,
  type HierarchyPage,
  type HierarchySection,
} from './pages.store';
import { ceritaFailure, type FailureOptions } from '../utils/ceritaAdminMessages';
import type { FailureKind } from '../utils/userMessages';
import { moveReorderItems, swapReorderItems } from '../utils/ceritaOrder';

/**
 * State and writes behind `/admin/cerita` (SPEC §3, §8).
 *
 * It owns no copy of the data: the page → chapter → section tree is read from the shared pages
 * store's hierarchy list (filled only by the `?include=sections` fetch, so every level carries
 * its token; never from the public per-slug cache) and the paragraphs and figures from the
 * shared content-block store, so a successful write that refreshes them also refreshes what the
 * public Cerita pages read next. Every write resolves the `expectedUpdatedAt` token from that
 * loaded data at call time, so a form left open keeps its draft, and after a "stale" refusal the
 * editor reloads and sends the same draft again with the fresh token.
 */

export type AdminSection = HierarchySection;
export type AdminChapter = HierarchyChapter;
export type AdminPage = HierarchyPage;

/** Shown instead of a partial tree: a reorder must name every sibling, so a gap cannot be edited. */
const INCOMPLETE_TREE_MESSAGE =
  'Data struktur halaman dari server belum lengkap, sehingga halaman ini belum bisa dipakai untuk mengubah atau mengurutkan. Muat ulang, dan hubungi pengelola teknis bila masih terjadi.';

export type WriteOutcome<T = undefined> =
  | {
      ok: true;
      value: T;
      /** The change is saved, but the lists could not be reloaded afterwards. */
      refreshFailed?: boolean;
    }
  | { ok: false; message: string; kind: FailureKind; stale: boolean; blocked: boolean };

export interface SectionFigureEntry {
  block: ContentBlock;
  /** Null when the stored figure cannot be read; the editor then treats it as replaceable. */
  figure: SectionFigure | null;
}

type Direction = -1 | 1;

function byOrder(a: ContentBlock, b: ContentBlock): number {
  return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
}

export const useCeritaAdminStore = defineStore('ceritaAdmin', () => {
  const pagesStore = usePagesStore();
  const blocksStore = useContentBlocksStore();

  const selectedSlug = ref<string | null>(null);
  const hasLoaded = ref(false);
  /** A write was saved but the reload after it failed: what is shown may be out of date. */
  const reloadNeeded = ref(false);
  /**
   * The section token each open figure draft was loaded with. A first save carries this token, not
   * whatever the shared data holds now, so another editor's save in between is still refused. It
   * moves forward only when the editor reloads, or after the editor's own write in the section
   * that left the figure untouched (see `saveSectionText`).
   */
  const sectionTokens = ref<Record<string, string>>({});
  /** The figure's stamp (its block's updatedAt) when each section token was taken. */
  const sectionFigureStamps = ref<Record<string, string | null>>({});

  const tree = computed<AdminPage[]>(() =>
    pagesStore.hierarchyIncomplete ? [] : pagesStore.hierarchyPages,
  );

  const isLoading = computed(() => pagesStore.isHierarchyLoading || blocksStore.isLoading);
  const loadError = computed(
    () =>
      pagesStore.hierarchyError ??
      (pagesStore.hierarchyIncomplete ? INCOMPLETE_TREE_MESSAGE : null) ??
      blocksStore.error,
  );

  /** Failure class matching `loadError`, for AlertBanner; null while `loadError` is null. */
  const loadErrorKind = computed<FailureKind | null>(() => {
    if (pagesStore.hierarchyError !== null) return pagesStore.hierarchyErrorKind ?? 'unknown';
    if (pagesStore.hierarchyIncomplete) return 'unknown';
    return blocksStore.error !== null ? (blocksStore.errorKind ?? 'unknown') : null;
  });

  const selectedPage = computed<AdminPage | null>(
    () => tree.value.find((page) => page.slug === selectedSlug.value) ?? tree.value[0] ?? null,
  );

  function selectPage(slug: string | null): void {
    selectedSlug.value = slug;
  }

  /** Loads (or reloads) the tree and every paragraph and figure. True when both loads worked. */
  async function load(): Promise<boolean> {
    await Promise.all([pagesStore.fetchHierarchy(true), blocksStore.fetchBlocks(true)]);
    hasLoaded.value = true;
    // A successful reload clears the notice; a failed one leaves it as it was.
    const succeeded =
      pagesStore.hierarchyError === null &&
      !pagesStore.hierarchyIncomplete &&
      blocksStore.error === null;
    if (succeeded) {
      reloadNeeded.value = false;
    }
    // Pin the selection to a real page, so a later reorder cannot shift "the first page" under it.
    if (!tree.value.some((page) => page.slug === selectedSlug.value)) {
      selectedSlug.value = tree.value[0]?.slug ?? null;
    }
    return succeeded;
  }

  /** Reloads the shared caches. Returns false when a reload failed (the stores swallow errors). */
  async function refresh(what: 'tree' | 'both'): Promise<boolean> {
    await Promise.all([
      pagesStore.fetchHierarchy(true),
      what === 'both' ? blocksStore.fetchBlocks(true) : Promise.resolve(),
    ]);
    return (
      pagesStore.hierarchyError === null &&
      !pagesStore.hierarchyIncomplete &&
      (what === 'tree' || blocksStore.error === null)
    );
  }

  // --- Lookups ---

  /** Paragraphs and figure (0 or 1) a section holds: what blocks deleting it. */
  function contentCountsFor(sectionId: string): { paragraphs: number; figures: number } {
    return { paragraphs: paragraphsFor(sectionId).length, figures: figureFor(sectionId) ? 1 : 0 };
  }

  function findPage(slug: string): AdminPage | undefined {
    return tree.value.find((page) => page.slug === slug);
  }

  function findChapter(chapterId: string): { page: AdminPage; chapter: AdminChapter } | undefined {
    for (const page of tree.value) {
      const chapter = page.chapters.find((item) => item.id === chapterId);
      if (chapter) return { page, chapter };
    }
    return undefined;
  }

  function findSection(
    sectionId: string,
  ): { page: AdminPage; chapter: AdminChapter; section: AdminSection } | undefined {
    for (const page of tree.value) {
      for (const chapter of page.chapters) {
        const section = chapter.sections.find((item) => item.id === sectionId);
        if (section) return { page, chapter, section };
      }
    }
    return undefined;
  }

  /** Records the section token the figure draft is being loaded with (editor open or reload). */
  function captureSectionToken(sectionId: string): void {
    const found = findSection(sectionId);
    if (found) setSectionToken(sectionId, found.section.updatedAt);
  }

  /**
   * Sets the token a section's drafts save with, and remembers which figure version it was taken
   * against. A token moved while the figure changed under it would let a save overwrite that change.
   */
  function setSectionToken(sectionId: string, token: string | undefined): void {
    if (!token) return;
    sectionTokens.value = { ...sectionTokens.value, [sectionId]: token };
    sectionFigureStamps.value = {
      ...sectionFigureStamps.value,
      [sectionId]: figureStamp(sectionId),
    };
  }

  function figureStamp(sectionId: string): string | null {
    return figureFor(sectionId)?.block.updatedAt ?? null;
  }

  /**
   * True when the figure of this section changed since the drafts' token was taken. A save with that
   * token would then overwrite someone else's figure, so the editor must reload the figure first.
   */
  function figureChangedSinceToken(sectionId: string): boolean {
    return (
      sectionId in sectionFigureStamps.value &&
      sectionFigureStamps.value[sectionId] !== figureStamp(sectionId)
    );
  }

  function paragraphsFor(sectionId: string): ContentBlock[] {
    return Object.values(blocksStore.serverBlocks)
      .filter((block) => block.sectionId === sectionId && block.type === 'prose')
      .sort(byOrder);
  }

  function figureFor(sectionId: string): SectionFigureEntry | null {
    const block = Object.values(blocksStore.serverBlocks).find(
      (item) => item.sectionId === sectionId && item.type === figureApi.FIGURE_BLOCK_TYPE,
    );
    return block ? { block, figure: figureFromBlock(block) } : null;
  }

  // --- Writes ---

  async function run<T>(
    context: string,
    refreshWhat: 'tree' | 'both',
    action: () => Promise<T>,
    options: FailureOptions = {},
    onSaved?: () => void,
  ): Promise<WriteOutcome<T>> {
    let value: T;
    try {
      value = await action();
    } catch (error) {
      return { ok: false, ...ceritaFailure(error, context, options) };
    }
    // The write is saved. If the reload that follows fails, it is still not a failed write: the
    // screen says so plainly and offers a reload (`reloadNeeded`), and `onSaved` removes what the
    // write deleted from the shared data so nothing deleted stays on screen or selected.
    const refreshed = await refresh(refreshWhat).catch(() => false);
    if (!refreshed) {
      onSaved?.();
      reloadNeeded.value = true;
      return { ok: true, value, refreshFailed: true };
    }
    reloadNeeded.value = false;
    return { ok: true, value };
  }

  /** Drops a deleted figure from the shared block data without a reload. */
  function forgetFigure(sectionId: string): void {
    const keep = (map: Record<string, ContentBlock>): Record<string, ContentBlock> =>
      Object.fromEntries(
        Object.entries(map).filter(
          ([, block]) =>
            !(block.sectionId === sectionId && block.type === figureApi.FIGURE_BLOCK_TYPE),
        ),
      );
    blocksStore.serverBlocks = keep(blocksStore.serverBlocks);
    blocksStore.blocks = keep(blocksStore.blocks);
  }

  /** Drops deleted sections from the flat list the /data pickers read (labels, breadcrumbs). */
  function forgetSections(sectionIds: string[]): void {
    const gone = new Set(sectionIds);
    pagesStore.sections = pagesStore.sections.filter((item) => !gone.has(item.sectionId));
  }

  /** Drops a deleted chapter or section from the shared page cache without a reload. */
  function pruneCachedPage(slug: string, edit: (page: AdminPage) => AdminPage): void {
    pagesStore.hierarchyPages = pagesStore.hierarchyPages.map((page) =>
      page.slug === slug ? edit(page) : page,
    );
    // The public reader keeps its own per-slug copy in another shape. Rather than edit it in place,
    // forget it: the next visit to that Cerita page fetches the current page.
    forgetPublicPage(slug);
  }

  function forgetPublicPage(slug: string): void {
    if (!(slug in pagesStore.pagesBySlug)) return;
    const remaining = { ...pagesStore.pagesBySlug };
    delete remaining[slug];
    pagesStore.pagesBySlug = remaining;
  }

  function missing(context: string): WriteOutcome<never> {
    return {
      ok: false,
      ...ceritaFailure({ status: 404 }, context),
    };
  }

  const DUPLICATE_PAGE =
    'Sudah ada halaman dengan judul yang sama atau sangat mirip. Gunakan judul yang berbeda.';

  async function addPage(title: string): Promise<WriteOutcome<{ slug: string }>> {
    const outcome = await run('menambah halaman', 'tree', () => api.createPage(title), {
      conflictMessage: DUPLICATE_PAGE,
    });
    if (outcome.ok) selectedSlug.value = outcome.value.slug;
    return outcome;
  }

  async function renamePage(
    slug: string,
    title: string,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const page = findPage(slug);
    if (!page) return missing('mengubah judul halaman');
    return run('mengubah judul halaman', 'tree', async () => {
      await api.renamePage(slug, title, expectedUpdatedAt ?? page.updatedAt);
      return undefined;
    });
  }

  async function updatePageDetails(
    slug: string,
    details: api.PageDetailsInput,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const page = findPage(slug);
    if (!page) return missing('menyimpan judul utama dan penulis');
    return run('menyimpan judul utama dan penulis', 'tree', async () => {
      await api.updatePageDetails(slug, details, expectedUpdatedAt ?? page.updatedAt);
      return undefined;
    });
  }

  async function removePage(slug: string, expectedUpdatedAt?: string): Promise<WriteOutcome> {
    const page = findPage(slug);
    if (!page) return missing('menghapus halaman');
    const index = tree.value.findIndex((item) => item.slug === slug);
    const neighbour = tree.value[index + 1] ?? tree.value[index - 1];
    const outcome = await run(
      'menghapus halaman',
      'tree',
      async () => {
        await api.deletePage(slug, expectedUpdatedAt ?? page.updatedAt);
        return undefined;
      },
      { subject: 'Halaman' },
    );
    if (outcome.ok) {
      // A deleted page must not stay readable from the shared caches, whether or not the reload
      // after the delete worked: the page itself, its summary row, its authoring copy and its
      // flattened sections.
      forgetPublicPage(slug);
      pagesStore.hierarchyPages = pagesStore.hierarchyPages.filter((item) => item.slug !== slug);
      pagesStore.pages = pagesStore.pages.filter((item) => item.slug !== slug);
      pagesStore.sections = pagesStore.sections.filter((item) => item.pageSlug !== slug);
      if (selectedSlug.value === slug) selectedSlug.value = neighbour?.slug ?? null;
    }
    return outcome;
  }

  async function movePage(slug: string, direction: Direction): Promise<WriteOutcome> {
    const page = findPage(slug);
    if (!page) return missing('mengurutkan halaman');
    const items = swapReorderItems(tree.value, page.id, direction);
    if (!items) return { ok: true, value: undefined };
    return run('mengurutkan halaman', 'tree', async () => {
      await api.reorderPages(items);
      return undefined;
    });
  }

  /** Drag and drop: puts one page at `toIndex` (0-based) of the full order. Same save as `movePage`. */
  async function placePage(slug: string, toIndex: number): Promise<WriteOutcome> {
    const page = findPage(slug);
    if (!page) return missing('mengurutkan halaman');
    const items = moveReorderItems(tree.value, page.id, toIndex);
    if (!items) return { ok: true, value: undefined };
    return run('mengurutkan halaman', 'tree', async () => {
      await api.reorderPages(items);
      return undefined;
    });
  }

  async function addChapter(
    pageSlug: string,
    title: string,
  ): Promise<WriteOutcome<{ id: string }>> {
    return run('menambah bab', 'tree', () => api.createChapter(pageSlug, title));
  }

  async function renameChapter(
    chapterId: string,
    title: string,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const found = findChapter(chapterId);
    if (!found) return missing('mengubah judul bab');
    return run('mengubah judul bab', 'tree', async () => {
      await api.renameChapter(chapterId, title, expectedUpdatedAt ?? found.chapter.updatedAt);
      return undefined;
    });
  }

  async function removeChapter(
    chapterId: string,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const found = findChapter(chapterId);
    if (!found) return missing('menghapus bab');
    return run(
      'menghapus bab',
      'tree',
      async () => {
        await api.deleteChapter(chapterId, expectedUpdatedAt ?? found.chapter.updatedAt);
        return undefined;
      },
      { subject: 'Bab' },
      () => {
        pruneCachedPage(found.page.slug, (page) => ({
          ...page,
          chapters: page.chapters.filter((item) => item.id !== chapterId),
        }));
        forgetSections(found.chapter.sections.map((item) => item.id));
      },
    );
  }

  async function moveChapter(
    pageSlug: string,
    chapterId: string,
    direction: Direction,
  ): Promise<WriteOutcome> {
    const page = findPage(pageSlug);
    if (!page) return missing('mengurutkan bab');
    const items = swapReorderItems(page.chapters, chapterId, direction);
    if (!items) return { ok: true, value: undefined };
    return run('mengurutkan bab', 'tree', async () => {
      await api.reorderChapters(pageSlug, page.updatedAt, items);
      return undefined;
    });
  }

  async function addSection(
    chapterId: string,
    title: string,
  ): Promise<WriteOutcome<{ id: string }>> {
    return run('menambah bagian', 'tree', () => api.createSection(chapterId, title));
  }

  async function renameSection(
    sectionId: string,
    title: string,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('mengubah judul bagian');
    return run('mengubah judul bagian', 'tree', async () => {
      await api.renameSection(sectionId, title, expectedUpdatedAt ?? found.section.updatedAt);
      return undefined;
    });
  }

  async function removeSection(
    sectionId: string,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('menghapus bagian');
    return run(
      'menghapus bagian',
      'tree',
      async () => {
        await api.deleteSection(sectionId, expectedUpdatedAt ?? found.section.updatedAt);
        return undefined;
      },
      { subject: 'Bagian' },
      () => {
        pruneCachedPage(found.page.slug, (page) => ({
          ...page,
          chapters: page.chapters.map((chapter) => ({
            ...chapter,
            sections: chapter.sections.filter((item) => item.id !== sectionId),
          })),
        }));
        forgetSections([sectionId]);
      },
    );
  }

  async function moveSection(
    chapterId: string,
    sectionId: string,
    direction: Direction,
  ): Promise<WriteOutcome> {
    const found = findChapter(chapterId);
    if (!found) return missing('mengurutkan bagian');
    const items = swapReorderItems(found.chapter.sections, sectionId, direction);
    if (!items) return { ok: true, value: undefined };
    return run('mengurutkan bagian', 'tree', async () => {
      await api.reorderSections(chapterId, found.chapter.updatedAt, items);
      return undefined;
    });
  }

  /**
   * Copies a section with its paragraphs and figure, as the last section of its chapter (SPEC §3).
   * The copy has content of its own, so both caches are reloaded. Resolves to the copy's id.
   */
  async function duplicateSection(
    sectionId: string,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome<{ id: string }>> {
    const found = findSection(sectionId);
    if (!found) return missing('menggandakan bagian');
    return run('menggandakan bagian', 'both', async () => {
      const result = await api.duplicateSection(
        sectionId,
        expectedUpdatedAt ?? found.section.updatedAt,
      );
      return { id: result.section.id };
    });
  }

  /**
   * Moves a section to another chapter of the same page. A chapter on another page is refused here
   * without a request, as the server would (422). Moving into the chapter it is already in does nothing.
   */
  async function moveSectionToChapter(
    sectionId: string,
    targetChapterId: string,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome<{ id: string; chapterId: string }>> {
    const found = findSection(sectionId);
    if (!found) return missing('memindahkan bagian');
    const target = findChapter(targetChapterId);
    if (!target || target.page.slug !== found.page.slug) {
      return { ok: false, ...ceritaFailure({ status: 422 }, 'memindahkan bagian') };
    }
    if (target.chapter.id === found.chapter.id) {
      return { ok: true, value: { id: sectionId, chapterId: targetChapterId } };
    }
    return run('memindahkan bagian', 'tree', async () => {
      await api.moveSectionToChapter(
        sectionId,
        targetChapterId,
        expectedUpdatedAt ?? found.section.updatedAt,
      );
      return { id: sectionId, chapterId: targetChapterId };
    });
  }

  /** Drag and drop: puts a chapter at `toIndex` (0-based) of its page. Same save as `moveChapter`. */
  async function placeChapter(
    pageSlug: string,
    chapterId: string,
    toIndex: number,
  ): Promise<WriteOutcome> {
    const page = findPage(pageSlug);
    if (!page) return missing('mengurutkan bab');
    const items = moveReorderItems(page.chapters, chapterId, toIndex);
    if (!items) return { ok: true, value: undefined };
    return run('mengurutkan bab', 'tree', async () => {
      await api.reorderChapters(pageSlug, page.updatedAt, items);
      return undefined;
    });
  }

  /** Drag and drop: puts a section at `toIndex` (0-based) of its chapter. Same save as `moveSection`. */
  async function placeSection(
    chapterId: string,
    sectionId: string,
    toIndex: number,
  ): Promise<WriteOutcome> {
    const found = findChapter(chapterId);
    if (!found) return missing('mengurutkan bagian');
    const items = moveReorderItems(found.chapter.sections, sectionId, toIndex);
    if (!items) return { ok: true, value: undefined };
    return run('mengurutkan bagian', 'tree', async () => {
      await api.reorderSections(chapterId, found.chapter.updatedAt, items);
      return undefined;
    });
  }

  /**
   * Saves the figure with the section token the draft was loaded with (`captureSectionToken`), so a
   * change another editor made since is refused with a stale-write answer instead of overwritten.
   */
  async function saveFigure(sectionId: string, figure: SectionFigure): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('menyimpan gambar');
    const token = sectionTokens.value[sectionId] ?? found.section.updatedAt;
    const outcome = await run('menyimpan gambar', 'both', () =>
      figureApi.saveSectionFigure(sectionId, token, figure),
    );
    if (outcome.ok) {
      // Chain the next figure save from this write's own token; fall back to the reloaded one.
      if (outcome.value) setSectionToken(sectionId, outcome.value);
      else if (!outcome.refreshFailed) captureSectionToken(sectionId);
    }
    return outcome.ok ? { ...outcome, value: undefined } : outcome;
  }

  async function removeFigure(sectionId: string): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('menghapus gambar');
    const token = sectionTokens.value[sectionId] ?? found.section.updatedAt;
    const outcome = await run(
      'menghapus gambar',
      'both',
      () => figureApi.deleteSectionFigure(sectionId, token),
      { subject: 'Gambar' },
      () => forgetFigure(sectionId),
    );
    if (outcome.ok) {
      if (outcome.value) setSectionToken(sectionId, outcome.value);
      else if (!outcome.refreshFailed) captureSectionToken(sectionId);
    }
    return outcome.ok ? { ...outcome, value: undefined } : outcome;
  }

  /**
   * Puts a saved section text into the shared data at once: the section's title in the tree and the
   * flat list, and its prose blocks (every other prose block of the section is dropped, the saved one
   * is set). The public reader's cached copy of the page is forgotten, as a delete does.
   */
  function applySectionText(sectionId: string, saved: api.SectionTextResponse): void {
    const found = findSection(sectionId);
    if (found) {
      const title = saved.section.title;
      pruneCachedPage(found.page.slug, (page) => ({
        ...page,
        chapters: page.chapters.map((chapter) =>
          chapter.id !== found.chapter.id
            ? chapter
            : {
                ...chapter,
                sections: chapter.sections.map((item) =>
                  item.id === sectionId
                    ? { ...item, title, updatedAt: saved.section.updatedAt }
                    : item,
                ),
              },
        ),
      }));
    }
    pagesStore.sections = pagesStore.sections.map((item) =>
      item.sectionId === sectionId ? { ...item, sectionTitle: saved.section.title } : item,
    );
    const keepSlug = saved.block?.slug ?? null;
    const dropOthers = (map: Record<string, ContentBlock>): Record<string, ContentBlock> =>
      Object.fromEntries(
        Object.entries(map).filter(
          ([slug, block]) =>
            !(
              block.sectionId === sectionId &&
              block.type === 'prose' &&
              slug !== keepSlug
            ),
        ),
      );
    const serverBlocks = dropOthers(blocksStore.serverBlocks);
    const blocks = dropOthers(blocksStore.blocks);
    if (saved.block) {
      serverBlocks[saved.block.slug] = saved.block;
      blocks[saved.block.slug] = saved.block;
    }
    blocksStore.serverBlocks = serverBlocks;
    blocksStore.blocks = blocks;
  }

  /**
   * Saves a section's title and body together (`PUT /api/sections/:id/text`, SPEC §8). The write uses
   * the section token the editor's drafts chain from, so another editor's change is refused as stale.
   * Resolves to the saved title and body, which the editor takes as its new baseline.
   */
  async function saveSectionText(
    sectionId: string,
    input: { title: string; body: string },
  ): Promise<WriteOutcome<{ title: string; body: string }>> {
    const found = findSection(sectionId);
    if (!found) return missing('menyimpan teks bagian');
    const token = sectionTokens.value[sectionId] ?? found.section.updatedAt;
    const figureBefore = figureStamp(sectionId);
    let savedToken: string | undefined;
    const outcome = await run('menyimpan teks bagian', 'both', async () => {
      const saved = await api.saveSectionText(sectionId, { ...input, expectedUpdatedAt: token });
      applySectionText(sectionId, saved);
      savedToken = saved.section.updatedAt;
      return { title: saved.section.title ?? '', body: saved.block?.body ?? '' };
    });
    // The answer's token is chained even when the follow-up reload failed, so the figure save that
    // follows does not depend on that reload. A figure another editor changed keeps the old token.
    if (
      outcome.ok &&
      savedToken &&
      figureStamp(sectionId) === figureBefore &&
      sectionId in sectionTokens.value
    ) {
      setSectionToken(sectionId, savedToken);
    }
    return outcome;
  }

  /**
   * Reads a topic's chosen highlights for the editor. A failure is reported like a write's, so the
   * panel can show it with the same banner.
   */
  async function loadHighlights(
    pageSlug: string,
  ): Promise<WriteOutcome<api.PageHighlightsState>> {
    try {
      return { ok: true, value: await api.getPageHighlights(pageSlug) };
    } catch (error) {
      return { ok: false, ...ceritaFailure(error, 'memuat statistik unggulan') };
    }
  }

  /**
   * Saves a topic's highlights. The page's token moves with the save, so the hierarchy is reloaded
   * too: the chapter and section writes that send the page token then do not hit a stale refusal.
   */
  function saveHighlights(
    pageSlug: string,
    indicatorIds: string[],
    expectedUpdatedAt: string,
  ): Promise<WriteOutcome<api.PageHighlightsState>> {
    return run('menyimpan statistik unggulan', 'tree', () =>
      api.putPageHighlights(pageSlug, indicatorIds, expectedUpdatedAt),
    );
  }

  return {
    selectedSlug,
    hasLoaded,
    reloadNeeded,
    tree,
    isLoading,
    loadError,
    loadErrorKind,
    selectedPage,
    selectPage,
    load,
    findPage,
    findChapter,
    findSection,
    captureSectionToken,
    figureChangedSinceToken,
    paragraphsFor,
    figureFor,
    contentCountsFor,
    addPage,
    renamePage,
    updatePageDetails,
    removePage,
    movePage,
    placePage,
    addChapter,
    renameChapter,
    removeChapter,
    moveChapter,
    addSection,
    renameSection,
    removeSection,
    moveSection,
    duplicateSection,
    moveSectionToChapter,
    placeChapter,
    placeSection,
    saveFigure,
    removeFigure,
    saveSectionText,
    loadHighlights,
    saveHighlights,
  };
});
