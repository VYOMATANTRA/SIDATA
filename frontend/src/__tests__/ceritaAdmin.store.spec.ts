import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCeritaAdminStore } from '../stores/ceritaAdmin.store';
import { usePagesStore } from '../stores/pages.store';
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
    expect(JSON.stringify(outcome)).toContain('1 paragraf atau gambar');
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
