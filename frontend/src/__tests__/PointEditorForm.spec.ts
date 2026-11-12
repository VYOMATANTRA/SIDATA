import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PointEditorForm from '../components/admin/maps/PointEditorForm.vue';
import { analyzeCoverage, RT_TAKEN_MESSAGE, STALE_POINT_MESSAGE } from '../utils/adminMapPoints';
import type { SpatialPointDTO } from '../types/maps';

// The real picker needs Leaflet; this stand-in only models the contract the form relies on.
vi.mock('../components/maps/LocationPicker.vue', () => ({
  default: {
    name: 'LocationPicker',
    props: ['modelValue', 'label', 'error', 'disabled', 'idPrefix', 'initialCenter'],
    emits: ['update:modelValue'],
    template: `
      <fieldset data-test="picker">
        <p v-if="error" data-test="picker-error">{{ error }}</p>
        <button type="button" data-test="picker-set" :disabled="disabled"
          @click="$emit('update:modelValue', { latitude: -1.25, longitude: 116.95 })">Atur</button>
        <button type="button" data-test="picker-move" :disabled="disabled"
          @click="$emit('update:modelValue', { latitude: -1.3, longitude: 116.9 })">Pindah</button>
      </fieldset>`,
  },
}));

function point(overrides: Partial<SpatialPointDTO> & Pick<SpatialPointDTO, 'id'>): SpatialPointDTO {
  return {
    name: `Titik ${overrides.id}`,
    type: 'ketua_rt',
    latitude: -1.22,
    longitude: 116.94,
    metadata: null,
    rts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface Request {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

let requests: Request[];
let respond: (request: Request) => Response | undefined;

function installFetch() {
  requests = [];
  respond = () => undefined;
  globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/api/auth/csrf-token')) {
      return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
    }
    const request: Request = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    requests.push(request);
    return (
      respond(request) ??
      ({ ok: true, json: async () => ({ point: point({ id: 'saved', name: 'Disimpan' }) }) } as Response)
    );
  });
}

function failure(status: number, body: Record<string, unknown>): Response {
  return { ok: false, status, json: async () => body } as Response;
}

const existing = [
  point({ id: 'rt3', name: 'Pos RT 03', rts: [3] }),
  point({ id: 'bsu', name: 'Bank Sampah Mawar', type: 'bank_sampah', rts: [30, 72] }),
];

function mountForm(
  target: SpatialPointDTO | null,
  others: readonly SpatialPointDTO[] = existing,
) {
  const all = target ? [...others.filter((p) => p.id !== target.id), target] : [...others];
  return mount(PointEditorForm, {
    props: {
      point: target,
      analysis: analyzeCoverage(all),
      initialCenter: [-1.2251, 116.9438] as [number, number],
      initialZoom: 13,
    },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  });
}

