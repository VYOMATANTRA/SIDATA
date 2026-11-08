import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PublicSettingsForm from '../components/data/PublicSettingsForm.vue';
import DataManagementView from '../views/DataManagementView.vue';
import { DEFAULT_PUBLIC_SETTINGS, useSettingsStore } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth';
import { USER_MESSAGES } from '../utils/userMessages';
import { leafletState, resetLeafletMock } from './leafletMock';

vi.mock('leaflet', async () => (await import('./leafletMock')).createLeafletMock());

const SETTINGS = {
  ...DEFAULT_PUBLIC_SETTINGS,
  defaultCoordinates: { lat: -1.3, lon: 117.0, zoom: 15 },
};

function mountForm(props: Record<string, unknown> = {}) {
  return mount(PublicSettingsForm, {
    props: { settings: DEFAULT_PUBLIC_SETTINGS, ...props },
    attachTo: document.body,
  });
}

/** Simulates the editor panning and zooming the Leaflet map, as Leaflet would on `moveend`. */
function panTo(lat: number, lon: number, zoom: number): void {
  leafletState.center = { lat, lng: lon };
  leafletState.zoom = zoom;
  leafletState.handlers.moveend?.();
}

describe('PublicSettingsForm.vue', () => {
  beforeEach(() => {
    resetLeafletMock();
    document.body.innerHTML = '';
  });

  it('renders identity and contact fields and submits the existing payload shape', async () => {
    const wrapper = mountForm();
    await flushPromises();

    expect(wrapper.find('input#settings-appName').exists()).toBe(true);
    expect(wrapper.find('input#settings-institutionName').exists()).toBe(true);
    expect(wrapper.find('input#settings-contactPhone').exists()).toBe(true);

    await wrapper.find('input#settings-appName').setValue('SIDATA 2026');
    await wrapper.find('input#settings-contactPhone').setValue('081122334455');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toEqual({
      appName: 'SIDATA 2026',
      institutionName: DEFAULT_PUBLIC_SETTINGS.institutionName,
      tagline: DEFAULT_PUBLIC_SETTINGS.tagline,
      administrativeArea: DEFAULT_PUBLIC_SETTINGS.administrativeArea,
      contactPhone: '081122334455',
      contactWhatsapp: DEFAULT_PUBLIC_SETTINGS.contactWhatsapp,
      contactEmail: DEFAULT_PUBLIC_SETTINGS.contactEmail,
      contactAddress: DEFAULT_PUBLIC_SETTINGS.contactAddress,
      defaultCoordinates: { lat: -1.2251, lon: 116.9438, zoom: 13 },
    });
    wrapper.unmount();
  });

  it('never shows a latitude, longitude or zoom field', async () => {
    const wrapper = mountForm();
    await flushPromises();

    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0);
    for (const id of ['lat', 'lon', 'zoom']) {
      expect(wrapper.find(`#settings-${id}`).exists()).toBe(false);
    }
    expect(wrapper.text()).not.toMatch(/latitude|longitude|lintang|bujur|default zoom/i);
    expect(wrapper.text()).toContain('Atur tampilan peta');
    expect(wrapper.text()).toContain('Simpan perubahan');
    expect(wrapper.text()).toContain('Batal');
    wrapper.unmount();
  });

  it('opens the map on the stored default view', async () => {
    const wrapper = mountForm({ settings: SETTINGS });
    await flushPromises();
    expect(leafletState.center).toEqual({ lat: -1.3, lng: 117.0 });
    expect(leafletState.zoom).toBe(15);
    wrapper.unmount();
  });

  it('maps panning and zooming to the lat/lon/zoom payload the API accepts', async () => {
    const wrapper = mountForm({ settings: SETTINGS });
    await flushPromises();

    panTo(-1.2411, 116.9702, 16);
    await wrapper.find('form').trigger('submit.prevent');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload.defaultCoordinates).toEqual({ lat: -1.2411, lon: 116.9702, zoom: 16 });
    wrapper.unmount();
  });

  it('keeps the world-coordinate and zoom validation', async () => {
    const wrapper = mountForm({
      settings: { ...DEFAULT_PUBLIC_SETTINGS, defaultCoordinates: { lat: 95, lon: 10, zoom: 13 } },
    });
    await flushPromises();

    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.text()).toContain('Tampilan peta belum valid');

    // Choosing a point on the map repairs the draft (the picker normalises into range).
    leafletState.handlers.click?.({ latlng: { lat: -1.2, lng: 116.9 } });
    await flushPromises();
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toHaveLength(1);
    wrapper.unmount();
  });

  it('rejects a zoom outside 1 to 20', async () => {
    const wrapper = mountForm({
      settings: {
        ...DEFAULT_PUBLIC_SETTINGS,
        defaultCoordinates: { lat: -1.2, lon: 116.9, zoom: 25 },
      },
    });
    await flushPromises();
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toBeFalsy();
    wrapper.unmount();
  });

  it('validates invalid email format and prevents submission', async () => {
    const wrapper = mountForm();
    await wrapper.find('input#settings-contactEmail').setValue('invalid-email');
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.text()).toContain('Format email tidak valid.');
    wrapper.unmount();
  });

  it('reports accurate saved, unsaved, saving and failed state', async () => {
    const wrapper = mountForm();
    await flushPromises();
    const state = () => wrapper.get('[data-test="settings-save-state"]');
    expect(state().text()).toBe('Belum ada perubahan.');
    expect(state().attributes('aria-live')).toBe('polite');

    await wrapper.find('input#settings-tagline').setValue('Tagline baru');
    expect(state().text()).toBe('Ada perubahan yang belum disimpan.');

    await wrapper.setProps({ busy: true });
    expect(state().text()).toBe('Menyimpan perubahan…');

    await wrapper.setProps({ busy: false, serverError: 'Gagal menyimpan.' });
    expect(state().text()).toContain('Perubahan belum tersimpan');
    expect(state().text()).toContain('masih ada di formulir');
    wrapper.unmount();
  });

  it('treats a map move as an unsaved change and moving back as no change', async () => {
    const wrapper = mountForm({ settings: SETTINGS });
    await flushPromises();
    const state = () => wrapper.get('[data-test="settings-save-state"]').text();
    panTo(-1.31, 117.01, 15);
    await flushPromises();
    expect(state()).toBe('Ada perubahan yang belum disimpan.');
    panTo(-1.3, 117.0, 15);
    await flushPromises();
    expect(state()).toBe('Belum ada perubahan.');
    wrapper.unmount();
  });

  it('prevents duplicate submits while saving, even before the parent reports busy', async () => {
    const wrapper = mountForm();
    await flushPromises();
    void wrapper.find('form').trigger('submit.prevent');
    void wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.emitted('submit')).toHaveLength(1);

    await wrapper.setProps({ busy: true });
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toHaveLength(1);
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined();
    }
    wrapper.unmount();
  });

  it('can submit again after a failed save without losing the draft', async () => {
    const wrapper = mountForm({ settings: SETTINGS });
    await flushPromises();
    await wrapper.find('input#settings-tagline').setValue('Tagline pilihan');
    panTo(-1.25, 116.99, 14);

    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.setProps({ busy: true });
    await wrapper.setProps({ busy: false, serverError: 'Gagal menyimpan.' });
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toHaveLength(2);
    const retry = wrapper.emitted('submit')?.[1]?.[0] as Record<string, unknown>;
    expect(retry.tagline).toBe('Tagline pilihan');
    expect(retry.defaultCoordinates).toEqual({ lat: -1.25, lon: 116.99, zoom: 14 });
    wrapper.unmount();
  });

  it('exposes dirtiness and keeps every button at least 44px tall', async () => {
    const wrapper = mountForm();
    await flushPromises();
    expect((wrapper.vm as unknown as { isDirty: boolean }).isDirty).toBe(false);
    await wrapper.find('input#settings-appName').setValue('Lain');
    expect((wrapper.vm as unknown as { isDirty: boolean }).isDirty).toBe(true);
    const actions = wrapper
      .findAll('button')
      .filter((button) => ['Batal', 'Simpan perubahan'].includes(button.text()));
    expect(actions).toHaveLength(2);
    for (const button of actions) expect(button.classes()).toContain('min-h-11');
    wrapper.unmount();
  });

  it('emits cancel from the Batal button', async () => {
    const wrapper = mountForm();
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Batal');
    await cancel?.trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });

  it('lets the error summary focus the map controls', async () => {
    const wrapper = mountForm({
      settings: { ...DEFAULT_PUBLIC_SETTINGS, defaultCoordinates: { lat: 95, lon: 10, zoom: 13 } },
    });
    await flushPromises();
    await wrapper.find('form').trigger('submit.prevent');
    const target = document.getElementById('settings-mapView-focus');
    expect(target).not.toBeNull();
    expect(target?.tagName).toBe('DIV');
    wrapper.unmount();
  });

  it('preserves an in-progress draft when props.settings changes after mount', async () => {
    const wrapper = mountForm({ settings: DEFAULT_PUBLIC_SETTINGS });
    await flushPromises();

    await wrapper.find('input#settings-appName').setValue('Draft App Name');
    panTo(-1.24, 116.95, 16);
    await flushPromises();

    await wrapper.setProps({
      settings: {
        ...DEFAULT_PUBLIC_SETTINGS,
        appName: 'Refreshed From Store',
        defaultCoordinates: { lat: -1.22, lon: 116.92, zoom: 14 },
      },
    });
    await flushPromises();

    expect((wrapper.find('input#settings-appName').element as HTMLInputElement).value).toBe(
      'Draft App Name',
    );
    await wrapper.find('form').trigger('submit.prevent');
    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toMatchObject({
      appName: 'Draft App Name',
      defaultCoordinates: { lat: -1.24, lon: 116.95, zoom: 16 },
    });
    wrapper.unmount();
  });

  it('updates untouched fields and map view when props.settings changes and keeps isDirty false', async () => {
    const wrapper = mountForm({ settings: DEFAULT_PUBLIC_SETTINGS });
    await flushPromises();

    const refreshedSettings = {
      ...DEFAULT_PUBLIC_SETTINGS,
      tagline: 'Slogan Baru Dari Server',
      defaultCoordinates: { lat: -1.3, lon: 117.0, zoom: 15 },
    };
    await wrapper.setProps({ settings: refreshedSettings });
    await flushPromises();

    expect((wrapper.find('input#settings-tagline').element as HTMLInputElement).value).toBe(
      'Slogan Baru Dari Server',
    );
    expect(leafletState.center).toEqual({ lat: -1.3, lng: 117.0 });
    expect(leafletState.zoom).toBe(15);
    expect(wrapper.vm.isDirty).toBe(false);

    await wrapper.find('form').trigger('submit.prevent');
    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toMatchObject({
      tagline: 'Slogan Baru Dari Server',
      defaultCoordinates: { lat: -1.3, lon: 117.0, zoom: 15 },
    });
    wrapper.unmount();
  });

  it('keeps edited fields when props.settings changes and submits payload with new baseline for untouched fields', async () => {
    const wrapper = mountForm({ settings: DEFAULT_PUBLIC_SETTINGS });
    await flushPromises();

    await wrapper.find('input#settings-appName').setValue('Aplikasi Kustom');
    await flushPromises();

    const refreshedSettings = {
      ...DEFAULT_PUBLIC_SETTINGS,
      tagline: 'Slogan Baru Dari Server',
      defaultCoordinates: { lat: -1.3, lon: 117.0, zoom: 15 },
    };
    await wrapper.setProps({ settings: refreshedSettings });
    await flushPromises();

    expect((wrapper.find('input#settings-appName').element as HTMLInputElement).value).toBe(
      'Aplikasi Kustom',
    );
    expect((wrapper.find('input#settings-tagline').element as HTMLInputElement).value).toBe(
      'Slogan Baru Dari Server',
    );
    expect(leafletState.center).toEqual({ lat: -1.3, lng: 117.0 });
    expect(leafletState.zoom).toBe(15);
    expect(wrapper.vm.isDirty).toBe(true);

    await wrapper.find('form').trigger('submit.prevent');
    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toMatchObject({
      appName: 'Aplikasi Kustom',
      tagline: 'Slogan Baru Dari Server',
      defaultCoordinates: { lat: -1.3, lon: 117.0, zoom: 15 },
    });
    wrapper.unmount();
  });
});

