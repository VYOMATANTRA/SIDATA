import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MapFilterBar from '../components/maps/MapFilterBar.vue';

describe('MapFilterBar.vue', () => {
  it('emits update:type when category pills are clicked', async () => {
    const wrapper = mount(MapFilterBar, {
      props: {
        activeType: 'all',
        activeRt: null,
      },
    });

    const buttons = wrapper.findAll('button');
    const ketuaRtBtn = buttons.find((b) => b.text().includes('Ketua RT'));
    expect(ketuaRtBtn).toBeDefined();

    await ketuaRtBtn?.trigger('click');
    expect(wrapper.emitted('update:type')?.[0]).toEqual(['ketua_rt']);
  });

  it('handles numeric input in RT search without trim() TypeError', async () => {
    const wrapper = mount(MapFilterBar, {
      props: {
        activeType: 'all',
        activeRt: null,
      },
    });

    const input = wrapper.find('input[type="number"]');
    await input.setValue(1);
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('update:rt')?.[0]).toEqual([1]);
  });

  it('clears RT filter and emits null when clear button is clicked', async () => {
    const wrapper = mount(MapFilterBar, {
      props: {
        activeType: 'all',
        activeRt: 5,
      },
    });

    const clearBtn = wrapper.find('button[type="button"].absolute');
    expect(clearBtn.exists()).toBe(true);

    await clearBtn.trigger('click');
    expect(wrapper.emitted('update:rt')?.[0]).toEqual([null]);
  });
});
