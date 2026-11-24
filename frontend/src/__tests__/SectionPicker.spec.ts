import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SectionPicker from '../components/data/SectionPicker.vue';
import { usePagesStore, type HierarchyPage } from '../stores/pages.store';

const UPDATED = '2026-01-01T00:00:00.000Z';

/** One page, one chapter, two untitled sections (positions 1 and 2) and a second chapter. */
function hierarchy(): HierarchyPage[] {
  return [
    {
      id: 'page-1',
      slug: 'kependudukan',
      title: 'Kependudukan',
      headline: null,
      bylineAuthor: null,
      bylineAffiliation: null,
      sortOrder: 0,
      createdAt: UPDATED,
      updatedAt: UPDATED,
      chapters: [
        {
          id: 'chap-1',
          slug: 'jumlah-penduduk',
          number: '1',
          title: 'Jumlah Penduduk',
          sortOrder: 0,
          updatedAt: UPDATED,
          sections: [
            { id: 'sec-1', slug: 'a', title: null, sortOrder: 0, updatedAt: UPDATED },
            { id: 'sec-2', slug: 'b', title: '  ', sortOrder: 1, updatedAt: UPDATED },
          ],
        },
        {
          id: 'chap-2',
          slug: 'kepadatan',
          number: '2',
          title: 'Kepadatan',
          sortOrder: 1,
          updatedAt: UPDATED,
          sections: [{ id: 'sec-3', slug: 'c', title: 'Ringkasan', sortOrder: 0, updatedAt: UPDATED }],
        },
      ],
    },
  ];
}

function mountPicker(modelValue: string) {
  setActivePinia(createPinia());
  usePagesStore().hierarchyPages = hierarchy();
  return mount(SectionPicker, { props: { modelValue, idPrefix: 'pick' }, attachTo: document.body });
}

describe('SectionPicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the page and chapter of a preset section and enables Bagian', () => {
    const wrapper = mountPicker('sec-2');

    expect((wrapper.get('#pick-page').element as HTMLSelectElement).value).toBe('page-1');
    expect((wrapper.get('#pick-chapter').element as HTMLSelectElement).value).toBe('chap-1');
    expect((wrapper.get('#pick-section').element as HTMLSelectElement).value).toBe('sec-2');
    expect(wrapper.get('#pick-section').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('labels untitled sections by position within the chapter', async () => {
    const wrapper = mountPicker('');
    await wrapper.get('#pick-page').setValue('page-1');
    await wrapper.get('#pick-chapter').setValue('chap-1');
    const labels = wrapper.findAll('option').map((option) => option.text());
    expect(labels).toContain('Bagian 1');
    expect(labels).toContain('Bagian 2');
    wrapper.unmount();
  });

  it('names a titled section by its title', async () => {
    const wrapper = mountPicker('');
    await wrapper.get('#pick-page').setValue('page-1');
    await wrapper.get('#pick-chapter').setValue('chap-2');
    expect(wrapper.findAll('option').map((option) => option.text())).toContain('Ringkasan');
    wrapper.unmount();
  });

  it('emits the section chosen in Bagian and clears it when a level above changes', async () => {
    const wrapper = mountPicker('');
    await wrapper.get('#pick-page').setValue('page-1');
    await wrapper.get('#pick-chapter').setValue('chap-1');
    await wrapper.get('#pick-section').setValue('sec-1');
    const lastEmit = (): unknown[] | undefined => {
      const emits = wrapper.emitted('update:modelValue') ?? [];
      return emits[emits.length - 1];
    };
    expect(lastEmit()).toEqual(['sec-1']);

    await wrapper.get('#pick-chapter').setValue('chap-2');
    expect(lastEmit()).toEqual(['']);
    wrapper.unmount();
  });

  it('follows a preset that arrives before the hierarchy has loaded', async () => {
    setActivePinia(createPinia());
    const pages = usePagesStore();
    const wrapper = mount(SectionPicker, {
      props: { modelValue: 'sec-3', idPrefix: 'pick' },
      attachTo: document.body,
    });
    expect(wrapper.find('[data-test="no-pages"]').exists()).toBe(true);

    pages.hierarchyPages = hierarchy();
    await wrapper.vm.$nextTick();

    expect((wrapper.get('#pick-page').element as HTMLSelectElement).value).toBe('page-1');
    expect((wrapper.get('#pick-chapter').element as HTMLSelectElement).value).toBe('chap-2');
    wrapper.unmount();
  });
});
