import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseButton from '../components/common/BaseButton.vue';

describe('BaseButton.vue', () => {
  it('renders default primary variant with slot content', () => {
    const wrapper = mount(BaseButton, {
      slots: {
        default: 'Klik Saya',
      },
    });

    expect(wrapper.text()).toContain('Klik Saya');
    expect(wrapper.classes()).toContain('bg-brand-biru-hytam');
    expect(wrapper.classes()).toContain('rounded-btn');
  });

  it('renders micro variant with exact padding and typography classes per style guide', () => {
    const wrapper = mount(BaseButton, {
      props: {
        variant: 'micro',
      },
      slots: {
        default: 'Micro',
      },
    });

    expect(wrapper.classes()).toContain('text-h4');
    expect(wrapper.classes()).toContain('border-brand-biru-hytam');
  });

  it('renders secondary variant with white background and brand border', () => {
    const wrapper = mount(BaseButton, {
      props: {
        variant: 'secondary',
      },
      slots: {
        default: 'Secondary',
      },
    });

    expect(wrapper.classes()).toContain('bg-white');
    expect(wrapper.classes()).toContain('border-brand-biru-hytam');
  });

  it('handles disabled state and prevents click emit', async () => {
    const wrapper = mount(BaseButton, {
      props: {
        disabled: true,
      },
      slots: {
        default: 'Disabled',
      },
    });

    expect(wrapper.classes()).toContain('bg-gray-300');
    expect(wrapper.attributes('disabled')).toBeDefined();

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('renders as anchor tag when href is provided', () => {
    const wrapper = mount(BaseButton, {
      props: {
        href: 'https://wa.me/628123456789',
        target: '_blank',
      },
      slots: {
        default: 'WhatsApp',
      },
    });

    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('https://wa.me/628123456789');
    expect(wrapper.attributes('target')).toBe('_blank');
  });
});
