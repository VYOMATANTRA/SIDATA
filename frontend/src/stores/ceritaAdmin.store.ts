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
  { ok: true; value: T } | { ok: false; message: string; stale: boolean; blocked: boolean };

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

  /** Loads (or reloads) the tree and every paragraph and figure. */
  async function load(): Promise<void> {
    await Promise.all([pagesStore.fetchHierarchy(true), blocksStore.fetchBlocks(true)]);
    hasLoaded.value = true;
    // Pin the selection to a real page, so a later reorder cannot shift "the first page" under it.
    if (!tree.value.some((page) => page.slug === selectedSlug.value)) {
      selectedSlug.value = tree.value[0]?.slug ?? null;
    }
  }

  async function refresh(what: 'tree' | 'both'): Promise<void> {
    await Promise.all([
      pagesStore.fetchHierarchy(true),
      what === 'both' ? blocksStore.fetchBlocks(true) : Promise.resolve(),
    ]);
  }

  // --- Lookups ---

  /** Paragraphs plus the figure (if any) a section holds: what blocks deleting it. */
  function contentCountFor(sectionId: string): number {
    return paragraphsFor(sectionId).length + (figureFor(sectionId) ? 1 : 0);
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
  ): Promise<WriteOutcome<T>> {
    let value: T;
    try {
      value = await action();
    } catch (error) {
      return { ok: false, ...ceritaFailure(error, context, options) };
    }
    // The write is done; a failed refresh must not turn it into a failure. The load error
    // banner reports it and the next reload fixes the screen.
    await refresh(refreshWhat).catch(() => undefined);
    return { ok: true, value };
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

  async function renamePage(slug: string, title: string): Promise<WriteOutcome> {
    const page = findPage(slug);
    if (!page) return missing('mengubah judul halaman');
    return run('mengubah judul halaman', 'tree', async () => {
      await api.renamePage(slug, title, page.updatedAt);
      return undefined;
    });
  }

  async function removePage(slug: string): Promise<WriteOutcome> {
    const page = findPage(slug);
    if (!page) return missing('menghapus halaman');
    const index = tree.value.findIndex((item) => item.slug === slug);
    const neighbour = tree.value[index + 1] ?? tree.value[index - 1];
    const outcome = await run(
      'menghapus halaman',
      'tree',
      async () => {
        await api.deletePage(slug, page.updatedAt);
        return undefined;
      },
      { subject: 'Halaman' },
    );
    if (outcome.ok) {
      // A deleted page must not stay readable from the shared cache.
      const remaining = { ...pagesStore.pagesBySlug };
      delete remaining[slug];
      pagesStore.pagesBySlug = remaining;
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

  async function renameChapter(chapterId: string, title: string): Promise<WriteOutcome> {
    const found = findChapter(chapterId);
    if (!found) return missing('mengubah judul bab');
    return run('mengubah judul bab', 'tree', async () => {
      await api.renameChapter(chapterId, title, found.chapter.updatedAt);
      return undefined;
    });
  }

  async function removeChapter(chapterId: string): Promise<WriteOutcome> {
    const found = findChapter(chapterId);
    if (!found) return missing('menghapus bab');
    return run(
      'menghapus bab',
      'tree',
      async () => {
        await api.deleteChapter(chapterId, found.chapter.updatedAt);
        return undefined;
      },
      { subject: 'Bab' },
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

  async function renameSection(sectionId: string, title: string): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('mengubah judul bagian');
    return run('mengubah judul bagian', 'tree', async () => {
      await api.renameSection(sectionId, title, found.section.updatedAt);
      return undefined;
    });
  }

  async function removeSection(sectionId: string): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('menghapus bagian');
    return run(
      'menghapus bagian',
      'tree',
      async () => {
        await api.deleteSection(sectionId, found.section.updatedAt);
        return undefined;
      },
      { subject: 'Bagian' },
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
    return run('menambah paragraf', 'both', () => api.createParagraph(sectionId, input));
  }

  async function editParagraph(
    block: ContentBlock,
    input: { title: string | null; body: string },
  ): Promise<WriteOutcome> {
    const current = blocksStore.serverBlocks[block.slug] ?? block;
    return run('menyimpan paragraf', 'both', async () => {
      await api.updateParagraph(block.slug, input, current.updatedAt);
      return undefined;
    });
  }

  async function removeParagraph(block: ContentBlock): Promise<WriteOutcome> {
    const current = blocksStore.serverBlocks[block.slug] ?? block;
    return run('menghapus paragraf', 'both', async () => {
      await api.deleteParagraph(block.slug, current.updatedAt);
      return undefined;
    });
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
    return run('mengurutkan paragraf', 'both', async () => {
      await api.reorderParagraphs(sectionId, found.section.updatedAt, items);
      return undefined;
    });
  }

  async function saveFigure(sectionId: string, figure: SectionFigure): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('menyimpan gambar');
    return run('menyimpan gambar', 'both', async () => {
      await figureApi.saveSectionFigure(sectionId, found.section.updatedAt, figure);
      return undefined;
    });
  }

  async function removeFigure(sectionId: string): Promise<WriteOutcome> {
    const found = findSection(sectionId);
    if (!found) return missing('menghapus gambar');
    return run(
      'menghapus gambar',
      'both',
      async () => {
        await figureApi.deleteSectionFigure(sectionId, found.section.updatedAt);
        return undefined;
      },
      { subject: 'Gambar' },
    );
  }

  return {
    selectedSlug,
    hasLoaded,
    tree,
    isLoading,
    loadError,
    selectedPage,
    selectPage,
    load,
    findPage,
    findChapter,
    findSection,
    paragraphsFor,
    figureFor,
    contentCountFor,
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
