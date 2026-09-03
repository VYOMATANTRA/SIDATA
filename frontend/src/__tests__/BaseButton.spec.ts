import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, markRaw } from 'vue';
import BaseButton from '../components/common/BaseButton.vue';

describe('BaseButton.vue', () => {
  it('renders default primary variant with lg size and slot content', () => {
    const wrapper = mount(BaseButton, {
      slots: {
        default: 'Klik Saya',
      },
    });

    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.text()).toContain('Klik Saya');
    expect(wrapper.classes()).toContain('bg-brand-navy');
    expect(wrapper.classes()).toContain('text-white');
    expect(wrapper.classes()).toContain('border-brand-navy');
    expect(wrapper.classes()).toContain('px-5');
    expect(wrapper.classes()).toContain('text-base');
    expect(wrapper.classes()).toContain('rounded-btn');
  });

  it('renders label prop when default slot is not provided', () => {
    const wrapper = mount(BaseButton, {
      props: {
        label: 'Tombol Label',
      },
    });

    expect(wrapper.text()).toContain('Tombol Label');
  });

  it('renders secondary variant with white background, navy border and navy text', () => {
    const wrapper = mount(BaseButton, {
      props: {
        variant: 'secondary',
        label: 'Secondary Action',
      },
    });

    expect(wrapper.classes()).toContain('bg-white');
    expect(wrapper.classes()).toContain('text-brand-navy');
    expect(wrapper.classes()).toContain('border-brand-navy');
  });

  it('renders active states with brand-navy-overlay for secondary and brand-navy/10 for primary', () => {
    const secActive = mount(BaseButton, {
      props: {
        variant: 'secondary',
        state: 'active',
        label: 'Secondary Active',
      },
    });
    expect(secActive.classes()).toContain('bg-brand-navy-overlay');
    expect(secActive.classes()).toContain('text-white');

    const priActive = mount(BaseButton, {
      props: {
        variant: 'primary',
        state: 'active',
        label: 'Primary Active',
      },
    });
    expect(priActive.classes()).toContain('bg-brand-navy/10');
    expect(priActive.classes()).toContain('text-brand-navy');
  });

  it('renders sizes correctly: sm, md, lg', () => {
    const smWrapper = mount(BaseButton, {
      props: { size: 'sm', label: 'Small' },
    });
    expect(smWrapper.classes()).toContain('px-3');
    expect(smWrapper.classes()).toContain('py-1.5');
    expect(smWrapper.classes()).toContain('text-xs');

    const mdWrapper = mount(BaseButton, {
      props: { size: 'md', label: 'Medium' },
    });
    expect(mdWrapper.classes()).toContain('px-4');
    expect(mdWrapper.classes()).toContain('py-2');
    expect(mdWrapper.classes()).toContain('text-sm');

    const lgWrapper = mount(BaseButton, {
      props: { size: 'lg', label: 'Large' },
    });
    expect(lgWrapper.classes()).toContain('px-5');
    expect(lgWrapper.classes()).toContain('py-2.5');
    expect(lgWrapper.classes()).toContain('text-base');
  });

  it('handles primary disabled state properly and prevents click events', async () => {
    const wrapper = mount(BaseButton, {
      props: {
        disabled: true,
        label: 'Disabled Primary',
      },
    });

    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.classes()).toContain('bg-gray-300');
    expect(wrapper.classes()).toContain('cursor-not-allowed');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('handles secondary disabled state with white background and gray border', () => {
    const wrapper = mount(BaseButton, {
      props: {
        variant: 'secondary',
        disabled: true,
        label: 'Disabled Secondary',
      },
    });

    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.classes()).toContain('bg-white');
    expect(wrapper.classes()).toContain('border-gray-300');
    expect(wrapper.classes()).toContain('text-gray-400');
    expect(wrapper.classes()).toContain('cursor-not-allowed');
  });

  it('renders leftIcon and rightIcon slots', () => {
    const wrapper = mount(BaseButton, {
      slots: {
        leftIcon: '<svg data-test="left-svg"></svg>',
        default: 'Icon Button',
        rightIcon: '<svg data-test="right-svg"></svg>',
      },
    });

    expect(wrapper.find('[data-test="left-icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="left-svg"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Icon Button');
    expect(wrapper.find('[data-test="right-icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="right-svg"]').exists()).toBe(true);
  });

  it('renders leftIcon and rightIcon props as components', () => {
    const DummyIcon = markRaw({
      render() {
        return h('i', { class: 'custom-icon' });
      },
    });

    const wrapper = mount(BaseButton, {
      props: {
        leftIcon: DummyIcon,
        rightIcon: DummyIcon,
        label: 'With Prop Icons',
      },
    });

    expect(wrapper.findAll('.custom-icon').length).toBe(2);
  });

  it('renders as anchor <a> element when href prop is provided', async () => {
    const wrapper = mount(BaseButton, {
      props: {
        href: 'https://example.com',
        target: '_blank',
        label: 'External Link',
      },
    });

    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('https://example.com');
    expect(wrapper.attributes('target')).toBe('_blank');
    expect(wrapper.attributes('type')).toBeUndefined();

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('disables anchor <a> element when href and disabled are both set', async () => {
    const wrapper = mount(BaseButton, {
      props: {
        href: 'https://example.com',
        disabled: true,
        label: 'Disabled Link',
      },
    });

    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    expect(wrapper.attributes('tabindex')).toBe('-1');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });
});
