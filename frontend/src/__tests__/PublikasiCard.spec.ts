import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PublikasiCard from '../components/admin/publikasi/PublikasiCard.vue';
import type { PublicationItem } from '../content/publikasi';
import { fetchMediaPreviewBlob } from '../services/media.service';

vi.mock('../services/media.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/media.service')>()),
  fetchMediaPreviewBlob: vi.fn<(path: string) => Promise<Blob>>(
    async () => new Blob(['x'], { type: 'image/webp' }),
  ),
}));

const DOC = '11111111-1111-4111-8111-111111111111';
const COVER = '22222222-2222-4222-8222-222222222222';

const UPLOADED: PublicationItem = {
  category: 'Statistik',
  title: 'Manggar dalam Angka 2026',
  description: 'Kompilasi data statistik sektoral.',
  isAvailableOnline: true,
  documentAssetId: DOC,
  fileType: 'PDF',
  fileSizeBytes: 9_856_000,
  pageCount: 120,
  publishedAt: '2026-03',
  source: 'Manggar Dalam Angka 2026.pdf',
};

const PENDING: PublicationItem = {
  category: 'Infografis',
  title: 'Infografis Kelurahan',
  description: 'Ringkasan visual.',
  isAvailableOnline: false,
};

function mountCard(
  publication: PublicationItem,
  extra: Record<string, unknown> = {},
) {
  return mount(PublikasiCard, { props: { publication, idPrefix: 'card-test', ...extra } });
}

beforeEach(() => {
  vi.mocked(fetchMediaPreviewBlob).mockClear();
  URL.createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:cover');
  URL.revokeObjectURL = vi.fn<(url: string) => void>();
});

