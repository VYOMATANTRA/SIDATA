import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CeritaStructureTree from '../components/admin/cerita/CeritaStructureTree.vue';
import type { AdminPage } from '../stores/ceritaAdmin.store';
import { figureTreeLabel } from '../utils/ceritaTreeLabels';

const page: AdminPage = {
  id: 'page-1',
  slug: 'kependudukan',
  title: 'Kependudukan',
  headline: null,
  bylineAuthor: null,
  bylineAffiliation: null,
  sortOrder: 0,
  updatedAt: '2026-11-13T10:00:00.000Z',
  createdAt: '2026-11-13T10:00:00.000Z',
  chapters: [
    {
      id: 'chap-1',
      slug: 'jumlah-penduduk',
      number: null,
      title: 'Jumlah Penduduk',
      sortOrder: 0,
      updatedAt: '2026-11-13T10:00:00.000Z',
      sections: [
        { id: 'sec-1', slug: 'ringkasan', title: 'Ringkasan', sortOrder: 0, updatedAt: 't1' },
        { id: 'sec-2', slug: 'rincian', title: null, sortOrder: 1, updatedAt: 't2' },
      ],
    },
    {
      id: 'chap-2',
      slug: 'jumlah-keluarga',
      number: '2',
      title: 'Jumlah Keluarga',
      sortOrder: 1,
      updatedAt: '2026-11-13T10:00:00.000Z',
      sections: [],
    },
  ],
};

/** Figure labels: the first section has one photo, the second none. */
const figureSummary = (sectionId: string) =>
  figureTreeLabel(sectionId === 'sec-1' ? { kind: 'photo', photos: [{} as never] } : null);

function mountTree(props: Partial<{ selectedSectionId: string | null; busy: boolean }> = {}) {
  return mount(CeritaStructureTree, {
    props: {
      page,
      selectedChapterId: null,
      selectedSectionId: null,
      busy: false,
      figureSummary,
      ...props,
    },
    attachTo: document.body,
  });
}

function sectionRow(wrapper: ReturnType<typeof mountTree>, title: string) {
  const row = wrapper
    .findAll('[data-test="section-item"]')
    .find((item) => item.find('[data-test="section-select"]').text().includes(title));
  if (!row) throw new Error(`no row ${title}`);
  return row;
}

function menuItem(row: ReturnType<typeof sectionRow>, label: string) {
  const found = row.findAll('button').find((item) => item.text().trim() === label);
  if (!found) throw new Error(`no ${label}`);
  return found;
}

