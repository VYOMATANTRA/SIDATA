import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AdminCeritaView from '../views/AdminCeritaView.vue';
import { useAuthStore } from '../stores/auth';
import { useCeritaAdminStore } from '../stores/ceritaAdmin.store';
import { createFakeCerita, type FakeCerita } from './ceritaFakeApi';

// The view guards leaving with unsaved work. Capture the guard so a spec can run it directly.
const leaveGuards: Array<() => unknown> = [];
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    onBeforeRouteLeave: (guard: () => unknown) => {
      leaveGuards.push(guard);
    },
  };
});

let fake: FakeCerita;

function seed(): void {
  fake.addPage('Kependudukan', [
    { title: 'Jumlah Penduduk', sections: ['Ringkasan', 'Rincian'] },
    { title: 'Jumlah Keluarga', sections: ['Ringkasan keluarga'] },
  ]);
  fake.addPage('Pendidikan', [{ title: 'Tingkat Pendidikan', sections: ['Jenjang'] }]);
  fake.addPage('Kesehatan', []);
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(AdminCeritaView, {
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

const body = (): DOMWrapper<HTMLElement> => new DOMWrapper(document.body);

function button(label: string, root: ParentNode = document.body): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((element) =>
    (element.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(label),
  );
  if (!found) throw new Error(`no button starting with "${label}"`);
  return found;
}

async function click(label: string): Promise<void> {
  button(label).click();
  await flushPromises();
}

async function typeInto(selector: string, value: string): Promise<void> {
  await body().find(selector).setValue(value);
}

async function submitDialog(): Promise<void> {
  await body().find('[data-test="name-dialog"]').trigger('submit');
  await flushPromises();
}

function pageTitles(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-test="page-select"]').map((item) =>
    item
      .text()
      .replace(/Urutan \d+:/, '')
      .replace(/\d+ bab.*$/, '')
      .replace(/Dibuka/, '')
      .trim(),
  );
}

const RAW_TERMS =
  /STALE_WRITE|HAS_DEPENDENTS|\b409\b|\b400\b|\b500\b|sortOrder|expectedUpdatedAt|\/api\/|undefined|\[object/;

describe('AdminCeritaView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
    document.body.innerHTML = '';
    leaveGuards.length = 0;
    fake = createFakeCerita();
    seed();
    fake.install();
  });

  describe('page list and structure', () => {
    it('lists the pages in order, marks the open one and shows its chapters and sections', async () => {
      const wrapper = await mountView();

      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan', 'Kesehatan']);
      const selected = wrapper.findAll('[data-test="page-select"]');
      expect(selected[0]!.attributes('aria-current')).toBe('true');
      expect(selected[1]!.attributes('aria-current')).toBeUndefined();
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Kependudukan');
      expect(wrapper.findAll('[data-test="chapter-title"]').map((c) => c.text())).toEqual([
        'Jumlah Penduduk',
        'Jumlah Keluarga',
      ]);
      expect(wrapper.findAll('[data-test="section-title"]').map((c) => c.text())).toEqual([
        'Ringkasan',
        'Rincian',
        'Ringkasan keluarga',
      ]);
      wrapper.unmount();
    });

    it('opens another page, moves focus to its heading and keeps one h2 per region', async () => {
      const wrapper = await mountView();

      await wrapper.findAll('[data-test="page-select"]')[1]!.trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Pendidikan');
      expect(document.activeElement).toBe(wrapper.find('[data-test="page-heading"]').element);
      expect(wrapper.findAll('[data-test="page-select"]')[1]!.attributes('aria-current')).toBe(
        'true',
      );
      wrapper.unmount();
    });

    it('offers a link to the public page that opens in a new tab with a spoken note', async () => {
      const wrapper = await mountView();

      const link = wrapper.find('[data-test="page-public-link"]');
      expect(link.attributes('href')).toBe('/cerita/kependudukan');
      expect(link.attributes('target')).toBe('_blank');
      expect(link.attributes('rel')).toContain('noopener');
      expect(link.text()).toContain('tab baru');
      wrapper.unmount();
    });

    it('shows the empty states for a page without chapters and a chapter without sections', async () => {
      const wrapper = await mountView();

      await wrapper.findAll('[data-test="page-select"]')[2]!.trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="chapter-empty"]').text()).toContain('belum memiliki bab');

      await click('Tambah bab');
      await typeInto('[data-test="name-input"]', 'Ibu Hamil');
      await submitDialog();
      expect(wrapper.find('[data-test="section-empty"]').text()).toContain('belum memiliki bagian');
      wrapper.unmount();
    });

    it('shows a retry for a failed load and loads once it works', async () => {
      fake.failNext(
        (r) => r.url === '/api/pages?include=sections',
        fake.json({ error: 'SQL error near x' }, 500),
      );
      const wrapper = await mountView();

      const error = wrapper.find('[data-test="load-error"]');
      expect(error.exists()).toBe(true);
      expect(error.text()).not.toMatch(RAW_TERMS);
      expect(error.text()).not.toContain('SQL');

      await wrapper.find('[data-test="load-retry"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false);
      expect(pageTitles(wrapper)).toContain('Kependudukan');
      wrapper.unmount();
    });
  });

  describe('pages', () => {
    it('adds a page: asks for a title, saves it, selects it and moves focus to its heading', async () => {
      const wrapper = await mountView();

      await click('Tambah halaman');
      const dialog = body().find('[data-test="name-dialog"]');
      expect(dialog.exists()).toBe(true);
      expect(document.body.textContent).toContain('Judul halaman');

      // Empty title is refused on the client with a plain sentence and nothing is sent.
      await submitDialog();
      expect(body().text()).toContain('Judul halaman wajib diisi.');
      expect(fake.writes()).toHaveLength(0);

      await typeInto('[data-test="name-input"]', '  Ekonomi Lokal ');
      await submitDialog();

      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: '/api/pages',
        body: { title: 'Ekonomi Lokal' },
      });
      expect(body().find('[data-test="name-dialog"]').exists()).toBe(false);
      expect(pageTitles(wrapper)).toContain('Ekonomi Lokal');
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Ekonomi Lokal');
      expect(document.activeElement).toBe(wrapper.find('[data-test="page-heading"]').element);
      expect(wrapper.find('[data-test="status"]').text()).toContain(
        'Halaman “Ekonomi Lokal” ditambahkan.',
      );
      wrapper.unmount();
    });

    it('keeps the typed title and explains plainly when a page title is already taken', async () => {
      const wrapper = await mountView();

      await click('Tambah halaman');
      await typeInto('[data-test="name-input"]', 'Pendidikan');
      await submitDialog();

      const dialog = body().find('[data-test="name-dialog"]');
      expect(dialog.exists()).toBe(true);
      expect((body().find('[data-test="name-input"]').element as HTMLInputElement).value).toBe(
        'Pendidikan',
      );
      const error = body().find('[data-test="name-error"]').text();
      expect(error).toContain('judul yang sama');
      expect(error).not.toMatch(RAW_TERMS);
      expect(error).not.toContain('Slug');
      wrapper.unmount();
    });

    it('renames a page with its token and leaves the address alone', async () => {
      const wrapper = await mountView();
      const token = fake.pages[0]!.updatedAt;

      await click('Ubah judul halaman Kependudukan');
      expect((body().find('[data-test="name-input"]').element as HTMLInputElement).value).toBe(
        'Kependudukan',
      );
      await typeInto('[data-test="name-input"]', 'Kependudukan Manggar');
      await submitDialog();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PATCH',
        url: '/api/pages/kependudukan',
        body: { title: 'Kependudukan Manggar', expectedUpdatedAt: token },
      });
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Kependudukan Manggar');
      expect(wrapper.find('[data-test="page-public-link"]').attributes('href')).toBe(
        '/cerita/kependudukan',
      );
      expect(document.activeElement).toBe(wrapper.find('[data-test="page-rename"]').element);
      wrapper.unmount();
    });

    it('keeps the draft on a stale rename, offers a reload that keeps it, then saves with the fresh token', async () => {
      const wrapper = await mountView();
      await click('Ubah judul halaman Kependudukan');
      await typeInto('[data-test="name-input"]', 'Judul saya');
      fake.touchPage('kependudukan');

      await submitDialog();

      expect(body().find('[data-test="name-dialog"]').exists()).toBe(true);
      expect((body().find('[data-test="name-input"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );
      const alert = body().find('[data-test="name-error"]').text();
      expect(alert).toContain('baru saja diubah oleh orang lain');
      expect(alert).not.toMatch(RAW_TERMS);
      expect(body().find('[data-test="name-stale"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Kependudukan');

      await body().find('[data-test="name-reload"]').trigger('click');
      await flushPromises();
      expect((body().find('[data-test="name-input"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );
      expect(body().find('[data-test="name-stale"]').exists()).toBe(false);

      await submitDialog();
      expect(fake.pages[0]!.title).toBe('Judul saya');
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Judul saya');
      wrapper.unmount();
    });

    it('keeps the typed title and shows plain text when the connection fails', async () => {
      const wrapper = await mountView();
      await click('Ubah judul halaman Kependudukan');
      await typeInto('[data-test="name-input"]', 'Judul baru');
      fake.failNext((r) => r.method === 'PATCH', fake.json({ error: 'x' }, 500));

      await submitDialog();

      expect((body().find('[data-test="name-input"]').element as HTMLInputElement).value).toBe(
        'Judul baru',
      );
      const error = body().find('[data-test="name-error"]').text();
      expect(error).toContain('Gagal mengubah judul halaman');
      expect(error).not.toMatch(RAW_TERMS);
      wrapper.unmount();
    });

    it('moves a page down and up with buttons, keeping focus on a usable button', async () => {
      const wrapper = await mountView();

      await click('Turun halaman Kependudukan');
      expect(fake.lastWrite()).toMatchObject({ method: 'PUT', url: '/api/pages/reorder' });
      expect(pageTitles(wrapper)).toEqual(['Pendidikan', 'Kependudukan', 'Kesehatan']);
      expect(wrapper.find('[data-test="status"]').text()).toContain('urutan 2 dari 3');
      expect(document.activeElement?.id).toBe('cerita-halaman-turun');

      await click('Turun halaman Kependudukan');
      expect(pageTitles(wrapper)).toEqual(['Pendidikan', 'Kesehatan', 'Kependudukan']);
      // The last page cannot go further down, so focus moves to the other button.
      expect(wrapper.find('#cerita-halaman-turun').attributes('disabled')).toBeDefined();
      expect(document.activeElement?.id).toBe('cerita-halaman-naik');

      await click('Naik halaman Kependudukan');
      expect(pageTitles(wrapper)).toEqual(['Pendidikan', 'Kependudukan', 'Kesehatan']);
      wrapper.unmount();
    });

    it('disables the move that cannot happen at either end', async () => {
      const wrapper = await mountView();

      expect(wrapper.find('#cerita-halaman-naik').attributes('disabled')).toBeDefined();
      expect(wrapper.find('#cerita-halaman-turun').attributes('disabled')).toBeUndefined();
      wrapper.unmount();
    });

    it('reports a stale reorder in plain words and reloads on request', async () => {
      const wrapper = await mountView();
      fake.failNext(
        (r) => r.url === '/api/pages/reorder',
        fake.json({ error: 'x', code: 'STALE_WRITE' }, 409),
      );

      await click('Turun halaman Kependudukan');

      const error = wrapper.find('[data-test="action-error"]');
      expect(error.text()).toContain('baru saja diubah oleh orang lain');
      expect(error.text()).not.toMatch(RAW_TERMS);
      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan', 'Kesehatan']);

      await wrapper.find('[data-test="action-reload"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="action-error"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('deletes an empty page after confirming, then opens its neighbour', async () => {
      const wrapper = await mountView();
      await wrapper.findAll('[data-test="page-select"]')[2]!.trigger('click');
      await flushPromises();

      await click('Hapus halaman Kesehatan');
      expect(body().find('[data-test="delete-dialog"]').text()).toContain(
        'Hapus halaman “Kesehatan”?',
      );
      expect(fake.writes()).toHaveLength(0);

      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'DELETE',
        url: expect.stringContaining('/api/pages/kesehatan?expectedUpdatedAt=') as string,
      });
      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan']);
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Pendidikan');
      expect(document.activeElement).toBe(wrapper.find('[data-test="page-heading"]').element);
      wrapper.unmount();
    });

    it('explains that empty chapters and sections go with a deleted page', async () => {
      const wrapper = await mountView();
      document.getElementById('cerita-halaman-hapus')?.focus();

      await click('Hapus halaman Kependudukan');

      expect(body().find('[data-test="delete-consequence"]').text()).toContain(
        '2 bab dan 3 bagian yang masih kosong',
      );
      await body().find('[data-test="delete-cancel"]').trigger('click');
      await flushPromises();
      expect(fake.pages).toHaveLength(3);
      expect(document.activeElement).toBe(document.getElementById('cerita-halaman-hapus'));
      wrapper.unmount();
    });

    it('blocks deleting a page that still holds content at once, naming what holds it in plain words', async () => {
      const sectionId = fake.pages[0]!.chapters[0]!.sections[0]!.id;
      fake.addParagraph(sectionId, 'Pembuka', 'Isi.');
      fake.addParagraph(sectionId, 'Lanjutan', 'Isi.');
      const wrapper = await mountView();

      await click('Hapus halaman Kependudukan');

      const error = body().find('[data-test="delete-error"]').text();
      expect(error).toContain('Halaman ini belum bisa dihapus');
      expect(error).toContain('2 paragraf atau gambar');
      expect(error).not.toMatch(RAW_TERMS);
      expect(error).not.toContain('blok konten:');
      expect(body().find('[data-test="delete-hint"]').text()).toContain('Ringkasan');
      // No confirm button is left; the way out is "Mengerti", and nothing was sent.
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);
      expect(body().find('[data-test="delete-cancel"]').text()).toBe('Mengerti');
      expect(fake.writes()).toHaveLength(0);
      expect(pageTitles(wrapper)).toContain('Kependudukan');
      wrapper.unmount();
    });

    it('also handles the refusal when the screen did not know about the content', async () => {
      const wrapper = await mountView();
      const sectionId = fake.pages[0]!.chapters[0]!.sections[0]!.id;
      fake.addParagraph(sectionId, 'Baru', 'Ditambah orang lain.');

      await click('Hapus halaman Kependudukan');
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(true);
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      const error = body().find('[data-test="delete-error"]').text();
      expect(error).toContain(
        'Halaman ini belum bisa dihapus karena masih berisi 1 paragraf atau gambar',
      );
      expect(error).not.toMatch(RAW_TERMS);
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);
      expect(pageTitles(wrapper)).toContain('Kependudukan');
      wrapper.unmount();
    });
  });

  describe('chapters', () => {
    it('adds a chapter to the open page and moves focus to its "Tambah bagian" button', async () => {
      const wrapper = await mountView();

      await click('Tambah bab');
      expect(document.body.textContent).toContain('Judul bab');
      await typeInto('[data-test="name-input"]', 'Rasio Jenis Kelamin');
      await submitDialog();

      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: '/api/pages/kependudukan/chapters',
        body: { title: 'Rasio Jenis Kelamin' },
      });
      expect(wrapper.findAll('[data-test="chapter-title"]').map((c) => c.text())).toContain(
        'Rasio Jenis Kelamin',
      );
      const newChapter = fake.pages[0]!.chapters[fake.pages[0]!.chapters.length - 1]!;
      expect(document.activeElement?.id).toBe(`cerita-bab-${newChapter.id}-tambah-bagian`);
      wrapper.unmount();
    });

    it('renames a chapter with the chapter token', async () => {
      const wrapper = await mountView();
      const chapter = fake.pages[0]!.chapters[0]!;
      const token = chapter.updatedAt;

      await click('Ubah judul bab Jumlah Penduduk');
      await typeInto('[data-test="name-input"]', 'Penduduk Total');
      await submitDialog();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PATCH',
        url: `/api/chapters/${chapter.id}`,
        body: { title: 'Penduduk Total', expectedUpdatedAt: token },
      });
      expect(wrapper.findAll('[data-test="chapter-title"]')[0]!.text()).toBe('Penduduk Total');
      wrapper.unmount();
    });

    it('blocks deleting a chapter whose section holds a paragraph, then deletes an empty one', async () => {
      const held = fake.pages[0]!.chapters[0]!.sections[0]!.id;
      fake.addParagraph(held, 'Pembuka', 'Isi.');
      const wrapper = await mountView();

      await click('Hapus bab Jumlah Penduduk');
      expect(body().find('[data-test="delete-error"]').text()).toContain(
        'Bab ini belum bisa dihapus karena masih berisi 1 paragraf atau gambar',
      );
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);
      await body().find('[data-test="delete-cancel"]').trigger('click');
      await flushPromises();
      expect(fake.writes()).toHaveLength(0);

      // The second chapter's only section is empty, so deleting the section and then the
      // chapter goes through.
      await click('Hapus bagian Ringkasan keluarga');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      await click('Hapus bab Jumlah Keluarga');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(wrapper.findAll('[data-test="chapter-title"]').map((c) => c.text())).toEqual([
        'Jumlah Penduduk',
      ]);
      expect(document.activeElement?.id).toBe('cerita-tambah-bab');
      wrapper.unmount();
    });
  });

  describe('sections', () => {
    it('adds a section and moves focus to its "Isi bagian" button', async () => {
      const wrapper = await mountView();

      await click('Tambah bagian pada bab Jumlah Penduduk');
      await typeInto('[data-test="name-input"]', 'Penduduk menurut usia');
      await submitDialog();

      const chapter = fake.pages[0]!.chapters[0]!;
      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: `/api/chapters/${chapter.id}/sections`,
        body: { title: 'Penduduk menurut usia' },
      });
      const created = chapter.sections[chapter.sections.length - 1]!;
      expect(document.activeElement?.id).toBe(`cerita-bagian-${created.id}-isi`);
      expect(wrapper.findAll('[data-test="section-title"]').map((c) => c.text())).toContain(
        'Penduduk menurut usia',
      );
      wrapper.unmount();
    });

    it('renames a section with the section token', async () => {
      const wrapper = await mountView();
      const section = fake.pages[0]!.chapters[0]!.sections[0]!;
      const token = section.updatedAt;

      await click('Ubah judul bagian Ringkasan');
      await typeInto('[data-test="name-input"]', 'Ringkasan umum');
      await submitDialog();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PATCH',
        url: `/api/sections/${section.id}`,
        body: { title: 'Ringkasan umum', expectedUpdatedAt: token },
      });
      expect(wrapper.findAll('[data-test="section-title"]')[0]!.text()).toBe('Ringkasan umum');
      wrapper.unmount();
    });

    it('moves a section with the chapter token', async () => {
      const wrapper = await mountView();
      const chapter = fake.pages[0]!.chapters[0]!;
      const token = chapter.updatedAt;

      await click('Turun bagian Ringkasan');

      expect(fake.lastWrite()).toMatchObject({
        method: 'PUT',
        url: `/api/chapters/${chapter.id}/sections/reorder`,
        body: { expectedUpdatedAt: token },
      });
      expect(
        wrapper
          .findAll('[data-test="section-title"]')
          .slice(0, 2)
          .map((c) => c.text()),
      ).toEqual(['Rincian', 'Ringkasan']);
      wrapper.unmount();
    });

    it('blocks deleting a section that holds a paragraph and offers the section editor', async () => {
      const section = fake.pages[0]!.chapters[0]!.sections[0]!;
      fake.addParagraph(section.id, 'Pembuka', 'Isi.');
      const wrapper = await mountView();

      await click('Hapus bagian Ringkasan');

      expect(body().find('[data-test="delete-error"]').text()).toContain(
        'Bagian ini belum bisa dihapus karena masih berisi 1 paragraf atau gambar',
      );
      expect(body().find('[data-test="delete-hint"]').text()).toContain('Buka isi bagian');
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);

      await body().find('[data-test="delete-action"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="delete-dialog"]').exists()).toBe(false);
      expect(body().find('[data-test="section-editor"]').exists()).toBe(true);
      expect(document.body.textContent).toContain('Isi bagian: Ringkasan');
      wrapper.unmount();
    });

    it('counts a figure as content that blocks deleting its section', async () => {
      const section = fake.pages[0]!.chapters[0]!.sections[0]!;
      fake.blocks.push({
        id: 'fig-1',
        sectionId: section.id,
        type: 'figure',
        slug: `figure-${section.id}`,
        title: null,
        body: '',
        metadata: { kind: 'photo', photos: [{ mediaId: 'm1', alt: 'Balai' }] },
        sortOrder: null,
        updatedAt: '2026-11-13T10:00:00.000Z',
      });
      const wrapper = await mountView();

      await click('Hapus bagian Ringkasan');

      expect(body().find('[data-test="delete-error"]').text()).toContain(
        'masih berisi 1 paragraf atau gambar',
      );
      expect(body().find('[data-test="delete-action"]').text()).toBe('Buka isi bagian');
      expect(fake.writes()).toHaveLength(0);
      wrapper.unmount();
    });

    it("deletes an empty section and returns focus to the chapter's add button", async () => {
      const wrapper = await mountView();

      await click('Hapus bagian Rincian');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      expect(wrapper.findAll('[data-test="section-title"]').map((c) => c.text())).toEqual([
        'Ringkasan',
        'Ringkasan keluarga',
      ]);
      expect(document.activeElement?.id).toBe(
        `cerita-bab-${fake.pages[0]!.chapters[0]!.id}-tambah-bagian`,
      );
      wrapper.unmount();
    });

    it('labels an untitled section by its position', async () => {
      fake.pages[1]!.chapters[0]!.sections[0]!.title = null;
      const wrapper = await mountView();
      await wrapper.findAll('[data-test="page-select"]')[1]!.trigger('click');

      expect(wrapper.find('[data-test="section-title"]').text()).toBe('Bagian 1');
      wrapper.unmount();
    });
  });

  describe('section editor dialog', () => {
    async function openRingkasan(): Promise<VueWrapper> {
      const wrapper = await mountView();
      await click('Isi bagian Ringkasan');
      return wrapper;
    }

    it('opens the editor for the chosen section with its place in the title and description', async () => {
      const wrapper = await openRingkasan();

      expect(body().find('[data-test="section-editor"]').exists()).toBe(true);
      expect(document.body.textContent).toContain('Isi bagian: Ringkasan');
      expect(document.body.textContent).toContain('Kependudukan › Jumlah Penduduk');
      expect(
        body()
          .find('[data-test="section-editor"]')
          .findAll('h3')
          .map((h) => h.text()),
      ).toEqual(['Paragraf', 'Gambar']);
      wrapper.unmount();
    });

    it('closes without a question when nothing is unsaved and returns focus to the opener', async () => {
      const wrapper = await mountView();
      const opener = document.getElementById(
        `cerita-bagian-${fake.pages[0]!.chapters[0]!.sections[0]!.id}-isi`,
      )!;
      opener.focus();
      opener.click();
      await flushPromises();

      await body().find('button[aria-label="Tutup dialog"]').trigger('click');
      await flushPromises();

      expect(body().find('[data-test="section-editor"]').exists()).toBe(false);
      expect(body().find('[data-test="discard-dialog"]').exists()).toBe(false);
      expect(document.activeElement).toBe(opener);
      wrapper.unmount();
    });

    it('asks before closing with an unsaved paragraph and keeps the draft on "Tetap di sini"', async () => {
      const wrapper = await openRingkasan();
      await click('Tambah paragraf');
      await body().find('[data-test="paragraph-title"]').setValue('Judul');
      await body().find('[data-test="paragraph-body"]').setValue('Teks yang belum disimpan.');

      await body().find('button[aria-label="Tutup dialog"]').trigger('click');
      await flushPromises();

      const prompt = body().find('[data-test="discard-dialog"]');
      expect(prompt.text()).toContain('Perubahan belum disimpan');
      expect(document.activeElement).toBe(body().find('[data-test="discard-keep"]').element);

      await body().find('[data-test="discard-keep"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="discard-dialog"]').exists()).toBe(false);
      expect(
        (body().find('[data-test="paragraph-body"]').element as HTMLTextAreaElement).value,
      ).toBe('Teks yang belum disimpan.');

      await body().find('button[aria-label="Tutup dialog"]').trigger('click');
      await flushPromises();
      await body().find('[data-test="discard-confirm"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="section-editor"]').exists()).toBe(false);
      expect(fake.writes()).toHaveLength(0);
      wrapper.unmount();
    });

    it('asks before leaving the route with an unsaved draft and lets the editor stay', async () => {
      const wrapper = await openRingkasan();
      expect(leaveGuards).toHaveLength(1);
      expect(await leaveGuards[0]!()).toBe(true);

      await click('Tambah paragraf');
      await body().find('[data-test="paragraph-body"]').setValue('belum disimpan');

      const pending = leaveGuards[0]!() as Promise<boolean>;
      await flushPromises();
      expect(body().find('[data-test="discard-dialog"]').exists()).toBe(true);

      await body().find('[data-test="discard-keep"]').trigger('click');
      await flushPromises();
      await expect(pending).resolves.toBe(false);
      expect(body().find('[data-test="section-editor"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('saves a paragraph through the dialog and the section token chains into the next write', async () => {
      const wrapper = await openRingkasan();
      await click('Tambah paragraf');
      await body().find('[data-test="paragraph-title"]').setValue('Pertama');
      await body().find('[data-test="paragraph-body"]').setValue('Isi pertama.');
      await body().find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();
      await click('Tambah paragraf');
      await body().find('[data-test="paragraph-title"]').setValue('Kedua');
      await body().find('[data-test="paragraph-body"]').setValue('Isi kedua.');
      await body().find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();
      const section = fake.pages[0]!.chapters[0]!.sections[0]!;
      const token = section.updatedAt;

      await click('Turun paragraf 1');

      expect(fake.lastWrite()).toMatchObject({ method: 'PUT', body: { expectedUpdatedAt: token } });
      expect(
        body()
          .findAll('[data-test="paragraph-heading"]')
          .map((h) => h.text()),
      ).toEqual(['Paragraf 1: Kedua', 'Paragraf 2: Pertama']);
      wrapper.unmount();
    });

    it('closes the editor when its section is deleted elsewhere', async () => {
      const wrapper = await openRingkasan();
      fake.pages[0]!.chapters[0]!.sections.shift();

      await useCeritaAdminStore().load();
      await flushPromises();

      expect(body().find('[data-test="section-editor"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="status"]').text()).toContain(
        'sudah dihapus oleh orang lain',
      );
      wrapper.unmount();
    });
  });

  describe('accessibility and wording', () => {
    it('gives every button a name, every control a label and shows no raw API text', async () => {
      const wrapper = await mountView();

      const unnamed = Array.from(document.body.querySelectorAll('button')).filter(
        (element) =>
          (element.textContent ?? '').trim() === '' && !element.getAttribute('aria-label'),
      );
      expect(unnamed).toHaveLength(0);
      expect(document.body.textContent).not.toMatch(RAW_TERMS);

      await click('Tambah halaman');
      const input = body().find('[data-test="name-input"]').element as HTMLInputElement;
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label?.textContent).toContain('Judul halaman');
      expect(body().find('[role="dialog"]').attributes('aria-labelledby')).toBeTruthy();
      wrapper.unmount();
    });

    it('returns focus to the button that opened a dialog when it is cancelled', async () => {
      const wrapper = await mountView();
      const opener = wrapper.find('[data-test="chapter-add"]').element as HTMLElement;
      opener.focus();

      opener.click();
      await flushPromises();
      expect(body().find('[role="dialog"]').exists()).toBe(true);
      await body().find('[data-test="name-cancel"]').trigger('click');
      await flushPromises();

      expect(document.activeElement).toBe(opener);
      wrapper.unmount();
    });

    it('refuses a title with markup before sending anything', async () => {
      const wrapper = await mountView();

      await click('Tambah bab');
      await typeInto('[data-test="name-input"]', '<b>Tebal</b>');
      await submitDialog();

      expect(body().text()).toContain('tidak boleh memuat tag HTML');
      expect(fake.writes()).toHaveLength(0);
      wrapper.unmount();
    });
  });
});
