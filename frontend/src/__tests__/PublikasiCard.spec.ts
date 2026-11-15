import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PublikasiCard from '../components/admin/publikasi/PublikasiCard.vue';
import type { PublicationItem } from '../content/publikasi';

const DOC = '11111111-1111-4111-8111-111111111111';

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
};

const PENDING: PublicationItem = {
  category: 'Infografis',
  title: 'Infografis Kelurahan',
  description: 'Ringkasan visual.',
  isAvailableOnline: false,
};

function mountCard(publication: PublicationItem, extra: Record<string, unknown> = {}) {
  return mount(PublikasiCard, { props: { publication, ...extra } });
}

describe('PublikasiCard', () => {
  it('shows the category chip, title, page and month line, description and file facts', () => {
    const wrapper = mountCard(UPLOADED);
    expect(wrapper.find('[data-test="card-category"]').text()).toBe('Statistik');
    expect(wrapper.find('h3').text()).toBe('Manggar dalam Angka 2026');
    expect(wrapper.find('[data-test="card-meta"]').text()).toBe(
      '120 Halaman, Diterbitkan Maret 2026',
    );
    expect(wrapper.text()).toContain('Kompilasi data statistik sektoral.');
    expect(wrapper.find('[data-test="card-file"]').text()).toBe('PDF · 9.4 MB');
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

  it('omits the meta and file lines when those facts are not stored', () => {
    const wrapper = mountCard(PENDING);
    expect(wrapper.find('[data-test="card-meta"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="card-file"]').exists()).toBe(false);
  });

  it('names each action with the visible word first and the publication title after it', () => {
    const wrapper = mountCard(UPLOADED);
    const names = ['Ubah', 'Hapus', 'Unduh', 'Naik', 'Turun'].map((word) =>
      wrapper
        .findAll('a, button')
        .find((element) => element.text().startsWith(word))
        ?.text()
        .replace(/\s+/g, ' ')
        .trim(),
    );
    expect(names).toEqual([
      'Ubah publikasi Manggar dalam Angka 2026',
      'Hapus publikasi Manggar dalam Angka 2026',
      'Unduh publikasi Manggar dalam Angka 2026',
      'Naik publikasi Manggar dalam Angka 2026',
      'Turun publikasi Manggar dalam Angka 2026',
    ]);
  });

  it('emits the action it was clicked for', async () => {
    const wrapper = mountCard(UPLOADED, { canMoveUp: true, canMoveDown: true });
    await wrapper.find('[data-test="card-edit"]').trigger('click');
    await wrapper.find('[data-test="card-delete"]').trigger('click');
    await wrapper.find('[data-test="card-move-up"]').trigger('click');
    await wrapper.find('[data-test="card-move-down"]').trigger('click');
    expect(wrapper.emitted('edit')).toHaveLength(1);
    expect(wrapper.emitted('delete')).toHaveLength(1);
    expect(wrapper.emitted('move-up')).toHaveLength(1);
    expect(wrapper.emitted('move-down')).toHaveLength(1);
  });

  it('disables Naik and Turun at the ends of the list, and while busy', () => {
    const wrapper = mountCard(UPLOADED);
    expect(wrapper.find('[data-test="card-move-up"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="card-move-down"]').attributes('disabled')).toBeDefined();

    const busy = mountCard(UPLOADED, { canMoveUp: true, canMoveDown: true, busy: true });
    expect(busy.find('[data-test="card-edit"]').attributes('disabled')).toBeDefined();
    expect(busy.find('[data-test="card-move-up"]').attributes('disabled')).toBeDefined();
  });
});
