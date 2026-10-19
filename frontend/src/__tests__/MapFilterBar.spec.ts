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
    const ketuaRtBtn = buttons.find((b) => b.text().includes('Ketua RT'));
    expect(ketuaRtBtn).toBeDefined();

    await ketuaRtBtn?.trigger('click');
    expect(wrapper.emitted('update:type')?.[0]).toEqual(['ketua_rt']);
  });

  it('renders only the category filters so RT search can share the main search field', () => {
    const wrapper = mount(MapFilterBar, {
      props: {
        activeType: 'all',
      },
    });

    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.findAll('button')).toHaveLength(4);
  });
});
