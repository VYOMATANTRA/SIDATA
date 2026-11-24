import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCeritaAdminStore } from '../stores/ceritaAdmin.store';
import { usePagesStore, type PageDetail } from '../stores/pages.store';
import { useAuthStore } from '../stores/auth';
import type { SectionFigure } from '../services/ceritaFigure.service';
import { createFakeCerita, type FakeCerita } from './ceritaFakeApi';

let fake: FakeCerita;

function setup(): ReturnType<typeof useCeritaAdminStore> {
  setActivePinia(createPinia());
  useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
  fake = createFakeCerita();
  fake.addPage('Kependudukan', [
    { title: 'Jumlah Penduduk', sections: ['Ringkasan', 'Rincian'] },
    { title: 'Jumlah Keluarga', sections: ['Ringkasan keluarga'] },
  ]);
  fake.addPage('Pendidikan', [{ title: 'Tingkat Pendidikan', sections: [] }]);
  fake.install();
  return useCeritaAdminStore();
}

describe('ceritaAdmin store', () => {
  let store: ReturnType<typeof useCeritaAdminStore>;

  beforeEach(async () => {
    store = setup();
    await store.load();
  });

  it('exposes the tree in order and selects the first page by default', () => {
    expect(store.tree.map((p) => p.title)).toEqual(['Kependudukan', 'Pendidikan']);
    expect(store.selectedPage?.slug).toBe('kependudukan');
    expect(store.tree[0]!.chapters[0]!.sections.map((s) => s.title)).toEqual([
      'Ringkasan',
      'Rincian',
    ]);
  });

  it('adds a page, selects it and refreshes the tree', async () => {
    const outcome = await store.addPage('Kesehatan');

    expect(outcome.ok).toBe(true);
    expect(store.selectedPage?.title).toBe('Kesehatan');
    expect(store.tree).toHaveLength(3);
  });

  it('words a duplicate page title in plain Indonesian', async () => {
    const outcome = await store.addPage('Kependudukan');

    expect(outcome).toMatchObject({ ok: false });
    const text = JSON.stringify(outcome);
    expect(text).toContain('judul yang sama');
    expect(text).not.toMatch(/Slug|409/);
  });

  it('renames a chapter with the chapter token it loaded', async () => {
    const chapter = store.tree[0]!.chapters[0]!;
    const outcome = await store.renameChapter(chapter.id, 'Penduduk Total');

    expect(outcome.ok).toBe(true);
    expect(fake.lastWrite()).toMatchObject({
      method: 'PATCH',
      body: { title: 'Penduduk Total', expectedUpdatedAt: chapter.updatedAt },
    });
    expect(store.tree[0]!.chapters[0]!.title).toBe('Penduduk Total');
  });

  it('reports a stale write without changing anything, then succeeds after a reload', async () => {
    const chapter = store.tree[0]!.chapters[0]!;
    fake.touchPage('kependudukan');
    fake.pages[0]!.chapters[0]!.updatedAt = '2030-01-01T00:00:00.000Z';

    const refused = await store.renameChapter(chapter.id, 'Judul saya');
    expect(refused).toMatchObject({ ok: false, stale: true });
    expect(store.tree[0]!.chapters[0]!.title).toBe('Jumlah Penduduk');

    await store.load();
    const retried = await store.renameChapter(chapter.id, 'Judul saya');
    expect(retried.ok).toBe(true);
    expect(store.tree[0]!.chapters[0]!.title).toBe('Judul saya');
  });

  it('moves a page down with a full reorder body', async () => {
    const outcome = await store.movePage('kependudukan', 1);

    expect(outcome.ok).toBe(true);
    expect(fake.lastWrite()).toMatchObject({
      method: 'PUT',
      url: '/api/pages/reorder',
      body: {
        items: [
          { id: fake.pages[1]!.id, sortOrder: 0 },
          { id: fake.pages[0]!.id, sortOrder: 1 },
        ],
      },
    });
    expect(store.tree.map((p) => p.title)).toEqual(['Pendidikan', 'Kependudukan']);
  });

  it('moves a section with the chapter token', async () => {
    const chapter = store.tree[0]!.chapters[0]!;
    const [first] = chapter.sections;
    const outcome = await store.moveSection(chapter.id, first!.id, 1);

    expect(outcome.ok).toBe(true);
    expect(fake.lastWrite()).toMatchObject({
      method: 'PUT',
      body: { expectedUpdatedAt: chapter.updatedAt },
    });
    expect(store.tree[0]!.chapters[0]!.sections.map((s) => s.title)).toEqual([
      'Rincian',
      'Ringkasan',
    ]);
  });

  it('does nothing and sends nothing for a move past the edge', async () => {
    const before = fake.writes().length;
    const outcome = await store.movePage('kependudukan', -1);

    expect(outcome.ok).toBe(true);
    expect(fake.writes()).toHaveLength(before);
  });

  it('places a dragged page at its drop index and saves the whole order in one reorder request', async () => {
    fake.addPage('Kesehatan', []);
    await store.load();
    const outcome = await store.placePage('kependudukan', 2);

    expect(outcome.ok).toBe(true);
    expect(fake.lastWrite()).toMatchObject({ method: 'PUT', url: '/api/pages/reorder' });
    expect(store.tree.map((p) => p.title)).toEqual(['Pendidikan', 'Kesehatan', 'Kependudukan']);
  });

  it('does nothing and sends nothing when the page would stay where it is', async () => {
    await store.load();
    const before = fake.writes().length;

    const outcome = await store.placePage('pendidikan', 1);

    expect(outcome.ok).toBe(true);
    expect(fake.writes()).toHaveLength(before);
  });

  it('blocks deleting a section that holds a paragraph with the dependency sentence', async () => {
    const section = store.tree[0]!.chapters[0]!.sections[0]!;
    fake.addParagraph(section.id, 'Pembuka', 'Isi paragraf.');
    await store.load();

    const outcome = await store.removeSection(section.id);

    expect(outcome).toMatchObject({
      ok: false,
      blocked: true,
      message: expect.stringContaining('Bagian ini belum bisa dihapus') as string,
    });
    expect(JSON.stringify(outcome)).toContain('masih berisi 1 paragraf.');
    expect(store.tree[0]!.chapters[0]!.sections).toHaveLength(2);
  });

  it('removes a deleted page from the shared page cache and selects its neighbour', async () => {
    store.selectPage('pendidikan');
    const pages = usePagesStore();
    expect(pages.pagesBySlug['pendidikan']).toBeDefined();

    const outcome = await store.removePage('pendidikan');

    expect(outcome.ok).toBe(true);
    expect(pages.pagesBySlug['pendidikan']).toBeUndefined();
    expect(store.selectedPage?.slug).toBe('kependudukan');
  });

  it('adds, edits, moves and removes a paragraph with the right tokens', async () => {
    const section = store.tree[0]!.chapters[0]!.sections[0]!;
    const added = await store.addParagraph(section.id, { title: 'Pertama', body: 'Isi satu.' });
    expect(added.ok).toBe(true);
    await store.addParagraph(section.id, { title: 'Kedua', body: 'Isi dua.' });
    expect(store.paragraphsFor(section.id).map((b) => b.title)).toEqual(['Pertama', 'Kedua']);

    const [first] = store.paragraphsFor(section.id);
    expect((await store.editParagraph(first!, { title: 'Pertama!', body: 'Baru.' })).ok).toBe(true);
    expect(store.paragraphsFor(section.id)[0]!.body).toBe('Baru.');

    const sectionNow = store.findSection(section.id)!.section;
    expect((await store.moveParagraph(section.id, first!.id, 1)).ok).toBe(true);
    expect(fake.lastWrite()).toMatchObject({
      method: 'PUT',
      body: { expectedUpdatedAt: sectionNow.updatedAt },
    });
    expect(store.paragraphsFor(section.id).map((b) => b.title)).toEqual(['Kedua', 'Pertama!']);

    const target = store.paragraphsFor(section.id)[0]!;
    expect((await store.removeParagraph(target)).ok).toBe(true);
    expect(store.paragraphsFor(section.id).map((b) => b.title)).toEqual(['Pertama!']);
  });

  it('saves and removes the figure with the section token and exposes it', async () => {
    const section = store.tree[0]!.chapters[0]!.sections[0]!;
    const figure: SectionFigure = {
      kind: 'photo',
      photos: [{ mediaId: 'm1', alt: 'Balai kelurahan' }],
    };

    expect((await store.saveFigure(section.id, figure)).ok).toBe(true);
    expect(fake.lastWrite()).toMatchObject({
      method: 'PUT',
      url: `/api/sections/${section.id}/figure`,
      body: { expectedUpdatedAt: section.updatedAt, figure },
    });
    expect(store.figureFor(section.id)?.figure).toEqual(figure);
    // The figure is not a paragraph.
    expect(store.paragraphsFor(section.id)).toHaveLength(0);

    expect((await store.removeFigure(section.id)).ok).toBe(true);
    expect(store.figureFor(section.id)).toBeNull();
  });
});

