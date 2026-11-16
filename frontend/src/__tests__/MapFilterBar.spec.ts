import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MapFilterBar from '../components/maps/MapFilterBar.vue';

describe('MapFilterBar.vue', () => {
  it('emits update:type when category pills are clicked', async () => {
    const wrapper = mount(MapFilterBar, {
      props: {
        activeType: 'all',
      },
    });

    const buttons = wrapper.findAll('button');
    const bankSampahBtn = buttons.find((b) => b.text().includes('Bank Sampah'));
    expect(bankSampahBtn).toBeDefined();

    await bankSampahBtn?.trigger('click');
    expect(wrapper.emitted('update:type')?.[0]).toEqual(['bank_sampah']);
  });

  it('omits the Ketua RT pill while keeping the remaining category filters without search input', () => {
    const wrapper = mount(MapFilterBar, {
      props: {
        activeType: 'all',
      },
    });

    const buttons = wrapper.findAll('button');
    expect(wrapper.find('input').exists()).toBe(false);
    expect(buttons).toHaveLength(3);
    expect(buttons.some((b) => b.text().includes('Ketua RT'))).toBe(false);
  });
});
