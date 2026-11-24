import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import CeritaLivePreview from '../components/admin/cerita/CeritaLivePreview.vue';
import { fetchMediaPreviewBlob } from '../services/media.service';
import type { ArticleFigure } from '../types/ceritaArticle';

vi.mock('../services/media.service', () => ({
  fetchMediaPreviewBlob: vi.fn<() => Promise<Blob>>(
    async () => new Blob(['img'], { type: 'image/webp' }),
  ),
  mediaPreviewPath: (id: string) => `/api/media/${id}/preview`,
}));

const MEDIA = '0f3e1c2a-1111-4222-8333-444455556666';
const ORIGIN = window.location.origin;

let urlCounter = 0;

beforeEach(() => {
  urlCounter = 0;
  vi.mocked(fetchMediaPreviewBlob).mockClear();
  URL.createObjectURL = vi.fn<(blob: Blob) => string>(
    () => `blob:http://localhost/${++urlCounter}`,
  );
  URL.revokeObjectURL = vi.fn<(url: string) => void>();
});

afterEach(() => {
  vi.useRealTimers();
});

type Props = InstanceType<typeof CeritaLivePreview>['$props'];

function mountPreview(props: Partial<Props> = {}): VueWrapper {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(CeritaLivePreview, {
    props: {
      sectionTitle: 'Ringkasan',
      body: 'Isi **tebal** paragraf.',
      chapterLabel: 'Bab 1 · Kependudukan',
      figure: null,
      ...props,
    },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
}

/** The preview iframe's window, which the component posts to. */
function frameWindow(wrapper: VueWrapper): Window {
  const win = wrapper.find('iframe').element.contentWindow;
  if (!win) throw new Error('the preview iframe has no window');
  return win;
}

/** The last message the component posted to the preview, as the preview would receive it. */
function postedMessages(wrapper: VueWrapper): Array<Record<string, unknown>> {
  const spy = vi.mocked(frameWindow(wrapper).postMessage);
  return spy.mock.calls.map(([message]) => message as Record<string, unknown>);
}

/** Dispatches a message event to the page, as if the preview sent it. */
function receive(data: unknown, source: unknown, origin = ORIGIN): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
}

/** Answers the indicator-table detail route the preview reads a chart's table from. */
function stubTable(status = 200): void {
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/indicator-tables/tab-umur')) {
      if (status !== 200) {
        return new Response(JSON.stringify({ error: 'x' }), { status });
      }
      return new Response(
        JSON.stringify({
          table: {
            id: 'tab-umur',
            sectionId: 's1',
            slug: 'umur',
            title: 'Umur',
            kind: 'age_pyramid',
            period: 'Juni 2024',
            source: null,
            sortOrder: 0,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            rows: [
              {
                id: 'r1',
                tableId: 'tab-umur',
                rowKey: 'k1',
                label: '0-4',
                male: 10,
                female: 12,
                total: 22,
                sortOrder: 0,
                createdAt: '',
                updatedAt: '',
              },
            ],
            totals: { rowCount: 1, male: 10, female: 12, total: 22 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

describe('CeritaLivePreview: the frame', () => {
  it('is a same-origin iframe of the bare preview route, titled and kept out of the tab order', () => {
    const wrapper = mountPreview();
    const iframe = wrapper.find('iframe');

    expect(iframe.attributes('src')).toBe('/admin/cerita/pratinjau');
    expect(iframe.attributes('title')).toBe('Pratinjau bagian');
    expect(iframe.attributes('tabindex')).toBe('-1');
    wrapper.unmount();
  });

  it('shows the Desktop and Ponsel modes as a labelled group of pressed buttons', async () => {
    const wrapper = mountPreview();
    const desktop = wrapper.find('[data-test="preview-desktop"]');
    const phone = wrapper.find('[data-test="preview-phone"]');

    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('Ukuran pratinjau');
    expect(desktop.attributes('aria-pressed')).toBe('true');
    expect(phone.attributes('aria-pressed')).toBe('false');

    await phone.trigger('click');

    expect(phone.attributes('aria-pressed')).toBe('true');
    expect(desktop.attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-test="preview-frame"]').attributes('data-mode')).toBe('phone');
    wrapper.unmount();
  });

  it('draws Desktop at the reader width of 1280px and Ponsel at 390px, not a narrower column', async () => {
    const wrapper = mountPreview();
    const iframe = wrapper.find('iframe');

    expect(iframe.attributes('style')).toContain('width: 1280px');

    await wrapper.find('[data-test="preview-phone"]').trigger('click');

    expect(iframe.attributes('style')).toContain('width: 390px');
    expect(iframe.attributes('style')).not.toContain('width: 1280px');
    wrapper.unmount();
  });

  it('does not show the old "saved content" wording any more', () => {
    const wrapper = mountPreview();

    expect(wrapper.text()).not.toContain('Menampilkan isi yang sudah disimpan');
    expect(wrapper.text()).toContain('Perubahan tampil di situs setelah Simpan perubahan');
    wrapper.unmount();
  });
});

describe('CeritaLivePreview: sending the draft', () => {
  it('sends the ready draft to the frame when the preview says it is ready', () => {
    const wrapper = mountPreview({ sectionTitle: 'Ringkasan' });
    const frame = wrapper.find('iframe').element as HTMLIFrameElement;
    vi.spyOn(frameWindow(wrapper), 'postMessage');

    receive({ type: 'cerita-preview-ready' }, frame.contentWindow);

    const [message] = postedMessages(wrapper);
    expect(message).toMatchObject({
      type: 'cerita-preview',
      title: 'Ringkasan',
      body: 'Isi **tebal** paragraf.',
      chapterLabel: 'Bab 1 · Kependudukan',
      figure: null,
      tables: {},
    });
    wrapper.unmount();
  });

  it('posts to the same origin only', () => {
    const wrapper = mountPreview();
    vi.spyOn(frameWindow(wrapper), 'postMessage');
    const frame = wrapper.find('iframe').element as HTMLIFrameElement;

    receive({ type: 'cerita-preview-ready' }, frame.contentWindow);

    expect(vi.mocked(frameWindow(wrapper).postMessage).mock.calls[0]?.[1]).toBe(ORIGIN);
    wrapper.unmount();
  });

  it('re-sends the draft after a short pause when the title or body changes', async () => {
    vi.useFakeTimers();
    const wrapper = mountPreview({ sectionTitle: 'Ringkasan' });
    vi.spyOn(frameWindow(wrapper), 'postMessage');

    await wrapper.setProps({ sectionTitle: 'Ringkasan baru', body: 'Isi baru.' });
    await wrapper.setProps({ body: 'Isi baru lagi.' });
    expect(vi.mocked(frameWindow(wrapper).postMessage)).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);

    const posted = postedMessages(wrapper);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ title: 'Ringkasan baru', body: 'Isi baru lagi.' });
    wrapper.unmount();
  });

  it('sends a photo as a blob URL, never as an address the preview would fetch unauthenticated', async () => {
    const wrapper = mountPreview({
      figure: {
        kind: 'photo',
        photo: { id: `/api/media/${MEDIA}`, src: `/api/media/${MEDIA}`, alt: 'Balai' },
      },
    });
    await flushPromises();
    vi.spyOn(frameWindow(wrapper), 'postMessage');

    receive({ type: 'cerita-preview-ready' }, wrapper.find('iframe').element.contentWindow);

    expect(fetchMediaPreviewBlob).toHaveBeenCalledWith(`/api/media/${MEDIA}/preview`);
    const [message] = postedMessages(wrapper);
    const figure = message?.['figure'] as ArticleFigure;
    expect(figure.kind).toBe('photo');
    if (figure.kind !== 'photo') return;
    expect(figure.photo.src).toBe('blob:http://localhost/1');
    wrapper.unmount();
  });

  it('sends the page table a chart reads, so the preview draws the same numbers', async () => {
    stubTable();
    const wrapper = mountPreview({
      figure: {
        kind: 'chart',
        tableId: 'tab-umur',
        chartType: 'bar',
        series: 'total',
        title: 'Penduduk',
      },
    });
    await flushPromises();
    vi.spyOn(frameWindow(wrapper), 'postMessage');

    receive({ type: 'cerita-preview-ready' }, wrapper.find('iframe').element.contentWindow);

    const [message] = postedMessages(wrapper);
    expect(Object.keys(message?.['tables'] as object)).toEqual(['tab-umur']);
    wrapper.unmount();
  });

  it('says when a photo could not be fetched, instead of sending a broken picture', async () => {
    vi.mocked(fetchMediaPreviewBlob).mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountPreview({
      figure: {
        kind: 'photo',
        photo: { id: `/api/media/${MEDIA}`, src: `/api/media/${MEDIA}`, alt: 'Balai' },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-test="preview-figure-unavailable"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('CeritaLivePreview: messages from the frame', () => {
  it('sizes the frame from the height the preview reports', async () => {
    const wrapper = mountPreview();
    const frame = wrapper.find('iframe').element as HTMLIFrameElement;

    receive({ type: 'cerita-preview-height', height: 730 }, frame.contentWindow);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('iframe').attributes('style')).toContain('height: 730px');
    wrapper.unmount();
  });

  it('ignores a height or ready message from another origin', async () => {
    const wrapper = mountPreview();
    vi.spyOn(frameWindow(wrapper), 'postMessage');
    const frame = wrapper.find('iframe').element as HTMLIFrameElement;

    receive({ type: 'cerita-preview-height', height: 900 }, frame.contentWindow, 'https://evil.example');
    receive({ type: 'cerita-preview-ready' }, frame.contentWindow, 'https://evil.example');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('iframe').attributes('style')).not.toContain('height: 900px');
    expect(vi.mocked(frameWindow(wrapper).postMessage)).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores a message from a window other than the preview frame', async () => {
    const wrapper = mountPreview();
    vi.spyOn(frameWindow(wrapper), 'postMessage');

    receive({ type: 'cerita-preview-ready' }, window);
    receive({ type: 'cerita-preview-height', height: 900 }, window);
    await wrapper.vm.$nextTick();

    expect(vi.mocked(frameWindow(wrapper).postMessage)).not.toHaveBeenCalled();
    expect(wrapper.find('iframe').attributes('style')).not.toContain('height: 900px');
    wrapper.unmount();
  });
});

describe('CeritaLivePreview: the chart table cannot be fetched', () => {
  it('says the figure is unavailable instead of drawing nothing', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 404 }));
    const wrapper = mountPreview({
      figure: {
        kind: 'chart',
        tableId: 'tab-umur',
        chartType: 'bar',
        series: 'total',
        title: 'Penduduk',
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-test="preview-figure-unavailable"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
