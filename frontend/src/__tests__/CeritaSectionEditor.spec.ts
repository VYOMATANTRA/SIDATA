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

const root = (wrapper: VueWrapper): HTMLElement => wrapper.element as HTMLElement;

function lastEmitted(wrapper: VueWrapper, event: string): unknown[] | undefined {
  const events = wrapper.emitted(event) ?? [];
  return events[events.length - 1];
}

function textWrites(): Array<{ url: string; body: Record<string, unknown> }> {
  return fake.writes().filter((r) => r.url.includes('/text')) as Array<{
    url: string;
    body: Record<string, unknown>;
  }>;
}

function pickFile(wrapper: VueWrapper, index: number, name: string, type: string): void {
  const input = wrapper.findAll('input[type="file"]')[index]!.element as HTMLInputElement;
  const picked = new File(['x'], name, { type });
  Object.defineProperty(picked, 'size', { value: 2048 });
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function upload(wrapper: VueWrapper, index: number): Promise<void> {
  pickFile(wrapper, index, 'foto.jpg', 'image/jpeg');
  await flushPromises();
}

/** The editor's save, as the header button runs it. */
async function save(wrapper: VueWrapper): Promise<boolean> {
  const result = await (wrapper.vm as unknown as { save: () => Promise<boolean> }).save();
  await flushPromises();
  return result;
}

const titleInput = (wrapper: VueWrapper): HTMLInputElement =>
  wrapper.find('[data-test="section-title"]').element as HTMLInputElement;
const bodyInput = (wrapper: VueWrapper): HTMLTextAreaElement =>
  wrapper.find('[data-test="section-body"]').element as HTMLTextAreaElement;

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

  describe('text card', () => {
    it('loads the title and joins the prose blocks into one body with a blank line', async () => {
      fake.addParagraph(sectionId, 'Pertama', 'Paragraf pertama.');
      fake.addParagraph(sectionId, 'Kedua', 'Paragraf kedua.');
      const wrapper = await mountEditor();

      expect(titleInput(wrapper).value).toBe('Ringkasan');
      expect(bodyInput(wrapper).value).toBe('Paragraf pertama.\n\nParagraf kedua.');
      expect(wrapper.find('[data-test="section-legacy-note"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('is clean until something changes, and reports the draft', async () => {
      const wrapper = await mountEditor();
      expect(lastEmitted(wrapper, 'dirty-change')).toBeUndefined();

      await wrapper.find('[data-test="section-title"]').setValue('Judul lain');
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([true]);
      expect(lastEmitted(wrapper, 'draft-change')).toEqual([{ title: 'Judul lain', body: '' }]);

      await wrapper.find('[data-test="section-title"]').setValue('Ringkasan');
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);
      wrapper.unmount();
    });

    it('saves title and body in one request and merges several paragraphs into one', async () => {
      fake.addParagraph(sectionId, 'Pertama', 'Paragraf pertama.');
      fake.addParagraph(sectionId, 'Kedua', 'Paragraf kedua.');
      const wrapper = await mountEditor();

      await wrapper.find('[data-test="section-title"]').setValue('Bagian baru');
      await wrapper.find('[data-test="section-body"]').setValue('Isi gabungan.\n\nParagraf baru.');
      expect(await save(wrapper)).toBe(true);

      expect(textWrites()).toHaveLength(1);
      expect(textWrites()[0]!.body).toMatchObject({
        title: 'Bagian baru',
        body: 'Isi gabungan.\n\nParagraf baru.',
      });
      expect(wrapper.find('[data-test="section-legacy-note"]').exists()).toBe(false);
      expect(useCeritaAdminStore().paragraphsFor(sectionId)).toHaveLength(1);
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);
      expect(wrapper.find('[data-test="section-status"]').text()).toBe('Perubahan disimpan.');
      wrapper.unmount();
    });

    it('removes the text when the body is saved empty', async () => {
      fake.addParagraph(sectionId, 'Isi', 'Sesuatu.');
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="section-body"]').setValue('   ');
      expect(await save(wrapper)).toBe(true);
      expect(textWrites()[0]!.body).toMatchObject({ body: '' });
      expect(useCeritaAdminStore().paragraphsFor(sectionId)).toHaveLength(0);
      wrapper.unmount();
    });

    it('refuses an empty title and an HTML tag before sending anything', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="section-title"]').setValue('   ');
      expect(await save(wrapper)).toBe(false);
      expect(wrapper.find('[data-test="section-title-error"]').text()).toBe(
        'Judul bagian wajib diisi.',
      );

      await wrapper.find('[data-test="section-title"]').setValue('Judul');
      await wrapper.find('[data-test="section-body"]').setValue('Halo <b>dunia</b>');
      expect(await save(wrapper)).toBe(false);
      expect(wrapper.text()).toContain(
        'Isi konten tidak boleh mengandung tag HTML. Gunakan tombol format untuk huruf tebal, miring, tautan atau daftar',
      );
      expect(textWrites()).toHaveLength(0);
      wrapper.unmount();
    });

    it('keeps the typed text when the save is refused as stale, and saves after a reload', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="section-body"]').setValue('Draf saya.');

      // Another editor changes the section after this one opened it.
      fake.changeFigureByOther(sectionId, { kind: 'photo', photos: [] });
      expect(await save(wrapper)).toBe(false);
      expect(wrapper.find('[data-test="section-text-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="section-text-reload"]').exists()).toBe(true);
      expect(bodyInput(wrapper).value).toBe('Draf saya.');
      expect(wrapper.text()).not.toMatch(RAW_TERMS);

      await wrapper.find('[data-test="section-text-reload"]').trigger('click');
      await flushPromises();
      expect(bodyInput(wrapper).value).toBe('Draf saya.');
      expect(await save(wrapper)).toBe(true);
      expect(textWrites()).toHaveLength(2);
      wrapper.unmount();
    });
  });

  describe('figure and the combined save', () => {
    it('saves "1 gambar" through the editor: alt text is required, then the figure is stored', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);

      expect(await save(wrapper)).toBe(false);
      expect(wrapper.text()).toContain('Teks alternatif untuk foto wajib diisi');
      expect(fake.writes().filter((r) => r.url.includes('/figure'))).toHaveLength(0);

      await wrapper.find('[data-test="photo-alt"]').setValue('Balai kelurahan');
      await wrapper.find('[data-test="photo-caption"]').setValue('Tampak depan');
      await wrapper.find('[data-test="photo-credit"]').setValue('Dok. kelurahan');
      expect(await save(wrapper)).toBe(true);

      expect(fake.lastWrite()!.body).toMatchObject({
        figure: {
          kind: 'photo',
          photos: [
            {
              mediaId: expect.any(String),
              alt: 'Balai kelurahan',
              caption: 'Tampak depan',
              credit: 'Dok. kelurahan',
            },
          ],
        },
      });
      expect(lastEmitted(wrapper, 'dirty-change')).toEqual([false]);
      wrapper.unmount();
    });

    it('saves the text first and then the figure when both changed', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="section-title"]').setValue('Judul gabungan');
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Foto');

      expect(await save(wrapper)).toBe(true);
      const urls = fake.writes().map((r) => r.url);
      const textAt = urls.findIndex((url) => url.includes('/text'));
      const figureAt = urls.findIndex((url) => url.includes('/figure'));
      expect(textAt).toBeGreaterThanOrEqual(0);
      expect(figureAt).toBeGreaterThan(textAt);
      wrapper.unmount();
    });

    it('does not call its own text save a conflict: the figure still saves afterwards', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="section-body"]').setValue('Isi pertama.');
      expect(await save(wrapper)).toBe(true);

      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Foto');
      expect(await save(wrapper)).toBe(true);
      expect(fake.lastWrite()!.url).toContain('/figure');
      wrapper.unmount();
    });

    it('keeps the figure draft and says so when the figure was replaced elsewhere meanwhile', async () => {
      const wrapper = await mountEditor();
      await wrapper.find('[data-test="kind-photo"]').setValue();
      await upload(wrapper, 0);
      await wrapper.find('[data-test="photo-alt"]').setValue('Foto saya');

      fake.changeFigureByOther(sectionId, {
        kind: 'photo',
        photos: [{ mediaId: 'media-lain', alt: 'Foto orang lain' }],
      });
      expect(await save(wrapper)).toBe(false);
      expect(wrapper.find('[data-test="figure-stale-notice"]').exists()).toBe(true);
      expect((wrapper.find('[data-test="photo-alt"]').element as HTMLTextAreaElement).value).toBe(
        'Foto saya',
      );
      wrapper.unmount();
    });
  });

  it('has no save button of its own and labels every control', async () => {
    const wrapper = await mountEditor();
    expect(wrapper.find('[data-test="figure-save"]').exists()).toBe(false);
    expect(
      Array.from(root(wrapper).querySelectorAll('button')).some((b) =>
        /Simpan/.test(b.textContent ?? ''),
      ),
    ).toBe(false);

    const unlabelled = Array.from(
      root(wrapper).querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select'),
    ).filter((el) => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
      return !el.id || !root(wrapper).querySelector(`label[for="${el.id}"]`);
    });
    expect(unlabelled).toHaveLength(0);
    expect(wrapper.text()).not.toMatch(RAW_TERMS);
    wrapper.unmount();
  });
});
