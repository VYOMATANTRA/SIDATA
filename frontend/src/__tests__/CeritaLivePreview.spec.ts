import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CeritaLivePreview from '../components/admin/cerita/CeritaLivePreview.vue';
import { fetchMediaPreviewBlob } from '../services/media.service';

vi.mock('../services/media.service', () => ({
  fetchMediaPreviewBlob: vi.fn<() => Promise<Blob>>(async () => new Blob(['img'], { type: 'image/webp' })),
  mediaPreviewPath: (id: string) => `/api/media/${id}/preview`,
}));

const MEDIA = '0f3e1c2a-1111-4222-8333-444455556666';

let urlCounter = 0;

beforeEach(() => {
  urlCounter = 0;
  vi.mocked(fetchMediaPreviewBlob).mockClear();
  URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => `blob:http://localhost/${++urlCounter}`);
  URL.revokeObjectURL = vi.fn<(url: string) => void>();
});

function mountPreview(props: Partial<InstanceType<typeof CeritaLivePreview>['$props']> = {}) {
  return mount(CeritaLivePreview, {
    props: {
      sectionTitle: 'Ringkasan',
      paragraphs: ['Isi **tebal** paragraf.'],
      figure: null,
      ...props,
    },
    attachTo: document.body,
  });
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

  it('names a stored chart instead of drawing it, since its numbers come from the site table', () => {
    const wrapper = mountPreview({
      figure: {
        kind: 'chart',
        tableId: 't1',
        chartType: 'bar',
        series: 'total',
        title: 'Jumlah penduduk',
      },
    });

    expect(wrapper.find('[data-test="preview-figure"]').text()).toContain('Jumlah penduduk');
    wrapper.unmount();
  });
});
