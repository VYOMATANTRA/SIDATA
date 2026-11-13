import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import CeritaSectionEditor from '../components/admin/cerita/CeritaSectionEditor.vue';
import { useCeritaAdminStore } from '../stores/ceritaAdmin.store';
import { useAuthStore } from '../stores/auth';
import { createFakeCerita, type FakeCerita } from './ceritaFakeApi';

let fake: FakeCerita;
let sectionId: string;

const RAW_TERMS =
  /STALE_WRITE|HAS_DEPENDENTS|FIGURE_|\b409\b|\b400\b|\b500\b|sortOrder|expectedUpdatedAt|mediaId|\/api\/|undefined|\[object/;

async function mountEditor(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
  await useCeritaAdminStore().load();
  const wrapper = mount(CeritaSectionEditor, {
    props: { sectionId },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

function button(wrapper: VueWrapper, label: string): HTMLButtonElement {
  const found = Array.from(root(wrapper).querySelectorAll('button')).find((element) =>
    (element.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(label),
  );
  if (!found) throw new Error(`no button starting with "${label}"`);
  return found;
}

async function click(wrapper: VueWrapper, label: string): Promise<void> {
  button(wrapper, label).click();
  await flushPromises();
}

function pickFile(
  wrapper: VueWrapper,
  index: number,
  name: string,
  type: string,
  size = 2048,
): void {
  const input = wrapper.findAll('input[type="file"]')[index]!.element as HTMLInputElement;
  const picked = new File(['x'], name, { type });
  Object.defineProperty(picked, 'size', { value: size });
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function upload(wrapper: VueWrapper, index: number): Promise<void> {
  pickFile(wrapper, index, 'foto.jpg', 'image/jpeg');
  await flushPromises();
}

const root = (wrapper: VueWrapper): HTMLElement => wrapper.element as HTMLElement;

function lastEmitted(wrapper: VueWrapper, event: string): unknown[] | undefined {
  const events = wrapper.emitted(event) ?? [];
  return events[events.length - 1];
}

const headings = (wrapper: VueWrapper): string[] =>
  wrapper.findAll('[data-test="paragraph-heading"]').map((item) => item.text());

describe('CeritaSectionEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    let counter = 0;
    URL.createObjectURL = () => `blob:test-${++counter}`;
    URL.revokeObjectURL = () => undefined;
    fake = createFakeCerita();
    fake.addPage('Kependudukan', [{ title: 'Jumlah Penduduk', sections: ['Ringkasan'] }]);
    sectionId = fake.pages[0]!.chapters[0]!.sections[0]!.id;
    fake.install();
  });

  describe('paragraphs', () => {
    it('shows an empty state, then lists paragraphs in order with a short preview', async () => {
      const empty = await mountEditor();
      expect(empty.find('[data-test="paragraph-empty"]').text()).toContain('Belum ada paragraf');
      empty.unmount();

      fake.addParagraph(sectionId, 'Pembuka', 'Kelurahan Manggar berpenduduk '.repeat(10));
      fake.addParagraph(sectionId, 'Penutup', 'Sekian.');
      const wrapper = await mountEditor();

      expect(headings(wrapper)).toEqual(['Paragraf 1: Pembuka', 'Paragraf 2: Penutup']);
      const preview = wrapper.find('[data-test="paragraph-preview"]').text();
      expect(preview.endsWith('…')).toBe(true);
      expect(preview.length).toBeLessThanOrEqual(181);
      wrapper.unmount();
    });

    it('adds a paragraph: a title and text are required, then it is saved and focus returns to the add button', async () => {
      const wrapper = await mountEditor();

      await click(wrapper, 'Tambah paragraf');
      expect(wrapper.find('[data-test="paragraph-new"]').exists()).toBe(true);
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      const alert = wrapper.find('[role="alert"]').text();
      expect(alert).toContain('Judul paragraf wajib diisi.');
      expect(alert).toContain('Isi paragraf wajib diisi');
      expect(fake.writes()).toHaveLength(0);

      await wrapper.find('[data-test="paragraph-title"]').setValue('  Pembuka ');
      await wrapper.find('[data-test="paragraph-body"]').setValue('Isi paragraf pertama.');
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: `/api/sections/${sectionId}/content-blocks`,
        body: { title: 'Pembuka', body: 'Isi paragraf pertama.' },
      });
      expect(headings(wrapper)).toEqual(['Paragraf 1: Pembuka']);
      expect(wrapper.find('[data-test="paragraph-new"]').exists()).toBe(false);
      expect(document.activeElement?.id).toMatch(/-tambah$/);
      wrapper.unmount();
    });

    it('edits a paragraph with its own token and closes the form', async () => {
      const block = fake.addParagraph(sectionId, 'Pembuka', 'Lama.');
      const token = block.updatedAt;
      const wrapper = await mountEditor();

      await click(wrapper, 'Ubah');
      expect(
        (wrapper.find('[data-test="paragraph-title"]').element as HTMLInputElement).value,
      ).toBe('Pembuka');
      await wrapper.find('[data-test="paragraph-body"]').setValue('Baru.');
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PATCH',
        url: `/api/content-blocks/${block.slug}`,
        body: { title: 'Pembuka', body: 'Baru.', expectedUpdatedAt: token },
      });
      expect(wrapper.find('[data-test="paragraph-form"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="paragraph-preview"]').text()).toBe('Baru.');
      wrapper.unmount();
    });

    it('allows only one open form at a time and says why', async () => {
      fake.addParagraph(sectionId, 'Satu', 'a');
      fake.addParagraph(sectionId, 'Dua', 'b');
      const wrapper = await mountEditor();

      await click(wrapper, 'Ubah');

      const edits = wrapper.findAll('[data-test="paragraph-edit"]');
      expect(edits).toHaveLength(1);
      expect(edits[0]!.attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-test="paragraph-add"]').attributes('disabled')).toBeDefined();
      expect(wrapper.text()).toContain('Simpan atau batalkan paragraf yang sedang dibuka');
      wrapper.unmount();
    });

    it('locks reordering and deleting while a paragraph form is open, so its token stays valid', async () => {
      fake.addParagraph(sectionId, 'Satu', 'a');
      fake.addParagraph(sectionId, 'Dua', 'b');
      const wrapper = await mountEditor();

      await click(wrapper, 'Ubah');

      const items = wrapper.findAll('[data-test="paragraph-item"]');
      const second = items[1]!;
      const names = ['Naik', 'Turun', 'Hapus'];
      for (const name of names) {
        const control = second.findAll('button').find((b) => b.text().startsWith(name))!;
        expect(control.attributes('disabled')).toBeDefined();
      }
      wrapper.unmount();
    });

    it('reports an unsaved paragraph through dirty-change and clears it on cancel', async () => {
      fake.addParagraph(sectionId, 'Satu', 'a');
      const wrapper = await mountEditor();

      await click(wrapper, 'Ubah');
      await wrapper.find('[data-test="paragraph-body"]').setValue('berubah');
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([true]);

      await wrapper.find('[data-test="paragraph-cancel"]').trigger('click');
      await flushPromises();
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);
      wrapper.unmount();
    });

    it('keeps the typed text and shows plain words when saving fails', async () => {
      fake.addParagraph(sectionId, 'Satu', 'a');
      const wrapper = await mountEditor();
      await click(wrapper, 'Ubah');
      await wrapper.find('[data-test="paragraph-body"]').setValue('Teks panjang saya.');
      fake.failNext((r) => r.method === 'PATCH', fake.json({ error: 'SQL boom' }, 500));

      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      expect(
        (wrapper.find('[data-test="paragraph-body"]').element as HTMLTextAreaElement).value,
      ).toBe('Teks panjang saya.');
      const error = wrapper.find('[data-test="form-error"]').text();
      expect(error).toContain('Gagal menyimpan paragraf');
      expect(error).not.toMatch(RAW_TERMS);
      expect(error).not.toContain('SQL');
      wrapper.unmount();
    });

    it('keeps the draft on a stale save, reloads without losing it, and saves with the fresh token', async () => {
      const block = fake.addParagraph(sectionId, 'Satu', 'asli');
      const wrapper = await mountEditor();
      await click(wrapper, 'Ubah');
      await wrapper.find('[data-test="paragraph-body"]').setValue('draf saya');
      fake.touchBlock(block.slug);

      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      expect(wrapper.find('[data-test="paragraph-stale-notice"]').exists()).toBe(true);
      const error = wrapper.find('[data-test="form-error"]').text();
      expect(error).toContain('baru saja diubah oleh orang lain');
      expect(error).not.toMatch(RAW_TERMS);
      expect(
        (wrapper.find('[data-test="paragraph-body"]').element as HTMLTextAreaElement).value,
      ).toBe('draf saya');

      await wrapper.find('[data-test="paragraph-reload"]').trigger('click');
      await flushPromises();
      expect(
        (wrapper.find('[data-test="paragraph-body"]').element as HTMLTextAreaElement).value,
      ).toBe('draf saya');
      expect(wrapper.find('[data-test="paragraph-stale-notice"]').exists()).toBe(false);

      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();
      expect(fake.blocks[0]!.body).toBe('draf saya');
      wrapper.unmount();
    });

    describe('when "Muat versi terbaru" cannot reach the server', () => {
      const COULD_NOT_RELOAD = 'Belum bisa memuat versi terbaru. Periksa koneksi lalu coba lagi.';
      const failReload = (): void => {
        for (const url of ['/api/pages?include=sections', '/api/content-blocks']) {
          fake.failNext(
            (r) => r.method === 'GET' && r.url === url,
            fake.json({ error: 'SQL boom' }, 500),
          );
        }
      };
      const announced = (wrapper: VueWrapper): string =>
        wrapper
          .findAll('[role="status"]')
          .map((el) => el.text())
          .join(' | ');

      it('keeps the stale warning and the draft, says so plainly, and still refuses the save', async () => {
        const block = fake.addParagraph(sectionId, 'Satu', 'asli');
        const wrapper = await mountEditor();
        await click(wrapper, 'Ubah');
        await wrapper.find('[data-test="paragraph-body"]').setValue('draf saya');
        fake.touchBlock(block.slug);
        await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
        await flushPromises();
        expect(wrapper.find('[data-test="paragraph-stale-notice"]').exists()).toBe(true);

        failReload();
        await wrapper.find('[data-test="paragraph-reload"]').trigger('click');
        await flushPromises();

        expect(wrapper.find('[data-test="paragraph-stale-notice"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="form-error"]').text()).toBe(COULD_NOT_RELOAD);
        expect(announced(wrapper)).toContain(COULD_NOT_RELOAD);
        expect(announced(wrapper)).not.toContain('Versi terbaru dimuat');
        expect(
          (wrapper.find('[data-test="paragraph-body"]').element as HTMLTextAreaElement).value,
        ).toBe('draf saya');
        expect(
          wrapper.find('[data-test="paragraph-reload"]').attributes('disabled'),
        ).toBeUndefined();

        // Nothing new was seen, so the next save is refused again, now with a visible reason.
        await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
        await flushPromises();
        expect(fake.blocks[0]!.body).toBe('asli');
        expect(wrapper.find('[data-test="paragraph-stale-notice"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="form-error"]').text()).toContain('baru saja diubah');
        wrapper.unmount();
      });

      it('does the same for a refused reorder and a refused delete', async () => {
        const first = fake.addParagraph(sectionId, 'Satu', 'a');
        fake.addParagraph(sectionId, 'Dua', 'b');
        const wrapper = await mountEditor();

        fake.touchSection(sectionId);
        await click(wrapper, 'Turun paragraf 1');
        expect(wrapper.find('[data-test="paragraph-list-reload"]').exists()).toBe(true);
        failReload();
        await wrapper.find('[data-test="paragraph-list-reload"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-test="paragraph-list-reload"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="paragraph-list-error"]').text()).toContain(
          COULD_NOT_RELOAD,
        );
        expect(announced(wrapper)).not.toContain('Versi terbaru dimuat');

        // Reload properly, then provoke a stale delete and fail its reload too.
        await wrapper.find('[data-test="paragraph-list-reload"]').trigger('click');
        await flushPromises();
        await click(wrapper, 'Hapus paragraf 1');
        fake.touchBlock(first.slug);
        await wrapper.find('[data-test="paragraph-delete-yes"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-test="paragraph-delete-reload"]').exists()).toBe(true);
        failReload();
        await wrapper.find('[data-test="paragraph-delete-reload"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-test="paragraph-delete-reload"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="paragraph-delete-error"]').text()).toBe(COULD_NOT_RELOAD);
        expect(fake.blocks.map((b) => b.slug)).toContain(first.slug);
        wrapper.unmount();
      });
    });

    it('moves paragraphs with buttons using the section token and keeps focus usable', async () => {
      fake.addParagraph(sectionId, 'Satu', 'a');
      fake.addParagraph(sectionId, 'Dua', 'b');
      const wrapper = await mountEditor();
      const token = fake.pages[0]!.chapters[0]!.sections[0]!.updatedAt;
      expect(
        wrapper
          .findAll('button')
          .filter((b) => b.text().startsWith('Naik'))[0]!
          .attributes('disabled'),
      ).toBeDefined();

      await click(wrapper, 'Turun paragraf 1');

      expect(fake.lastWrite()).toMatchObject({
        method: 'PUT',
        url: `/api/sections/${sectionId}/content-blocks/reorder`,
        body: { expectedUpdatedAt: token },
      });
      expect(headings(wrapper)).toEqual(['Paragraf 1: Dua', 'Paragraf 2: Satu']);
      // "Satu" is now last, so the down button is disabled and focus moved to up.
      expect(document.activeElement?.id).toMatch(/-p-.*-naik$/);
      wrapper.unmount();
    });

    it('shows a stale reorder in plain words with a reload button', async () => {
      fake.addParagraph(sectionId, 'Satu', 'a');
      fake.addParagraph(sectionId, 'Dua', 'b');
      const wrapper = await mountEditor();
      fake.touchSection(sectionId);

      await click(wrapper, 'Turun paragraf 1');

      const error = wrapper.find('[data-test="paragraph-list-error"]');
      expect(error.text()).toContain('baru saja diubah oleh orang lain');
      expect(error.text()).not.toMatch(RAW_TERMS);
      expect(headings(wrapper)).toEqual(['Paragraf 1: Satu', 'Paragraf 2: Dua']);

      await wrapper.find('[data-test="paragraph-list-reload"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="paragraph-list-error"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('asks before deleting a paragraph, deletes it with its token and returns focus to the add button', async () => {
      const block = fake.addParagraph(sectionId, 'Satu', 'a');
      const token = block.updatedAt;
      const wrapper = await mountEditor();

      await click(wrapper, 'Hapus paragraf 1');
      expect(wrapper.find('[data-test="paragraph-delete-confirm"]').text()).toContain(
        'Hapus paragraf 1 “Satu”?',
      );
      expect(fake.writes()).toHaveLength(0);

      await wrapper.find('[data-test="paragraph-delete-yes"]').trigger('click');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'DELETE',
        url: `/api/content-blocks/${block.slug}?expectedUpdatedAt=${encodeURIComponent(token)}`,
      });
      expect(wrapper.find('[data-test="paragraph-empty"]').exists()).toBe(true);
      expect(document.activeElement?.id).toMatch(/-tambah$/);
      wrapper.unmount();
    });

    it('keeps the paragraph and explains when a delete fails or is stale', async () => {
      const block = fake.addParagraph(sectionId, 'Satu', 'a');
      const wrapper = await mountEditor();
      await click(wrapper, 'Hapus paragraf 1');
      fake.touchBlock(block.slug);

      await wrapper.find('[data-test="paragraph-delete-yes"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="paragraph-delete-error"]').text()).toContain(
        'baru saja diubah oleh orang lain',
      );
      expect(wrapper.find('[data-test="paragraph-delete-reload"]').exists()).toBe(true);
      expect(headings(wrapper)).toEqual(['Paragraf 1: Satu']);

      await wrapper.find('[data-test="paragraph-delete-reload"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-test="paragraph-delete-yes"]').trigger('click');
      await flushPromises();
      expect(fake.blocks).toHaveLength(0);
      wrapper.unmount();
    });
  });

  describe('a draft keeps the token it was opened with (no silent lost update)', () => {
    async function reloadScreen(): Promise<void> {
      await useCeritaAdminStore().load();
      await flushPromises();
    }

    async function savePhotoFigure(wrapper: VueWrapper): Promise<void> {
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
    }

    it('refuses a paragraph edit when another editor saved it after the form was opened', async () => {
      const block = fake.addParagraph(sectionId, 'Satu', 'asli');
      const wrapper = await mountEditor();
      await click(wrapper, 'Ubah');
      await wrapper.find('[data-test="paragraph-body"]').setValue('draf saya');

      fake.touchBlock(block.slug);
      // Saving the figure is an ordinary write elsewhere in the section; it reloads the data.
      await savePhotoFigure(wrapper);
      expect(fake.blocks.some((b) => b.type === 'figure')).toBe(true);

      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      expect(fake.blocks.find((b) => b.slug === block.slug)!.body).toBe('asli');
      expect(wrapper.find('[data-test="paragraph-stale-notice"]').exists()).toBe(true);
      expect(
        (wrapper.find('[data-test="paragraph-body"]').element as HTMLTextAreaElement).value,
      ).toBe('draf saya');

      await wrapper.find('[data-test="paragraph-reload"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();
      expect(fake.blocks.find((b) => b.slug === block.slug)!.body).toBe('draf saya');
      wrapper.unmount();
    });

    it('refuses a paragraph delete confirmed after another editor saved it', async () => {
      const block = fake.addParagraph(sectionId, 'Satu', 'asli');
      const wrapper = await mountEditor();
      await click(wrapper, 'Hapus paragraf 1');

      fake.touchBlock(block.slug);
      await reloadScreen();
      await wrapper.find('[data-test="paragraph-delete-yes"]').trigger('click');
      await flushPromises();

      expect(fake.blocks).toHaveLength(1);
      expect(wrapper.find('[data-test="paragraph-delete-error"]').text()).toContain(
        'baru saja diubah oleh orang lain',
      );

      await wrapper.find('[data-test="paragraph-delete-reload"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-test="paragraph-delete-yes"]').trigger('click');
      await flushPromises();
      expect(fake.blocks).toHaveLength(0);
      wrapper.unmount();
    });

    it('refuses a figure save when another editor replaced the figure, even after an own paragraph write reloaded the data', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');

      fake.changeFigureByOther(sectionId, {
        kind: 'photo',
        photos: [{ mediaId: 'media-other', alt: 'Foto editor lain' }],
      });
      await click(wrapper, 'Tambah paragraf');
      await wrapper.find('[data-test="paragraph-title"]').setValue('Pembuka');
      await wrapper.find('[data-test="paragraph-body"]').setValue('Isi.');
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      const stored = fake.blocks.find((b) => b.type === 'figure')!.metadata as {
        photos: { alt: string }[];
      };
      expect(stored.photos[0]!.alt).toBe('Foto editor lain');
      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(true);
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai kelurahan',
      );

      await wrapper.find('[data-test="figure-reload"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
      const after = fake.blocks.find((b) => b.type === 'figure')!.metadata as {
        photos: { alt: string }[];
      };
      expect(after.photos[0]!.alt).toBe('Balai kelurahan');
      wrapper.unmount();
    });

    async function staleFigureDraft(wrapper: VueWrapper): Promise<void> {
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');
      fake.changeFigureByOther(sectionId, {
        kind: 'photos',
        photos: [
          { mediaId: 'media-a', alt: 'A' },
          { mediaId: 'media-b', alt: 'B' },
          { mediaId: 'media-c', alt: 'C' },
        ],
      });
      // An own paragraph write reloads the shared data, so the tree is now newer than the draft.
      await click(wrapper, 'Tambah paragraf');
      await wrapper.find('[data-test="paragraph-title"]').setValue('Pembuka');
      await wrapper.find('[data-test="paragraph-body"]').setValue('Isi.');
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(true);
    }

    const otherFigure = (): { kind: string; photos: unknown[] } =>
      fake.blocks.find((b) => b.type === 'figure')!.metadata as { kind: string; photos: unknown[] };

    it("says plainly, before reloading, that saving will replace the other editor's version", async () => {
      const wrapper = await mountEditor();
      await staleFigureDraft(wrapper);

      const notice = wrapper.find('[data-test="figure-stale-notice"]').text();
      expect(notice).toContain('menggantikan versi');
      expect(notice).toContain('orang lain');
      wrapper.unmount();
    });

    it('does not move the draft to a newer token when the reload failed: saving is still refused', async () => {
      const wrapper = await mountEditor();
      await staleFigureDraft(wrapper);
      fake.failNext(
        (r) => r.method === 'GET' && r.url === '/api/pages?include=sections',
        fake.json({ error: 'SQL boom' }, 500),
      );

      await wrapper.find('[data-test="figure-reload"]').trigger('click');
      await flushPromises();

      // Still told that the version is old, with a plain reason; nothing replaced.
      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="figure-reloaded-notice"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="form-error"]').text()).not.toMatch(RAW_TERMS);

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
      expect(otherFigure().kind).toBe('photos');
      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('after a successful reload shows what was loaded and warns that saving replaces it', async () => {
      const wrapper = await mountEditor();
      await staleFigureDraft(wrapper);

      await wrapper.find('[data-test="figure-reload"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(false);
      const notice = wrapper.find('[data-test="figure-reloaded-notice"]').text();
      expect(notice).toContain('3 foto');
      expect(notice).toContain('menggantikan');
      // The draft itself is untouched.
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai kelurahan',
      );

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
      expect(otherFigure().kind).toBe('photo');
      expect(wrapper.find('[data-test="figure-reloaded-notice"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('drops the "reloaded" notice when the next save is refused again because the figure changed once more', async () => {
      const wrapper = await mountEditor();
      await staleFigureDraft(wrapper);
      await wrapper.find('[data-test="figure-reload"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="figure-reloaded-notice"]').exists()).toBe(true);

      fake.changeFigureByOther(sectionId, {
        kind: 'photos',
        photos: [
          { mediaId: 'media-a', alt: 'A2' },
          { mediaId: 'media-b', alt: 'B2' },
        ],
      });
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="figure-reloaded-notice"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('does not call an own paragraph write a conflict: the figure still saves afterwards', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');

      await click(wrapper, 'Tambah paragraf');
      await wrapper.find('[data-test="paragraph-title"]').setValue('Pembuka');
      await wrapper.find('[data-test="paragraph-body"]').setValue('Isi.');
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();
      // Another editor only added a paragraph; that does not touch this figure.
      fake.touchSection(sectionId);
      fake.addParagraph(sectionId, 'Dari editor lain', 'Isi lain.');
      await click(wrapper, 'Tambah paragraf');
      await wrapper.find('[data-test="paragraph-title"]').setValue('Kedua');
      await wrapper.find('[data-test="paragraph-body"]').setValue('Isi kedua.');
      await wrapper.find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toBe('Tersimpan: satu foto.');
      wrapper.unmount();
    });
  });

  describe('figure', () => {
    it('starts without a kind, says there is no figure and asks for a kind on save', async () => {
      const wrapper = await mountEditor();

      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toContain(
        'belum memiliki gambar',
      );
      expect(
        wrapper
          .findAll('input[type="radio"]')
          .every((r) => !(r.element as HTMLInputElement).checked),
      ).toBe(true);
      expect(wrapper.find('[data-test="figure-delete"]').exists()).toBe(false);

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      expect(wrapper.find('[role="alert"]').text()).toContain('Pilih jenis gambar');
      expect(fake.writes()).toHaveLength(0);
      wrapper.unmount();
    });

    it('saves one photo: upload, required description, optional caption and credit', async () => {
      const wrapper = await mountEditor();
      const token = fake.pages[0]!.chapters[0]!.sections[0]!.updatedAt;

      await wrapper.find('[data-test="kind-photo"]').setValue();
      expect(wrapper.findAll('[data-test="figure-photo-row"]')).toHaveLength(1);
      await upload(wrapper, 0);
      expect(wrapper.find('[data-test="photo-preview-image"]').exists()).toBe(true);

      // No description yet: refused with a plain sentence, nothing sent.
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      expect(wrapper.find('[role="alert"]').text()).toContain(
        'Teks pengganti untuk foto wajib diisi',
      );
      expect(fake.writes().filter((w) => w.url.includes('figure'))).toHaveLength(0);

      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan dari depan');
      await wrapper.find('[data-test="photo-caption"]').setValue('Tampak depan');
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PUT',
        url: `/api/sections/${sectionId}/figure`,
        body: {
          expectedUpdatedAt: token,
          figure: {
            kind: 'photo',
            photos: [
              {
                mediaId: expect.stringMatching(/^media-/) as string,
                alt: 'Balai kelurahan dari depan',
                caption: 'Tampak depan',
              },
            ],
          },
        },
      });
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toBe('Tersimpan: satu foto.');
      expect(wrapper.find('[data-test="figure-delete"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('starts a series with two photo slots, caps it at twelve and orders photos with buttons', async () => {
      const wrapper = await mountEditor();

      await wrapper.find('[data-test="kind-photos"]').setValue();
      expect(wrapper.findAll('[data-test="figure-photo-row"]')).toHaveLength(2);
      await wrapper.findAll('[data-test="photo-alt"]')[0]!.setValue('Pertama');
      await wrapper.findAll('[data-test="photo-alt"]')[1]!.setValue('Kedua');

      await click(wrapper, 'Turun foto 1');
      const alts = (): string[] =>
        wrapper
          .findAll('[data-test="photo-alt"]')
          .map((el) => (el.element as HTMLTextAreaElement).value);
      expect(alts()).toEqual(['Kedua', 'Pertama']);
      // The last row cannot go further down, so focus moved to its up button.
      expect(document.activeElement?.id).toMatch(/foto-1-naik$/);

      for (let i = 0; i < 10; i += 1) await click(wrapper, 'Tambah foto');
      expect(wrapper.findAll('[data-test="figure-photo-row"]')).toHaveLength(12);
      expect(wrapper.find('[data-test="add-photo"]').attributes('disabled')).toBeDefined();
      expect(wrapper.text()).toContain('12 dari 12 foto');

      await click(wrapper, 'Hapus foto 12');
      expect(wrapper.findAll('[data-test="figure-photo-row"]')).toHaveLength(11);
      wrapper.unmount();
    });

    it('saves a three-photo series in the chosen order', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photos"]').setValue();
      await click(wrapper, 'Tambah foto');
      for (let i = 0; i < 3; i += 1) {
        await upload(wrapper, i);
        await wrapper.findAll('[data-test="photo-alt"]')[i]!.setValue(`Foto ${i + 1}`);
      }
      await click(wrapper, 'Naik foto 3');

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      const figure = (
        fake.lastWrite()!.body as { figure: { kind: string; photos: { alt: string }[] } }
      ).figure;
      expect(figure.kind).toBe('photos');
      expect(figure.photos.map((p) => p.alt)).toEqual(['Foto 1', 'Foto 3', 'Foto 2']);
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toBe('Tersimpan: 3 foto.');
      wrapper.unmount();
    });

    it('refuses a series with fewer than two photos', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photos"]').setValue();
      await click(wrapper, 'Hapus foto 2');

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');

      expect(wrapper.find('[role="alert"]').text()).toContain('2 sampai 12');
      expect(fake.writes().filter((w) => w.url.includes('figure'))).toHaveLength(0);
      wrapper.unmount();
    });

    it('keeps the previous photo when a new upload is refused and says why', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      const before = wrapper.find('[data-test="photo-preview-image"]').attributes('src');

      pickFile(wrapper, 0, 'dokumen.pdf', 'application/pdf');
      await flushPromises();
      expect(wrapper.find('[data-test="photo-error"]').text()).toContain('JPEG, PNG, atau WebP');

      pickFile(wrapper, 0, 'besar.jpg', 'image/jpeg', 6 * 1024 * 1024);
      await flushPromises();
      expect(wrapper.find('[data-test="photo-error"]').text()).toContain('5 MB');

      expect(wrapper.find('[data-test="photo-preview-image"]').attributes('src')).toBe(before);
      wrapper.unmount();
    });

    it('saves a diagram made of bars, reading comma decimals', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-diagram"]').setValue();

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      const alert = wrapper.find('[role="alert"]').text();
      expect(alert).toContain('Judul diagram wajib diisi');
      expect(alert).toContain('gambar atau data batang');

      await wrapper.find('[data-test="diagram-title"]').setValue('Penduduk per RT');
      await wrapper.find('[data-test="bar-unit"]').setValue('jiwa');
      await click(wrapper, 'Tambah batang');
      await wrapper.find('[data-test="bar-label"]').setValue('RT 1');
      await wrapper.find('[data-test="bar-value"]').setValue('abc');
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      expect(wrapper.find('[role="alert"]').text()).toContain('angka yang valid');

      await wrapper.find('[data-test="bar-value"]').setValue('12.5');
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      expect(wrapper.find('[role="alert"]').text()).toContain('Gunakan koma untuk desimal');

      await wrapper.find('[data-test="bar-value"]').setValue('1.234,5');
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PUT',
        body: {
          figure: {
            kind: 'diagram',
            title: 'Penduduk per RT',
            bars: { unit: 'jiwa', items: [{ label: 'RT 1', value: 1234.5 }] },
          },
        },
      });
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toContain(
        'diagram “Penduduk per RT”',
      );
      wrapper.unmount();
    });

    it('requires a description for a diagram image', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-diagram"]').setValue();
      await wrapper.find('[data-test="diagram-title"]').setValue('Diagram');
      await upload(wrapper, 0);

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      expect(wrapper.find('[role="alert"]').text()).toContain(
        'Teks pengganti untuk gambar diagram wajib diisi',
      );

      await wrapper.find('[data-test="diagram-image-alt"]').setValue('Diagram batang penduduk');
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toContain('diagram');
      wrapper.unmount();
    });

    it('is not dirty just from choosing a kind, and only real edits make it dirty', async () => {
      const wrapper = await mountEditor();
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);

      await wrapper.find('[data-test="kind-photos"]').setValue();
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await wrapper.find('[data-test="kind-diagram"]').setValue();
      await click(wrapper, 'Tambah batang');
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);

      await wrapper.find('[data-test="diagram-title"]').setValue('Judul');
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([true]);
      wrapper.unmount();
    });

    it('does not count switching a stored photo to a series as an edit until a second photo is added', async () => {
      fake.blocks.push({
        id: 'fig-1',
        sectionId,
        type: 'figure',
        slug: `figure-${sectionId}`,
        title: null,
        body: '',
        metadata: { kind: 'photo', photos: [{ mediaId: 'media-9', alt: 'Balai' }] },
        sortOrder: null,
        updatedAt: '2026-11-13T10:00:00.000Z',
      });
      const wrapper = await mountEditor();

      await wrapper.find('[data-test="kind-photos"]').setValue();
      expect(wrapper.findAll('[data-test="figure-photo-row"]')).toHaveLength(2);
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);

      await upload(wrapper, 1);
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([true]);
      wrapper.unmount();
    });

    it('drops the hidden extra photos when saving as one photo so they cannot come back', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photos"]').setValue();
      for (let i = 0; i < 2; i += 1) {
        await upload(wrapper, i);
        await wrapper.findAll('[data-test="photo-alt"]')[i]!.setValue(`Foto ${i + 1}`);
      }
      await wrapper.find('[data-test="kind-photo"]').setValue();
      expect(wrapper.findAll('[data-test="figure-photo-row"]')).toHaveLength(1);
      expect(wrapper.find('[data-test="figure-extra-note"]').exists()).toBe(true);

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      const figure = (fake.lastWrite()!.body as { figure: { kind: string; photos: unknown[] } })
        .figure;
      expect(figure.kind).toBe('photo');
      expect(figure.photos).toHaveLength(1);

      await wrapper.find('[data-test="kind-photos"]').setValue();
      const rows = wrapper.findAll('[data-test="figure-photo-row"]');
      expect(rows).toHaveLength(2);
      expect(rows[1]!.find('[data-test="photo-preview"]').exists()).toBe(false);
      expect((rows[1]!.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        '',
      );
      wrapper.unmount();
    });

    it('loads a stored figure into the form and reverts edits on request', async () => {
      fake.blocks.push({
        id: 'fig-1',
        sectionId,
        type: 'figure',
        slug: `figure-${sectionId}`,
        title: null,
        body: '',
        metadata: { kind: 'photo', photos: [{ mediaId: 'media-9', alt: 'Balai', credit: 'Tim' }] },
        sortOrder: null,
        updatedAt: '2026-11-13T10:00:00.000Z',
      });
      const wrapper = await mountEditor();

      expect((wrapper.find('[data-test="kind-photo"]').element as HTMLInputElement).checked).toBe(
        true,
      );
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai',
      );
      expect((wrapper.find('[data-test="photo-credit"]').element as HTMLInputElement).value).toBe(
        'Tim',
      );
      expect(wrapper.find('[data-test="figure-revert"]').exists()).toBe(false);

      await wrapper.find('[data-test="photo-alt"]').setValue('Lain');
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([true]);
      await wrapper.find('[data-test="figure-revert"]').trigger('click');
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai',
      );
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);
      wrapper.unmount();
    });

    it('keeps the whole draft when saving fails and shows plain words', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');
      fake.failNext((r) => r.method === 'PUT', fake.json({ error: 'SQL boom' }, 500));

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      const error = wrapper.find('[data-test="form-error"]').text();
      expect(error).toContain('Gagal menyimpan gambar');
      expect(error).not.toMatch(RAW_TERMS);
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai kelurahan',
      );
      expect(wrapper.find('[data-test="photo-preview-image"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toContain(
        'belum memiliki gambar',
      );
      wrapper.unmount();
    });

    it('keeps the draft on a stale save and saves with the fresh token after a reload', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');
      fake.touchSection(sectionId);

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="form-error"]').text()).toContain(
        'baru saja diubah oleh orang lain',
      );

      await wrapper.find('[data-test="figure-reload"]').trigger('click');
      await flushPromises();
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai kelurahan',
      );
      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(false);

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toBe('Tersimpan: satu foto.');
      wrapper.unmount();
    });

    it('disables saving while a photo is uploading', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      let finish: (value: Response) => void = () => undefined;
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/media')
          return new Promise<Response>((resolve) => (finish = resolve));
        return original(input, init);
      }) as typeof fetch;

      pickFile(wrapper, 0, 'a.jpg', 'image/jpeg');
      await flushPromises();
      expect(wrapper.find('[data-test="figure-save"]').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-test="figure-save"]').text()).toContain('Menunggu unggahan');

      finish(
        fake.json(
          {
            media: {
              id: 'media-x',
              kind: 'photo',
              mimeType: 'image/webp',
              byteSize: 1,
              width: 1,
              height: 1,
              originalName: 'a.jpg',
              previewUrl: '/api/media/media-x/preview',
            },
          },
          201,
        ),
      );
      await flushPromises();
      expect(wrapper.find('[data-test="figure-save"]').attributes('disabled')).toBeUndefined();
      wrapper.unmount();
    });

    function holdNextUpload(): () => void {
      let finish: (value: Response) => void = () => undefined;
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/media') {
          return new Promise<Response>((resolve) => (finish = resolve));
        }
        return original(input, init);
      }) as typeof fetch;
      return () =>
        finish(
          fake.json(
            {
              media: {
                id: 'media-late',
                kind: 'photo',
                mimeType: 'image/webp',
                byteSize: 1,
                width: 1,
                height: 1,
                originalName: 'a.jpg',
                previewUrl: '/api/media/media-late/preview',
              },
            },
            201,
          ),
        );
    }

    it('locks the kind choice and the photo buttons while a photo is uploading', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photos"]').setValue();
      const finish = holdNextUpload();

      pickFile(wrapper, 0, 'a.jpg', 'image/jpeg');
      await flushPromises();

      for (const radio of wrapper.findAll('input[type="radio"]')) {
        // The fieldset around the radios is disabled, which disables each of them.
        expect((radio.element as HTMLInputElement).matches(':disabled')).toBe(true);
      }
      expect(wrapper.find('[data-test="add-photo"]').attributes('disabled')).toBeDefined();
      const removes = wrapper.findAll('button').filter((b) => b.text().startsWith('Hapus foto'));
      expect(removes.length).toBeGreaterThan(0);
      expect(removes.every((b) => b.attributes('disabled') !== undefined)).toBe(true);

      finish();
      await flushPromises();
      for (const radio of wrapper.findAll('input[type="radio"]')) {
        expect((radio.element as HTMLInputElement).matches(':disabled')).toBe(false);
      }
      wrapper.unmount();
    });

    it('does not stay blocked after the upload slot disappears mid-upload', async () => {
      fake.addPage('Pendidikan', [{ title: 'Tingkat', sections: ['Jenjang'] }]);
      const otherSection = fake.pages[1]!.chapters[0]!.sections[0]!.id;
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      holdNextUpload();

      pickFile(wrapper, 0, 'a.jpg', 'image/jpeg');
      await flushPromises();
      expect(wrapper.find('[data-test="figure-save"]').attributes('disabled')).toBeDefined();

      // The editor is pointed at another section, which replaces every photo slot.
      await wrapper.setProps({ sectionId: otherSection });
      await flushPromises();

      expect(wrapper.find('[data-test="figure-save"]').attributes('disabled')).toBeUndefined();
      expect(wrapper.find('[data-test="figure-save"]').text()).toBe('Simpan gambar');
      wrapper.unmount();
    });

    it('asks before deleting the figure, deletes it with the section token and says so', async () => {
      fake.blocks.push({
        id: 'fig-1',
        sectionId,
        type: 'figure',
        slug: `figure-${sectionId}`,
        title: null,
        body: '',
        metadata: { kind: 'photo', photos: [{ mediaId: 'media-9', alt: 'Balai' }] },
        sortOrder: null,
        updatedAt: '2026-11-13T10:00:00.000Z',
      });
      const wrapper = await mountEditor();
      const token = fake.pages[0]!.chapters[0]!.sections[0]!.updatedAt;

      await wrapper.find('[data-test="figure-delete"]').trigger('click');
      expect(wrapper.find('[data-test="figure-delete-confirm"]').text()).toContain(
        'Hapus gambar dari bagian ini?',
      );
      expect(fake.writes()).toHaveLength(0);

      await wrapper.find('[data-test="figure-delete-confirm-button"]').trigger('click');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'DELETE',
        url: `/api/sections/${sectionId}/figure?expectedUpdatedAt=${encodeURIComponent(token)}`,
      });
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toContain(
        'belum memiliki gambar',
      );
      expect(wrapper.find('[data-test="figure-delete-confirm"]').exists()).toBe(false);
      wrapper.unmount();
    });

    // The write works but the reload that follows it fails: the whole screen is offline again.
    const failPagesReload = (): void => {
      for (const url of ['/api/pages?include=sections', '/api/content-blocks']) {
        fake.failNext(
          (r) => r.method === 'GET' && r.url === url,
          fake.json({ error: 'SQL boom' }, 500),
        );
      }
    };
    const statusText = (wrapper: VueWrapper): string =>
      wrapper
        .findAll('[role="status"]')
        .map((el) => el.text())
        .join(' | ');

    it('keeps the draft when the figure was saved but the reload failed, and says so plainly', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');
      failPagesReload();

      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();

      // It was saved on the server...
      expect(fake.blocks.some((b) => b.type === 'figure')).toBe(true);
      // ...so the editor's photo and text must still be on screen, not reset to the old (empty) figure.
      expect(wrapper.find('[data-test="photo-preview-image"]').exists()).toBe(true);
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai kelurahan',
      );
      expect((wrapper.find('[data-test="kind-photo"]').element as HTMLInputElement).checked).toBe(
        true,
      );
      expect(statusText(wrapper)).toContain(
        'Gambar disimpan, tetapi halaman belum bisa dimuat ulang.',
      );
      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(true);
      // Nothing is left unsaved, so no discard prompt would fire.
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);

      // The reload notice brings the screen in line with what is stored, without touching the draft.
      await wrapper.find('[data-test="reload-notice-button"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toBe('Tersimpan: satu foto.');
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Balai kelurahan',
      );
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);

      // Saving again sends the same figure: no conflict and nothing is lost.
      await wrapper.find('[data-test="figure-editor"]').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(false);
      const stored = fake.blocks.find((b) => b.type === 'figure')!.metadata as {
        photos: { alt: string }[];
      };
      expect(stored.photos[0]!.alt).toBe('Balai kelurahan');
      wrapper.unmount();
    });

    it('shows the figure as gone when it was deleted but the reload failed, and offers the reload', async () => {
      fake.blocks.push({
        id: 'fig-1',
        sectionId,
        type: 'figure',
        slug: `figure-${sectionId}`,
        title: null,
        body: '',
        metadata: { kind: 'photo', photos: [{ mediaId: 'media-9', alt: 'Balai' }] },
        sortOrder: null,
        updatedAt: '2026-11-13T10:00:00.000Z',
      });
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="figure-delete"]').trigger('click');
      failPagesReload();

      await wrapper.find('[data-test="figure-delete-confirm-button"]').trigger('click');
      await flushPromises();

      expect(fake.blocks.some((b) => b.type === 'figure')).toBe(false);
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toContain(
        'belum memiliki gambar',
      );
      expect(wrapper.find('[data-test="figure-delete"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="figure-delete-confirm"]').exists()).toBe(false);
      expect((wrapper.find('[data-test="kind-photo"]').element as HTMLInputElement).checked).toBe(
        false,
      );
      expect(statusText(wrapper)).toContain(
        'Gambar dihapus, tetapi halaman belum bisa dimuat ulang.',
      );
      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(true);

      await wrapper.find('[data-test="reload-notice-button"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toContain(
        'belum memiliki gambar',
      );
      wrapper.unmount();
    });

    it('keeps the figure and explains when deleting it fails', async () => {
      fake.blocks.push({
        id: 'fig-1',
        sectionId,
        type: 'figure',
        slug: `figure-${sectionId}`,
        title: null,
        body: '',
        metadata: { kind: 'photo', photos: [{ mediaId: 'media-9', alt: 'Balai' }] },
        sortOrder: null,
        updatedAt: '2026-11-13T10:00:00.000Z',
      });
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="figure-delete"]').trigger('click');
      fake.failNext((r) => r.method === 'DELETE', fake.json({ error: 'x' }, 500));

      await wrapper.find('[data-test="figure-delete-confirm-button"]').trigger('click');
      await flushPromises();

      const error = wrapper.find('[data-test="figure-delete-error"]').text();
      expect(error).toContain('Gagal menghapus gambar');
      expect(error).not.toMatch(RAW_TERMS);
      expect(wrapper.find('[data-test="figure-stored-note"]').text()).toBe('Tersimpan: satu foto.');
      wrapper.unmount();
    });
  });

  it('labels every control and shows no raw API text', async () => {
    fake.addParagraph(sectionId, 'Satu', 'a');
    const wrapper = await mountEditor();
    await wrapper.find('[data-test="kind-photos"]').setValue();
    await click(wrapper, 'Tambah paragraf');

    const unlabelled = Array.from(
      root(wrapper).querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select'),
    ).filter((el) => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
      return !el.id || !root(wrapper).querySelector(`label[for="${el.id}"]`);
    });
    expect(unlabelled).toHaveLength(0);
    const unnamed = Array.from(root(wrapper).querySelectorAll('button')).filter(
      (el) => (el.textContent ?? '').trim() === '' && !el.getAttribute('aria-label'),
    );
    expect(unnamed).toHaveLength(0);
    expect(wrapper.text()).not.toMatch(RAW_TERMS);
    wrapper.unmount();
  });
});
