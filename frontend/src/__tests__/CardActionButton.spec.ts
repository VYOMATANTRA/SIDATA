import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ArrowDownTrayIcon, PencilSquareIcon } from '@heroicons/vue/24/outline';
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

describe('CardActionButton link variant', () => {
  it('renders an anchor with the address, the target and a safe rel, named by label and title', () => {
    const wrapper = mount(CardActionButton, {
      props: {
        icon: ArrowDownTrayIcon,
        label: 'Unduh',
        srText: 'publikasi Laporan',
        href: '/api/media/abc/download',
        target: '_blank',
      },
    });
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/api/media/abc/download');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toContain('noopener');
    expect(link.text().replace(/\s+/g, ' ').trim()).toBe('Unduh publikasi Laporan');
  });
});
