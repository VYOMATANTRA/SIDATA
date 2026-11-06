import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AdminRukunTetanggaView from '../views/AdminRukunTetanggaView.vue';

// Mock RtLocationPicker so Leaflet DOM initialization doesn't run in jsdom
vi.mock('../components/maps/RtLocationPicker.vue', () => ({
  default: {
    name: 'RtLocationPicker',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <div data-test="rt-location-picker">
        <button type="button" data-test="picker-clear" :disabled="disabled" @click="$emit('update:modelValue', null)">
          Hapus titik mock
        </button>
        <button type="button" data-test="picker-set" :disabled="disabled" @click="$emit('update:modelValue', { latitude: -1.25, longitude: 116.95 })">
          Pilih titik mock
        </button>
      </div>
    `,
  },
}));

describe('AdminRukunTetanggaView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  const mockLeaders = [
    {
      rtNumber: 1,
      name: 'Ketua 1',
      phone: '081234567801',
      phoneIsWhatsapp: true,
      alamat: 'Jl. RT 1',
      coordinates: {
        latitude: -1.22,
        longitude: 116.94,
        pointId: 'point-1',
      },
    },
    {
      rtNumber: 2,
      name: '',
      phone: '',
      phoneIsWhatsapp: false,
      alamat: null,
      coordinates: null,
    },
  ];

  function setupFetchMock(
    customHandler?: (url: string, init?: RequestInit) => Response | undefined,
  ) {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (customHandler) {
        const custom = customHandler(url, init);
        if (custom !== undefined) return custom;
      }
      if (url.includes('/api/auth/csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'test-csrf' }) } as Response;
      }
      if (url.includes('/api/maps/rt-leaders?limit=100')) {
        return {
          ok: true,
          json: async () => ({ leaders: mockLeaders, isSampleRoster: true }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    globalThis.fetch = fetchMock;
    return fetchMock;
  }

  function mountView() {
    return mount(AdminRukunTetanggaView, {
      global: { stubs: { teleport: true } },
    });
  }

  it('renders leaders table with pagination and opens editor on click', async () => {
    setupFetchMock();
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Daftar Ketua RT');
    expect(wrapper.text()).toContain('Ketua 1');
    expect(wrapper.text()).toContain('Belum tersedia'); // Empty name on RT 2

    // Click edit on RT 1
    await wrapper.find('[data-test="rt-edit-1"]').trigger('click');
    expect(wrapper.text()).toContain('Edit RT 1');
  });

  it('can save a later edit after submitting an unchanged leader', async () => {
    const fetchMock = setupFetchMock();
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-test="rt-edit-1"]').trigger('click');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);

    await wrapper.find('[data-test="rt-edit-1"]').trigger('click');
    const name = wrapper.find<HTMLInputElement>('input#rt-name');
    expect(name.attributes('disabled')).toBeUndefined();
    await name.setValue('Updated synthetic leader');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).includes('/api/maps/rt-leaders/1') && init?.method === 'PATCH',
      ),
    ).toBe(true);
  });

  it('deletes existing spatial point when location is cleared and saved (Section 5)', async () => {
    const requests: { url: string; method: string }[] = [];
    setupFetchMock((url, init) => {
      if (init?.method && ['PATCH', 'DELETE', 'POST'].includes(init.method)) {
        requests.push({ url, method: init.method });
        return { ok: true, json: async () => ({ message: 'success' }) } as Response;
      }
    });

    const wrapper = mountView();
    await flushPromises();

    // Open RT 1 editor (has point-1)
    await wrapper.find('[data-test="rt-edit-1"]').trigger('click');

    // Clear location via picker
    await wrapper.find('[data-test="picker-clear"]').trigger('click');

    // Submit form
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Must have sent DELETE /api/maps/points/point-1
    const deleteReq = requests.find((r) => r.method === 'DELETE');
    expect(deleteReq).toBeDefined();
    expect(deleteReq?.url).toContain('/api/maps/points/point-1');
    expect(deleteReq?.url).toContain('expectedRtNumber=1');
  });

  it('retains the draft and blocks stale location saves until explicit reload', async () => {
    const requests: string[] = [];
    setupFetchMock((url, init) => {
      if (init?.method === 'DELETE' && url.includes('/api/maps/points/')) {
        requests.push(url);
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'Ownership changed' }),
        } as Response;
      }
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-test="rt-edit-1"]').trigger('click');
    await wrapper.find('input#rt-name').setValue('Unsaved draft');
    await wrapper.find('[data-test="picker-clear"]').trigger('click');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('expectedRtNumber=1');
    expect((wrapper.find('input#rt-name').element as HTMLInputElement).value).toBe('Unsaved draft');
    expect(wrapper.text()).toContain('Data kontak berhasil disimpan');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    expect(requests).toHaveLength(1);
    const reload = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Muat ulang data RT'));
    await reload!.trigger('click');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });

  it('sends null for cleared address and forces phoneIsWhatsapp to false when phone is blank', async () => {
    const requests: { url: string; method: string; body?: Record<string, unknown> }[] = [];
    setupFetchMock((url, init) => {
      if (init?.method && ['PATCH', 'DELETE', 'POST'].includes(init.method)) {
        requests.push({
          url,
          method: init.method,
          body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
        });
        return { ok: true, json: async () => ({ message: 'success' }) } as Response;
      }
    });

    const wrapper = mountView();
    await flushPromises();

    // Open RT 1 (has phone '081234' and alamat 'Jl. Mulawarman')
    await wrapper.find('[data-test="rt-edit-1"]').trigger('click');

    // Clear phone and alamat
    await wrapper.find('input#rt-phone').setValue('');
    await wrapper.find('textarea#rt-alamat').setValue('');

    // Submit form
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const patchReq = requests.find((r) => r.method === 'PATCH' && r.url.includes('/rt-leaders/1'));
    expect(patchReq).toBeDefined();
    expect(patchReq?.body?.phone).toBe('');
    expect(patchReq?.body?.phoneIsWhatsapp).toBe(false);
    expect(patchReq?.body?.alamat).toBe(null);
  });

  it('creates new spatial point when previously empty slot sets location', async () => {
    const requests: { url: string; method: string; body?: Record<string, unknown> }[] = [];
    setupFetchMock((url, init) => {
      if (init?.method && ['PATCH', 'DELETE', 'POST'].includes(init.method)) {
        requests.push({
          url,
          method: init.method,
          body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
        });
        return {
          ok: true,
          json: async () => ({ point: { id: 'new-point-2' } }),
        } as Response;
      }
    });

    const wrapper = mountView();
    await flushPromises();

    // Open RT 2 (coordinates: null, name: '')
    await wrapper.find('[data-test="rt-edit-2"]').trigger('click');

    // Set location via mock picker
    await wrapper.find('[data-test="picker-set"]').trigger('click');

    // Submit without changing empty name
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Should NOT send name: '' to rt-leaders PATCH (omits unchanged empty name)
    const patchLeaderReq = requests.find((r) => r.url.includes('/api/maps/rt-leaders/2'));
    expect(patchLeaderReq).toBeUndefined();

    // Should POST to /api/maps/points with RT 2
    const postPointReq = requests.find(
      (r) => r.method === 'POST' && r.url.includes('/api/maps/points'),
    );
    expect(postPointReq).toBeDefined();
    expect(postPointReq?.body?.rts).toEqual([2]);
  });

  it('reports partial failure when contact save succeeds but point mutation fails', async () => {
    setupFetchMock((url, init) => {
      if (url.includes('/api/maps/rt-leaders/1') && init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ message: 'updated' }) } as Response;
      }
      if (url.includes('/api/maps/points/point-1') && init?.method === 'DELETE') {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database error on point delete' }),
        } as Response;
      }
    });

    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-test="rt-edit-1"]').trigger('click');

    // Change phone and clear location
    await wrapper.find('input#rt-phone').setValue('0899999999');
    await wrapper.find('[data-test="picker-clear"]').trigger('click');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Modal stays open and informs about partial success
    expect(wrapper.text()).toContain(
      'Data kontak berhasil disimpan, namun lokasi gagal diperbarui',
    );
  });

  it('disables Apply button when CSV input text changes after preview (Section 6)', async () => {
    setupFetchMock((url) => {
      if (url.includes('/api/maps/rt-leaders/import/preview')) {
        return {
          ok: true,
          json: async () => ({
            rows: [
              {
                rowNumber: 2,
                rtNumber: 1,
                name: 'Ketua 1',
                action: 'update',
                changedFields: ['name'],
              },
            ],
            errors: [],
            summary: { total: 1, changed: 1, unchanged: 0, errors: 0 },
          }),
        } as Response;
      }
    });

    const wrapper = mountView();
    await flushPromises();

    const textarea = wrapper.find('textarea#rt-csv-text');
    await textarea.setValue(
      'rtNumber,name,phone,phoneIsWhatsapp,alamat,latitude,longitude\n1,Nama A,,,,,',
    );

    // Preview
    await wrapper.find('button[data-test="rt-apply-import"]').trigger('click'); // Initially disabled
    expect(
      wrapper.find('button[data-test="rt-apply-import"]').attributes('disabled'),
    ).toBeDefined();

    const previewBtn = wrapper.findAll('button').find((b) => b.text().includes('Periksa CSV'));
    await previewBtn?.trigger('click');
    await flushPromises();

    // Now preview is accepted and Apply is enabled
    expect(
      wrapper.find('button[data-test="rt-apply-import"]').attributes('disabled'),
    ).toBeUndefined();
    expect(wrapper.find('[data-test="rt-import-preview"]').exists()).toBe(true);

    // Edit text away -> Apply must become disabled immediately!
    await textarea.setValue(
      'rtNumber,name,phone,phoneIsWhatsapp,alamat,latitude,longitude\n2,Nama B,,,,,',
    );
    expect(
      wrapper.find('button[data-test="rt-apply-import"]').attributes('disabled'),
    ).toBeDefined();
    expect(wrapper.find('[data-test="rt-import-preview"]').exists()).toBe(false);
  });

  it('invalidates a preview immediately when a replacement file starts reading', async () => {
    const fetchMock = setupFetchMock((url) => {
      if (url.includes('/import/preview')) {
        return {
          ok: true,
          json: async () => ({
            rows: [],
            errors: [],
            summary: { total: 1, changed: 1, unchanged: 0, errors: 0 },
          }),
        } as Response;
      }
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('textarea#rt-csv-text').setValue('rtNumber,name\n1,First');
    const previewButton = wrapper.findAll('button').find((b) => b.text().includes('Periksa CSV'))!;
    await previewButton.trigger('click');
    await flushPromises();
    const apply = wrapper.find('[data-test="rt-apply-import"]');
    expect(apply.attributes('disabled')).toBeUndefined();

    let finish!: (text: string) => void;
    const file = {
      text: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    };
    const fileInput = wrapper.find<HTMLInputElement>('[data-test="rt-csv-file"]');
    Object.defineProperty(fileInput.element, 'files', { configurable: true, value: [file] });
    await fileInput.trigger('change');
    expect(apply.attributes('disabled')).toBeDefined();
    expect(previewButton.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="rt-import-preview"]').exists()).toBe(false);
    await apply.trigger('click');
    await previewButton.trigger('click');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/import'))).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/import/preview')),
    ).toHaveLength(1);

    finish('rtNumber,name\n2,Replacement');
    await flushPromises();
    expect((wrapper.find('textarea#rt-csv-text').element as HTMLTextAreaElement).value).toContain(
      'Replacement',
    );
    expect(apply.attributes('disabled')).toBeDefined();
    await previewButton.trigger('click');
    await flushPromises();
    expect(apply.attributes('disabled')).toBeUndefined();
  });

  it('keeps the existing text and requires another preview when file reading fails', async () => {
    setupFetchMock((url) =>
      url.includes('/import/preview')
        ? ({
            ok: true,
            json: async () => ({
              rows: [],
              errors: [],
              summary: { total: 1, changed: 1, unchanged: 0, errors: 0 },
            }),
          } as Response)
        : undefined,
    );
    const wrapper = mountView();
    await flushPromises();
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea#rt-csv-text');
    await textarea.setValue('rtNumber,name\n1,Existing');
    const preview = wrapper.findAll('button').find((b) => b.text().includes('Periksa CSV'))!;
    await preview.trigger('click');
    await flushPromises();
    const fileInput = wrapper.find<HTMLInputElement>('[data-test="rt-csv-file"]');
    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [{ text: () => Promise.reject(new Error('read failure')) }],
    });
    await fileInput.trigger('change');
    await flushPromises();
    expect(textarea.element.value).toContain('Existing');
    expect(wrapper.text()).toContain('Gagal membaca berkas CSV.');
    expect(wrapper.find('[data-test="rt-apply-import"]').attributes('disabled')).toBeDefined();
    expect(preview.attributes('disabled')).toBeUndefined();
  });

  it('ignores stale file reads when another file or manual input wins', async () => {
    setupFetchMock();
    const wrapper = mountView();
    await flushPromises();
    const input = wrapper.find<HTMLInputElement>('[data-test="rt-csv-file"]');
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea#rt-csv-text');
    let finishFirst!: (text: string) => void;
    let finishSecond!: (text: string) => void;
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [
        {
          text: () =>
            new Promise<string>((resolve) => {
              finishFirst = resolve;
            }),
        },
      ],
    });
    await input.trigger('change');
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [
        {
          text: () =>
            new Promise<string>((resolve) => {
              finishSecond = resolve;
            }),
        },
      ],
    });
    await input.trigger('change');
    finishSecond('second file');
    await flushPromises();
    finishFirst('first file');
    await flushPromises();
    expect(textarea.element.value).toBe('second file');

    let finishThird!: (text: string) => void;
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [
        {
          text: () =>
            new Promise<string>((resolve) => {
              finishThird = resolve;
            }),
        },
      ],
    });
    await input.trigger('change');
    await textarea.setValue('manually edited');
    finishThird('third file');
    await flushPromises();
    expect(textarea.element.value).toBe('manually edited');
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text().includes('Periksa CSV'))!
        .attributes('disabled'),
    ).toBeUndefined();
  });
});
