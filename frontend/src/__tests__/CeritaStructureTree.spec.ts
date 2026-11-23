import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
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
      '0 bagian',
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
    expect(figures[1]!.classes()).toContain('font-medium');
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

  it('moves a section with the Turun item of its options menu, which stays a plain button', async () => {
    const wrapper = mountTree();
    const row = sectionRow(wrapper, 'Ringkasan');

    await menuItem(row, 'Turun').trigger('click');

    const [chapter, section, direction] = wrapper.emitted('move-section')![0]!;
    expect((chapter as { id: string }).id).toBe('chap-1');
    expect((section as { id: string }).id).toBe('sec-1');
    expect(direction).toBe(1);
    // The first section cannot move up: the button is disabled, not hidden.
    expect((menuItem(sectionRow(wrapper, 'Ringkasan'), 'Naik').element as HTMLButtonElement).disabled).toBe(true);
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
    expect(wrapper.find('[data-test="grip"]').attributes('draggable')).toBe('false');
    wrapper.unmount();
  });
});
