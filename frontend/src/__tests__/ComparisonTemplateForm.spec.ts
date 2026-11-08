import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ComparisonTemplateForm from '../components/templates/ComparisonTemplateForm.vue';
import {
  useComparisonTemplatesStore,
  type ComparisonTemplate,
} from '../stores/comparisonTemplates.store';
import { USER_MESSAGES } from '../utils/userMessages';

const BODY =
  'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.';
const FLAGGED_BODY =
  'Berdasarkan data {period_current}, {label} terus meningkat, {trend} dibandingkan {period_previous}.';

function makeTemplate(overrides: Partial<ComparisonTemplate> = {}): ComparisonTemplate {
  return {
    id: 'tpl-1',
    slug: 'perbandingan-tahunan',
    label: 'Perbandingan tahunan',
    body: BODY,
    trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
    trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
    trendTetap: 'tidak berubah',
    usageCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

const PREVIEW_OK = {
  valid: true,
  problems: [],
  previews: [
    { title: 'Contoh saat nilai naik', trend: 'naik', text: 'Kalimat contoh naik.', note: null },
    {
      title: 'Contoh saat nilai sebelumnya nol',
      trend: 'naik',
      text: null,
      note: 'Kalimat ini tidak ditampilkan untuk contoh ini.',
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

let calls: Call[];
let saveResponses: Array<() => Response | Promise<Response>>;
let previewResponse: () => Response | Promise<Response>;

function installFetch(): void {
  calls = [];
  saveResponses = [];
  previewResponse = () => json(PREVIEW_OK);
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === '/api/comparison-templates/preview') return previewResponse();
    const next = saveResponses.shift();
    if (!next) throw new Error(`unexpected fetch: ${method} ${url}`);
    return next();
  }) as typeof fetch;
}

const saves = () => calls.filter((c) => c.url !== '/api/comparison-templates/preview');
const previews = () => calls.filter((c) => c.url === '/api/comparison-templates/preview');

function mountForm(template: ComparisonTemplate | null = makeTemplate()): VueWrapper {
  return mount(ComparisonTemplateForm, {
    props: { template },
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  });
}

const ackWarnings = (keys = ['key-1']) => ({
  error: 'Body template memuat kata tren di luar slot {trend}.',
  code: 'TREND_KEYWORD_ACK_REQUIRED',
  warnings: keys.map((ackKey, index) => ({
    ackKey,
    phrase: index === 0 ? 'terus' : 'meningkat',
    keyword: index === 0 ? 'terus' : 'meningkat',
    start: 10,
    end: 15,
    excerpt: '…data {period_current}, {label} terus meningkat, {trend} diba…',
    acknowledged: false,
    message: 'Kata "terus" menyatakan tren di luar slot {trend}.',
  })),
});

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('ComparisonTemplateForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('editing', () => {
    it('shows an existing template as named parts only, never braces or slot names', async () => {
      const wrapper = mountForm();
      await flushPromises();

      const audible = `${wrapper.text()} ${wrapper
        .findAll('[aria-label]')
        .map((el) => el.attributes('aria-label'))
        .join(' ')}`;
      expect(audible).not.toMatch(/[{}]/);
      expect(audible).not.toMatch(/value_current|period_previous|delta_percent/);
      expect(wrapper.text()).toContain('Keterangan perubahan');
      expect(wrapper.text()).toContain('Nilai sekarang');
      wrapper.unmount();
    });

    it('saves the exact stored string it was given when nothing changed (round trip)', async () => {
      const wrapper = mountForm();
      saveResponses.push(() => json({ template: makeTemplate() }));

      await submit(wrapper);

      expect(saves()).toHaveLength(1);
      expect(saves()[0]).toMatchObject({
        url: '/api/comparison-templates/tpl-1',
        method: 'PATCH',
        body: {
          label: 'Perbandingan tahunan',
          body: BODY,
          trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
          trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
          trendTetap: 'tidak berubah',
        },
      });
      // The lookup key is never sent on edit and never shown.
      expect(saves()[0]!.body).not.toHaveProperty('slug');
      expect(wrapper.emitted('saved')).toHaveLength(1);
      wrapper.unmount();
    });

    it('warns that a template in use is live on public pages', () => {
      const wrapper = mountForm(makeTemplate({ usageCount: 3 }));

      expect(wrapper.find('[data-test="usage-note"]').text()).toContain('dipakai 3 indikator');
      wrapper.unmount();
    });
  });

  describe('creating', () => {
    async function fillNew(wrapper: VueWrapper): Promise<void> {
      await wrapper.find('#templat-nama').setValue('Perbandingan Baru');

      const body = wrapper.find('[data-test="builder-body"]');
      await body.find('[data-action="add-text"]').trigger('click');
      await body.find('textarea').setValue('Penduduk ');
      await body.find('[data-chip="trend"]').trigger('click');

      for (const field of ['trendNaik', 'trendTurun', 'trendTetap']) {
        const builder = wrapper.find(`[data-test="builder-${field}"]`);
        await builder.find('[data-action="add-text"]').trigger('click');
        await builder.find('textarea').setValue(`teks ${field}`);
      }
    }

    it('generates the lookup key from the name and keeps it out of the UI', async () => {
      const wrapper = mountForm(null);
      await fillNew(wrapper);
      saveResponses.push(
        () => json({ template: makeTemplate({ id: 'tpl-2' }) }),
        () => json({}),
      );

      await submit(wrapper);

      expect(saves()[0]).toMatchObject({
        url: '/api/comparison-templates',
        method: 'POST',
        body: {
          slug: 'perbandingan-baru',
          label: 'Perbandingan Baru',
          body: 'Penduduk {trend}',
          trendNaik: 'teks trendNaik',
        },
      });
      expect(wrapper.html()).not.toContain('perbandingan-baru');
      wrapper.unmount();
    });

    it('blocks an empty draft and shows each correction beside its own field', async () => {
      const wrapper = mountForm(null);

      await submit(wrapper);

      expect(saves()).toHaveLength(0);
      expect(wrapper.find('#templat-nama-error').text()).toBe('Nama templat wajib diisi.');
      expect(wrapper.find('[data-test="builder-body"] [data-test="builder-error"]').text()).toBe(
        'Susunan kalimat wajib diisi.',
      );
      expect(
        wrapper.find('[data-test="builder-trendNaik"] [data-test="builder-error"]').text(),
      ).toBe('Saat nilai naik wajib diisi.');
      wrapper.unmount();
    });

    it('will not save a main sentence that lacks the "Keterangan perubahan" part', async () => {
      const wrapper = mountForm(null);
      await fillNew(wrapper);
      // Remove the trend chip (the second row), leaving only the text.
      const rows = wrapper.findAll('[data-test="builder-body"] li[data-segment-id]');
      await rows[1]!.find('[data-action="remove"]').trigger('click');

      await submit(wrapper);

      expect(saves()).toHaveLength(0);
      expect(
        wrapper.find('[data-test="builder-body"] [data-test="builder-error"]').text(),
      ).toContain('Keterangan perubahan');
      wrapper.unmount();
    });

    it('blocks a template name that duplicates an existing template (case-insensitive)', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useComparisonTemplatesStore(pinia);
      store.templates = [
        makeTemplate({ id: 'tpl-1', label: 'Perbandingan tahunan' }),
        makeTemplate({ id: 'tpl-2', label: 'Ringkas' }),
      ];

      // New template with duplicate name (case-insensitive and trimmed)
      const wrapper = mount(ComparisonTemplateForm, {
        props: { template: null },
        global: { plugins: [pinia] },
        attachTo: document.body,
      });

      await wrapper.find('#templat-nama').setValue('  perbandingan TAHUNAN  ');
      await submit(wrapper);

      expect(saves()).toHaveLength(0);
      expect(wrapper.find('#templat-nama-error').text()).toBe(
        'Nama templat sudah dipakai. Gunakan nama lain.',
      );

      // Editing tpl-1 and keeping its own name does NOT trigger duplicate error
      const editWrapper = mount(ComparisonTemplateForm, {
        props: { template: store.templates[0] },
        global: { plugins: [pinia] },
        attachTo: document.body,
      });

      expect(editWrapper.find('#templat-nama-error').exists()).toBe(false);

      // Changing tpl-1's name to tpl-2's name DOES trigger duplicate error
      await editWrapper.find('#templat-nama').setValue('Ringkas');
      await submit(editWrapper);

      expect(saves()).toHaveLength(0);
      expect(editWrapper.find('#templat-nama-error').text()).toBe(
        'Nama templat sudah dipakai. Gunakan nama lain.',
      );

      wrapper.unmount();
      editWrapper.unmount();
    });
  });

  describe('trend-keyword acknowledgment', () => {
    it('shows each flagged phrase in plain words and never the code, status or key', async () => {
      const wrapper = mountForm(makeTemplate({ body: FLAGGED_BODY }));
      saveResponses.push(() => json(ackWarnings(['key-secret-1']), 422));

      await submit(wrapper);

      const panel = wrapper.find('[data-test="trend-warnings"]');
      expect(panel.exists()).toBe(true);
      expect(panel.attributes('role')).toBe('alert');
      expect(panel.text()).toContain('di luar bagian yang mengikuti angka');
      expect(panel.text()).toContain('Periksa kembali sebelum menyimpan');
      expect(panel.text()).toContain('terus');
      // The excerpt is readable: chips by name, no braces.
      expect(panel.text()).toContain('[Periode sekarang]');
      expect(wrapper.text()).not.toMatch(/key-secret-1|TREND_KEYWORD|ACK_REQUIRED|422|ackKey|[{}]/);
      expect(wrapper.html()).not.toContain('key-secret-1');
      wrapper.unmount();
    });

    it('requires an explicit confirmation per phrase before saving again', async () => {
      const wrapper = mountForm(makeTemplate({ body: FLAGGED_BODY }));
      saveResponses.push(() => json(ackWarnings(['key-1', 'key-2']), 422));
      await submit(wrapper);

      const boxes = wrapper.findAll('[data-test="trend-warning"] input[type="checkbox"]');
      expect(boxes).toHaveLength(2);
      for (const box of boxes) {
        const id = box.attributes('id');
        expect(wrapper.find(`label[for="${id}"]`).exists()).toBe(true);
      }

      const save = wrapper.find('[data-test="save"]');
      expect(save.attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-test="confirm-help"]').exists()).toBe(true);

      await boxes[0]!.setValue(true);
      expect(wrapper.find('[data-test="save"]').attributes('disabled')).toBeDefined();

      await boxes[1]!.setValue(true);
      expect(wrapper.find('[data-test="save"]').attributes('disabled')).toBeUndefined();
      wrapper.unmount();
    });

    it('echoes every ackKey in acknowledgedWarnings once confirmed, then saves', async () => {
      const wrapper = mountForm(makeTemplate({ body: FLAGGED_BODY }));
      saveResponses.push(
        () => json(ackWarnings(['key-1', 'key-2']), 422),
        () => json({ template: makeTemplate({ body: FLAGGED_BODY }) }),
      );
      await submit(wrapper);
      for (const box of wrapper.findAll('[data-test="trend-warning"] input[type="checkbox"]')) {
        await box.setValue(true);
      }

      await submit(wrapper);

      expect(saves()).toHaveLength(2);
      expect(saves()[0]!.body).not.toHaveProperty('acknowledgedWarnings');
      expect(saves()[1]!.body).toMatchObject({ acknowledgedWarnings: ['key-1', 'key-2'] });
      expect(wrapper.emitted('saved')).toHaveLength(1);
      wrapper.unmount();
    });

    it('clears the confirmations after any edit to the main sentence', async () => {
      const wrapper = mountForm(makeTemplate({ body: FLAGGED_BODY }));
      saveResponses.push(
        () => json(ackWarnings(['key-1']), 422),
        () => json({ template: makeTemplate() }),
      );
      await submit(wrapper);
      await wrapper.find('[data-test="trend-warning"] input[type="checkbox"]').setValue(true);
      expect(wrapper.find('[data-test="save"]').attributes('disabled')).toBeUndefined();

      // Edit the wording of the main sentence.
      const body = wrapper.find('[data-test="builder-body"]');
      await body.find('textarea').setValue('Berdasarkan data lain ');

      expect(wrapper.find('[data-test="trend-warning"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="warning-notice"]').text()).toContain(
        'konfirmasi sebelumnya dibatalkan',
      );

      await submit(wrapper);
      expect(saves()[1]!.body).not.toHaveProperty('acknowledgedWarnings');
      wrapper.unmount();
    });

    it('drops the stale "confirmation cancelled" notice on the next edit and on a new save', async () => {
      const wrapper = mountForm(makeTemplate({ body: FLAGGED_BODY }));
      saveResponses.push(
        () => json(ackWarnings(['key-1']), 422),
        () => json({ template: makeTemplate() }),
      );
      await submit(wrapper);
      await wrapper.find('[data-test="builder-body"] textarea').setValue('Berdasarkan data lain ');
      expect(wrapper.find('[data-test="warning-notice"]').exists()).toBe(true);

      await wrapper.find('[data-test="builder-body"] textarea').setValue('Berdasarkan data baru ');
      expect(wrapper.find('[data-test="warning-notice"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="trend-warnings"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('makes each acknowledgment a single click target of at least 44px', async () => {
      const wrapper = mountForm(makeTemplate({ body: FLAGGED_BODY }));
      saveResponses.push(() => json(ackWarnings(['key-1']), 422));
      await submit(wrapper);

      const label = wrapper.find('[data-test="confirm-label"]');
      expect(label.classes()).toContain('min-h-11');
      expect(label.find('input[type="checkbox"]').exists()).toBe(true);
      expect(label.text()).toContain('Saya sudah memeriksa kata');
      wrapper.unmount();
    });

    it('keeps confirmations when only an unrelated field changes', async () => {
      const wrapper = mountForm(makeTemplate({ body: FLAGGED_BODY }));
      saveResponses.push(() => json(ackWarnings(['key-1']), 422));
      await submit(wrapper);
      await wrapper.find('[data-test="trend-warning"] input[type="checkbox"]').setValue(true);

      await wrapper.find('#templat-nama').setValue('Nama lain');

      expect(wrapper.find('[data-test="trend-warning"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="save"]').attributes('disabled')).toBeUndefined();
      wrapper.unmount();
    });
  });

  describe('failures', () => {
    it('keeps the draft and shows approved wording, never the server text, status or code', async () => {
      const wrapper = mountForm();
      saveResponses.push(() =>
        json({ error: 'Body harus memuat tepat satu {trend}; slug duplikat', code: 'X_FAIL' }, 400),
      );
      await wrapper.find('#templat-nama').setValue('Nama yang diedit');

      await submit(wrapper);

      const error = wrapper.find('[data-test="form-error"]').text();
      expect(error).toContain('Gagal menyimpan templat kalimat.');
      expect(error).toContain(USER_MESSAGES.validation);
      expect(error).not.toMatch(/[{}]|slug|X_FAIL|\b400\b/);
      expect((wrapper.find('#templat-nama').element as HTMLInputElement).value).toBe(
        'Nama yang diedit',
      );
      expect(wrapper.find('[data-test="builder-body"] textarea').exists()).toBe(true);
      wrapper.unmount();
    });

    it('shows approved wording for a server failure and lets the Admin retry', async () => {
      const wrapper = mountForm();
      saveResponses.push(
        () => json({ error: 'ECONNREFUSED 10.0.0.5:3306 stack trace' }, 500),
        () => json({ template: makeTemplate() }),
      );

      await submit(wrapper);
      expect(wrapper.find('[data-test="form-error"]').text()).toContain(USER_MESSAGES.server);
      expect(wrapper.text()).not.toMatch(/ECONNREFUSED|3306|500/);

      await submit(wrapper);
      expect(wrapper.emitted('saved')).toHaveLength(1);
      wrapper.unmount();
    });

    it('sends only one request when submitted twice before the first answers', async () => {
      const wrapper = mountForm();
      let release!: (response: Response) => void;
      saveResponses.push(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );

      await wrapper.find('form').trigger('submit');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(saves()).toHaveLength(1);
      expect(wrapper.find('[data-test="save"]').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-test="save"]').text()).toContain('Menyimpan');

      release(json({ template: makeTemplate() }));
      await flushPromises();
      expect(wrapper.emitted('saved')).toHaveLength(1);
      wrapper.unmount();
    });

    it('retries creation with a new key when another admin took the generated one', async () => {
      const wrapper = mountForm(null);
      await wrapper.find('#templat-nama').setValue('Perbandingan tahunan');
      const body = wrapper.find('[data-test="builder-body"]');
      await body.find('[data-chip="trend"]').trigger('click');
      for (const field of ['trendNaik', 'trendTurun', 'trendTetap']) {
        const builder = wrapper.find(`[data-test="builder-${field}"]`);
        await builder.find('[data-action="add-text"]').trigger('click');
        await builder.find('textarea').setValue('x');
      }
      saveResponses.push(
        () => json({ error: 'Slug sudah digunakan' }, 409),
        // refetch of the list shows the key is now taken
        () => json({ templates: [makeTemplate({ slug: 'perbandingan-tahunan' })] }),
        () => json({ template: makeTemplate({ id: 'tpl-9', slug: 'perbandingan-tahunan-2' }) }),
      );

      await submit(wrapper);

      const posts = saves().filter((c) => c.method === 'POST');
      expect(posts.map((c) => c.body?.['slug'])).toEqual([
        'perbandingan-tahunan',
        'perbandingan-tahunan-2',
      ]);
      expect(wrapper.emitted('saved')).toHaveLength(1);
      wrapper.unmount();
    });
  });

  describe('dirty and busy signals for the host', () => {
    it('reports isDirty only once the draft differs from the loaded template', async () => {
      const wrapper = mountForm();
      const form = wrapper.vm as unknown as { isDirty: () => boolean };
      expect(form.isDirty()).toBe(false);

      await wrapper.find('#templat-nama').setValue('Nama lain');
      expect(form.isDirty()).toBe(true);

      await wrapper.find('#templat-nama').setValue('Perbandingan tahunan');
      expect(form.isDirty()).toBe(false);
      wrapper.unmount();
    });

    it('emits busy true while saving and false afterwards', async () => {
      const wrapper = mountForm();
      let release: (r: Response) => void = () => {};
      saveResponses.push(() => new Promise<Response>((resolve) => (release = resolve)));
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      expect(wrapper.emitted('busy')?.slice(-1)[0]).toEqual([true]);

      release(json({ template: makeTemplate() }));
      await flushPromises();
      expect(wrapper.emitted('busy')?.slice(-1)[0]).toEqual([false]);
      wrapper.unmount();
    });
  });

  describe('live preview', () => {
    it('debounces: several edits inside the window cause a single preview request', async () => {
      vi.useFakeTimers();
      const wrapper = mountForm();
      await vi.advanceTimersByTimeAsync(500);
      expect(previews()).toHaveLength(1);

      const text = wrapper.find('[data-test="builder-trendTetap"] textarea');
      await text.setValue('tidak berubah l');
      await vi.advanceTimersByTimeAsync(100);
      await text.setValue('tidak berubah la');
      await vi.advanceTimersByTimeAsync(100);
      await text.setValue('tidak berubah lagi');
      expect(previews()).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(previews()).toHaveLength(2);
      expect(previews()[1]!.body).toMatchObject({ trendTetap: 'tidak berubah lagi' });
      expect(previews()[1]!.body).not.toHaveProperty('label');
      wrapper.unmount();
    });

    it('shows each rendered sentence and the zero-previous note, in a polite live region', async () => {
      vi.useFakeTimers();
      const wrapper = mountForm();
      await vi.advanceTimersByTimeAsync(500);
      await flushPromises();

      const items = wrapper.findAll('[data-test="preview-item"]');
      expect(items).toHaveLength(2);
      expect(items[0]!.text()).toContain('Kalimat contoh naik.');
      expect(wrapper.find('[data-test="preview-note"]').text()).toContain(
        'tidak ditampilkan untuk contoh ini',
      );
      // Only a short status is announced; the sentences stay outside the live region.
      const live = wrapper.find('[data-test="preview"] [aria-live="polite"]');
      expect(live.text()).toBe('Pratinjau diperbarui');
      expect(live.find('[data-test="preview-item"]').exists()).toBe(false);
      expect(live.element.contains(items[0]!.element)).toBe(false);
      wrapper.unmount();
    });

    it('does not call the server while the sentences are incomplete', async () => {
      vi.useFakeTimers();
      const wrapper = mountForm(null);
      await vi.advanceTimersByTimeAsync(1000);

      expect(previews()).toHaveLength(0);
      expect(wrapper.find('[data-test="preview-incomplete"]').text()).toContain('lengkap');
      wrapper.unmount();
    });

    it('keeps the form usable and says so when the preview cannot load', async () => {
      vi.useFakeTimers();
      previewResponse = () => json({ error: 'boom' }, 500);
      const wrapper = mountForm();
      await vi.advanceTimersByTimeAsync(500);
      await flushPromises();

      expect(wrapper.find('[data-test="preview-error"]').text()).toContain(
        'Pratinjau belum bisa dimuat',
      );
      expect(wrapper.find('[data-test="preview-error"]').text()).not.toMatch(/500|boom/);
      expect(wrapper.find('[data-test="save"]').attributes('disabled')).toBeUndefined();
      wrapper.unmount();
    });
  });
});
