import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SortToggleButton from '../components/admin/cards/SortToggleButton.vue';

describe('SortToggleButton', () => {
  it('shows the label with the up-down icon, and exposes the pressed state', () => {
    const wrapper = mount(SortToggleButton, { props: { pressed: true, label: 'Urutkan Publikasi' } });
    const button = wrapper.find('[data-test="sort-toggle"]');
    expect(button.element.tagName).toBe('BUTTON');
    expect(button.text()).toBe('Urutkan Publikasi');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.find('svg').attributes('aria-hidden')).toBe('true');
  });

  it('emits click and respects disabled', async () => {
    const wrapper = mount(SortToggleButton, { props: { pressed: false, label: 'Urutkan Cerita' } });
    expect(wrapper.find('[data-test="sort-toggle"]').attributes('aria-pressed')).toBe('false');
    await wrapper.find('[data-test="sort-toggle"]').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    const off = mount(SortToggleButton, { props: { pressed: false, label: 'Urutkan Cerita', disabled: true } });
    expect(off.find('[data-test="sort-toggle"]').attributes('disabled')).toBeDefined();
  });
});
