import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PublicSettingsForm from '../components/data/PublicSettingsForm.vue';
import { DEFAULT_PUBLIC_SETTINGS } from '../stores/settings.store';
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
    const payload = emitted?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).toEqual({
      appName: 'SIDATA 2026',
      institutionName: DEFAULT_PUBLIC_SETTINGS.institutionName,
      tagline: DEFAULT_PUBLIC_SETTINGS.tagline,
      administrativeArea: DEFAULT_PUBLIC_SETTINGS.administrativeArea,
      contactPhone: '081122334455',
      contactWhatsapp: DEFAULT_PUBLIC_SETTINGS.contactWhatsapp,
      contactEmail: DEFAULT_PUBLIC_SETTINGS.contactEmail,
      contactAddress: DEFAULT_PUBLIC_SETTINGS.contactAddress,
    });
    expect(payload?.defaultCoordinates).toBeUndefined();
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

  it('clamps odd stored values (zoom 13.5, 0, 99 and lat 120) for map display and omits untouched coordinates on submit', async () => {
    for (const { input, expected } of [
      {
        input: { lat: 120, lon: 116.9, zoom: 13.5 },
        expected: { lat: 90, lon: 116.9, zoom: 14 },
      },
      {
        input: { lat: -1.2, lon: 116.9, zoom: 0 },
        expected: { lat: -1.2, lon: 116.9, zoom: 1 },
      },
      {
        input: { lat: -1.2, lon: 116.9, zoom: 99 },
        expected: { lat: -1.2, lon: 116.9, zoom: 20 },
      },
    ]) {
      const wrapper = mountForm({
        settings: {
          ...DEFAULT_PUBLIC_SETTINGS,
          defaultCoordinates: input,
        },
      });
      await flushPromises();

      expect(leafletState.center.lat).toBe(expected.lat);
      expect(leafletState.center.lng).toBe(expected.lon);
      expect(leafletState.zoom).toBe(expected.zoom);

      await wrapper.find('form').trigger('submit.prevent');
      const emitted = wrapper.emitted('submit');
      expect(emitted).toBeTruthy();
      const payload = emitted?.[emitted.length - 1]?.[0] as Record<string, unknown>;
      expect(payload.defaultCoordinates).toBeUndefined();

      wrapper.unmount();
    }
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
    const payload = emitted?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).toMatchObject({
      tagline: 'Slogan Baru Dari Server',
    });
    expect(payload?.defaultCoordinates).toBeUndefined();
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
    const refreshedPayload = emitted?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(refreshedPayload).toMatchObject({
      appName: 'Aplikasi Kustom',
      tagline: 'Slogan Baru Dari Server',
    });
    expect(refreshedPayload?.defaultCoordinates).toBeUndefined();
    wrapper.unmount();
  });

  it('omits defaultCoordinates when only text is edited with high-precision coordinates', async () => {
    const highPrecisionSettings = {
      ...DEFAULT_PUBLIC_SETTINGS,
      defaultCoordinates: { lat: -1.23456789, lon: 116.98765432, zoom: 14 },
    };
    const wrapper = mountForm({ settings: highPrecisionSettings });
    await flushPromises();

    await wrapper.find('input#settings-appName').setValue('Nama Baru');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    const payload = emitted?.[0]?.[0] as Record<string, unknown>;
    expect(payload.appName).toBe('Nama Baru');
    expect(payload.defaultCoordinates).toBeUndefined();
    wrapper.unmount();
  });

  it('omits defaultCoordinates when only text is edited with null defaultCoordinates', async () => {
    const nullCoordsSettings = {
      ...DEFAULT_PUBLIC_SETTINGS,
      defaultCoordinates: null as unknown as typeof DEFAULT_PUBLIC_SETTINGS.defaultCoordinates,
    };
    const wrapper = mountForm({ settings: nullCoordsSettings });
    await flushPromises();

    await wrapper.find('input#settings-appName').setValue('Nama Baru');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    const payload = emitted?.[0]?.[0] as Record<string, unknown>;
    expect(payload.appName).toBe('Nama Baru');
    expect(payload.defaultCoordinates).toBeUndefined();
    wrapper.unmount();
  });

  it('emits defaultCoordinates when map view is changed and submitted', async () => {
    const wrapper = mountForm();
    await flushPromises();

    panTo(-1.25, 116.96, 15);
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    const payload = emitted?.[0]?.[0] as Record<string, unknown>;
    expect(payload.defaultCoordinates).toEqual({ lat: -1.25, lon: 116.96, zoom: 15 });
    wrapper.unmount();
  });

  it('clears mapDirty and omits defaultCoordinates after reverting map back to baseline', async () => {
    const wrapper = mountForm({ settings: SETTINGS });
    await flushPromises();

    panTo(-1.5, 117.5, 10);
    await flushPromises();
    expect((wrapper.vm as unknown as { mapDirty: boolean }).mapDirty).toBe(true);

    panTo(-1.3, 117.0, 15);
    await flushPromises();
    expect((wrapper.vm as unknown as { mapDirty: boolean }).mapDirty).toBe(false);

    await wrapper.find('input#settings-appName').setValue('Nama Saja');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    const payload = emitted?.[0]?.[0] as Record<string, unknown>;
    expect(payload.appName).toBe('Nama Saja');
    expect(payload.defaultCoordinates).toBeUndefined();
    wrapper.unmount();
  });

  it('emits dirty-change when dirty state changes', async () => {
    const wrapper = mountForm();
    await flushPromises();

    const emitted = () => wrapper.emitted('dirty-change');
    expect(emitted()).toBeTruthy();
    expect(emitted()?.[emitted()!.length - 1]).toEqual([false]);

    await wrapper.find('input#settings-appName').setValue('Nama Diubah');
    expect(emitted()?.[emitted()!.length - 1]).toEqual([true]);

    await wrapper.find('input#settings-appName').setValue(DEFAULT_PUBLIC_SETTINGS.appName);
    expect(emitted()?.[emitted()!.length - 1]).toEqual([false]);
    wrapper.unmount();
  });
});

