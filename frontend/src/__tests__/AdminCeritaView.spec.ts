import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import { h } from 'vue';
import AdminCeritaView from '../views/AdminCeritaView.vue';
import AdminHeader from '../components/admin/AdminHeader.vue';
import { useAdminHeader } from '../composables/useAdminHeader';
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
async function mountView(
  slug: string | null = 'kependudukan',
  selection: Record<string, string> = {},
): Promise<VueWrapper> {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/cerita', name: 'admin-cerita', component: AdminCeritaView }],
  });
  await router.push(
    slug
      ? { name: 'admin-cerita', query: { halaman: slug, ...selection } }
      : { name: 'admin-cerita' },
  );
  await router.isReady();
  // Rendered through <RouterView>, as the app renders it: vue-router only runs the route's update
  // guards for a component it renders itself.
  const wrapper = mount(() => h('div', [h(AdminHeader), h(RouterView)]), {
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

async function submitDetailsDialog(): Promise<void> {
  await body().find('[data-test="details-dialog"]').trigger('submit');
  await flushPromises();
}

/** Clicks the Hapus button on the list card at `index` (the list order: Kependudukan, Pendidikan, Kesehatan). */
async function deleteCard(wrapper: VueWrapper, index: number): Promise<void> {
  await wrapper.findAll('[data-test="card-delete"]')[index]!.trigger('click');
  await flushPromises();
}

/** The spoken state of select-all: the text its aria-describedby points to, or undefined. */
function selectAllNote(wrapper: VueWrapper): string | undefined {
  const id = wrapper.find('[data-test="select-all"]').attributes('aria-describedby');
  return id ? (document.getElementById(id)?.textContent?.trim() ?? undefined) : undefined;
}

/** Page titles in the order the shared store holds them (what the list and the public site read). */
function pageOrder(): string[] {
  return useCeritaAdminStore().tree.map((item) => item.title);
}

/** Titles of the page cards on the list, in order. */
function pageTitles(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-test="card-title"]').map((item) => item.text().trim());
}

/** Title of a section row in the structure tree (without its number or figure label). */
function sectionTitleOf(row: Element): string {
  return (row.querySelector('[data-test="section-select"] .font-medium')?.textContent ?? '').trim();
}

/** Title of a chapter row in the tree, without the "Bab N · " prefix. */
function chapterTitleOf(row: Element): string {
  return (row.querySelector('[data-test="chapter-title"]')?.textContent ?? '')
    .replace(/^\s*Bab \S+ · /, '')
    .trim();
}

function sectionTitles(): string[] {
  return Array.from(document.querySelectorAll('[data-test="section-item"]')).map(sectionTitleOf);
}

function chapterTitles(): string[] {
  return Array.from(document.querySelectorAll('[data-test="chapter-item"]')).map(chapterTitleOf);
}

function sectionRow(title: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[data-test="section-item"]')).find(
    (item) => sectionTitleOf(item) === title,
  );
  if (!row) throw new Error(`no section row "${title}"`);
  return row;
}

function chapterRow(title: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[data-test="chapter-item"]')).find(
    (item) => chapterTitleOf(item) === title,
  );
  if (!row) throw new Error(`no chapter row "${title}"`);
  return row;
}

/** A button in a row's ⋯ menu. The menu is closed in the DOM, but its buttons are still there. */
function menuButton(row: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(row.querySelectorAll('button')).find(
    (item) => (item.textContent ?? '').trim() === label,
  );
  if (!found) throw new Error(`no "${label}" in that row`);
  return found;
}

async function clickMenu(row: HTMLElement, label: string): Promise<void> {
  menuButton(row, label).click();
  await flushPromises();
}

