import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatCard from '../components/common/StatCard.vue';

describe('StatCard.vue', () => {
  it('renders value, label, and glassmorphism styling by default', () => {
    const wrapper = mount(StatCard, {
      props: {
        value: 42,
        label: 'Total Pos RT',
      },
    });

    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('Total Pos RT');
    expect(wrapper.find('span.uppercase').exists()).toBe(true);
    expect(wrapper.classes()).toContain('bg-surface-glass');
    expect(wrapper.classes()).toContain('rounded-card');
  });

  it('renders dark theme with brand primary background', () => {
    const wrapper = mount(StatCard, {
      props: {
        value: 100,
        label: 'Total RT',
        theme: 'dark',
      },
    });

    expect(wrapper.classes()).toContain('bg-brand-biru-hytam');
  });

  it('renders icon slot inside a 30x30px frame with border per style guide', () => {
    const wrapper = mount(StatCard, {
      props: {
        value: 5,
        label: 'Bank Sampah',
      },
      slots: {
        icon: '<svg data-test="icon"></svg>',
      },
    });

    const iconContainer = wrapper.find('.w-\\[30px\\]');
    expect(iconContainer.exists()).toBe(true);
    expect(iconContainer.find('[data-test="icon"]').exists()).toBe(true);
  });
});
