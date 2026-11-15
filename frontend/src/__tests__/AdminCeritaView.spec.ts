import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
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
let router: Router;

function seed(): void {
  fake.addPage('Kependudukan', [
    { title: 'Jumlah Penduduk', sections: ['Ringkasan', 'Rincian'] },
    { title: 'Jumlah Keluarga', sections: ['Ringkasan keluarga'] },
  ]);
  fake.addPage('Pendidikan', [{ title: 'Tingkat Pendidikan', sections: ['Jenjang'] }]);
  fake.addPage('Kesehatan', []);
}

/**
 * Mounts the screen at `/admin/cerita`. The default is the structure of the first page (the URL the
 * Edit button produces); pass `null` for the list, which is the screen's own default.
 */
async function mountView(slug: string | null = 'kependudukan'): Promise<VueWrapper> {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/cerita', name: 'admin-cerita', component: AdminCeritaView }],
  });
  await router.push(slug ? { name: 'admin-cerita', query: { halaman: slug } } : { name: 'admin-cerita' });
  await router.isReady();
  const wrapper = mount(AdminCeritaView, {
    global: { plugins: [createPinia(), router] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

async function mountList(): Promise<VueWrapper> {
  return mountView(null);
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

/** Page titles in the order the shared store holds them (what the list and the public site read). */
function pageOrder(): string[] {
  return useCeritaAdminStore().tree.map((item) => item.title);
}

/** Titles of the page cards on the list, in order. */
function pageTitles(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-test="card-title"]').map((item) => item.text().trim());
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
    it('shows the Cerita pages as cards in order, each with its author and dates', async () => {
      const wrapper = await mountList();

      expect(wrapper.find('[data-test="list-view"] h2').text()).toBe('Cerita');
      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan', 'Kesehatan']);
      const cards = wrapper.findAll('[data-test="page-card"]');
      expect(cards).toHaveLength(3);
      expect(cards[0]!.find('[data-test="card-author"]').text()).toBe('—');
      // The fake stamps 13 Nov 2026 10:00 UTC, the same calendar day in any timezone from UTC-10 to UTC+13.
      expect(cards[0]!.find('[data-test="card-created"]').text()).toBe('13 November 2026');
      expect(cards[0]!.find('[data-test="card-updated"]').text()).toBe('13 November 2026');
      expect(cards[0]!.find('[data-test="card-edit"]').text()).toContain('Edit');
      expect(cards[0]!.find('[data-test="card-delete"]').text()).toContain('Hapus');
      // Naik / Turun only show in Urutkan mode; the selection checkbox is always there.
      expect(cards[0]!.find('[data-test="card-up"]').exists()).toBe(false);
      expect(cards[0]!.find('input[type="checkbox"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('shows the chosen page with its chapters and sections, and no list', async () => {
      const wrapper = await mountView();

      expect(wrapper.find('[data-test="list-view"]').exists()).toBe(false);
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

    it('opens a page from its Edit button, moves focus to its heading and keeps one h2 per region', async () => {
      const wrapper = await mountList();

      await wrapper.findAll('[data-test="card-edit"]')[1]!.trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.query['halaman']).toBe('pendidikan');
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Pendidikan');
      expect(document.activeElement).toBe(wrapper.find('[data-test="page-heading"]').element);
      expect(wrapper.findAll('h2').map((item) => item.text())).toContain('Pendidikan');
      wrapper.unmount();
    });

    it('returns to the list with the back button and focuses the card it came from', async () => {
      const wrapper = await mountView('pendidikan');

      await wrapper.find('[data-test="back-to-list"]').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.query['halaman']).toBeUndefined();
      expect(wrapper.find('[data-test="list-view"]').exists()).toBe(true);
      expect(document.activeElement).toBe(
        document.getElementById('cerita-kartu-pendidikan-ubah'),
      );
      wrapper.unmount();
    });

    it('shows a plain notice for a page that is not there, with a way back', async () => {
      const wrapper = await mountView('tidak-ada');

      expect(wrapper.find('[data-test="page-missing"]').text()).toContain('tidak ditemukan');
      expect(wrapper.find('[data-test="back-to-list"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="page-heading"]').exists()).toBe(false);
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
      const wrapper = await mountView('kesehatan');
      expect(wrapper.find('[data-test="chapter-empty"]').text()).toContain('belum memiliki bab');

      await click('Tambah bab');
      await typeInto('[data-test="name-input"]', 'Ibu Hamil');
      await submitDialog();
      expect(wrapper.find('[data-test="section-empty"]').text()).toContain('belum memiliki bagian');
      wrapper.unmount();
    });

    it('shows a forbidden load failure without a retry button', async () => {
      fake.failNext((r) => r.url === '/api/pages?include=sections', fake.json({ error: 'x' }, 403));
      const wrapper = await mountView();

      expect(wrapper.find('[data-test="load-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="alert-banner-retry"]').exists()).toBe(false);
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

      await wrapper.find('[data-test="alert-banner-retry"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false);
      expect(pageOrder()).toContain('Kependudukan');
      wrapper.unmount();
    });
  });

  describe('pages', () => {
    it('adds a page: asks for a title, saves it, opens it and moves focus to its heading', async () => {
      const wrapper = await mountList();

      await click('Tambah Cerita');

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
      expect(router.currentRoute.value.query['halaman']).toBe('ekonomi-lokal');
      expect(wrapper.find('[data-test="page-heading"]').text()).toBe('Ekonomi Lokal');
      expect(document.activeElement).toBe(wrapper.find('[data-test="page-heading"]').element);
      expect(wrapper.find('[data-test="status"]').text()).toContain(
        'Halaman “Ekonomi Lokal” ditambahkan.',
      );
      wrapper.unmount();
    });

    it('keeps the typed title and explains plainly when a page title is already taken', async () => {
      const wrapper = await mountList();

      await click('Tambah Cerita');
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

    it('sets the headline and byline with the page token, keeps the title and focuses the button', async () => {
      const wrapper = await mountView();
      const token = fake.pages[0]!.updatedAt;

      await click('Judul utama & penulis');
      expect(body().find('[data-test="details-dialog"]').exists()).toBe(true);
      await typeInto('[data-test="details-headline"]', '  Potret Kependudukan ');
      await typeInto('[data-test="details-author"]', 'Tim Penyusun');
      await typeInto('[data-test="details-affiliation"]', '');
      await body().find('[data-test="details-dialog"]').trigger('submit');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PATCH',
        url: '/api/pages/kependudukan',
        body: {
          headline: 'Potret Kependudukan',
          bylineAuthor: 'Tim Penyusun',
          bylineAffiliation: null,
          expectedUpdatedAt: token,
        },
      });
      expect(fake.pages[0]!.title).toBe('Kependudukan');
      expect(body().find('[data-test="details-dialog"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="status"]').text()).toContain('Judul utama dan penulis');
      expect(document.activeElement).toBe(wrapper.find('[data-test="page-details"]').element);

      // Reopened with the stored values.
      await click('Judul utama & penulis');
      expect(
        (body().find('[data-test="details-headline"]').element as HTMLInputElement).value,
      ).toBe('Potret Kependudukan');
      wrapper.unmount();
    });

    it('refuses an affiliation without an author on the client and sends nothing', async () => {
      const wrapper = await mountView();
      await click('Judul utama & penulis');
      await typeInto('[data-test="details-affiliation"]', 'Kelurahan Manggar');
      await body().find('[data-test="details-dialog"]').trigger('submit');
      await flushPromises();
      expect(body().text()).toContain('Isi nama penulis jika afiliasi penulis diisi.');
      expect(fake.writes()).toHaveLength(0);
      wrapper.unmount();
    });

    it('keeps the typed headline on a stale save and saves after the dialog reload', async () => {
      const wrapper = await mountView();
      await click('Judul utama & penulis');
      await typeInto('[data-test="details-headline"]', 'Judul saya');
      fake.touchPage('kependudukan');

      await body().find('[data-test="details-dialog"]').trigger('submit');
      await flushPromises();
      expect(body().find('[data-test="details-stale"]').exists()).toBe(true);
      expect(
        (body().find('[data-test="details-headline"]').element as HTMLInputElement).value,
      ).toBe('Judul saya');
      expect(body().find('[data-test="details-error"]').text()).not.toMatch(RAW_TERMS);

      await body().find('[data-test="details-reload"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="details-stale"]').exists()).toBe(false);
      await body().find('[data-test="details-dialog"]').trigger('submit');
      await flushPromises();
      expect(body().find('[data-test="details-dialog"]').exists()).toBe(false);
      expect(fake.pages[0]!.headline).toBe('Judul saya');
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
      expect(pageOrder()).toEqual(['Pendidikan', 'Kependudukan', 'Kesehatan']);
      expect(wrapper.find('[data-test="status"]').text()).toContain('urutan 2 dari 3');
      expect(document.activeElement?.id).toBe('cerita-halaman-turun');

      await click('Turun halaman Kependudukan');
      expect(pageOrder()).toEqual(['Pendidikan', 'Kesehatan', 'Kependudukan']);
      // The last page cannot go further down, so focus moves to the other button.
      expect(wrapper.find('#cerita-halaman-turun').attributes('disabled')).toBeDefined();
      expect(document.activeElement?.id).toBe('cerita-halaman-naik');

      await click('Naik halaman Kependudukan');
      expect(pageOrder()).toEqual(['Pendidikan', 'Kependudukan', 'Kesehatan']);
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
      expect(pageOrder()).toEqual(['Kependudukan', 'Pendidikan', 'Kesehatan']);

      await wrapper.find('[data-test="action-reload"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="action-error"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('deletes an empty page from its structure after confirming, then returns to the list', async () => {
      const wrapper = await mountView('kesehatan');

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
      expect(router.currentRoute.value.query['halaman']).toBeUndefined();
      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan']);
      expect(wrapper.find('[data-test="page-heading"]').exists()).toBe(false);
      expect(document.activeElement).toBe(document.getElementById('cerita-tambah-halaman'));
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
      expect(error).toContain('masih berisi 2 paragraf.');
      expect(error).not.toMatch(RAW_TERMS);
      expect(error).not.toContain('blok konten:');
      expect(body().find('[data-test="delete-hint"]').text()).toContain('Ringkasan');
      // No confirm button is left; the way out is "Mengerti", and nothing was sent.
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);
      expect(body().find('[data-test="delete-cancel"]').text()).toBe('Mengerti');
      expect(fake.writes()).toHaveLength(0);
      expect(pageOrder()).toContain('Kependudukan');
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
      expect(error).toContain('Halaman ini belum bisa dihapus karena masih berisi 1 paragraf.');
      expect(error).not.toMatch(RAW_TERMS);
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);
      expect(pageOrder()).toContain('Kependudukan');
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
        'Bab ini belum bisa dihapus karena masih berisi 1 paragraf.',
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
        'Bagian ini belum bisa dihapus karena masih berisi 1 paragraf.',
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

      expect(body().find('[data-test="delete-error"]').text()).toContain('masih berisi 1 gambar.');
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
      const wrapper = await mountView('pendidikan');

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

  describe('when the reload after a saved change fails', () => {
    it('says the change is saved, offers a reload, and keeps a deleted page off the screen', async () => {
      const wrapper = await mountView('kesehatan');
      fake.failNext(
        (r) => r.method === 'GET' && r.url === '/api/pages?include=sections',
        fake.json({ error: 'SQL boom' }, 500),
      );

      await click('Hapus halaman Kesehatan');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      const notice = wrapper.find('[data-test="reload-notice"]');
      expect(notice.text()).toContain('sudah tersimpan');
      expect(notice.text()).toContain('belum bisa dimuat ulang');
      expect(notice.text()).not.toMatch(RAW_TERMS);
      expect(notice.text()).not.toContain('SQL');
      // The deleted page is gone: the screen is back on the list, without a dead structure view.
      expect(wrapper.find('[data-test="list-view"]').exists()).toBe(true);
      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan']);
      expect(wrapper.find('[data-test="page-heading"]').exists()).toBe(false);
      // The generic load error is replaced by this clearer notice.
      expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false);

      await wrapper.find('[data-test="reload-notice-button"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('shows the same notice inside the section editor after a paragraph is saved', async () => {
      const wrapper = await mountView();
      await click('Isi bagian Ringkasan');
      await click('Tambah paragraf');
      await body().find('[data-test="paragraph-title"]').setValue('Pembuka');
      await body().find('[data-test="paragraph-body"]').setValue('Isi.');
      fake.failNext(
        (r) => r.method === 'GET' && r.url === '/api/content-blocks',
        fake.json({ error: 'x' }, 500),
      );

      await body().find('[data-test="paragraph-form"]').trigger('submit');
      await flushPromises();

      expect(fake.blocks).toHaveLength(1);
      const notice = body().find('[data-test="section-editor"] [data-test="reload-notice"]');
      expect(notice.exists()).toBe(true);
      expect(notice.text()).toContain('sudah tersimpan');
      wrapper.unmount();
    });
  });

  describe('a draft keeps the token it was opened with (no silent lost update)', () => {
    // Another editor saves, and then something else on this screen reloads the shared data
    // (any other save does). The first submit of the already-open form must still be refused.
    async function otherEditorSavesThenScreenReloads(change: () => void): Promise<void> {
      change();
      await useCeritaAdminStore().load();
      await flushPromises();
    }

    it('refuses a page rename opened before another editor saved, then saves after a reload', async () => {
      const wrapper = await mountView();
      await click('Ubah judul halaman Kependudukan');
      await typeInto('[data-test="name-input"]', 'Judul saya');

      await otherEditorSavesThenScreenReloads(() => fake.touchPage('kependudukan'));
      await submitDialog();

      expect(fake.pages[0]!.title).toBe('Kependudukan');
      expect(body().find('[data-test="name-error"]').text()).toContain(
        'baru saja diubah oleh orang lain',
      );
      expect((body().find('[data-test="name-input"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );

      await body().find('[data-test="name-reload"]').trigger('click');
      await flushPromises();
      await submitDialog();
      expect(fake.pages[0]!.title).toBe('Judul saya');
      wrapper.unmount();
    });

    it('does the same for a chapter and a section rename', async () => {
      const wrapper = await mountView();
      const chapter = fake.pages[0]!.chapters[0]!;

      await click('Ubah judul bab Jumlah Penduduk');
      await typeInto('[data-test="name-input"]', 'Bab saya');
      await otherEditorSavesThenScreenReloads(() => fake.touchChapter(chapter.id));
      await submitDialog();
      expect(chapter.title).toBe('Jumlah Penduduk');
      expect(body().find('[data-test="name-error"]').text()).toContain('baru saja diubah');
      await body().find('[data-test="name-cancel"]').trigger('click');
      await flushPromises();

      const section = chapter.sections[0]!;
      await click('Ubah judul bagian Ringkasan');
      await typeInto('[data-test="name-input"]', 'Bagian saya');
      await otherEditorSavesThenScreenReloads(() => fake.touchSection(section.id));
      await submitDialog();
      expect(section.title).toBe('Ringkasan');
      expect(body().find('[data-test="name-error"]').text()).toContain('baru saja diubah');
      wrapper.unmount();
    });

    it('refuses a delete confirmed after another editor changed the page, until reloaded', async () => {
      const wrapper = await mountView('kesehatan');
      await click('Hapus halaman Kesehatan');

      await otherEditorSavesThenScreenReloads(() => fake.touchPage('kesehatan'));
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      expect(fake.pages.map((p) => p.slug)).toContain('kesehatan');
      expect(body().find('[data-test="delete-error"]').text()).toContain(
        'baru saja diubah oleh orang lain',
      );

      await body().find('[data-test="delete-reload"]').trigger('click');
      await flushPromises();
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(fake.pages.map((p) => p.slug)).not.toContain('kesehatan');
      wrapper.unmount();
    });
  });

  describe('when "Muat ulang" cannot reach the server', () => {
    const COULD_NOT_RELOAD = 'Belum bisa memuat versi terbaru. Periksa koneksi lalu coba lagi.';
    const failReload = (): void => {
      for (const url of ['/api/pages?include=sections', '/api/content-blocks']) {
        fake.failNext(
          (r) => r.method === 'GET' && r.url === url,
          fake.json({ error: 'SQL boom' }, 500),
        );
      }
    };

    it('keeps the stale notice and the typed title in the rename dialog, and still refuses the save', async () => {
      const wrapper = await mountView();
      await click('Ubah judul halaman Kependudukan');
      await typeInto('[data-test="name-input"]', 'Judul saya');
      fake.touchPage('kependudukan');
      await submitDialog();
      expect(body().find('[data-test="name-stale"]').exists()).toBe(true);

      failReload();
      await body().find('[data-test="name-reload"]').trigger('click');
      await flushPromises();

      expect(body().find('[data-test="name-stale"]').exists()).toBe(true);
      expect(body().find('[data-test="name-error"]').text()).toBe(COULD_NOT_RELOAD);
      expect((body().find('[data-test="name-input"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );

      // Nothing new was seen, so the old token is still used and the save is refused again.
      await submitDialog();
      expect(fake.pages[0]!.title).toBe('Kependudukan');
      expect(body().find('[data-test="name-error"]').text()).toContain('baru saja diubah');
      expect(body().find('[data-test="name-stale"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('keeps the stale notice and the confirm button in the delete dialog, and still refuses the delete', async () => {
      const wrapper = await mountView('kesehatan');
      await click('Hapus halaman Kesehatan');
      fake.touchPage('kesehatan');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="delete-reload"]').exists()).toBe(true);

      failReload();
      await body().find('[data-test="delete-reload"]').trigger('click');
      await flushPromises();

      expect(body().find('[data-test="delete-reload"]').exists()).toBe(true);
      expect(body().find('[data-test="delete-error"]').text()).toBe(COULD_NOT_RELOAD);

      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(fake.pages.map((p) => p.slug)).toContain('kesehatan');
      expect(body().find('[data-test="delete-error"]').text()).toContain('baru saja diubah');
      wrapper.unmount();
    });

    it('keeps the page-level stale banner when its reload fails', async () => {
      const wrapper = await mountView();
      // A chapter reorder carries the page's token, so another editor's save makes it stale.
      fake.touchPage('kependudukan');
      await click('Turun bab Jumlah Penduduk');
      expect(wrapper.find('[data-test="action-reload"]').exists()).toBe(true);

      failReload();
      await wrapper.find('[data-test="action-reload"]').trigger('click');
      await flushPromises();

      // The load-error banner already shows the failure, so the stale notice stays as it was
      // and does not gain a second, repeated "could not reload" banner.
      expect(wrapper.find('[data-test="load-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="action-reload"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="action-error"]').text()).not.toContain(COULD_NOT_RELOAD);
      expect(wrapper.find('[data-test="status"]').text()).toContain(COULD_NOT_RELOAD);
      expect(wrapper.find('[data-test="status"]').text()).not.toContain('Data terbaru dimuat');
      wrapper.unmount();
    });
  });

  describe('a session that ended', () => {
    it('hides the reload notice once the session has ended, and shows it before', async () => {
      const wrapper = await mountView();
      useCeritaAdminStore().reloadNeeded = true;
      await flushPromises();
      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(true);

      useAuthStore().markSessionEnded();
      await flushPromises();

      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('hides a session failure of a reorder once the layout notice covers it', async () => {
      const wrapper = await mountView();
      fake.failNext((r) => r.method === 'PUT', fake.json({ error: 'x' }, 401));
      await click('Turun bab Jumlah Penduduk');
      expect(wrapper.find('[data-test="action-error"]').exists()).toBe(true);

      useAuthStore().markSessionEnded();
      await flushPromises();

      expect(wrapper.find('[data-test="action-error"]').exists()).toBe(false);
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

      await click('Ubah judul halaman Kependudukan');
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

  describe('Cerita list', () => {
    it('labels the search box and names the toolbar buttons in their visible words', async () => {
      const wrapper = await mountList();

      const search = wrapper.find('[data-test="search"]').element as HTMLInputElement;
      expect(document.querySelector(`label[for="${search.id}"]`)?.textContent).toContain(
        'Cari Cerita',
      );
      expect(wrapper.find('[data-test="sort-toggle"]').text()).toBe('Urutkan Cerita');
      expect(wrapper.find('[data-test="select-all"]').text()).toBe('Pilih semua');
      expect(wrapper.find('[data-test="add-page"]').text()).toBe('Tambah Cerita');
      expect(wrapper.find('[data-test="sort-toggle"]').attributes('aria-pressed')).toBe('false');
      expect(wrapper.find('[data-test="bulk-delete"]').exists()).toBe(false);

      const unnamed = wrapper.findAll('button').filter((item) => item.text().trim() === '');
      expect(unnamed).toHaveLength(0);
      wrapper.unmount();
    });

    it('draws the Tambah Cerita icon in the same row as its label', async () => {
      const wrapper = await mountList();

      const icon = wrapper.find('[data-test="add-page"] [data-test="left-icon"]');
      expect(icon.exists()).toBe(true);
      expect(icon.find('svg').exists()).toBe(true);
      wrapper.unmount();
    });

    it('shows a checkbox on every card without any mode switch', async () => {
      const wrapper = await mountList();

      expect(wrapper.findAll('[data-test="page-checkbox"]')).toHaveLength(3);
      const boxes = wrapper.findAll('[data-test="page-checkbox"]');
      const label = document.querySelector(`label[for="${boxes[0]!.attributes('id')}"]`);
      expect(label?.textContent?.trim()).toBe('Pilih halaman Kependudukan');
      wrapper.unmount();
    });

    it('filters the cards by title as the editor types, and says how many match', async () => {
      const wrapper = await mountList();

      await typeInto('[data-test="search"]', 'Pendidikan');
      expect(pageTitles(wrapper)).toEqual(['Pendidikan']);
      expect(wrapper.find('[data-test="search-count"]').text()).toBe(
        'Menampilkan 1 dari 3 Cerita.',
      );

      await typeInto('[data-test="search"]', 'zzz');
      expect(wrapper.find('[data-test="search-empty"]').text()).toContain(
        'Tidak ada Cerita yang cocok',
      );
      expect(wrapper.find('[data-test="page-card"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('explains an empty site and still offers adding the first Cerita', async () => {
      fake.pages.splice(0, fake.pages.length);
      const wrapper = await mountList();

      expect(wrapper.find('[data-test="page-empty"]').text()).toContain('Belum ada Cerita');
      expect(wrapper.find('[data-test="add-page"]').attributes('disabled')).toBeUndefined();
      wrapper.unmount();
    });

    it('goes through select-all states: none, some (mixed) and all, then clears', async () => {
      const wrapper = await mountList();
      const selectAll = () => wrapper.find('[data-test="select-all"]');

      expect(selectAll().attributes('aria-checked')).toBe('false');
      await selectAll().trigger('click');
      expect(selectAll().attributes('aria-checked')).toBe('true');
      expect(selectAll().text()).toBe('Batal pilih semua');
      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('3 dipilih');
      expect(wrapper.find('[data-test="bulk-delete"]').text()).toBe('Hapus semua');
      expect(wrapper.findAll('[data-test="page-card"][data-selected="true"]')).toHaveLength(3);

      await selectAll().trigger('click');
      expect(selectAll().attributes('aria-checked')).toBe('false');
      expect(selectAll().text()).toBe('Pilih semua');
      expect(wrapper.find('[data-test="bulk-delete"]').exists()).toBe(false);

      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(true);
      expect(selectAll().attributes('aria-checked')).toBe('mixed');
      expect(selectAll().text()).toBe('Pilih semua');
      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('1 dipilih');
      wrapper.unmount();
    });

    it('selects only the cards the search shows when select-all is used', async () => {
      const wrapper = await mountList();

      await typeInto('[data-test="search"]', 'Pendidikan');
      await wrapper.find('[data-test="select-all"]').trigger('click');

      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('1 dipilih');
      expect(wrapper.find('[data-test="select-all"]').attributes('aria-checked')).toBe('true');
      wrapper.unmount();
    });

    it('gives a selected card a tinted fill and a stronger border, not only a checked box', async () => {
      const wrapper = await mountList();
      await wrapper.findAll('[data-test="page-checkbox"]')[1]!.setValue(true);

      const selected = wrapper.findAll('[data-test="page-card"]')[1]!;
      const plain = wrapper.findAll('[data-test="page-card"]')[0]!;
      expect(selected.classes()).toContain('bg-surface-hover');
      expect(selected.classes()).toContain('border-brand-navy');
      expect(plain.classes()).toContain('bg-surface');
      expect(plain.classes()).not.toContain('bg-surface-hover');
      wrapper.unmount();
    });

    it('deletes the selected empty pages one by one and reports the page that still holds content', async () => {
      const sectionId = fake.pages[1]!.chapters[0]!.sections[0]!.id;
      fake.addParagraph(sectionId, 'Ringkasan', 'Isi bagian.');
      const wrapper = await mountList();
      const bulk = () => wrapper.find('[data-test="bulk-delete"]');

      const boxes = wrapper.findAll('[data-test="page-checkbox"]');
      await boxes[0]!.setValue(true);
      await boxes[1]!.setValue(true);
      await flushPromises();
      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('2 dipilih');
      expect(bulk().text()).toBe('Hapus semua');

      await bulk().trigger('click');
      await flushPromises();
      expect(body().find('[data-test="bulk-items"]').text()).toContain('Kependudukan');
      expect(body().find('[data-test="bulk-items"]').text()).toContain('Pendidikan');
      expect(fake.writes()).toHaveLength(0);

      await body().find('[data-test="bulk-confirm"]').trigger('click');
      await flushPromises();

      const rows = body().findAll('[data-test="bulk-results"] li');
      expect(rows.map((row) => row.attributes('data-status'))).toEqual(['deleted', 'blocked']);
      expect(body().find('[data-test="bulk-summary"]').text()).toBe(
        '1 halaman dihapus, 1 tidak dihapus.',
      );
      expect(rows[1]!.text()).toContain('Pendidikan');
      expect(rows[1]!.text()).toContain('belum bisa dihapus');
      expect(fake.pages.map((item) => item.title)).toEqual(['Pendidikan', 'Kesehatan']);
      expect(document.activeElement?.getAttribute('data-test')).toBe('bulk-close');

      await body().find('[data-test="bulk-close"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="bulk-delete-dialog"]').exists()).toBe(false);
      // The page that was deleted leaves the selection; the blocked one stays selected.
      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('1 dipilih');
      expect(pageTitles(wrapper)).toEqual(['Pendidikan', 'Kesehatan']);
      wrapper.unmount();
    });

    it('refuses a page that changed after the dialog opened, and offers a reload', async () => {
      const wrapper = await mountList();
      await wrapper.findAll('[data-test="page-checkbox"]')[2]!.setValue(true);
      await wrapper.find('[data-test="bulk-delete"]').trigger('click');
      await flushPromises();

      // Another editor saves Kesehatan after the dialog has opened.
      fake.pages[2]!.updatedAt = '2030-01-01T00:00:00.000Z';
      await body().find('[data-test="bulk-confirm"]').trigger('click');
      await flushPromises();

      expect(body().find('[data-test="bulk-results"] li').attributes('data-status')).toBe(
        'failed',
      );
      expect(body().find('[data-test="bulk-stale"]').exists()).toBe(true);
      expect(fake.pages).toHaveLength(3);

      await body().find('[data-test="bulk-reload"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="bulk-stale"]').exists()).toBe(false);
      expect(body().find('[data-test="bulk-reload"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('moves a card down in Urutkan mode with its button, saves the order and keeps focus on that card', async () => {
      const wrapper = await mountList();

      await wrapper.find('[data-test="sort-toggle"]').trigger('click');
      expect(wrapper.find('[data-test="sort-toggle"]').attributes('aria-pressed')).toBe('true');
      expect(wrapper.findAll('[data-test="card-up"]')).toHaveLength(3);
      expect(wrapper.findAll('[data-test="card-up"]')[0]!.attributes('disabled')).toBeDefined();
      expect(wrapper.findAll('[data-test="card-down"]')[2]!.attributes('disabled')).toBeDefined();

      await wrapper.findAll('[data-test="card-down"]')[0]!.trigger('click');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({ method: 'PUT', url: '/api/pages/reorder' });
      expect(pageTitles(wrapper)).toEqual(['Pendidikan', 'Kependudukan', 'Kesehatan']);
      expect(wrapper.find('[data-test="status"]').text()).toContain('urutan 2 dari 3');
      expect(document.activeElement?.id).toBe('cerita-kartu-kependudukan-turun');
      wrapper.unmount();
    });

    it('drags a card by its grip with Urutkan off, shows a drop line and saves the new order', async () => {
      const wrapper = await mountList();
      const grip = () => wrapper.findAll('[data-test="grip"]')[0]!;
      expect(wrapper.find('[data-test="sort-toggle"]').attributes('aria-pressed')).toBe('false');
      expect(grip().attributes('draggable')).toBe('true');
      expect(grip().attributes('title')).toContain('Seret untuk mengubah urutan');

      await grip().trigger('dragstart');
      const target = wrapper.find('[data-slug="kesehatan"]');
      await target.trigger('dragover', { clientY: 0 });
      await flushPromises();
      expect(target.find('[data-test="drop-indicator"]').exists()).toBe(true);

      await target.trigger('drop', { clientY: 0 });
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({ method: 'PUT', url: '/api/pages/reorder' });
      expect(pageTitles(wrapper)).toEqual(['Pendidikan', 'Kesehatan', 'Kependudukan']);
      expect(wrapper.find('[data-test="status"]').text()).toContain('urutan 3 dari 3');
      expect(wrapper.find('[data-test="drop-indicator"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('disables the grip while a search filter is active, with the reason in its title', async () => {
      const wrapper = await mountList();
      await typeInto('[data-test="search"]', 'Pendidikan');
      const grip = wrapper.findAll('[data-test="grip"]')[0]!;

      expect(grip.attributes('draggable')).toBe('false');
      expect(grip.attributes('title')).toContain('pencarian aktif');

      // A drop while the filter is on is refused: nothing is sent.
      const before = fake.writes().length;
      await wrapper.find('[data-slug="pendidikan"]').trigger('drop', { clientY: 0 });
      await flushPromises();
      expect(fake.writes()).toHaveLength(before);

      await typeInto('[data-test="search"]', '');
      expect(wrapper.findAll('[data-test="grip"]')[0]!.attributes('draggable')).toBe('true');
      wrapper.unmount();
    });

    it('ignores a drop on the same card and sends nothing', async () => {
      const wrapper = await mountList();
      const before = fake.writes().length;

      await wrapper.findAll('[data-test="grip"]')[1]!.trigger('dragstart');
      await wrapper.find('[data-slug="pendidikan"]').trigger('drop', { clientY: 0 });
      await flushPromises();

      expect(fake.writes()).toHaveLength(before);
      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan', 'Kesehatan']);
      wrapper.unmount();
    });

    it('deletes one page from its card through the same confirmation as the structure view', async () => {
      const wrapper = await mountList();

      await wrapper.findAll('[data-test="card-delete"]')[2]!.trigger('click');
      expect(body().find('[data-test="delete-dialog"]').text()).toContain(
        'Hapus halaman “Kesehatan”?',
      );
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan']);
      expect(document.activeElement?.id).toBe('cerita-tambah-halaman');
      wrapper.unmount();
    });
  });
});