describe('ceritaAdmin store when the reload after a saved write fails', () => {
  let store: ReturnType<typeof useCeritaAdminStore>;
  const failTreeReload = (): void =>
    fake.failNext(
      (r) => r.method === 'GET' && r.url === '/api/pages?include=sections',
      fake.json({ error: 'SQL boom' }, 500),
    );

  beforeEach(async () => {
    store = setup();
    await store.load();
  });

  it('reports the saved change, asks for a reload and leaves no deleted page selected', async () => {
    store.selectPage('pendidikan');
    failTreeReload();

    const outcome = await store.removePage('pendidikan');

    expect(outcome).toMatchObject({ ok: true, refreshFailed: true });
    expect(store.reloadNeeded).toBe(true);
    expect(fake.pages.map((p) => p.slug)).toEqual(['kependudukan']);
    // The deleted page is gone from the screen's data and from every shared cache.
    expect(store.tree.map((p) => p.slug)).toEqual(['kependudukan']);
    expect(store.selectedPage?.slug).toBe('kependudukan');
    const pages = usePagesStore();
    expect(pages.pages.map((p) => p.slug)).toEqual(['kependudukan']);
    expect(pages.pagesBySlug['pendidikan']).toBeUndefined();
    expect(pages.sections.some((s) => s.pageSlug === 'pendidikan')).toBe(false);

    await store.load();
    expect(store.reloadNeeded).toBe(false);
  });

  it('drops a deleted chapter or section from the screen even though the reload failed', async () => {
    const chapter = store.tree[0]!.chapters[1]!;
    const sectionId = store.tree[0]!.chapters[0]!.sections[1]!.id;

    failTreeReload();
    expect(await store.removeSection(sectionId)).toMatchObject({ ok: true, refreshFailed: true });
    expect(store.tree[0]!.chapters[0]!.sections.map((s) => s.title)).toEqual(['Ringkasan']);

    await store.load();
    failTreeReload();
    expect(await store.removeSection(chapter.sections[0]!.id)).toMatchObject({ ok: true });
    // The screen still shows the chapter as it was, so a delete now would carry an old token:
    // the editor reloads first.
    expect(await store.removeChapter(chapter.id)).toMatchObject({ ok: false, stale: true });
    await store.load();
    failTreeReload();
    expect(await store.removeChapter(chapter.id)).toMatchObject({ ok: true, refreshFailed: true });
    expect(store.tree[0]!.chapters.map((c) => c.title)).toEqual(['Jumlah Penduduk']);
  });

  it('also drops a deleted section from the flat section list the /data pickers use', async () => {
    const sectionId = store.tree[0]!.chapters[0]!.sections[1]!.id;
    const pages = usePagesStore();
    expect(pages.sectionById.has(sectionId)).toBe(true);

    failTreeReload();
    expect(await store.removeSection(sectionId)).toMatchObject({ ok: true, refreshFailed: true });

    expect(pages.sections.some((section) => section.sectionId === sectionId)).toBe(false);
    expect(pages.sectionById.has(sectionId)).toBe(false);
    expect(pages.labelFor(sectionId)).toBe('Tanpa bagian');
    // The other sections stay.
    expect(pages.sections).toHaveLength(2);
  });

  it('drops the sections of a deleted chapter from the flat list as well', async () => {
    const chapter = store.tree[0]!.chapters[1]!;
    const sectionIds = chapter.sections.map((section) => section.id);
    const pages = usePagesStore();

    failTreeReload();
    expect(await store.removeChapter(chapter.id)).toMatchObject({ ok: true, refreshFailed: true });

    for (const id of sectionIds) {
      expect(pages.sectionById.has(id)).toBe(false);
    }
    expect(pages.sections.map((section) => section.chapterTitle)).not.toContain('Jumlah Keluarga');
  });

  it('flags a failed reload of paragraphs after a paragraph write too', async () => {
    const section = store.tree[0]!.chapters[0]!.sections[0]!;
    fake.failNext(
      (r) => r.method === 'GET' && r.url === '/api/content-blocks',
      fake.json({ error: 'x' }, 500),
    );

    const outcome = await store.addParagraph(section.id, { title: 'Baru', body: 'Isi.' });

    expect(outcome).toMatchObject({ ok: true, refreshFailed: true });
    expect(store.reloadNeeded).toBe(true);
  });

  it('does not flag a reload that worked', async () => {
    const outcome = await store.addChapter('kependudukan', 'Bab baru');
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome).not.toHaveProperty('refreshFailed', true);
    expect(store.reloadNeeded).toBe(false);
  });
});

