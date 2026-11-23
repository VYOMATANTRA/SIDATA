import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import CeritaLivePreview from '../components/admin/cerita/CeritaLivePreview.vue';
import { fetchMediaPreviewBlob } from '../services/media.service';

vi.mock('../services/media.service', () => ({
  fetchMediaPreviewBlob: vi.fn<() => Promise<Blob>>(
    async () => new Blob(['img'], { type: 'image/webp' }),
  ),
  mediaPreviewPath: (id: string) => `/api/media/${id}/preview`,
}));

const MEDIA = '0f3e1c2a-1111-4222-8333-444455556666';

let urlCounter = 0;

beforeEach(() => {
  urlCounter = 0;
  vi.mocked(fetchMediaPreviewBlob).mockClear();
  URL.createObjectURL = vi.fn<(blob: Blob) => string>(
    () => `blob:http://localhost/${++urlCounter}`,
  );
  URL.revokeObjectURL = vi.fn<(url: string) => void>();
});

function mountPreview(props: Partial<InstanceType<typeof CeritaLivePreview>['$props']> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(CeritaLivePreview, {
    props: {
      sectionTitle: 'Ringkasan',
      paragraphs: ['Isi **tebal** paragraf.'],
      figure: null,
      ...props,
    },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
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
              {
                id: 'r2',
                tableId: 'tab-umur',
                rowKey: 'k2',
                label: '5-9',
                male: 8,
                female: 9,
                total: 17,
                sortOrder: 1,
                createdAt: '',
                updatedAt: '',
              },
            ],
            totals: { rowCount: 2, male: 18, female: 21, total: 39 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

describe('CeritaLivePreview', () => {
  it('renders the section title and each stored paragraph through the public prose component', () => {
    const wrapper = mountPreview({ paragraphs: ['Satu.', 'Isi **tebal** paragraf.'] });

    expect(wrapper.find('h4').text()).toBe('Ringkasan');
    const prose = wrapper.findAll('[data-test="section-prose"]');
    expect(prose).toHaveLength(2);
    expect(prose[1]!.find('strong').text()).toBe('tebal');
    wrapper.unmount();
  });

  it('says so when the section has no saved paragraph or figure', () => {
    const wrapper = mountPreview({ paragraphs: [] });

    expect(wrapper.find('[data-test="preview-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('switches between Desktop and Ponsel with pressed buttons and narrows the frame for Ponsel', async () => {
    const wrapper = mountPreview();
    const desktop = wrapper.find('[data-test="preview-desktop"]');
    const phone = wrapper.find('[data-test="preview-phone"]');
    expect(desktop.attributes('aria-pressed')).toBe('true');
    expect(phone.attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('Ukuran pratinjau');

    await phone.trigger('click');

    expect(phone.attributes('aria-pressed')).toBe('true');
    expect(desktop.attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-test="preview-frame"]').attributes('data-mode')).toBe('phone');
    expect(wrapper.find('[data-test="preview-frame"]').classes()).toContain('max-w-[375px]');
    wrapper.unmount();
  });

  it('loads a stored photo through the authenticated preview route and never points an image at the API', async () => {
    const wrapper = mountPreview({
      figure: {
        kind: 'photo',
        photo: { id: MEDIA, src: `/api/media/${MEDIA}`, alt: 'Balai kelurahan' },
      },
    });
    await flushPromises();

    expect(fetchMediaPreviewBlob).toHaveBeenCalledWith(`/api/media/${MEDIA}/preview`);
    const images = wrapper.findAll('img');
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.attributes('src') ?? '').not.toMatch(/^\/api\/media/);
    }
    expect(images[0]!.attributes('src')).toBe('blob:http://localhost/1');
    wrapper.unmount();
  });

  it('says when a photo could not be fetched, instead of showing a broken picture', async () => {
    vi.mocked(fetchMediaPreviewBlob).mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountPreview({
      figure: {
        kind: 'photo',
        photo: { id: MEDIA, src: `/api/media/${MEDIA}`, alt: 'Balai' },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-test="preview-figure-unavailable"]').exists()).toBe(true);
    expect(wrapper.findAll('img')).toHaveLength(0);
    wrapper.unmount();
  });

  it('draws a stored chart from the table it names, with the same chart the public page draws', async () => {
    stubTable();
    const wrapper = mountPreview({
      figure: {
        kind: 'chart',
        tableId: 'tab-umur',
        chartType: 'column',
        series: 'by_sex',
        title: 'Penduduk menurut umur',
        source: 'Contoh BPS 2024',
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-test="chart-title"]').text()).toBe('Penduduk menurut umur');
    expect(wrapper.find('[data-test="chart-source"]').text()).toBe('Sumber: Contoh BPS 2024');
    expect(wrapper.find('[data-test="preview-figure-unavailable"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('says a chart cannot be shown when its table cannot be fetched, instead of drawing nothing silently', async () => {
    stubTable(404);
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

    expect(wrapper.find('[data-test="figure-chart"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="preview-figure-unavailable"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