/** Selects a section in the tree (the centre column opens it). */
async function openSection(title: string): Promise<void> {
  sectionRow(title).querySelector<HTMLButtonElement>('[data-test="section-select"]')!.click();
  await flushPromises();
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
      expect(wrapper.find('[data-test="admin-header-title"]').text()).toBe('Kependudukan');
      expect(wrapper.findAll('[data-test="chapter-title"]').map((c) => c.text())).toEqual([
        'Bab 1 · Jumlah Penduduk',
        'Bab 2 · Jumlah Keluarga',
      ]);
      expect(sectionTitles()).toEqual(['Ringkasan', 'Rincian', 'Ringkasan keluarga']);
      expect(
        Array.from(wrapper.findAll('[data-test="section-select"]')).map((item) =>
          item.find('.tabular-nums').text(),
        ),
      ).toEqual(['1.1', '1.2', '2.1']);
      wrapper.unmount();
    });

    it('opens a page from its Edit button, moves focus to its heading and keeps one h2 per region', async () => {
      const wrapper = await mountList();

      await wrapper.findAll('[data-test="card-edit"]')[1]!.trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.query['halaman']).toBe('pendidikan');
      expect(wrapper.find('[data-test="admin-header-title"]').text()).toBe('Pendidikan');
      expect(document.activeElement).toBe(wrapper.find('[data-test="admin-header-title"]').element);
      wrapper.unmount();
    });

    it('returns to the list from the breadcrumb and focuses the card it came from', async () => {
      const wrapper = await mountView('pendidikan');

      await wrapper.find('nav[aria-label="Breadcrumb"] a').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.query['halaman']).toBeUndefined();
      expect(wrapper.find('[data-test="list-view"]').exists()).toBe(true);
      expect(document.activeElement).toBe(document.getElementById('cerita-kartu-pendidikan-ubah'));
      wrapper.unmount();
    });

    it('sets the shell header to the page (breadcrumb, title, headline) and hands it back in the list', async () => {
      fake.pages[0]!.headline = 'Potret Kependudukan';
      const wrapper = await mountView();
      const header = useAdminHeader();

      expect(header.title.value).toBe('Kependudukan');
      expect(header.subtitle.value).toBe('Potret Kependudukan');
      expect(header.compact.value).toBe(true);
      expect(header.trail.value).toEqual([
        { label: 'Cerita', to: '/admin/cerita' },
        { label: 'Kependudukan' },
      ]);
      expect(wrapper.find('[data-test="admin-header-title"]').text()).toBe('Kependudukan');
      expect(document.querySelector('#admin-header-actions [data-test="page-public-link"]')).not.toBeNull();

      await router.push({ name: 'admin-cerita' });
      await flushPromises();

      expect(header.trail.value).toBeNull();
      expect(header.compact.value).toBe(false);
      expect(document.querySelector('#admin-header-actions [data-test="page-public-link"]')).toBeNull();
      wrapper.unmount();
    });

    it('uses the fallback hint when the page has no headline', async () => {
      const wrapper = await mountView();
      expect(useAdminHeader().subtitle.value).toBe(
        'Perubahan langsung tampil di situs setelah disimpan.',
      );
      wrapper.unmount();
    });

    it('shows a plain notice for a page that is not there, with a way back', async () => {
      const wrapper = await mountView('tidak-ada');

      expect(wrapper.find('[data-test="page-missing"]').text()).toContain('tidak ditemukan');
      expect(wrapper.find('[data-test="back-to-list"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('offers a link to the public page that opens in a new tab with a spoken note', async () => {
      const wrapper = await mountView();

      const link = body().find('[data-test="page-public-link"]');
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
      expect(wrapper.find('[data-test="section-empty"]').text()).toContain('Belum ada bagian');
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
      expect(wrapper.find('[data-test="admin-header-title"]').text()).toBe('Ekonomi Lokal');
      expect(document.activeElement).toBe(wrapper.find('[data-test="admin-header-title"]').element);
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

    it('renames a page from Info cerita with its token and leaves the address alone', async () => {
      const wrapper = await mountView();
      const token = fake.pages[0]!.updatedAt;

      await click('Info cerita');
      expect((body().find('[data-test="details-title"]').element as HTMLInputElement).value).toBe(
        'Kependudukan',
      );
      await typeInto('[data-test="details-title"]', 'Kependudukan Manggar');
      await submitDetailsDialog();

      expect(fake.writes()[0]).toMatchObject({
        method: 'PATCH',
        url: '/api/pages/kependudukan',
        body: { title: 'Kependudukan Manggar', expectedUpdatedAt: token },
      });
      expect(fake.pages[0]!.title).toBe('Kependudukan Manggar');
      expect(wrapper.find('[data-test="admin-header-title"]').text()).toBe('Kependudukan Manggar');
      expect(body().find('[data-test="page-public-link"]').attributes('href')).toBe(
        '/cerita/kependudukan',
      );
      expect(document.activeElement).toBe(wrapper.find('[data-test="info-button"]').element);
      wrapper.unmount();
    });

    it('sets the headline and byline with the page token, keeps the title and focuses the button', async () => {
      const wrapper = await mountView();
      const token = fake.pages[0]!.updatedAt;

      await click('Info cerita');
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
      expect(document.activeElement).toBe(wrapper.find('[data-test="info-button"]').element);

      // Reopened with the stored values.
      await click('Info cerita');
      expect(
        (body().find('[data-test="details-headline"]').element as HTMLInputElement).value,
      ).toBe('Potret Kependudukan');
      wrapper.unmount();
    });

    it('refuses an affiliation without an author on the client and sends nothing', async () => {
      const wrapper = await mountView();
      await click('Info cerita');
      await typeInto('[data-test="details-affiliation"]', 'Kelurahan Manggar');
      await body().find('[data-test="details-dialog"]').trigger('submit');
      await flushPromises();
      expect(body().text()).toContain('Isi nama penulis jika afiliasi penulis diisi.');
      expect(fake.writes()).toHaveLength(0);
      wrapper.unmount();
    });

    it('keeps the typed headline on a stale save and saves after the dialog reload', async () => {
      const wrapper = await mountView();
      await click('Info cerita');
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

    it('keeps the draft on a stale title save, offers a reload that keeps it, then saves with the fresh token', async () => {
      const wrapper = await mountView();
      await click('Info cerita');
      await typeInto('[data-test="details-title"]', 'Judul saya');
      fake.touchPage('kependudukan');

      await submitDetailsDialog();

      expect(body().find('[data-test="details-dialog"]').exists()).toBe(true);
      expect((body().find('[data-test="details-title"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );
      const alert = body().find('[data-test="details-error"]').text();
      expect(alert).toContain('baru saja diubah oleh orang lain');
      expect(alert).not.toMatch(RAW_TERMS);
      expect(body().find('[data-test="details-stale"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="admin-header-title"]').text()).toBe('Kependudukan');

      await body().find('[data-test="details-reload"]').trigger('click');
      await flushPromises();
      expect((body().find('[data-test="details-title"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );
      expect(body().find('[data-test="details-stale"]').exists()).toBe(false);

      await submitDetailsDialog();
      expect(fake.pages[0]!.title).toBe('Judul saya');
      expect(wrapper.find('[data-test="admin-header-title"]').text()).toBe('Judul saya');
      wrapper.unmount();
    });

    it('keeps the typed title and explains plainly when the title save fails', async () => {
      const wrapper = await mountView();
      await click('Info cerita');
      await typeInto('[data-test="details-title"]', 'Judul baru');
      fake.failNext((r) => r.method === 'PATCH', fake.json({ error: 'x' }, 500));

      await submitDetailsDialog();

      expect((body().find('[data-test="details-title"]').element as HTMLInputElement).value).toBe(
        'Judul baru',
      );
      const error = body().find('[data-test="details-error"]').text();
      expect(error).toContain('Gagal mengubah judul halaman');
      expect(error).not.toMatch(RAW_TERMS);
      expect(fake.pages[0]!.title).toBe('Kependudukan');
      wrapper.unmount();
    });



    it('reports a stale reorder in plain words and reloads on request', async () => {
      const wrapper = await mountList();
      await wrapper.find('[data-test="sort-toggle"]').trigger('click');
      fake.failNext(
        (r) => r.url === '/api/pages/reorder',
        fake.json({ error: 'x', code: 'STALE_WRITE' }, 409),
      );

      await wrapper.findAll('[data-test="card-down"]')[0]!.trigger('click');
      await flushPromises();

      const error = wrapper.find('[data-test="action-error"]');
      expect(error.text()).toContain('baru saja diubah oleh orang lain');
      expect(error.text()).not.toMatch(RAW_TERMS);
      expect(pageOrder()).toEqual(['Kependudukan', 'Pendidikan', 'Kesehatan']);

      await wrapper.find('[data-test="action-reload"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="action-error"]').exists()).toBe(false);
      wrapper.unmount();
    });


    it('explains that empty chapters and sections go with a deleted page', async () => {
      const wrapper = await mountList();
      document.getElementById('cerita-kartu-kependudukan-hapus')?.focus();

      await deleteCard(wrapper, 0);

      expect(body().find('[data-test="delete-consequence"]').text()).toContain(
        '2 bab dan 3 bagian yang masih kosong',
      );
      await body().find('[data-test="delete-cancel"]').trigger('click');
      await flushPromises();
      expect(fake.pages).toHaveLength(3);
      expect(document.activeElement).toBe(
        document.getElementById('cerita-kartu-kependudukan-hapus'),
      );
      wrapper.unmount();
    });

    it('blocks deleting a page that still holds content at once, naming what holds it in plain words', async () => {
      const sectionId = fake.pages[0]!.chapters[0]!.sections[0]!.id;
      fake.addParagraph(sectionId, 'Pembuka', 'Isi.');
      fake.addParagraph(sectionId, 'Lanjutan', 'Isi.');
      const wrapper = await mountList();

      await deleteCard(wrapper, 0);

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
      const wrapper = await mountList();
      const sectionId = fake.pages[0]!.chapters[0]!.sections[0]!.id;
      fake.addParagraph(sectionId, 'Baru', 'Ditambah orang lain.');

      await deleteCard(wrapper, 0);
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
      expect(chapterTitles()).toContain('Rasio Jenis Kelamin');
      const newChapter = fake.pages[0]!.chapters[fake.pages[0]!.chapters.length - 1]!;
      expect(document.activeElement?.id).toBe(`cerita-bab-${newChapter.id}-tambah-bagian`);
      wrapper.unmount();
    });

    it('renames a chapter from its options menu with the chapter token', async () => {
      const wrapper = await mountView();
      const chapter = fake.pages[0]!.chapters[0]!;
      const token = chapter.updatedAt;

      await clickMenu(chapterRow('Jumlah Penduduk'), 'Ubah judul');
      await typeInto('[data-test="name-input"]', 'Penduduk Total');
      await submitDialog();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PATCH',
        url: `/api/chapters/${chapter.id}`,
        body: { title: 'Penduduk Total', expectedUpdatedAt: token },
      });
      expect(chapterTitles()[0]).toBe('Penduduk Total');
      wrapper.unmount();
    });

    it('blocks deleting a chapter whose section holds a paragraph, then deletes an empty one', async () => {
      const held = fake.pages[0]!.chapters[0]!.sections[0]!.id;
      fake.addParagraph(held, 'Pembuka', 'Isi.');
      const wrapper = await mountView();

      await clickMenu(chapterRow('Jumlah Penduduk'), 'Hapus bab');
      expect(body().find('[data-test="delete-error"]').text()).toContain(
        'Bab ini belum bisa dihapus karena masih berisi 1 paragraf.',
      );
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);
      await body().find('[data-test="delete-cancel"]').trigger('click');
      await flushPromises();
      expect(fake.writes()).toHaveLength(0);

      // The second chapter's only section is empty, so deleting the section and then the
      // chapter goes through.
      await clickMenu(sectionRow('Ringkasan keluarga'), 'Hapus bagian');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      await clickMenu(chapterRow('Jumlah Keluarga'), 'Hapus bab');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(chapterTitles()).toEqual(['Jumlah Penduduk']);
      expect(document.activeElement?.id).toBe('cerita-tambah-bab');
      wrapper.unmount();
    });
  });

  describe('sections', () => {
    it('adds a section and opens it in the centre column, with focus on its heading', async () => {
      const wrapper = await mountView();

      chapterRow('Jumlah Penduduk')
        .querySelector<HTMLButtonElement>('[data-test="section-add"]')!
        .click();
      await flushPromises();
      await typeInto('[data-test="name-input"]', 'Penduduk menurut usia');
      await submitDialog();

      const chapter = fake.pages[0]!.chapters[0]!;
      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: `/api/chapters/${chapter.id}/sections`,
        body: { title: 'Penduduk menurut usia' },
      });
      const created = chapter.sections[chapter.sections.length - 1]!;
      expect(sectionTitles()).toContain('Penduduk menurut usia');
      expect(router.currentRoute.value.query['bagian']).toBe(created.id);
      expect(wrapper.find('[data-test="section-heading"]').text()).toContain(
        'Penduduk menurut usia',
      );
      expect(document.activeElement?.id).toBe('cerita-bagian-judul');
      wrapper.unmount();
    });

    it('renames a section from its options menu with the section token', async () => {
      const wrapper = await mountView();
      const section = fake.pages[0]!.chapters[0]!.sections[0]!;
      const token = section.updatedAt;

      await clickMenu(sectionRow('Ringkasan'), 'Ubah judul');
      await typeInto('[data-test="name-input"]', 'Ringkasan umum');
      await submitDialog();

      expect(fake.lastWrite()).toMatchObject({
        method: 'PATCH',
        url: `/api/sections/${section.id}`,
        body: { title: 'Ringkasan umum', expectedUpdatedAt: token },
      });
      expect(sectionTitles()[0]).toBe('Ringkasan umum');
      wrapper.unmount();
    });

    it('moves a section down with its button and sends the chapter token', async () => {
      const wrapper = await mountView();
      const chapter = fake.pages[0]!.chapters[0]!;
      const token = chapter.updatedAt;

      await clickMenu(sectionRow('Ringkasan'), 'Turun');

      expect(fake.lastWrite()).toMatchObject({
        method: 'PUT',
        url: `/api/chapters/${chapter.id}/sections/reorder`,
        body: { expectedUpdatedAt: token },
      });
      expect(sectionTitles().slice(0, 2)).toEqual(['Rincian', 'Ringkasan']);
      expect(document.activeElement?.id).toBe(`cerita-pohon-bagian-${chapter.sections[0]!.id}`);
      wrapper.unmount();
    });

    it('blocks deleting a section that holds a paragraph and offers to open it', async () => {
      const section = fake.pages[0]!.chapters[0]!.sections[0]!;
      fake.addParagraph(section.id, 'Pembuka', 'Isi.');
      const wrapper = await mountView();

      await clickMenu(sectionRow('Ringkasan'), 'Hapus bagian');

      expect(body().find('[data-test="delete-error"]').text()).toContain(
        'Bagian ini belum bisa dihapus karena masih berisi 1 paragraf.',
      );
      expect(body().find('[data-test="delete-hint"]').text()).toContain('Buka isi bagian');
      expect(body().find('[data-test="delete-confirm"]').exists()).toBe(false);

      await body().find('[data-test="delete-action"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="delete-dialog"]').exists()).toBe(false);
      expect(router.currentRoute.value.query['bagian']).toBe(section.id);
      expect(wrapper.find('[data-test="section-heading"]').text()).toContain('Ringkasan');
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

      await clickMenu(sectionRow('Ringkasan'), 'Hapus bagian');

      expect(body().find('[data-test="delete-error"]').text()).toContain('masih berisi 1 gambar.');
      expect(body().find('[data-test="delete-action"]').text()).toBe('Buka isi bagian');
      expect(fake.writes()).toHaveLength(0);
      wrapper.unmount();
    });

    it("deletes an empty section and returns focus to the chapter's add button", async () => {
      const wrapper = await mountView();

      await clickMenu(sectionRow('Rincian'), 'Hapus bagian');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      expect(sectionTitles()).toEqual(['Ringkasan', 'Ringkasan keluarga']);
      expect(document.activeElement?.id).toBe(
        `cerita-bab-${fake.pages[0]!.chapters[0]!.id}-tambah-bagian`,
      );
      wrapper.unmount();
    });

    it('labels an untitled section by its position', async () => {
      fake.pages[1]!.chapters[0]!.sections[0]!.title = null;
      const wrapper = await mountView('pendidikan');

      expect(sectionTitles()).toEqual(['Bagian 1']);
      wrapper.unmount();
    });
  });

  describe('section selection and the centre column', () => {
    it('opens a section in the centre column with its number, breadcrumb and both editor cards', async () => {
      const wrapper = await mountView();

      await openSection('Ringkasan');

      expect(router.currentRoute.value.query['bagian']).toBe(
        fake.pages[0]!.chapters[0]!.sections[0]!.id,
      );
      expect(wrapper.find('[data-test="section-heading"]').text()).toBe('1.1 Ringkasan');
      expect(wrapper.find('[data-test="breadcrumb"]').text()).toContain('Bab 1 · Jumlah Penduduk');
      expect(wrapper.find('[data-test="breadcrumb"]').text()).toContain('Bagian 1.1');
      expect(body().find('[data-test="section-editor"]').exists()).toBe(true);
      expect(
        body()
          .find('[data-test="section-editor"]')
          .findAll('h3')
          .map((h) => h.text()),
      ).toEqual(['Paragraf', 'Gambar']);
      expect(wrapper.find('[data-test="section-select"][aria-current="true"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('restores the selection from the URL on a fresh mount', async () => {
      const section = fake.pages[0]!.chapters[0]!.sections[1]!;
      const wrapper = await mountView('kependudukan', {
        bab: fake.pages[0]!.chapters[0]!.id,
        bagian: section.id,
      });

      expect(wrapper.find('[data-test="section-heading"]').text()).toBe('1.2 Rincian');
      wrapper.unmount();
    });

    it('asks before switching to another section with an unsaved paragraph, and keeps the draft on "Tetap di sini"', async () => {
      const wrapper = await mountView();
      await openSection('Ringkasan');
      await click('Tambah paragraf');
      await body().find('[data-test="paragraph-title"]').setValue('Pembuka');
      await body().find('[data-test="paragraph-body"]').setValue('Isi.');

      await openSection('Rincian');

      expect(body().find('[data-test="discard-dialog"]').exists()).toBe(true);
      expect(router.currentRoute.value.query['bagian']).toBe(
        fake.pages[0]!.chapters[0]!.sections[0]!.id,
      );
      await body().find('[data-test="discard-keep"]').trigger('click');
      await flushPromises();
      expect(body().find('[data-test="discard-dialog"]').exists()).toBe(false);
      expect(router.currentRoute.value.query['bagian']).toBe(
        fake.pages[0]!.chapters[0]!.sections[0]!.id,
      );
      expect(body().find('[data-test="paragraph-title"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('switches section when the unsaved draft is discarded', async () => {
      const wrapper = await mountView();
      await openSection('Ringkasan');
      await click('Tambah paragraf');
      await body().find('[data-test="paragraph-body"]').setValue('Isi.');

      await openSection('Rincian');
      await body().find('[data-test="discard-confirm"]').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.query['bagian']).toBe(
        fake.pages[0]!.chapters[0]!.sections[1]!.id,
      );
      expect(wrapper.find('[data-test="section-heading"]').text()).toBe('1.2 Rincian');
      wrapper.unmount();
    });

    it('switches section without a question when nothing is unsaved', async () => {
      const wrapper = await mountView();
      await openSection('Ringkasan');

      await openSection('Rincian');

      expect(body().find('[data-test="discard-dialog"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="section-heading"]').text()).toBe('1.2 Rincian');
      wrapper.unmount();
    });

    it('moves between sections with the previous and next buttons and focuses the heading', async () => {
      const wrapper = await mountView();
      await openSection('Rincian');

      expect(wrapper.find('[data-test="section-prev"]').text()).toContain('1.1 Ringkasan');
      expect(wrapper.find('[data-test="section-next"]').text()).toContain('2.1 Ringkasan keluarga');
      await wrapper.find('[data-test="section-next"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="section-heading"]').text()).toBe('2.1 Ringkasan keluarga');
      expect(document.activeElement?.id).toBe('cerita-bagian-judul');
      wrapper.unmount();
    });

    it('duplicates the open section: the copy opens with its own paragraphs', async () => {
      const section = fake.pages[0]!.chapters[0]!.sections[0]!;
      fake.addParagraph(section.id, 'Pembuka', 'Isi pembuka.');
      const wrapper = await mountView();
      await openSection('Ringkasan');

      await wrapper.find('[data-test="section-duplicate"]').trigger('click');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({
        method: 'POST',
        url: `/api/sections/${section.id}/duplicate`,
        body: { expectedUpdatedAt: section.updatedAt },
      });
      expect(sectionTitles()).toEqual([
        'Ringkasan',
        'Rincian',
        'Ringkasan (salinan)',
        'Ringkasan keluarga',
      ]);
      const copy = fake.pages[0]!.chapters[0]!.sections[2]!;
      expect(router.currentRoute.value.query['bagian']).toBe(copy.id);
      expect(wrapper.find('[data-test="section-heading"]').text()).toContain('Ringkasan (salinan)');
      expect(document.activeElement?.id).toBe('cerita-bagian-judul');
      wrapper.unmount();
    });

    it('saves a paragraph in the centre column and the section token chains into the next write', async () => {
      const wrapper = await mountView();
      await openSection('Ringkasan');
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

    it('clears the centre column when its section is deleted elsewhere, and says so', async () => {
      const wrapper = await mountView();
      await openSection('Ringkasan');
      fake.pages[0]!.chapters[0]!.sections.shift();

      await useCeritaAdminStore().load();
      await flushPromises();

      expect(body().find('[data-test="section-editor"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="section-missing"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="status"]').text()).toContain('sudah tidak ada');
      wrapper.unmount();
    });
  });

  describe('when the reload after a saved change fails', () => {
    it('says the change is saved, offers a reload, and keeps a deleted page off the screen', async () => {
      const wrapper = await mountList();
      fake.failNext(
        (r) => r.method === 'GET' && r.url === '/api/pages?include=sections',
        fake.json({ error: 'SQL boom' }, 500),
      );

      await deleteCard(wrapper, 2);
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
      // The generic load error is replaced by this clearer notice.
      expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false);

      await wrapper.find('[data-test="reload-notice-button"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-test="reload-notice"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('shows the same notice inside the section editor after a paragraph is saved', async () => {
      const wrapper = await mountView();
      await openSection('Ringkasan');
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

    it('refuses a title save opened before another editor saved, then saves after a reload', async () => {
      const wrapper = await mountView();
      await click('Info cerita');
      await typeInto('[data-test="details-title"]', 'Judul saya');

      await otherEditorSavesThenScreenReloads(() => fake.touchPage('kependudukan'));
      await submitDetailsDialog();

      expect(fake.pages[0]!.title).toBe('Kependudukan');
      expect(body().find('[data-test="details-error"]').text()).toContain(
        'baru saja diubah oleh orang lain',
      );
      expect((body().find('[data-test="details-title"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );

      await body().find('[data-test="details-reload"]').trigger('click');
      await flushPromises();
      await submitDetailsDialog();
      expect(fake.pages[0]!.title).toBe('Judul saya');
      wrapper.unmount();
    });

    it('does the same for a chapter and a section rename', async () => {
      const wrapper = await mountView();
      const chapter = fake.pages[0]!.chapters[0]!;

      await clickMenu(chapterRow('Jumlah Penduduk'), 'Ubah judul');
      await typeInto('[data-test="name-input"]', 'Bab saya');
      await otherEditorSavesThenScreenReloads(() => fake.touchChapter(chapter.id));
      await submitDialog();
      expect(chapter.title).toBe('Jumlah Penduduk');
      expect(body().find('[data-test="name-error"]').text()).toContain('baru saja diubah');
      await body().find('[data-test="name-cancel"]').trigger('click');
      await flushPromises();

      const section = chapter.sections[0]!;
      await clickMenu(sectionRow('Ringkasan'), 'Ubah judul');
      await typeInto('[data-test="name-input"]', 'Bagian saya');
      await otherEditorSavesThenScreenReloads(() => fake.touchSection(section.id));
      await submitDialog();
      expect(section.title).toBe('Ringkasan');
      expect(body().find('[data-test="name-error"]').text()).toContain('baru saja diubah');
      wrapper.unmount();
    });

    it('refuses a delete confirmed after another editor changed the page, until reloaded', async () => {
      const wrapper = await mountList();
      await deleteCard(wrapper, 2);

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

    it('keeps the stale notice and the typed title in the info dialog, and still refuses the save', async () => {
      const wrapper = await mountView();
      await click('Info cerita');
      await typeInto('[data-test="details-title"]', 'Judul saya');
      fake.touchPage('kependudukan');
      await submitDetailsDialog();
      expect(body().find('[data-test="details-stale"]').exists()).toBe(true);

      failReload();
      await body().find('[data-test="details-reload"]').trigger('click');
      await flushPromises();

      expect(body().find('[data-test="details-stale"]').exists()).toBe(true);
      expect(body().find('[data-test="details-error"]').text()).toBe(COULD_NOT_RELOAD);
      expect((body().find('[data-test="details-title"]').element as HTMLInputElement).value).toBe(
        'Judul saya',
      );

      // Nothing new was seen, so the old token is still used and the save is refused again.
      await submitDetailsDialog();
      expect(fake.pages[0]!.title).toBe('Kependudukan');
      expect(body().find('[data-test="details-error"]').text()).toContain('baru saja diubah');
      expect(body().find('[data-test="details-stale"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('keeps the stale notice and the confirm button in the delete dialog, and still refuses the delete', async () => {
      const wrapper = await mountList();
      await deleteCard(wrapper, 2);
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
      await clickMenu(chapterRow('Jumlah Penduduk'), 'Turun');
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
      await clickMenu(chapterRow('Jumlah Penduduk'), 'Turun');
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

      await click('Info cerita');
      const input = body().find('[data-test="details-title"]').element as HTMLInputElement;
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
      // The magnifier is decoration only; the input keeps its own label.
      const icon = wrapper.find('[data-test="search"]').element.parentElement!.querySelector('svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(wrapper.find('[data-test="sort-toggle"]').text()).toBe('Urutkan Cerita');
      // Each action carries its icon on the label row, before the label.
      expect(wrapper.find('[data-test="sort-toggle"] [data-test="left-icon"] svg').exists()).toBe(
        true,
      );
      expect(wrapper.find('[data-test="card-edit"] [data-test="left-icon"] svg').exists()).toBe(
        true,
      );
      expect(wrapper.find('[data-test="card-delete"] [data-test="left-icon"] svg').exists()).toBe(
        true,
      );
      expect(wrapper.find('[data-test="card-edit"]').text()).toMatch(/^Edit/);
      expect(wrapper.find('[data-test="select-all"]').text()).toBe('Pilih semua');
      expect(wrapper.find('[data-test="add-page"]').text()).toBe('Tambah Cerita');
      expect(wrapper.find('[data-test="sort-toggle"]').attributes('aria-pressed')).toBe('false');
      expect(wrapper.find('[data-test="bulk-delete"]').exists()).toBe(false);

      const unnamed = wrapper
        .findAll('button')
        .filter((item) => item.text().trim() === '' && !item.attributes('aria-label'));
      expect(unnamed).toHaveLength(0);
      wrapper.unmount();
    });

    it('keeps a fixed selection row for the bulk actions and shows no explanatory hints above the cards', async () => {
      const wrapper = await mountList();
      const bar = () => wrapper.find('[data-test="selection-bar"]');

      // The row is always there, so selecting a card does not shift the cards below it.
      expect(bar().exists()).toBe(true);
      expect(bar().find('[data-test="bulk-delete"]').exists()).toBe(false);
      expect(bar().find('[data-test="selected-count"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="sort-hint"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="select-hint"]').exists()).toBe(false);

      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(true);
      expect(bar().find('[data-test="selected-count"]').text()).toBe('1 dipilih');
      expect(bar().find('[data-test="bulk-delete"]').text()).toBe('Hapus semua');
      // The bulk group sits inside the row, not in the toolbar that holds the search and buttons.
      expect(wrapper.find('[data-test="toolbar"] [data-test="bulk-delete"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="toolbar"] [data-test="selected-count"]').exists()).toBe(
        false,
      );
      wrapper.unmount();
    });

    it('hides Tambah Cerita and uses the primary style for select-all while cards are selected', async () => {
      const wrapper = await mountList();
      const add = () => wrapper.find('[data-test="add-page"]');
      const selectAll = () => wrapper.find('[data-test="select-all"]');

      expect(add().classes()).not.toContain('invisible');
      expect(selectAll().classes()).toContain('bg-surface');

      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(true);
      // `invisible` keeps the slot (no shift) and removes the button from focus and the a11y tree.
      expect(add().classes()).toContain('invisible');
      expect(selectAll().classes()).toContain('bg-brand-navy');
      expect(selectAll().text()).toBe('Pilih semua');

      await wrapper.findAll('[data-test="page-checkbox"]')[1]!.setValue(true);
      await wrapper.findAll('[data-test="page-checkbox"]')[2]!.setValue(true);
      expect(selectAll().text()).toBe('Batal pilih semua');
      expect(selectAll().classes()).toContain('bg-brand-navy');
      wrapper.unmount();
    });

    it('disables select-all when the search matches nothing, so nothing is announced as selected', async () => {
      const wrapper = await mountList();
      await typeInto('[data-test="search"]', 'zzz');

      expect(wrapper.find('[data-test="select-all"]').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-test="selected-count"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('moves focus to select-all after a card delete while cards are selected, since Tambah is hidden', async () => {
      const wrapper = await mountList();
      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(true);

      await wrapper.findAll('[data-test="card-delete"]')[2]!.trigger('click');
      await body().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      expect(pageTitles(wrapper)).toEqual(['Kependudukan', 'Pendidikan']);
      expect(document.activeElement?.id).toBe('cerita-pilih-semua');
      wrapper.unmount();
    });

    it('moves focus to select-all when the focused Hapus semua disappears', async () => {
      const wrapper = await mountList();
      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(true);
      const bulk = wrapper.find('[data-test="bulk-delete"]').element as HTMLButtonElement;
      bulk.focus();
      expect(document.activeElement).toBe(bulk);

      // Clearing the selection removes the bulk button; focus must not fall to the body.
      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(false);
      await flushPromises();

      expect(wrapper.find('[data-test="bulk-delete"]').exists()).toBe(false);
      expect(document.activeElement?.id).toBe('cerita-pilih-semua');
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

      // A plain button, not a checkbox: its name is the visible label and the state is a note.
      expect(selectAll().attributes('role')).toBeUndefined();
      expect(selectAll().text()).toBe('Pilih semua');
      expect(selectAllNote(wrapper)).toBeUndefined();
      await selectAll().trigger('click');
      expect(selectAllNote(wrapper)).toBe('semua dipilih');
      expect(selectAll().text()).toBe('Batal pilih semua');
      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('3 dipilih');
      expect(wrapper.find('[data-test="bulk-delete"]').text()).toBe('Hapus semua');
      expect(wrapper.findAll('[data-test="page-card"][data-selected="true"]')).toHaveLength(3);

      await selectAll().trigger('click');
      expect(selectAllNote(wrapper)).toBeUndefined();
      expect(selectAll().text()).toBe('Pilih semua');
      expect(wrapper.find('[data-test="bulk-delete"]').exists()).toBe(false);

      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(true);
      expect(selectAllNote(wrapper)).toBe('sebagian dipilih');
      expect(selectAll().text()).toBe('Pilih semua');
      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('1 dipilih');
      wrapper.unmount();
    });

    it('selects only the cards the search shows when select-all is used', async () => {
      const wrapper = await mountList();

      await typeInto('[data-test="search"]', 'Pendidikan');
      await wrapper.find('[data-test="select-all"]').trigger('click');

      expect(wrapper.find('[data-test="selected-count"]').text()).toBe('1 dipilih');
      expect(selectAllNote(wrapper)).toBe('semua dipilih');
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
      expect(bulk().find('[data-test="left-icon"] svg').exists()).toBe(true);

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
        '1 halaman dihapus, 1 tidak dapat dihapus.',
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

    it('reads each page token when that page is deleted, so an earlier delete that moves a later token on does not block it', async () => {
      // Deleting Kependudukan moves Pendidikan's token on (the server may renumber it). The matcher
      // only observes the request and answers false, so the real delete still runs.
      fake.failNext((r) => {
        if (r.method === 'DELETE' && r.url.startsWith('/api/pages/kependudukan')) {
          fake.touchPage('pendidikan');
        }
        return false;
      }, fake.json({}));
      const wrapper = await mountList();
      await wrapper.findAll('[data-test="page-checkbox"]')[0]!.setValue(true);
      await wrapper.findAll('[data-test="page-checkbox"]')[1]!.setValue(true);
      await wrapper.find('[data-test="bulk-delete"]').trigger('click');
      await flushPromises();

      await body().find('[data-test="bulk-confirm"]').trigger('click');
      await flushPromises();

      const rows = body().findAll('[data-test="bulk-results"] li');
      expect(rows.map((row) => row.attributes('data-status'))).toEqual(['deleted', 'deleted']);
      expect(fake.pages.map((item) => item.slug)).toEqual(['kesehatan']);
      wrapper.unmount();
    });

    it('refuses a page changed on the server since the list was loaded, and offers a reload', async () => {
      const wrapper = await mountList();
      await wrapper.findAll('[data-test="page-checkbox"]')[2]!.setValue(true);
      await wrapper.find('[data-test="bulk-delete"]').trigger('click');
      await flushPromises();

      // Another editor saves Kesehatan after the dialog has opened.
      fake.pages[2]!.updatedAt = '2030-01-01T00:00:00.000Z';
      await body().find('[data-test="bulk-confirm"]').trigger('click');
      await flushPromises();

      expect(body().find('[data-test="bulk-results"] li').attributes('data-status')).toBe('failed');
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
      // Focus stays on the moved card's Edit, which exists in every mode (not on Naik / Turun).
      expect(document.activeElement?.id).toBe('cerita-kartu-kependudukan-ubah');
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

    it('shows the category photo as a decorative thumbnail, and a placeholder for a page without one', async () => {
      fake.addPage('Halaman Baru', []);
      const wrapper = await mountList();

      const kependudukan = wrapper.find('[data-slug="kependudukan"]');
      const thumb = kependudukan.find('[data-test="thumbnail-image"]');
      expect(thumb.exists()).toBe(true);
      expect(thumb.attributes('alt')).toBe('');
      expect(thumb.attributes('loading')).toBe('lazy');
      expect(thumb.attributes('decoding')).toBe('async');
      expect(kependudukan.find('[data-test="thumbnail-placeholder"]').exists()).toBe(false);

      const fresh = wrapper.find('[data-slug="halaman-baru"]');
      expect(fresh.find('[data-test="thumbnail-image"]').exists()).toBe(false);
      expect(fresh.find('[data-test="thumbnail-placeholder"]').attributes('aria-hidden')).toBe(
        'true',
      );
      wrapper.unmount();
    });

    it('drops a card on the zone after the last card, which shows a line while hovered', async () => {
      const wrapper = await mountList();
      expect(wrapper.find('[data-test="drop-end"]').exists()).toBe(false);

      await wrapper.findAll('[data-test="grip"]')[0]!.trigger('dragstart');
      const zone = wrapper.find('[data-test="drop-end"]');
      expect(zone.exists()).toBe(true);
      await zone.trigger('dragover');
      await flushPromises();
      expect(wrapper.find('[data-test="drop-indicator"][data-edge="end"]').exists()).toBe(true);

      await zone.trigger('drop');
      await flushPromises();

      expect(fake.lastWrite()).toMatchObject({ method: 'PUT', url: '/api/pages/reorder' });
      expect(pageTitles(wrapper)).toEqual(['Pendidikan', 'Kesehatan', 'Kependudukan']);
      expect(document.activeElement?.id).toBe('cerita-kartu-kependudukan-ubah');
      expect(wrapper.find('[data-test="drop-end"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('gives the toolbar full-width stacked controls on phones and one row from md', async () => {
      const wrapper = await mountList();
      const toolbar = wrapper.find('[data-test="toolbar"]').classes();

      expect(toolbar).toContain('w-full');
      expect(toolbar).toContain('flex-col');
      expect(toolbar).toContain('md:flex-row');
      for (const selector of ['sort-toggle', 'select-all', 'add-page']) {
        expect(wrapper.find(`[data-test="${selector}"]`).classes()).toEqual(
          expect.arrayContaining(['w-full', 'md:w-auto']),
        );
      }
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

describe('AdminCeritaView chapter overview', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
    document.body.innerHTML = '';
    leaveGuards.length = 0;
    fake = createFakeCerita();
    seed();
    fake.install();
  });

  function overviewTitles(): string[] {
    return Array.from(document.querySelectorAll('[data-test="overview-title"]')).map((item) =>
      (item.textContent ?? '').trim(),
    );
  }

  function overviewCard(title: string): HTMLElement {
    const card = Array.from(
      document.querySelectorAll<HTMLElement>('[data-test="overview-item"]'),
    ).find(
      (item) =>
        (item.querySelector('[data-test="overview-title"]')?.textContent ?? '').trim() === title,
    );
    if (!card) throw new Error(`no overview card "${title}"`);
    return card;
  }

  async function openChapter(title: string): Promise<void> {
    chapterRow(title).querySelector<HTMLButtonElement>('[data-test="chapter-toggle"]')!.click();
    await flushPromises();
  }

  it('selecting a chapter in the tree shows its overview, not a section', async () => {
    const wrapper = await mountView();

    await openChapter('Jumlah Penduduk');

    expect(router.currentRoute.value.query['bagian']).toBeUndefined();
    expect(router.currentRoute.value.query['bab']).toBe(fake.pages[0]!.chapters[0]!.id);
    expect(wrapper.find('[data-test="overview-heading"]').text()).toBe(
      'Bab 1 dari 2 · Jumlah Penduduk',
    );
    expect(overviewTitles()).toEqual(['Ringkasan', 'Rincian']);
    expect(wrapper.find('[data-test="section-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the empty-chapter notice with the add panel', async () => {
    fake.addPage('Lingkungan', [{ title: 'Sampah' }]);
    fake.pages[3]!.chapters[0]!.sections = [];
    const wrapper = await mountView('lingkungan', { bab: fake.pages[3]!.chapters[0]!.id });

    expect(wrapper.find('[data-test="overview-empty"]').text()).toBe(
      'Belum ada bagian di bab ini.',
    );
    expect(wrapper.find('[data-test="add-section-panel"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('moves a section with its Turun button and keeps focus on the moved card', async () => {
    const wrapper = await mountView();
    await openChapter('Jumlah Penduduk');

    overviewCard('Ringkasan').querySelector<HTMLButtonElement>('[data-test="card-down"]')!.click();
    await flushPromises();

    expect(overviewTitles()).toEqual(['Rincian', 'Ringkasan']);
    expect(document.activeElement?.id).toBe(
      `cerita-ringkasan-bagian-${fake.pages[0]!.chapters[0]!.sections[0]!.id}`,
    );
    wrapper.unmount();
  });

  it('saves the chapter title with Simpan judul and shows it in the tree', async () => {
    const wrapper = await mountView();
    await openChapter('Jumlah Penduduk');

    const input = wrapper.get<HTMLInputElement>('[data-test="chapter-title-input"]');
    await input.setValue('Penduduk Desa');
    await wrapper.get('[data-test="chapter-title-save"]').trigger('click');
    await flushPromises();

    expect(fake.pages[0]!.chapters[0]!.title).toBe('Penduduk Desa');
    expect(chapterTitles()).toContain('Penduduk Desa');
    wrapper.unmount();
  });

  it('adds a section with a figure kind and opens it in the section editor', async () => {
    const wrapper = await mountView();
    await openChapter('Jumlah Penduduk');

    await wrapper.get('[data-test="tile-gallery"]').setValue(true);
    await wrapper.get('[data-test="add-section-title"]').setValue('Bagian Baru');
    await wrapper.get('[data-test="add-section-submit"]').trigger('click');
    await flushPromises();

    const added = fake.pages[0]!.chapters[0]!.sections.find((item) => item.title === 'Bagian Baru');
    expect(added).toBeDefined();
    expect(router.currentRoute.value.query['bagian']).toBe(added!.id);
    wrapper.unmount();
  });
});
