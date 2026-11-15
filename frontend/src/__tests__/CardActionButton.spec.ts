import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { PencilSquareIcon } from '@heroicons/vue/24/outline';
import CardActionButton from '../components/admin/cards/CardActionButton.vue';

describe('CardActionButton', () => {
  it('shows the icon before the label, hides the icon from assistive tech, and names the item', () => {
    const wrapper = mount(CardActionButton, {
      props: { icon: PencilSquareIcon, label: 'Edit', srText: 'halaman Kependudukan' },
    });

    const icon = wrapper.find('[data-test="left-icon"] svg');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(wrapper.text()).toBe('Edit halaman Kependudukan');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.classes()).toContain('min-h-11');
  });

  it('emits click and cannot be pressed while disabled', async () => {
    const wrapper = mount(CardActionButton, {
      props: { icon: PencilSquareIcon, label: 'Edit', srText: 'halaman X' },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    const disabled = mount(CardActionButton, {
      props: { icon: PencilSquareIcon, label: 'Edit', srText: 'halaman X', disabled: true },
    });
    await disabled.trigger('click');
    expect(disabled.emitted('click')).toBeUndefined();
    expect(disabled.attributes('disabled')).toBeDefined();
  });

  it('passes the id and test hook through to the button', () => {
    const wrapper = mount(CardActionButton, {
      props: {
        icon: PencilSquareIcon,
        label: 'Edit',
        srText: 'halaman X',
        id: 'card-edit-x',
        dataTest: 'card-edit',
      },
    });
    expect(wrapper.attributes('id')).toBe('card-edit-x');
    expect(wrapper.attributes('data-test')).toBe('card-edit');
  });
});
