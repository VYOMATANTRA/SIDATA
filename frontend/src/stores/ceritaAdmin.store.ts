import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as api from '../services/ceritaAdmin.service';
import * as figureApi from '../services/ceritaFigure.service';
import { figureFromBlock, type SectionFigure } from '../services/ceritaFigure.service';
import { useContentBlocksStore, type ContentBlock } from './contentBlocks.store';
import { usePagesStore } from './pages.store';
import { ceritaFailure, type FailureOptions } from '../utils/ceritaAdminMessages';
import { swapReorderItems } from '../utils/ceritaOrder';

/**
 * State and writes behind `/admin/cerita` (SPEC §3, §8).
 *
 * It owns no copy of the data: the page → chapter → section tree is read from the shared pages
 * store and the paragraphs and figures from the shared content-block store, so a successful
 * write that refreshes them also refreshes what the public Cerita pages read next. Every write
 * resolves the `expectedUpdatedAt` token from that loaded data at call time, so a form left open
 * keeps its draft, and after a "stale" refusal the editor reloads and sends the same draft again
 * with the fresh token.
 */

export interface AdminSection {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface AdminChapter {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  updatedAt: string;
  sections: AdminSection[];
}

export interface AdminPage {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  updatedAt: string;
  chapters: AdminChapter[];
}

export type WriteOutcome<T = undefined> =
  | {
      ok: true;
      value: T;
      /** The change is saved, but the lists could not be reloaded afterwards. */
      refreshFailed?: boolean;
    }
  | { ok: false; message: string; stale: boolean; blocked: boolean };

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
   * that left the figure untouched (see `trackSectionWrite`).
   */
  const sectionTokens = ref<Record<string, string>>({});

  const tree = computed<AdminPage[]>(() => {
    const result: AdminPage[] = [];
    for (const summary of pagesStore.pages) {
      const detail = pagesStore.pagesBySlug[summary.slug];
      if (detail) result.push(detail as unknown as AdminPage);
    }
    return result;
  });

  const isLoading = computed(() => pagesStore.isHierarchyLoading || blocksStore.isLoading);
  const loadError = computed(() => pagesStore.hierarchyError ?? blocksStore.error);

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
    const succeeded = pagesStore.hierarchyError === null && blocksStore.error === null;
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
    return pagesStore.hierarchyError === null && (what === 'tree' || blocksStore.error === null);
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
    if (found)
      sectionTokens.value = { ...sectionTokens.value, [sectionId]: found.section.updatedAt };
  }

  function setSectionToken(sectionId: string, token: string | undefined): void {
    if (token) sectionTokens.value = { ...sectionTokens.value, [sectionId]: token };
  }

  function figureStamp(sectionId: string): string | null {
    return figureFor(sectionId)?.block.updatedAt ?? null;
  }

  /**
   * Runs one of the editor's own paragraph writes. Such a write bumps the section token, which would
   * make the editor's own next figure save look stale. If the figure itself did not change across the
   * write (and the reload worked), the figure draft's token moves to the current one; if it did, someone
   * else changed the figure and the draft keeps its old token so the next save is refused.
   */
  async function trackSectionWrite<T>(
    sectionId: string,
    write: () => Promise<WriteOutcome<T>>,
  ): Promise<WriteOutcome<T>> {
    const before = figureStamp(sectionId);
    const outcome = await write();
    if (
      outcome.ok &&
      !outcome.refreshFailed &&
      sectionId in sectionTokens.value &&
      figureStamp(sectionId) === before
    ) {
      captureSectionToken(sectionId);
    }
    return outcome;
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

  /** Drops deleted sections from the flat list the /data pickers read (labels, breadcrumbs). */
  function forgetSections(sectionIds: string[]): void {
    const gone = new Set(sectionIds);
    pagesStore.sections = pagesStore.sections.filter((item) => !gone.has(item.sectionId));
  }

  /** Drops a deleted chapter or section from the shared page cache without a reload. */
  function pruneCachedPage(slug: string, edit: (page: AdminPage) => AdminPage): void {
    const cached = pagesStore.pagesBySlug[slug] as unknown as AdminPage | undefined;
    if (!cached) return;
    pagesStore.pagesBySlug = {
      ...pagesStore.pagesBySlug,
      [slug]: edit(cached) as unknown as (typeof pagesStore.pagesBySlug)[string],
    };
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
      // after the delete worked: the page itself, its summary row and its flattened sections.
      const remaining = { ...pagesStore.pagesBySlug };
      delete remaining[slug];
      pagesStore.pagesBySlug = remaining;
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

  // Paragraphs and the figure bump the section's token, so both caches are refreshed.

  async function addParagraph(
    sectionId: string,
    input: api.ParagraphInput,
  ): Promise<WriteOutcome<ContentBlock>> {
    return trackSectionWrite(sectionId, () =>
      run('menambah paragraf', 'both', () => api.createParagraph(sectionId, input)),
    );
  }

  /**
   * `expectedUpdatedAt` is the paragraph's token as it was when the form was opened. Without it the
   * token currently in the shared data is used, which is only right for a caller that has just
   * loaded it.
   */
  async function editParagraph(
    block: ContentBlock,
    input: { title: string | null; body: string },
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const token =
      expectedUpdatedAt ?? blocksStore.serverBlocks[block.slug]?.updatedAt ?? block.updatedAt;
    const write = (): Promise<WriteOutcome> =>
      run('menyimpan paragraf', 'both', async () => {
        await api.updateParagraph(block.slug, input, token);
        return undefined;
      });
    return block.sectionId ? trackSectionWrite(block.sectionId, write) : write();
  }

  async function removeParagraph(
    block: ContentBlock,
    expectedUpdatedAt?: string,
  ): Promise<WriteOutcome> {
    const token =
      expectedUpdatedAt ?? blocksStore.serverBlocks[block.slug]?.updatedAt ?? block.updatedAt;
    const write = (): Promise<WriteOutcome> =>
      run('menghapus paragraf', 'both', async () => {
        await api.deleteParagraph(block.slug, token);
        return undefined;
      });
    return block.sectionId ? trackSectionWrite(block.sectionId, write) : write();
  }

  async function moveParagraph(
    sectionId: string,
    blockId: string,
    direction: Direction,
  ): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('mengurutkan paragraf');
    const items = swapReorderItems(paragraphsFor(sectionId), blockId, direction);
    if (!items) return { ok: true, value: undefined };
    return trackSectionWrite(sectionId, () =>
      run('mengurutkan paragraf', 'both', async () => {
        await api.reorderParagraphs(sectionId, found.section.updatedAt, items);
        return undefined;
      }),
    );
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
    );
    if (outcome.ok) {
      if (outcome.value) setSectionToken(sectionId, outcome.value);
      else if (!outcome.refreshFailed) captureSectionToken(sectionId);
    }
    return outcome.ok ? { ...outcome, value: undefined } : outcome;
  }

  return {
    selectedSlug,
    hasLoaded,
    reloadNeeded,
    tree,
    isLoading,
    loadError,
    selectedPage,
    selectPage,
    load,
    findPage,
    findChapter,
    findSection,
    captureSectionToken,
    paragraphsFor,
    figureFor,
    contentCountsFor,
    addPage,
    renamePage,
    removePage,
    movePage,
    addChapter,
    renameChapter,
    removeChapter,
    moveChapter,
    addSection,
    renameSection,
    removeSection,
    moveSection,
    addParagraph,
    editParagraph,
    removeParagraph,
    moveParagraph,
    saveFigure,
    removeFigure,
  };
});
