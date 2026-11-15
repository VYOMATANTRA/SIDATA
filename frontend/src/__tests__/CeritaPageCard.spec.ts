import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CeritaPageCard from '../components/admin/cerita/CeritaPageCard.vue';
import { ceritaCoverFor } from '../content/ceritaCovers';
import { fetchMediaPreviewBlob } from '../services/media.service';
import type { AdminPage } from '../stores/ceritaAdmin.store';

vi.mock('../services/media.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/media.service')>()),
  fetchMediaPreviewBlob: vi.fn<(path: string) => Promise<Blob>>(
    async () => new Blob(['x'], { type: 'image/webp' }),
  ),
}));

beforeEach(() => {
  vi.mocked(fetchMediaPreviewBlob).mockClear();
  URL.createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:cover-thumb');
  URL.revokeObjectURL = vi.fn<(url: string) => void>();
});

const page: AdminPage = {
  id: 'p1',
  slug: 'kependudukan',
  title: 'Kependudukan',
  coverAssetId: null,
  headline: null,
  bylineAuthor: null,
  bylineAffiliation: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  chapters: [],
};

/** A dragover/drop event the way the browser sends one, cancelable so preventDefault is visible. */
function dragEvent(type: 'dragover' | 'drop'): Event {
  return new Event(type, { bubbles: true, cancelable: true });
}

describe('CeritaPageCard drag guard', () => {
  it('ignores a file or text dragged in from outside: nothing is prevented or reported', async () => {
    const wrapper = mount(CeritaPageCard, { props: { page, sorting: true, dragActive: false } });
    const card = wrapper.element as HTMLElement;

    const over = dragEvent('dragover');
    card.dispatchEvent(over);
    const dropped = dragEvent('drop');
    card.dispatchEvent(dropped);
    await wrapper.vm.$nextTick();

    expect(over.defaultPrevented).toBe(false);
    expect(dropped.defaultPrevented).toBe(false);
    expect(wrapper.emitted('drag-over')).toBeUndefined();
    expect(wrapper.emitted('drop')).toBeUndefined();
    wrapper.unmount();
  });

  it('handles a drag of a card from this list: the drop is accepted and reported', async () => {
    const wrapper = mount(CeritaPageCard, { props: { page, sorting: true, dragActive: true } });
    const card = wrapper.element as HTMLElement;

    const over = dragEvent('dragover');
    card.dispatchEvent(over);
    card.dispatchEvent(dragEvent('drop'));
    await wrapper.vm.$nextTick();

    expect(over.defaultPrevented).toBe(true);
    expect(wrapper.emitted('drag-over')).toHaveLength(1);
    expect(wrapper.emitted('drop')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('CeritaPageCard thumbnail', () => {
  it('emits thumbnail when clicking card-thumbnail-btn', async () => {
    const wrapper = mount(CeritaPageCard, { props: { page } });
    const btn = wrapper.find('[data-test="card-thumbnail-btn"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('Thumbnail');
    expect(btn.attributes('id')).toBe('cerita-kartu-kependudukan-thumbnail');

    await btn.trigger('click');
    expect(wrapper.emitted('thumbnail')).toHaveLength(1);
    wrapper.unmount();
  });

  it('loads custom coverAssetId via useAuthenticatedBlobUrl (?variant=thumbnail) instead of ceritaCoverFor', async () => {
    const wrapper = mount(CeritaPageCard, {
      props: { page: { ...page, coverAssetId: 'asset-1' } },
    });
    await flushPromises();

    expect(fetchMediaPreviewBlob).toHaveBeenCalledWith(
      '/api/media/asset-1/preview?variant=thumbnail',
    );
    expect(wrapper.find('[data-test="thumbnail-image"]').attributes('src')).toBe('blob:cover-thumb');
    wrapper.unmount();
  });

  it('waits until near the viewport via IntersectionObserver before fetching custom cover', async () => {
    let onIntersect: IntersectionObserverCallback = () => {};
    const observe = vi.fn<(target: Element) => void>();
    const disconnect = vi.fn<() => void>();
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (callback: IntersectionObserverCallback) {
        onIntersect = callback;
        return {
          observe,
          disconnect,
          unobserve: vi.fn<(target: Element) => void>(),
          takeRecords: vi.fn<() => IntersectionObserverEntry[]>(),
        };
      }),
    );
    try {
      const wrapper = mount(CeritaPageCard, {
        props: { page: { ...page, coverAssetId: 'asset-1' } },
      });
      await flushPromises();
      expect(observe).toHaveBeenCalledTimes(1);
      expect(fetchMediaPreviewBlob).not.toHaveBeenCalled();
      expect(wrapper.find('[data-test="thumbnail-image"]').attributes('src')).toBe(
        ceritaCoverFor('kependudukan'),
      );

      onIntersect(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await flushPromises();
      expect(fetchMediaPreviewBlob).toHaveBeenCalledWith(
        '/api/media/asset-1/preview?variant=thumbnail',
      );
      expect(wrapper.find('[data-test="thumbnail-image"]').attributes('src')).toBe(
        'blob:cover-thumb',
      );
      wrapper.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows bundled ceritaCoverFor while custom blob fetch is pending and switches once resolved', async () => {
    let resolveBlob!: (blob: Blob) => void;
    vi.mocked(fetchMediaPreviewBlob).mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolveBlob = resolve;
        }),
    );

    const wrapper = mount(CeritaPageCard, {
      props: { page: { ...page, coverAssetId: 'asset-1' } },
    });
    await flushPromises();
    expect(wrapper.find('[data-test="thumbnail-image"]').attributes('src')).toBe(
      ceritaCoverFor('kependudukan'),
    );

    resolveBlob(new Blob(['x'], { type: 'image/webp' }));
    await flushPromises();
    expect(wrapper.find('[data-test="thumbnail-image"]').attributes('src')).toBe('blob:cover-thumb');
    wrapper.unmount();
  });
});