describe('ceritaAdmin store and the public page cache', () => {
  let store: ReturnType<typeof useCeritaAdminStore>;

  beforeEach(async () => {
    store = setup();
    await store.load();
  });

  /** What the public Cerita reader can leave in the shared cache: another shape, older, no tokens. */
  function publicCopy(slug: string, title: string): PageDetail {
    return {
      id: 'public-copy',
      slug,
      title,
      sortOrder: 99,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      chapters: [
        {
          id: 'old-chapter',
          slug: 'bab-lama',
          number: null,
          title: 'Bab lama',
          sortOrder: 1,
          sections: [{ id: 'old-section', slug: 'bagian-lama', title: null, sortOrder: 1 }],
        },
      ],
    };
  }

  const failTreeReload = (): void =>
    fake.failNext(
      (r) => r.method === 'GET' && r.url === '/api/pages?include=sections',
      fake.json({ error: 'SQL boom' }, 500),
    );

  it('never reads the public per-slug cache for its tree', async () => {
    const pages = usePagesStore();
    pages.pagesBySlug = { ...pages.pagesBySlug, kependudukan: publicCopy('kependudukan', 'Lama') };

    expect(store.tree[0]!.title).toBe('Kependudukan');
    const chapter = store.tree[0]!.chapters[0]!;
    expect(chapter.id).not.toBe('old-chapter');
    expect(typeof chapter.updatedAt).toBe('string');

    // A write still carries the real token and is accepted.
    expect(await store.renameChapter(chapter.id, 'Penduduk Total')).toMatchObject({ ok: true });
  });

  it('reorders every page even when only one page was opened on the public site', async () => {
    const pages = usePagesStore();
    pages.pagesBySlug = { kependudukan: publicCopy('kependudukan', 'Lama') };

    const outcome = await store.movePage('pendidikan', -1);

    expect(outcome).toMatchObject({ ok: true });
    expect(store.tree.map((p) => p.slug)).toEqual(['pendidikan', 'kependudukan']);
  });

  it('drops a deleted chapter from the screen and forgets the public copy of its page', async () => {
    const pages = usePagesStore();
    const chapter = store.tree[0]!.chapters[1]!;
    // Empty the chapter first (a reload that works), then delete it with a reload that fails.
    expect(await store.removeSection(chapter.sections[0]!.id)).toMatchObject({ ok: true });
    pages.pagesBySlug = { ...pages.pagesBySlug, kependudukan: publicCopy('kependudukan', 'Lama') };

    failTreeReload();
    expect(await store.removeChapter(chapter.id)).toMatchObject({ ok: true, refreshFailed: true });

    expect(store.tree[0]!.chapters.map((c) => c.id)).not.toContain(chapter.id);
    // The next public visit fetches the page again instead of reading a pre-delete copy.
    expect(pages.pagesBySlug['kependudukan']).toBeUndefined();
  });

  it('refuses to work from a page the server sent without its tokens', async () => {
    const copy = JSON.parse(JSON.stringify(store.tree)) as typeof store.tree;
    const stamped = copy.map((page) => ({
      ...page,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));
    // The second page's chapters arrive without their `updatedAt`.
    for (const chapter of stamped[1]!.chapters) {
      delete (chapter as { updatedAt?: string }).updatedAt;
    }
    fake.failNext(
      (r) => r.method === 'GET' && r.url === '/api/pages?include=sections',
      fake.json({ pages: stamped }),
    );

    expect(await store.load()).toBe(false);

    // No half-edited tree: a reorder has to name every sibling, so nothing is offered.
    expect(store.tree).toEqual([]);
    expect(store.loadError).toContain('belum lengkap');
    expect(store.loadError).not.toMatch(/updatedAt|token/i);

    // A good reload recovers.
    expect(await store.load()).toBe(true);
    expect(store.tree.map((p) => p.slug)).toEqual(['kependudukan', 'pendidikan']);
    expect(store.loadError).toBeNull();
  });

  describe('duplicate and move a section', () => {
    it('duplicates a section with the token it loaded, appends the copy and reloads the tree', async () => {
      const section = store.tree[0]!.chapters[0]!.sections[0]!;
      const token = section.updatedAt;

      const outcome = await store.duplicateSection(section.id);

      expect(outcome).toMatchObject({ ok: true });
      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: `/api/sections/${section.id}/duplicate`,
        body: { expectedUpdatedAt: token },
      });
      const titles = store.tree[0]!.chapters[0]!.sections.map((s) => s.title);
      expect(titles).toEqual(['Ringkasan', 'Rincian', 'Ringkasan (salinan)']);
      expect(outcome.ok && store.findSection(outcome.value.id)).toBeTruthy();
    });

    it('copies the paragraphs of the section to the copy', async () => {
      const section = store.tree[0]!.chapters[0]!.sections[0]!;
      await store.addParagraph(section.id, { title: 'Satu', body: 'Isi paragraf.' });

      const outcome = await store.duplicateSection(section.id);

      expect(outcome.ok).toBe(true);
      const copy = store.tree[0]!.chapters[0]!.sections[2]!;
      expect(store.paragraphsFor(copy.id).map((b) => b.body)).toEqual(['Isi paragraf.']);
      expect(store.paragraphsFor(section.id)).toHaveLength(1);
    });

    it('reports a stale duplicate in plain words and writes nothing', async () => {
      const section = store.tree[0]!.chapters[0]!.sections[0]!;
      const before = store.tree[0]!.chapters[0]!.sections.length;
      fake.failNext(
        (r) => r.url === `/api/sections/${section.id}/duplicate`,
        fake.json({ error: 'stale', code: 'STALE_WRITE' }, 409),
      );

      const outcome = await store.duplicateSection(section.id);

      expect(outcome).toMatchObject({ ok: false, stale: true });
      expect(JSON.stringify(outcome)).not.toMatch(/STALE_WRITE|409/);
      expect(store.tree[0]!.chapters[0]!.sections).toHaveLength(before);
    });

    it('moves a section to another chapter of the same page with the section token', async () => {
      const [first, second] = store.tree[0]!.chapters;
      const section = first!.sections[1]!;
      const token = section.updatedAt;

      const outcome = await store.moveSectionToChapter(section.id, second!.id);

      expect(outcome.ok).toBe(true);
      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: `/api/sections/${section.id}/move`,
        body: { targetChapterId: second!.id, expectedUpdatedAt: token },
      });
      expect(store.findChapter(first!.id)?.chapter.sections.map((s) => s.id)).toEqual([
        first!.sections[0]!.id,
      ]);
      expect(store.findChapter(second!.id)?.chapter.sections.map((s) => s.id)).toContain(
        section.id,
      );
    });

    it('refuses a chapter of another page without sending a request', async () => {
      const section = store.tree[0]!.chapters[0]!.sections[0]!;
      const otherPageChapter = store.tree[1]!.chapters[0]!;
      const writesBefore = fake.requests.filter((r) => r.method !== 'GET').length;

      const outcome = await store.moveSectionToChapter(section.id, otherPageChapter.id);

      expect(outcome).toMatchObject({ ok: false });
      expect(fake.requests.filter((r) => r.method !== 'GET')).toHaveLength(writesBefore);
    });

    it('does nothing when the target is the chapter the section is already in', async () => {
      const chapter = store.tree[0]!.chapters[0]!;
      const writesBefore = fake.requests.filter((r) => r.method !== 'GET').length;

      const outcome = await store.moveSectionToChapter(chapter.sections[0]!.id, chapter.id);

      expect(outcome.ok).toBe(true);
      expect(fake.requests.filter((r) => r.method !== 'GET')).toHaveLength(writesBefore);
    });
  });
  describe('drag placement of chapters and sections', () => {
    it('puts a section at the dropped place in its chapter with the chapter token', async () => {
      const chapter = store.tree[0]!.chapters[0]!;
      const first = chapter.sections[0]!;

      const outcome = await store.placeSection(chapter.id, first.id, 1);

      expect(outcome.ok).toBe(true);
      expect(fake.lastWrite()).toMatchObject({
        method: 'PUT',
        url: `/api/chapters/${chapter.id}/sections/reorder`,
        body: { expectedUpdatedAt: chapter.updatedAt },
      });
      expect(store.findChapter(chapter.id)?.chapter.sections.map((s) => s.title)).toEqual([
        'Rincian',
        'Ringkasan',
      ]);
    });

    it('sends nothing when a section is dropped where it already is', async () => {
      const chapter = store.tree[0]!.chapters[0]!;
      const writesBefore = fake.requests.filter((r) => r.method !== 'GET').length;

      const outcome = await store.placeSection(chapter.id, chapter.sections[0]!.id, 0);

      expect(outcome.ok).toBe(true);
      expect(fake.requests.filter((r) => r.method !== 'GET')).toHaveLength(writesBefore);
    });

    it('puts a chapter at the dropped place of its page with the page token', async () => {
      const page = store.tree[0]!;
      const first = page.chapters[0]!;

      const outcome = await store.placeChapter(page.slug, first.id, 1);

      expect(outcome.ok).toBe(true);
      expect(fake.lastWrite()).toMatchObject({
        method: 'PUT',
        url: `/api/pages/${page.slug}/chapters/reorder`,
        body: { expectedUpdatedAt: page.updatedAt },
      });
      expect(store.findPage(page.slug)?.chapters.map((c) => c.title)).toEqual(['Jumlah Keluarga', 'Jumlah Penduduk']);
    });
  });
});