describe('PublikasiCard', () => {
  it('shows the category, title, description and the five labelled facts', () => {
    const wrapper = mountCard(UPLOADED);
    expect(wrapper.find('[data-test="card-category"]').text()).toBe('Statistik');
    expect(wrapper.find('h3').text()).toBe('Manggar dalam Angka 2026');
    expect(wrapper.find('[data-test="card-description"]').text()).toBe(
      'Kompilasi data statistik sektoral.',
    );
    expect(wrapper.find('[data-test="card-pages"]').text()).toBe('120');
    expect(wrapper.find('[data-test="card-published"]').text()).toBe('Maret 2026');
    expect(wrapper.find('[data-test="card-format"]').text()).toBe('PDF');
    expect(wrapper.find('[data-test="card-size"]').text()).toBe('9.4 MB');
    expect(wrapper.find('[data-test="card-source"]').text()).toBe('Manggar Dalam Angka 2026.pdf');
    const labels = wrapper.findAll('dt').map((dt) => dt.text());
    expect(labels).toEqual(['Halaman', 'Diterbitkan', 'Format', 'Ukuran', 'Sumber']);
  });

  it('shows an em dash for every fact that is not stored', () => {
    const wrapper = mountCard(PENDING);
    for (const test of ['card-pages', 'card-published', 'card-format', 'card-size', 'card-source']) {
      expect(wrapper.find(`[data-test="${test}"]`).text()).toBe('—');
    }
  });

  it('links Unduh to the public download route only for a downloadable publication', () => {
    const wrapper = mountCard(UPLOADED);
    const download = wrapper.find('[data-test="card-download"]');
    expect(download.element.tagName).toBe('A');
    expect(download.attributes('href')).toBe(`/api/media/${DOC}/download`);
    expect(wrapper.find('[data-test="card-status"]').exists()).toBe(false);

    const pending = mountCard(PENDING);
    expect(pending.find('[data-test="card-download"]').exists()).toBe(false);
    expect(pending.find('[data-test="card-status"]').text()).toBe('Segera hadir');
  });

  it('names each action with the visible word first and the publication title after it', async () => {
    const wrapper = mountCard(UPLOADED, { sorting: true, canMoveUp: true, canMoveDown: true });
    const names = ['Unduh', 'Ubah', 'Hapus', 'Naik', 'Turun'].map((word) =>
      wrapper
        .findAll('a, button')
        .find((element) => element.text().startsWith(word))
        ?.text()
        .replace(/\s+/g, ' ')
        .trim(),
    );
    expect(names).toEqual([
      'Unduh publikasi Manggar dalam Angka 2026',
      'Ubah publikasi Manggar dalam Angka 2026',
      'Hapus publikasi Manggar dalam Angka 2026',
      'Naik publikasi Manggar dalam Angka 2026',
      'Turun publikasi Manggar dalam Angka 2026',
    ]);
  });

  it('shows Naik and Turun only in Urutkan mode', () => {
    expect(mountCard(UPLOADED).find('[data-test="card-move-up"]').exists()).toBe(false);
    expect(mountCard(UPLOADED, { sorting: true }).find('[data-test="card-move-up"]').exists()).toBe(
      true,
    );
  });

  it('emits the action it was clicked for, and the checkbox toggles the selection', async () => {
    const wrapper = mountCard(UPLOADED, { sorting: true, canMoveUp: true, canMoveDown: true });
    await wrapper.find('[data-test="card-edit"]').trigger('click');
    await wrapper.find('[data-test="card-delete"]').trigger('click');
    await wrapper.find('[data-test="card-move-up"]').trigger('click');
    await wrapper.find('[data-test="card-move-down"]').trigger('click');
    await wrapper.find('[data-test="publication-checkbox"]').setValue(true);
    expect(wrapper.emitted('edit')).toHaveLength(1);
    expect(wrapper.emitted('delete')).toHaveLength(1);
    expect(wrapper.emitted('move')).toEqual([[-1], [1]]);
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });

  it('marks a selected card with the tinted fill and stronger border', () => {
    const plain = mountCard(UPLOADED);
    expect(plain.find('[data-test="publication-card"]').attributes('data-selected')).toBe('false');
    expect(plain.find('[data-test="publication-card"]').classes()).toContain('border-border');

    const picked = mountCard(UPLOADED, { selected: true });
    const card = picked.find('[data-test="publication-card"]');
    expect(card.attributes('data-selected')).toBe('true');
    expect(card.classes()).toContain('border-brand-navy');
    expect(card.classes()).toContain('bg-surface-hover');
    expect(picked.find('[data-test="publication-checkbox"]').element).toHaveProperty(
      'checked',
      true,
    );
  });

  it('disables Naik and Turun at the ends of the list, and while busy', () => {
    const wrapper = mountCard(UPLOADED, { sorting: true });
    expect(wrapper.find('[data-test="card-move-up"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="card-move-down"]').attributes('disabled')).toBeDefined();

    const busy = mountCard(UPLOADED, { sorting: true, canMoveUp: true, canMoveDown: true, busy: true });
    expect(busy.find('[data-test="card-edit"]').attributes('disabled')).toBeDefined();
    expect(busy.find('[data-test="card-move-up"]').attributes('disabled')).toBeDefined();
  });

  it('keeps a grip drag-start and reports it, and is not draggable while a filter blocks it', async () => {
    const wrapper = mountCard(UPLOADED);
    expect(wrapper.find('[data-test="grip"]').attributes('draggable')).toBe('true');
    await wrapper.find('[data-test="grip"]').trigger('dragstart');
    expect(wrapper.emitted('drag-start')).toHaveLength(1);

    const blocked = mountCard(UPLOADED, { dragBlock: 'search' });
    expect(blocked.find('[data-test="grip"]').attributes('draggable')).toBe('false');
    expect(blocked.find('[data-test="grip"]').attributes('title')).toContain('pencarian');
  });

  it('shows a drop line on the side the card would land', () => {
    const wrapper = mountCard(UPLOADED, { dropEdge: 'before' });
    expect(wrapper.find('[data-test="drop-indicator"]').attributes('data-edge')).toBe('before');
  });

  describe('cover', () => {
    it('loads the stored cover through the authenticated preview as a blob, thumbnail size', async () => {
      const wrapper = mountCard({ ...UPLOADED, coverAssetId: COVER });
      await flushPromises();
      expect(fetchMediaPreviewBlob).toHaveBeenCalledWith(
        `/api/media/${COVER}/preview?variant=thumbnail`,
      );
      expect(wrapper.find('[data-test="card-cover"]').attributes('src')).toBe('blob:cover');
      expect(wrapper.find('[data-test="card-cover"]').attributes('alt')).toBe('');
    });

    it('shows a neutral placeholder and fetches nothing when there is no cover', async () => {
      const wrapper = mountCard(UPLOADED);
      await flushPromises();
      expect(fetchMediaPreviewBlob).not.toHaveBeenCalled();
      expect(wrapper.find('[data-test="card-cover-placeholder"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="card-cover"]').exists()).toBe(false);
    });

    it('waits until the card is near the viewport before requesting the cover', async () => {
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
        const wrapper = mountCard({ ...UPLOADED, coverAssetId: COVER });
        await flushPromises();
        expect(observe).toHaveBeenCalledTimes(1);
        expect(fetchMediaPreviewBlob).not.toHaveBeenCalled();

        onIntersect(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
        await flushPromises();
        expect(fetchMediaPreviewBlob).toHaveBeenCalledTimes(1);
        expect(wrapper.find('[data-test="card-cover"]').exists()).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