describe('PublicSettingsForm in the CMS dialog', () => {
  function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
    return { ok, status, json: async () => body } as Response;
  }

  interface PatchCall {
    body: Record<string, unknown>;
  }

  function installFetch(patchResponses: Response[]): PatchCall[] {
    const patches: PatchCall[] = [];
    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
      if (url === '/api/settings/public' && init?.method === 'PATCH') {
        patches.push({ body: JSON.parse(String(init.body)) as Record<string, unknown> });
        const next = patchResponses.shift();
        if (!next) throw new Error('unexpected extra PATCH');
        return next;
      }
      if (url === '/api/settings/public') return json({ settings: SETTINGS });
      if (url === '/api/pages?include=sections') return json({ pages: [] });
      if (url === '/api/indicators?pageSize=200') {
        return json({ indicators: [], total: 0, page: 1, pageSize: 200 });
      }
      if (url === '/api/indicator-tables?pageSize=200') {
        return json({ tables: [], total: 0, page: 1, pageSize: 200 });
      }
      if (url === '/api/content-blocks') return json({ blocks: [] });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    return patches;
  }

  /** The dialog teleports to `<body>`; a stubbed Teleport would remount the form on every re-render. */
  function dialogRoot(): DOMWrapper<HTMLElement> {
    return new DOMWrapper(document.body);
  }

  async function openSettingsDialog() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().setAuth({ id: '1', email: 'admin@example.com', role: 'admin' }, 'token');
    const wrapper = mount(DataManagementView, {
      global: { plugins: [pinia], stubs: { RouterLink: true } },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.find('[data-test="tab-pengaturan"]').trigger('click');
    await flushPromises();
    const edit = wrapper.findAll('button').find((button) => button.text().startsWith('Edit'));
    await edit?.trigger('click');
    await flushPromises();
    return { wrapper, store: useSettingsStore() };
  }

  beforeEach(() => {
    resetLeafletMock();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('starts from the stored view', async () => {
    installFetch([]);
    const { wrapper } = await openSettingsDialog();
    expect(dialogRoot().find('[role="dialog"]').exists()).toBe(true);
    expect(leafletState.center).toEqual({ lat: -1.3, lng: 117.0 });
    expect(leafletState.zoom).toBe(15);
    wrapper.unmount();
  });

  describe('protecting unsaved changes', () => {
    const prompt = () => dialogRoot().find('[data-test="settings-discard-prompt"]');
    const dialogButton = (label: string) =>
      dialogRoot()
        .findAll('[role="dialog"] button')
        .find((button) => button.text() === label);
    const pressEscape = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    async function makeDirty() {
      panTo(-1.5, 117.5, 10);
      await flushPromises();
    }

    it('closes a clean form at once, with no prompt, via Batal, Escape and the backdrop', async () => {
      installFetch([]);
      const { wrapper } = await openSettingsDialog();
      await dialogButton('Batal')?.trigger('click');
      await flushPromises();
      expect(prompt().exists()).toBe(false);
      expect(dialogRoot().find('[role="dialog"]').exists()).toBe(false);
      wrapper.unmount();

      installFetch([]);
      const second = await openSettingsDialog();
      pressEscape();
      await flushPromises();
      expect(dialogRoot().find('[role="dialog"]').exists()).toBe(false);
      second.wrapper.unmount();

      installFetch([]);
      const third = await openSettingsDialog();
      await dialogRoot().find('[role="presentation"]').trigger('click');
      await flushPromises();
      expect(dialogRoot().find('[role="dialog"]').exists()).toBe(false);
      third.wrapper.unmount();
    });

    it('asks before discarding a dirty draft and keeps the draft on "Tetap di sini"', async () => {
      const patches = installFetch([]);
      const { wrapper } = await openSettingsDialog();
      await dialogRoot().find('input#settings-appName').setValue('Nama baru');
      await makeDirty();

      await dialogButton('Batal')?.trigger('click');
      await flushPromises();

      const alert = prompt();
      expect(alert.exists()).toBe(true);
      expect(alert.attributes('role')).toBe('alertdialog');
      expect(alert.attributes('aria-labelledby')).toBe('settings-discard-title');
      expect(alert.attributes('aria-describedby')).toBe('settings-discard-body');
      expect(alert.text()).toContain('Perubahan belum disimpan');
      expect(alert.text()).toContain('Tutup tanpa menyimpan perubahan?');
      expect(document.activeElement?.textContent?.trim()).toBe('Tetap di sini');
      expect(dialogRoot().find('[role="dialog"] form').isVisible()).toBe(false);

      await dialogRoot().find('[data-test="settings-discard-keep"]').trigger('click');
      await flushPromises();
      expect(prompt().exists()).toBe(false);
      const form = dialogRoot().find('[role="dialog"] form');
      expect(form.isVisible()).toBe(true);
      expect((dialogRoot().find('input#settings-appName').element as HTMLInputElement).value).toBe(
        'Nama baru',
      );
      expect(patches).toHaveLength(0);
      wrapper.unmount();
    });

    it('discards the draft on "Tutup tanpa menyimpan" and leaves the stored settings unchanged', async () => {
      const patches = installFetch([]);
      const { wrapper, store } = await openSettingsDialog();
      await makeDirty();
      await dialogButton('Batal')?.trigger('click');
      await flushPromises();
      await dialogRoot().find('[data-test="settings-discard-confirm"]').trigger('click');
      await flushPromises();

      expect(dialogRoot().find('[role="dialog"]').exists()).toBe(false);
      expect(store.settings.defaultCoordinates).toEqual({ lat: -1.3, lon: 117.0, zoom: 15 });
      expect(patches).toHaveLength(0);
      wrapper.unmount();
    });

    describe('while the prompt is shown, Escape, the backdrop and the X all mean "stay"', () => {
      const dismissals: Array<[string, () => Promise<void>]> = [
        ['Escape', async () => void pressEscape()],
        [
          'the backdrop',
          async () => {
            await dialogRoot().find('[role="presentation"]').trigger('click');
          },
        ],
        [
          'the X button',
          async () => {
            await dialogRoot().find('[aria-label="Tutup dialog"]').trigger('click');
          },
        ],
      ];

      it.each(dismissals)('%s dismisses the prompt and keeps the draft', async (_name, dismiss) => {
        const patches = installFetch([]);
        const { wrapper } = await openSettingsDialog();
        await dialogRoot().find('input#settings-appName').setValue('Nama baru');
        await makeDirty();
        const centerBefore = { ...leafletState.center };
        const zoomBefore = leafletState.zoom;

        pressEscape();
        await flushPromises();
        expect(prompt().exists()).toBe(true);

        await dismiss();
        await flushPromises();
        expect(prompt().exists()).toBe(false);
        expect(dialogRoot().find('[role="dialog"]').exists()).toBe(true);
        expect(dialogRoot().find('[role="dialog"] form').isVisible()).toBe(true);
        expect(
          (dialogRoot().find('input#settings-appName').element as HTMLInputElement).value,
        ).toBe('Nama baru');
        expect(leafletState.center).toEqual(centerBefore);
        expect(leafletState.zoom).toBe(zoomBefore);
        expect(patches).toHaveLength(0);
        expect(document.activeElement).not.toBe(document.body);
        wrapper.unmount();
      });
    });

    it('prompts when the close button is used with a dirty draft', async () => {
      installFetch([]);
      const { wrapper } = await openSettingsDialog();
      await makeDirty();
      await dialogRoot().find('[aria-label="Tutup dialog"]').trigger('click');
      await flushPromises();
      expect(prompt().exists()).toBe(true);
      wrapper.unmount();
    });

    it('cannot be dismissed while a save is in flight', async () => {
      let release: (response: Response) => void = () => undefined;
      globalThis.fetch = vi.fn<typeof fetch>(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
          if (url === '/api/settings/public' && init?.method === 'PATCH') {
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
          }
          if (url === '/api/settings/public') return json({ settings: SETTINGS });
          if (url === '/api/pages?include=sections') return json({ pages: [] });
          if (url === '/api/indicators?pageSize=200') {
            return json({ indicators: [], total: 0, page: 1, pageSize: 200 });
          }
          if (url === '/api/indicator-tables?pageSize=200') {
            return json({ tables: [], total: 0, page: 1, pageSize: 200 });
          }
          if (url === '/api/content-blocks') return json({ blocks: [] });
          throw new Error(`unexpected fetch: ${url}`);
        },
      ) as typeof fetch;
      const { wrapper } = await openSettingsDialog();
      await makeDirty();
      await dialogRoot().find('[role="dialog"] form').trigger('submit');
      await flushPromises();

      pressEscape();
      await dialogRoot().find('[role="presentation"]').trigger('click');
      await flushPromises();
      expect(dialogRoot().find('[role="dialog"]').exists()).toBe(true);
      expect(prompt().exists()).toBe(false);

      release(json({ message: 'ok', settings: SETTINGS }));
      await flushPromises();
      wrapper.unmount();
    });

    it('closes without a prompt after a successful save', async () => {
      installFetch([json({ message: 'ok', settings: SETTINGS })]);
      const { wrapper } = await openSettingsDialog();
      await makeDirty();
      await dialogRoot().find('[role="dialog"] form').trigger('submit');
      await flushPromises();
      expect(prompt().exists()).toBe(false);
      expect(dialogRoot().find('[role="dialog"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  it('keeps the draft and shows a plain-Indonesian message when saving fails, then saves on retry', async () => {
    const patches = installFetch([
      json({ error: 'ER_LOCK_WAIT_TIMEOUT at db.query' }, false, 500),
      json({
        message: 'ok',
        settings: { ...SETTINGS, defaultCoordinates: { lat: -1.42, lon: 117.2, zoom: 12 } },
      }),
    ]);
    const { wrapper, store } = await openSettingsDialog();

    panTo(-1.42, 117.2, 12);
    await flushPromises();
    await dialogRoot().find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    const dialog = dialogRoot().find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain(`Gagal menyimpan pengaturan publik. ${USER_MESSAGES.server}`);
    expect(dialog.text()).not.toMatch(/ER_LOCK|500|db\.query/);
    expect(dialog.text()).toContain('Perubahan belum tersimpan');
    expect(store.settings.defaultCoordinates).toEqual({ lat: -1.3, lon: 117.0, zoom: 15 });
    expect(patches).toHaveLength(1);
    expect(patches[0]!.body.defaultCoordinates).toEqual({ lat: -1.42, lon: 117.2, zoom: 12 });

    // The draft survived the failure: retrying sends the same view.
    await dialogRoot().find('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(patches).toHaveLength(2);
    expect(patches[1]!.body.defaultCoordinates).toEqual({ lat: -1.42, lon: 117.2, zoom: 12 });
    expect(store.settings.defaultCoordinates).toEqual({ lat: -1.42, lon: 117.2, zoom: 12 });
    expect(dialogRoot().find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('sends exactly one request when the form is submitted twice quickly', async () => {
    const patches = installFetch([
      json({ message: 'ok', settings: SETTINGS }),
      json({ message: 'ok', settings: SETTINGS }),
    ]);
    const { wrapper } = await openSettingsDialog();
    const form = dialogRoot().find('[role="dialog"] form');
    void form.trigger('submit');
    void form.trigger('submit');
    await flushPromises();
    expect(patches).toHaveLength(1);
    wrapper.unmount();
  });

  it('adds no coordinate or zoom inputs to the dialog', async () => {
    installFetch([]);
    const { wrapper } = await openSettingsDialog();
    const dialog = dialogRoot().find('[role="dialog"]');
    expect(dialog.findAll('input[type="number"]')).toHaveLength(0);
    expect(dialog.text()).toContain('Atur tampilan peta');
    wrapper.unmount();
  });
});
