import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import router from '../router/index';
import AdminTemplatKalimatView from '../views/AdminTemplatKalimatView.vue';
import { ADMIN_NAV, isAdminNavGroup } from '../config/adminNav';
import { useAuthStore } from '../stores/auth';
import type { ComparisonTemplate } from '../stores/comparisonTemplates.store';

const PATH = '/admin/sistem/templat-kalimat';

function makeTemplate(overrides: Partial<ComparisonTemplate> = {}): ComparisonTemplate {
  return {
    id: 'tpl-1',
    slug: 'perbandingan-tahunan',
    label: 'Perbandingan tahunan',
    body: 'Berdasarkan data {period_current}, {label} {value_current}, {trend}.',
    trendNaik: 'naik {delta}',
    trendTurun: 'turun {delta}',
    trendTetap: 'tidak berubah',
    usageCount: 0,
    createdAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

let templates: ComparisonTemplate[];
let deleteStatus: number;
let methods: string[];
let patchHandler: () => Response | Promise<Response>;

function installFetch(): void {
  methods = [];
  deleteStatus = 200;
  patchHandler = () => json({ template: templates[0] });
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
    methods.push(`${method} ${url}`);
    if (method === 'GET' && url === '/api/comparison-templates') return json({ templates });
    if (method === 'PATCH') return patchHandler();
    if (url === '/api/comparison-templates/preview') {
      return json({ valid: true, problems: [], previews: [] });
    }
    if (method === 'DELETE') {
      return deleteStatus === 200
        ? json({ template: templates[0] })
        : json({ error: 'Template masih dipakai 2 indikator.' }, deleteStatus);
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(AdminTemplatKalimatView, {
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

const bodyText = (): string => document.body.textContent ?? '';

describe('AdminTemplatKalimatView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    templates = [
      makeTemplate({ id: 'tpl-1', label: 'Perbandingan tahunan', usageCount: 2 }),
      makeTemplate({ id: 'tpl-2', label: 'Perbandingan umum', usageCount: 0 }),
    ];
    installFetch();
  });

  it('lists each template with its name, usage count, update date and actions', async () => {
    const wrapper = await mountView();

    const cards = wrapper.findAll('[data-test="template-card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain('Perbandingan tahunan');
    expect(cards[0]!.find('[data-test="usage"]').text()).toBe('Dipakai 2 indikator');
    expect(cards[0]!.text()).toContain('Terakhir diperbarui');
    expect(cards[0]!.find('[data-test="edit"]').attributes('aria-label')).toBe(
      'Ubah templat Perbandingan tahunan',
    );
    expect(cards[0]!.find('[data-test="delete"]').attributes('aria-label')).toBe(
      'Hapus templat Perbandingan tahunan',
    );
    wrapper.unmount();
  });

  it('derives the "Terpasang" badge from the real usage count, not a flag', async () => {
    const wrapper = await mountView();
    const [used, unused] = wrapper.findAll('[data-test="template-card"]');

    expect(used!.find('[data-test="badge-terpasang"]').text()).toBe('Terpasang');
    expect(used!.find('[data-test="badge-belum"]').exists()).toBe(false);
    expect(unused!.find('[data-test="badge-terpasang"]').exists()).toBe(false);
    expect(unused!.find('[data-test="badge-belum"]').text()).toBe('Belum dipakai');
    wrapper.unmount();
  });

  it('describes a template with chip names and no placeholder syntax', async () => {
    const wrapper = await mountView();

    const body = wrapper.find('[data-test="template-body"]').text();
    expect(body).toContain('[Periode sekarang]');
    expect(body).toContain('[Keterangan perubahan]');
    expect(wrapper.text()).not.toMatch(/[{}]|period_current|slug|perbandingan-tahunan/);
    wrapper.unmount();
  });

  it('updates the grid order immediately when a template is renamed to a different alphabetical position', async () => {
    const wrapper = await mountView();

    let cards = wrapper.findAll('[data-test="template-card"]');
    expect(cards[0]!.text()).toContain('Perbandingan tahunan');
    expect(cards[1]!.text()).toContain('Perbandingan umum');

    // Click edit on the second template ('Perbandingan umum')
    await cards[1]!.find('[data-test="edit"]').trigger('click');
    await flushPromises();

    // Rename 'Perbandingan umum' to 'A-Perbandingan awal' which sorts before 'Perbandingan tahunan'
    const name = document.body.querySelector<HTMLInputElement>('#templat-nama')!;
    name.value = 'A-Perbandingan awal';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    patchHandler = () =>
      json({
        template: {
          ...templates[1]!,
          label: 'A-Perbandingan awal',
          updatedAt: '2026-03-06T00:00:00.000Z',
        },
      });

    const form = document.body.querySelector<HTMLFormElement>('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    // After save, the grid is sorted by label: 'A-Perbandingan awal' is now first, 'Perbandingan tahunan' is second
    cards = wrapper.findAll('[data-test="template-card"]');
    expect(cards[0]!.text()).toContain('A-Perbandingan awal');
    expect(cards[1]!.text()).toContain('Perbandingan tahunan');

    wrapper.unmount();
  });

  it('shows an empty state when there are no templates', async () => {
    templates = [];
    const wrapper = await mountView();

    expect(wrapper.find('[data-test="empty"]').text()).toContain('Belum ada templat');
    wrapper.unmount();
  });

  it('shows a plain error with a retry when the list cannot be loaded', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/csrf-token') return json({ csrfToken: 'c' });
      return json({ error: 'ER_ACCESS_DENIED' }, 500);
    }) as typeof fetch;

    const wrapper = await mountView();

    const alert = wrapper.find('[data-test="list-error"]');
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toContain('Gagal memuat daftar templat kalimat.');
    expect(alert.text()).not.toMatch(/ER_ACCESS|500/);
    expect(wrapper.find('[data-test="alert-banner-retry"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([
    [403, true, false, false],
    [401, true, false, false],
    [401, false, false, true],
  ])(
    'list load failure with status %i: banner %s, retry %s (session ended %s)',
    async (status, banner, retry, ended) => {
      globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/auth/csrf-token') return json({ csrfToken: 'c' });
        return json({ error: 'x' }, status);
      }) as typeof fetch;

      const wrapper = await mountView();
      if (ended) {
        useAuthStore().sessionEnded = true;
        await flushPromises();
      }

      expect(wrapper.find('[data-test="list-error"]').exists()).toBe(banner);
      expect(wrapper.find('[data-test="alert-banner-retry"]').exists()).toBe(retry);
      wrapper.unmount();
    },
  );

  describe('delete', () => {
    it('confirms by naming the template, then deletes it', async () => {
      const wrapper = await mountView();
      await wrapper.findAll('[data-test="delete"]')[1]!.trigger('click');
      await flushPromises();

      expect(bodyText()).toContain('Hapus templat “Perbandingan umum”?');
      expect(bodyText()).toContain('tidak bisa dibatalkan');
      const confirm = document.body.querySelector<HTMLButtonElement>(
        '[data-test="confirm-delete"]',
      );
      expect(confirm?.textContent).toContain('Hapus “Perbandingan umum”');

      confirm!.click();
      await flushPromises();

      expect(methods).toContain('DELETE /api/comparison-templates/tpl-2');
      expect(wrapper.findAll('[data-test="template-card"]')).toHaveLength(1);
      wrapper.unmount();
    });

    it('explains an in-use template with its count and offers no delete action', async () => {
      const wrapper = await mountView();
      await wrapper.findAll('[data-test="delete"]')[0]!.trigger('click');
      await flushPromises();

      const message = document.body.querySelector('[data-test="delete-in-use"]')?.textContent ?? '';
      expect(message).toContain('masih dipakai 2 indikator');
      expect(message).toMatch(/Lepaskan atau ganti/);
      expect(document.body.querySelector('[data-test="confirm-delete"]')).toBeNull();
      expect(methods.some((m) => m.startsWith('DELETE'))).toBe(false);
      wrapper.unmount();
    });

    it('shows the same explanation when the server answers in-use for a stale count', async () => {
      const wrapper = await mountView();
      deleteStatus = 409;
      await wrapper.findAll('[data-test="delete"]')[1]!.trigger('click');
      await flushPromises();

      // Another admin attached it on the backend right after dialog was opened
      templates = [
        makeTemplate({ id: 'tpl-1', label: 'Perbandingan tahunan', usageCount: 2 }),
        makeTemplate({ id: 'tpl-2', label: 'Perbandingan umum', usageCount: 5 }),
      ];

      document.body.querySelector<HTMLButtonElement>('[data-test="confirm-delete"]')!.click();
      await flushPromises();

      const error = document.body.querySelector('[data-test="delete-error"]')?.textContent ?? '';
      expect(error).toContain('masih dipakai 5 indikator');
      expect(error).not.toMatch(/409|Template masih dipakai 2/);
      // The list now shows the refreshed count and the template is still there.
      expect(wrapper.findAll('[data-test="template-card"]')).toHaveLength(2);
      expect(wrapper.findAll('[data-test="usage"]')[1]!.text()).toBe('Dipakai 5 indikator');
      wrapper.unmount();
    });

    it('refreshes template usage count and shows busy state when opening delete dialog', async () => {
      const wrapper = await mountView();
      // Server usage count changed to 3 before clicking delete
      templates = [
        makeTemplate({ id: 'tpl-1', label: 'Perbandingan tahunan', usageCount: 2 }),
        makeTemplate({ id: 'tpl-2', label: 'Perbandingan umum', usageCount: 3 }),
      ];

      await wrapper.findAll('[data-test="delete"]')[1]!.trigger('click');

      // Dialog is busy/loading while fetching refreshed usage
      expect(document.body.querySelector('[data-test="delete-loading"]')).not.toBeNull();

      await flushPromises();

      // Refreshed usage is applied, showing in-use and blocking confirm
      expect(methods).toContain('GET /api/comparison-templates');
      expect(document.body.querySelector('[data-test="delete-loading"]')).toBeNull();
      const inUse = document.body.querySelector('[data-test="delete-in-use"]');
      expect(inUse?.textContent).toContain('masih dipakai 3 indikator');
      expect(document.body.querySelector('[data-test="confirm-delete"]')).toBeNull();
      wrapper.unmount();
    });

    it('keeps the template and shows approved wording on any other failure', async () => {
      const wrapper = await mountView();
      deleteStatus = 500;
      await wrapper.findAll('[data-test="delete"]')[1]!.trigger('click');
      await flushPromises();
      document.body.querySelector<HTMLButtonElement>('[data-test="confirm-delete"]')!.click();
      await flushPromises();

      const error = document.body.querySelector('[data-test="delete-error"]')?.textContent ?? '';
      expect(error).toContain('Gagal menghapus templat kalimat.');
      expect(error).not.toMatch(/500|Template masih/);
      expect(wrapper.findAll('[data-test="template-card"]')).toHaveLength(2);
      wrapper.unmount();
    });
  });

  describe('editor dialog', () => {
    const q = <T extends HTMLElement>(sel: string) => document.body.querySelector<T>(sel);
    const press = (key: string) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );

    async function openEditor() {
      const wrapper = await mountView();
      await wrapper.findAll('[data-test="edit"]')[0]!.trigger('click');
      await flushPromises();
      return wrapper;
    }

    it('closes without asking when nothing changed (Escape and Batal)', async () => {
      const wrapper = await openEditor();
      expect(q('[data-test="template-form"]')).not.toBeNull();

      press('Escape');
      await flushPromises();
      expect(q('[data-test="template-form"]')).toBeNull();
      expect(q('[data-test="discard-dialog"]')).toBeNull();

      await wrapper.findAll('[data-test="edit"]')[0]!.trigger('click');
      await flushPromises();
      const cancel = Array.from(document.body.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Batal',
      )!;
      cancel.click();
      await flushPromises();
      expect(q('[data-test="template-form"]')).toBeNull();
      expect(q('[data-test="discard-dialog"]')).toBeNull();
      wrapper.unmount();
    });

    it('asks before discarding a changed draft, and "Tetap di sini" keeps it', async () => {
      const wrapper = await openEditor();
      const name = q<HTMLInputElement>('#templat-nama')!;
      name.value = 'Nama baru';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();

      press('Escape');
      await flushPromises();
      const dialog = q('[data-test="discard-dialog"]');
      expect(dialog?.getAttribute('role')).toBe('alertdialog');
      expect(dialog?.textContent).toContain('Tutup tanpa menyimpan perubahan?');
      expect(document.activeElement).toBe(q('[data-test="discard-keep"]'));
      expect(q('[data-test="discard-keep"]')?.textContent).toContain('Tetap di sini');

      q<HTMLButtonElement>('[data-test="discard-keep"]')!.click();
      await flushPromises();
      expect(q('[data-test="discard-dialog"]')).toBeNull();
      expect(q<HTMLInputElement>('#templat-nama')!.value).toBe('Nama baru');
      expect(document.activeElement).toBe(q('#templat-nama'));
      wrapper.unmount();
    });

    it('treats Escape and a backdrop click on the prompt as "stay"', async () => {
      const wrapper = await openEditor();
      const name = q<HTMLInputElement>('#templat-nama')!;
      name.value = 'Nama baru';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();

      const dismissers: Array<() => void> = [
        () => press('Escape'),
        () =>
          (
            q('[data-test="discard-dialog"]')!.closest('[role="presentation"]') as HTMLElement
          ).click(),
      ];
      for (const dismiss of dismissers) {
        press('Escape');
        await flushPromises();
        expect(q('[data-test="discard-dialog"]')).not.toBeNull();

        dismiss();
        await flushPromises();
        expect(q('[data-test="discard-dialog"]')).toBeNull();
        expect(q('[data-test="template-form"]')).not.toBeNull();
        expect(q<HTMLInputElement>('#templat-nama')!.value).toBe('Nama baru');
      }
      wrapper.unmount();
    });

    it('returns focus to the opener after "Tutup tanpa menyimpan"', async () => {
      const wrapper = await mountView();
      const opener = wrapper.findAll('[data-test="edit"]')[0]!.element as HTMLElement;
      opener.focus();
      await wrapper.findAll('[data-test="edit"]')[0]!.trigger('click');
      await flushPromises();
      const name = q<HTMLInputElement>('#templat-nama')!;
      name.value = 'Nama baru';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();

      press('Escape');
      await flushPromises();
      q<HTMLButtonElement>('[data-test="discard-confirm"]')!.click();
      await flushPromises();
      expect(q('[data-test="template-form"]')).toBeNull();
      expect(document.activeElement).toBe(opener);
      wrapper.unmount();
    });

    it('closes for good on "Tutup tanpa menyimpan"', async () => {
      const wrapper = await openEditor();
      const name = q<HTMLInputElement>('#templat-nama')!;
      name.value = 'Nama baru';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();

      press('Escape');
      await flushPromises();
      expect(q('[data-test="discard-confirm"]')?.textContent).toContain('Tutup tanpa menyimpan');
      q<HTMLButtonElement>('[data-test="discard-confirm"]')!.click();
      await flushPromises();

      expect(q('[data-test="template-form"]')).toBeNull();
      expect(q('[data-test="discard-dialog"]')).toBeNull();
      wrapper.unmount();
    });

    it('cannot be dismissed while a save is in flight, and survives a failed save', async () => {
      const wrapper = await openEditor();
      let release: (r: Response) => void = () => {};
      patchHandler = () => new Promise<Response>((resolve) => (release = resolve));
      const name = q<HTMLInputElement>('#templat-nama')!;
      name.value = 'Nama baru';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();

      q<HTMLFormElement>('[data-test="template-form"]')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await flushPromises();
      expect(methods).toContain('PATCH /api/comparison-templates/tpl-1');

      press('Escape');
      q<HTMLElement>('.fixed.inset-0')!.click();
      await flushPromises();
      expect(q('[data-test="template-form"]')).not.toBeNull();
      expect(q('[data-test="discard-dialog"]')).toBeNull();
      expect(q<HTMLButtonElement>('button[aria-label="Tutup dialog"]')!.disabled).toBe(true);

      release(json({ error: 'gagal' }, 500));
      await flushPromises();
      expect(q('[data-test="template-form"]')).not.toBeNull();
      expect(q<HTMLInputElement>('#templat-nama')!.value).toBe('Nama baru');
      wrapper.unmount();
    });

    it('sets returnValue and calls preventDefault on beforeunload when dirty, but not when clean or closed', async () => {
      const wrapper = await openEditor();
      try {
        // clean editor
        const cleanEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(cleanEvent);
        expect(cleanEvent.defaultPrevented).toBe(false);

        // make dirty
        const name = q<HTMLInputElement>('#templat-nama')!;
        name.value = 'Nama baru';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        await flushPromises();

        let assignedReturnValue: unknown = undefined;
        const dirtyEvent = new Event('beforeunload', { cancelable: true });
        Object.defineProperty(dirtyEvent, 'returnValue', {
          get: () => assignedReturnValue,
          set: (v) => {
            assignedReturnValue = v;
          },
        });
        window.dispatchEvent(dirtyEvent);
        expect(dirtyEvent.defaultPrevented).toBe(true);
        expect(assignedReturnValue).toBe('');

        // after closing editor via discard
        press('Escape');
        await flushPromises();
        q<HTMLButtonElement>('[data-test="discard-confirm"]')!.click();
        await flushPromises();

        const closedEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(closedEvent);
        expect(closedEvent.defaultPrevented).toBe(false);
      } finally {
        wrapper.unmount();
      }
    });

    it('removes beforeunload listener on unmount', async () => {
      const wrapper = await openEditor();
      const name = q<HTMLInputElement>('#templat-nama')!;
      name.value = 'Nama baru';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();

      wrapper.unmount();

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it('guards router navigation via onBeforeRouteLeave when dirty', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);
      authStore.setAuth({ id: 'ad-1', email: 'admin@manggar.go.id', role: 'admin' }, 'token');
      await router.push(PATH);
      await router.isReady();

      const App = {
        template: '<router-view />',
      };
      const wrapper = mount(App, {
        global: { plugins: [pinia, router] },
        attachTo: document.body,
      });
      await flushPromises();

      const editButtons = document.body.querySelectorAll<HTMLButtonElement>('[data-test="edit"]');
      editButtons[0]!.click();
      await flushPromises();

      const name = q<HTMLInputElement>('#templat-nama')!;
      name.value = 'Nama baru';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();

      // Attempt navigation
      const navPromise1 = router.push('/admin');
      await flushPromises();

      // Prompt is visible and route stays on PATH
      expect(q('[data-test="discard-dialog"]')).not.toBeNull();
      expect(router.currentRoute.value.path).toBe(PATH);

      // "Tetap di sini" keeps draft and aborts navigation
      q<HTMLButtonElement>('[data-test="discard-keep"]')!.click();
      await flushPromises();
      await navPromise1;

      expect(q('[data-test="discard-dialog"]')).toBeNull();
      expect(router.currentRoute.value.path).toBe(PATH);
      expect(q<HTMLInputElement>('#templat-nama')!.value).toBe('Nama baru');

      // Attempt navigation again
      const navPromise2 = router.push('/admin');
      await flushPromises();
      expect(q('[data-test="discard-dialog"]')).not.toBeNull();

      // "Tutup tanpa menyimpan" navigates away
      q<HTMLButtonElement>('[data-test="discard-confirm"]')!.click();
      await flushPromises();
      await navPromise2;

      expect(router.currentRoute.value.path).toBe('/admin');
      wrapper.unmount();
    });
  });

  describe('access', () => {
    it('opens the authoring screen for an Admin only: an Editor is sent home even by direct URL', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);

      authStore.setAuth({ id: 'ed-1', email: 'editor@manggar.go.id', role: 'editor' }, 'token');
      await router.push('/admin');
      await router.push(PATH);
      expect(router.currentRoute.value.name).toBe('home');

      authStore.setAuth({ id: 'ad-1', email: 'admin@manggar.go.id', role: 'admin' }, 'token');
      await router.push(PATH);
      expect(router.currentRoute.value.path).toBe(PATH);
      expect(router.currentRoute.value.meta.requiresAdmin).toBe(true);
    });

    it('lists the screen in the sidebar for Admin only, without a "Segera hadir" badge', () => {
      const group = ADMIN_NAV.filter(isAdminNavGroup).flatMap((g) => g.items);
      const link = group.find((item) => item.to === PATH)!;

      expect(link.roles).toEqual(['admin']);
      expect(link.badge).toBeUndefined();
    });
  });
});