describe('CeritaStructureTree', () => {
  it('lists the chapters numbered by their stored number or position, with the section count', () => {
    const wrapper = mountTree();

    expect(wrapper.findAll('[data-test="chapter-title"]').map((item) => item.text())).toEqual([
      'Bab 1 · Jumlah Penduduk',
      'Bab 2 · Jumlah Keluarga',
    ]);
    expect(wrapper.findAll('[data-test="chapter-meta"]').map((item) => item.text())).toEqual([
      '2 bagian',
      'Belum ada bagian',
    ]);
    wrapper.unmount();
  });

  it('numbers each section 1.1, 1.2 and shows its figure kind, with a warning for an empty section', () => {
    const wrapper = mountTree();
    const sections = wrapper.findAll('[data-test="section-select"]');

    expect(sections.map((item) => item.find('.tabular-nums').text())).toEqual(['1.1', '1.2']);
    const figures = wrapper.findAll('[data-test="section-figure"]');
    expect(figures[0]!.text()).toBe('1 gambar');
    expect(figures[1]!.text()).toBe('Figur kosong');
    expect(figures[1]!.classes()).toContain('text-status-warning');
    // An untitled section is named by its position.
    expect(sections[1]!.text()).toContain('Bagian 2');
    wrapper.unmount();
  });

  it('opens and closes a chapter with its disclosure button and says so with aria-expanded', async () => {
    const wrapper = mountTree();
    const toggle = wrapper.findAll('[data-test="chapter-toggle"]')[0]!;
    expect(toggle.attributes('aria-expanded')).toBe('true');

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('[data-test="section-item"]')).toHaveLength(0);

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(wrapper.findAll('[data-test="section-item"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('marks the selected section with aria-current and says a chapter without sections is empty', () => {
    const wrapper = mountTree({ selectedSectionId: 'sec-2' });

    const current = wrapper.findAll('[data-test="section-select"]').filter((item) =>
      item.attributes('aria-current'),
    );
    expect(current).toHaveLength(1);
    expect(current[0]!.attributes('id')).toBe('cerita-pohon-bagian-sec-2');
    expect(wrapper.find('[data-test="section-empty"]').text()).toBe('Belum ada bagian.');
    wrapper.unmount();
  });

  it('reports a selected section with its chapter', async () => {
    const wrapper = mountTree();
    await wrapper.findAll('[data-test="section-select"]')[1]!.trigger('click');

    const [chapter, section] = wrapper.emitted('select-section')![0]!;
    expect((chapter as { id: string }).id).toBe('chap-1');
    expect((section as { id: string }).id).toBe('sec-2');
    wrapper.unmount();
  });

  it('offers no Naik or Turun in the options menus of chapters and sections', async () => {
    const wrapper = mountTree();
    expect(wrapper.text()).not.toMatch(/Naik|Turun/);
    await wrapper.findAll('[data-test="section-menu"] summary')[0]!.trigger('click');
    expect(menuItem(sectionRow(wrapper, 'Ringkasan'), 'Ubah judul').text()).toBe('Ubah judul');
    expect(
      sectionRow(wrapper, 'Ringkasan')
        .findAll('button')
        .map((item) => item.text().trim()),
    ).not.toEqual(expect.arrayContaining(['Naik', 'Turun']));
    wrapper.unmount();
  });

  it('asks to delete a chapter and to rename it through its options menu', async () => {
    const wrapper = mountTree();
    const row = wrapper.findAll('[data-test="chapter-item"]')[1]!;

    menuItem(row, 'Hapus bab').element.click();
    menuItem(row, 'Ubah judul').element.click();

    expect(wrapper.emitted('delete-chapter')).toHaveLength(1);
    expect(wrapper.emitted('rename-chapter')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits the info request from the "Info cerita" row', async () => {
    const wrapper = mountTree();
    await wrapper.find('[data-test="info-button"]').trigger('click');
    expect(wrapper.emitted('info')).toHaveLength(1);
    wrapper.unmount();
  });

  it('drags a section by its grip onto a later section of the same chapter and reports the new place', async () => {
    const wrapper = mountTree();
    const first = sectionRow(wrapper, 'Ringkasan');
    const second = sectionRow(wrapper, 'Bagian 2');

    await first.find('[data-test="grip"]').trigger('dragstart');
    await second.trigger('dragover');
    await second.trigger('drop');

    const [chapter, section, toIndex] = wrapper.emitted('place-section')![0]!;
    expect((chapter as { id: string }).id).toBe('chap-1');
    expect((section as { id: string }).id).toBe('sec-1');
    expect(toIndex).toBe(1);
    wrapper.unmount();
  });

  it('does not offer drag while a save is running', () => {
    const wrapper = mountTree({ busy: true });
    expect(wrapper.find('[data-test="grip-wrap"]').attributes('draggable')).toBe('false');
    expect((wrapper.find('[data-test="grip"]').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('moves a section from the keyboard: Spasi, arrow, Spasi, with its number updating while carried', async () => {
    const wrapper = mountTree();
    const grip = sectionRow(wrapper, 'Ringkasan').find('[data-test="grip"]');

    await grip.trigger('keydown', { key: ' ' });
    expect(grip.attributes('aria-pressed')).toBe('true');
    expect(grip.attributes('aria-label')).toBe('Pindahkan bagian 1.1: Ringkasan');
    expect(wrapper.get('[data-test="section-reorder-status"]').text()).toBe(
      'Bagian 1.1 diangkat. Posisi 1 dari 2.',
    );

    await grip.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.findAll('[data-test="section-select"]').map((item) => item.text())).toEqual([
      expect.stringContaining('Bagian 2'),
      expect.stringContaining('Ringkasan'),
    ]);
    expect(wrapper.findAll('.tabular-nums').map((item) => item.text())).toEqual(['1.1', '1.2']);
    expect(wrapper.get('[data-test="section-reorder-status"]').text()).toBe('Posisi 2 dari 2.');

    await grip.trigger('keydown', { key: ' ' });
    const [chapter, section, toIndex] = wrapper.emitted('place-section')![0]!;
    expect((chapter as { id: string }).id).toBe('chap-1');
    expect((section as { id: string }).id).toBe('sec-1');
    expect(toIndex).toBe(1);
    expect(wrapper.get('[data-test="section-reorder-status"]').text()).toBe(
      'Bagian dipindahkan ke posisi 2 dari 2.',
    );
    wrapper.unmount();
  });

  it('cancels a keyboard section move with Escape and saves nothing', async () => {
    const wrapper = mountTree();
    const grip = sectionRow(wrapper, 'Ringkasan').find('[data-test="grip"]');

    await grip.trigger('keydown', { key: ' ' });
    await grip.trigger('keydown', { key: 'ArrowDown' });
    await grip.trigger('keydown', { key: 'Escape' });

    expect(wrapper.findAll('[data-test="section-select"]').map((item) => item.text())).toEqual([
      expect.stringContaining('Ringkasan'),
      expect.stringContaining('Bagian 2'),
    ]);
    expect(wrapper.get('[data-test="section-reorder-status"]').text()).toBe('Dibatalkan.');
    expect(wrapper.emitted('place-section')).toBeUndefined();
    wrapper.unmount();
  });

  it('cancels a keyboard move when focus leaves the grip', async () => {
    const wrapper = mountTree();
    const grip = sectionRow(wrapper, 'Ringkasan').find('[data-test="grip"]');

    await grip.trigger('keydown', { key: ' ' });
    await grip.trigger('keydown', { key: 'ArrowDown' });
    (grip.element as HTMLButtonElement).blur();
    await flushPromises();

    expect(grip.attributes('aria-pressed')).toBe('false');
    expect(wrapper.emitted('place-section')).toBeUndefined();
    wrapper.unmount();
  });

  it('moves a chapter from the keyboard and reports the new place', async () => {
    const wrapper = mountTree();
    const grip = wrapper.findAll('[data-test="chapter-item"]')[1]!.find('[data-test="grip"]');

    await grip.trigger('keydown', { key: ' ' });
    await grip.trigger('keydown', { key: 'ArrowUp' });
    // A chapter with a stored number keeps it (the source's numbering); the order is what moved.
    expect(
      wrapper.findAll('[data-test="chapter-title"]').map((item) => item.text().split(' · ')[1]),
    ).toEqual(['Jumlah Keluarga', 'Jumlah Penduduk']);
    await grip.trigger('keydown', { key: 'Enter' });

    const [chapter, toIndex] = wrapper.emitted('place-chapter')![0]!;
    expect((chapter as { id: string }).id).toBe('chap-2');
    expect(toIndex).toBe(0);
    expect(wrapper.get('[data-test="chapter-reorder-status"]').text()).toBe(
      'Bab dipindahkan ke posisi 1 dari 2.',
    );
    wrapper.unmount();
  });
});