async function submit(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('PointEditorForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has no coordinate, id or free-text RT fields', () => {
    const wrapper = mountForm(null);
    const textInputs = wrapper.findAll('input[type="text"], input[type="number"]');
    expect(textInputs).toHaveLength(1);
    expect(textInputs[0]?.attributes('id')).toBe('point-name');
    expect(wrapper.find('label[for="point-name"]').exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/latitude|longitude|zoom/i);
  });

  it('creates a Ketua RT point for exactly one RT, with a suggested name', async () => {
    const wrapper = mountForm(null);
    await wrapper.find('[data-test="picker-set"]').trigger('click');
    await wrapper.find('[data-test="rt-tile-5"] input').setValue(true);
    expect((wrapper.find('#point-name').element as HTMLInputElement).value).toBe(
      'Pos RT 05 Kelurahan Manggar',
    );
    await submit(wrapper);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: '/api/maps/points', method: 'POST' });
    expect(requests[0]?.body).toEqual({
      name: 'Pos RT 05 Kelurahan Manggar',
      type: 'ketua_rt',
      latitude: -1.25,
      longitude: 116.95,
      rts: [5],
    });
    expect(wrapper.emitted('saved')?.[0]?.[1]).toBe(true);
  });

  it('keeps a name the editor typed instead of the suggestion', async () => {
    const wrapper = mountForm(null);
    await wrapper.find('#point-name').setValue('Pos Ronda Mawar');
    await wrapper.find('[data-test="rt-tile-5"] input').setValue(true);
    expect((wrapper.find('#point-name').element as HTMLInputElement).value).toBe('Pos Ronda Mawar');
  });

  it('creates a Bank Sampah point that covers several RTs', async () => {
    const wrapper = mountForm(null);
    await wrapper.find('[data-test="point-type-bank_sampah"] input').setValue(true);
    await wrapper.find('#point-name').setValue('Bank Sampah Melati');
    await wrapper.find('[data-test="picker-set"]').trigger('click');
    for (const rt of [60, 30, 72]) {
      await wrapper.find(`[data-test="rt-tile-${rt}"] input`).setValue(true);
    }
    await submit(wrapper);
    expect(requests[0]?.body).toMatchObject({ type: 'bank_sampah', rts: [30, 60, 72] });
  });

  it('allows a Bank Sampah point to share an RT that has a Ketua RT point', async () => {
    const wrapper = mountForm(null);
    await wrapper.find('[data-test="point-type-bank_sampah"] input').setValue(true);
    await wrapper.find('#point-name').setValue('Bank Sampah Melati');
    await wrapper.find('[data-test="picker-set"]').trigger('click');
    await wrapper.find('[data-test="rt-tile-3"] input').setValue(true);
    expect(wrapper.find('[data-test="rt-coverage"]').text()).not.toContain('sudah dipakai');
    await submit(wrapper);
    expect(requests).toHaveLength(1);
  });

  it('explains and blocks a second Ketua RT point on the same RT, before any request', async () => {
    const wrapper = mountForm(null);
    await wrapper.find('[data-test="picker-set"]').trigger('click');
    await wrapper.find('[data-test="rt-tile-3"] input').setValue(true);
    expect(wrapper.text()).toContain('RT 3 sudah dipakai titik Ketua RT “Pos RT 03”');
    await submit(wrapper);
    expect(requests).toHaveLength(0);
    expect(wrapper.find('[data-test="form-error"]').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').text()).toContain('Periksa kembali isian berikut');
  });

  it('blocks a Ketua RT point with more than one RT after switching type', async () => {
    const wrapper = mountForm(null);
    await wrapper.find('[data-test="point-type-bank_sampah"] input').setValue(true);
    await wrapper.find('#point-name').setValue('Titik');
    await wrapper.find('[data-test="picker-set"]').trigger('click');
    await wrapper.find('[data-test="rt-tile-30"] input').setValue(true);
    await wrapper.find('[data-test="rt-tile-31"] input').setValue(true);
    await wrapper.find('[data-test="point-type-ketua_rt"] input').setValue(true);
    expect(wrapper.text()).toContain('Titik Ketua RT hanya boleh memilih satu RT');
    await submit(wrapper);
    expect(requests).toHaveLength(0);
  });

  it('requires name, location and an RT for a Ketua RT point, each with a text message', async () => {
    const wrapper = mountForm(null);
    await submit(wrapper);
    expect(requests).toHaveLength(0);
    const text = wrapper.text();
    expect(text).toContain('Isi nama titik.');
    expect(text).toContain('Tentukan lokasi titik di peta.');
    expect(text).toContain('Pilih satu RT untuk titik Ketua RT ini.');
    expect(wrapper.find('#point-name').attributes('aria-invalid')).toBe('true');
    expect(wrapper.find('#point-name').attributes('aria-describedby')).toContain('error');
  });

  it('sends only the changed fields on edit, with expectedRtNumber for a Ketua RT point', async () => {
    const wrapper = mountForm(existing[0]!);
    await wrapper.find('#point-name').setValue('Pos RT 03 (baru)');
    await submit(wrapper);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: '/api/maps/points/rt3?expectedRtNumber=3',
      method: 'PATCH',
      body: { name: 'Pos RT 03 (baru)' },
    });
    expect(wrapper.emitted('saved')?.[0]?.[1]).toBe(false);
  });

  it('moves a point by position alone and keeps expectedRtNumber', async () => {
    const wrapper = mountForm(existing[0]!);
    await wrapper.find('[data-test="picker-move"]').trigger('click');
    await submit(wrapper);
    expect(requests[0]?.body).toEqual({ latitude: -1.3, longitude: 116.9 });
    expect(requests[0]?.url).toContain('expectedRtNumber=3');
  });

  it('changes a Ketua RT point to another free RT and sends the old RT as expected', async () => {
    const wrapper = mountForm(existing[0]!);
    await wrapper.find('[data-test="rt-tile-4"] input').setValue(true);
    await submit(wrapper);
    expect(requests[0]?.body).toEqual({ rts: [4] });
    expect(requests[0]?.url).toContain('expectedRtNumber=3');
  });

  it('omits expectedRtNumber for a Bank Sampah point and sends its new coverage', async () => {
    const wrapper = mountForm(existing[1]!);
    await wrapper.find('[data-test="rt-tile-72"] input').setValue(false);
    await wrapper.find('[data-test="rt-tile-5"] input').setValue(true);
    await submit(wrapper);
    expect(requests[0]?.url).toBe('/api/maps/points/bsu');
    expect(requests[0]?.body).toEqual({ rts: [5, 30] });
  });

  it('closes without a request when nothing changed', async () => {
    const wrapper = mountForm(existing[0]!);
    await submit(wrapper);
    expect(requests).toHaveLength(0);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('reports whether the draft differs from the saved point', async () => {
    const wrapper = mountForm(existing[0]!);
    const form = wrapper.vm as unknown as { isDirty: () => boolean };
    expect(form.isDirty()).toBe(false);
    await wrapper.find('#point-name').setValue('Lain');
    expect(form.isDirty()).toBe(true);
    await wrapper.find('#point-name').setValue('Titik rt3');
    // "Titik rt3" is not the saved name "Pos RT 03".
    expect(form.isDirty()).toBe(true);
    await wrapper.find('#point-name').setValue('Pos RT 03');
    expect(form.isDirty()).toBe(false);

    const blank = mountForm(null);
    const blankForm = blank.vm as unknown as { isDirty: () => boolean };
    expect(blankForm.isDirty()).toBe(false);
    await blank.find('[data-test="picker-set"]').trigger('click');
    expect(blankForm.isDirty()).toBe(true);
  });

  it('does not force coverage repair when an unrelated field of a legacy point is edited', async () => {
    const legacy = point({ id: 'legacy', name: 'Pos Lama', rts: [8, 9] });
    const wrapper = mountForm(legacy);
    await wrapper.find('#point-name').setValue('Pos Lama 2');
    await submit(wrapper);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toEqual({ name: 'Pos Lama 2' });
  });

  it('keeps the whole draft, blocks saving and asks for a reload when the point changed (409)', async () => {
    respond = () => failure(409, { error: 'x', code: 'STALE_WRITE' });
    const wrapper = mountForm(existing[0]!);
    await wrapper.find('#point-name').setValue('Draf saya');
    await wrapper.find('[data-test="picker-move"]').trigger('click');
    await submit(wrapper);

    expect(requests).toHaveLength(1);
    expect(wrapper.text()).toContain(STALE_POINT_MESSAGE);
    expect(wrapper.text()).not.toMatch(/409|STALE/);
    expect((wrapper.find('#point-name').element as HTMLInputElement).value).toBe('Draf saya');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.find('[data-test="point-save"]').attributes('disabled')).toBeDefined();

    await wrapper.find('form').trigger('submit');
    expect(requests).toHaveLength(1);

    await wrapper.find('[data-test="point-reload"]').trigger('click');
    expect(wrapper.emitted('reload')).toHaveLength(1);
  });

  it('treats a deleted point (404) the same way', async () => {
    respond = () => failure(404, { error: 'Titik spasial tidak ditemukan.' });
    const wrapper = mountForm(existing[0]!);
    await wrapper.find('#point-name').setValue('Draf');
    await submit(wrapper);
    expect(wrapper.text()).toContain(STALE_POINT_MESSAGE);
    expect(wrapper.find('[data-test="point-reload"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="point-save"]').attributes('disabled')).toBeDefined();
  });

  it('explains a duplicate Ketua RT claim from the server and stays editable', async () => {
    respond = () => failure(409, { error: 'RT 4 sudah dicakup oleh titik ketua_rt lain (clx9)' });
    const wrapper = mountForm(existing[0]!);
    await wrapper.find('[data-test="rt-tile-4"] input').setValue(true);
    await submit(wrapper);
    expect(wrapper.text()).toContain(RT_TAKEN_MESSAGE);
    expect(wrapper.text()).not.toContain('clx9');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.find('[data-test="point-reload"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="point-save"]').attributes('disabled')).toBeUndefined();
  });

  it('shows a plain message for a server failure and keeps the draft', async () => {
    respond = () => failure(500, { error: 'ER_DUP stack trace' });
    const wrapper = mountForm(existing[1]!);
    await wrapper.find('#point-name').setValue('Draf');
    await submit(wrapper);
    expect(wrapper.text()).toContain('Gagal menyimpan titik.');
    expect(wrapper.text()).not.toMatch(/ER_DUP|500/);
    expect((wrapper.find('#point-name').element as HTMLInputElement).value).toBe('Draf');
  });

  it('points to the RT screen for contacts instead of offering contact fields', () => {
    const wrapper = mountForm(existing[0]!);
    expect(wrapper.find('[data-test="point-rt-contact-note"]').text()).toContain('Rukun Tetangga');
    expect(wrapper.find('input[type="tel"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/telepon\s*\*|alamat\s*\*/i);
  });

  it('reports busy while saving and disables the controls', async () => {
    let release: (value: Response) => void = () => undefined;
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes('csrf')) {
        return { ok: true, json: async () => ({ csrfToken: 'c' }) } as Response;
      }
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const wrapper = mountForm(existing[1]!);
    await wrapper.find('#point-name').setValue('Draf');
    void wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('busy')?.slice(-1)[0]).toEqual([true]);
    expect(wrapper.find('#point-name').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="point-save"]').text()).toContain('Menyimpan');
    release({ ok: true, json: async () => ({ point: existing[1] }) } as Response);
    await flushPromises();
    expect(wrapper.emitted('busy')?.slice(-1)[0]).toEqual([false]);
  });
});