describe('PublicSettingsForm parts (system configuration page)', () => {
  beforeEach(() => {
    resetLeafletMock();
    document.body.innerHTML = '';
  });

  it('identity part shows only the portal and contact fields, with no map', async () => {
    const wrapper = mountForm({ part: 'identity', idPrefix: 'identitas' });
    await flushPromises();

    expect(wrapper.find('input#identitas-appName').exists()).toBe(true);
    expect(wrapper.find('input#identitas-contactEmail').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Atur tampilan peta');
    expect(leafletState.handlers.moveend).toBeUndefined();
    wrapper.unmount();
  });

  it('identity part submits only text fields and never the map view', async () => {
    const wrapper = mountForm({ part: 'identity', settings: SETTINGS });
    await flushPromises();

    await wrapper.find('input#settings-tagline').setValue('Tagline baru');
    await wrapper.find('form').trigger('submit.prevent');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload.tagline).toBe('Tagline baru');
    expect(payload).not.toHaveProperty('defaultCoordinates');
    wrapper.unmount();
  });

  it('map part shows only the map picker and submits only the new view', async () => {
    const wrapper = mountForm({ part: 'map', settings: SETTINGS });
    await flushPromises();

    expect(wrapper.find('input#settings-appName').exists()).toBe(false);
    expect(wrapper.text()).toContain('Atur tampilan peta');

    panTo(-1.2411, 116.9702, 16);
    await wrapper.find('form').trigger('submit.prevent');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual({ defaultCoordinates: { lat: -1.2411, lon: 116.9702, zoom: 16 } });
    wrapper.unmount();
  });

  it('map part does not validate or block on identity fields it does not show', async () => {
    const wrapper = mountForm({
      part: 'map',
      settings: { ...SETTINGS, appName: '', contactEmail: '' },
    });
    await flushPromises();

    panTo(-1.25, 116.99, 14);
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toHaveLength(1);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('a part form with nothing changed sends nothing', async () => {
    const wrapper = mountForm({ part: 'map', settings: SETTINGS });
    await flushPromises();

    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });

  it('reports dirtiness only for its own part', async () => {
    const identity = mountForm({ part: 'identity', settings: SETTINGS });
    await flushPromises();
    panTo(-1.5, 117.5, 10);
    await flushPromises();
    expect((identity.vm as unknown as { isDirty: boolean }).isDirty).toBe(false);
    await identity.find('input#settings-appName').setValue('Lain');
    expect((identity.vm as unknown as { isDirty: boolean }).isDirty).toBe(true);
    identity.unmount();
  });

  it('requireChanges keeps Save disabled until something changes, and cancelLabel renames Batal', async () => {
    const wrapper = mountForm({
      part: 'identity',
      requireChanges: true,
      cancelLabel: 'Batalkan perubahan',
    });
    await flushPromises();
    const save = () => wrapper.findAll('button').find((b) => b.text() === 'Simpan perubahan')!;

    expect(save().attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('button').some((b) => b.text() === 'Batalkan perubahan')).toBe(true);

    await wrapper.find('input#settings-appName').setValue('Nama baru');
    expect(save().attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});
