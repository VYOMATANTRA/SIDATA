import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import BaseLink from '../components/common/BaseLink.vue';

function createMockRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/target', component: { template: '<div>target</div>' } },
    ],
  });
}

describe('BaseLink.vue', () => {
  it('renders default link with large text-base size, brand-navy color, and trailing arrow', () => {
    const wrapper = mount(BaseLink, {
      props: {
        href: '/destinasi',
        label: 'Link label',
      },
    });

    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('/destinasi');
    expect(wrapper.text()).toContain('Link label');
    expect(wrapper.text()).toContain('→');
    expect(wrapper.classes()).toContain('text-base');
    expect(wrapper.classes()).toContain('text-brand-navy');
    expect(wrapper.classes()).toContain('font-normal');
    expect(wrapper.classes()).toContain('border-transparent');
  });

  it('renders static hover state with bold weight and continuous underline extending below label, space, and arrow', () => {
    const wrapper = mount(BaseLink, {
      props: {
        href: '/destinasi',
        label: 'Link label',
        state: 'hover',
      },
    });

    expect(wrapper.classes()).toContain('font-bold');
    expect(wrapper.classes()).toContain('border-b-2');
    expect(wrapper.classes()).toContain('border-current');
  });

  it('renders sizes correctly: sm (text-xs), md (text-sm), lg (text-base)', () => {
    const sm = mount(BaseLink, { props: { size: 'sm', label: 'Small' } });
    expect(sm.classes()).toContain('text-xs');

    const md = mount(BaseLink, { props: { size: 'md', label: 'Medium' } });
    expect(md.classes()).toContain('text-sm');

    const lg = mount(BaseLink, { props: { size: 'lg', label: 'Large' } });
    expect(lg.classes()).toContain('text-base');
  });

  it('renders color variants correctly', () => {
    const navy = mount(BaseLink, { props: { variant: 'navy', label: 'Navy' } });
    expect(navy.classes()).toContain('text-brand-navy');

    const indigo = mount(BaseLink, { props: { variant: 'indigo', label: 'Indigo' } });
    expect(indigo.classes()).toContain('text-brand-indigo');

    const white = mount(BaseLink, { props: { variant: 'white', label: 'White' } });
    expect(white.classes()).toContain('text-white');
  });

  it('renders as RouterLink when "to" prop is passed', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(BaseLink, {
      props: {
        to: '/target',
        label: 'Internal Nav',
      },
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('/target');
  });

  it('adds rel="noopener noreferrer" for external or _blank links', () => {
    const external = mount(BaseLink, {
      props: {
        href: 'https://example.com',
        label: 'External',
      },
    });
    expect(external.attributes('rel')).toBe('noopener noreferrer');

    const blank = mount(BaseLink, {
      props: {
        href: '/dokumen.pdf',
        target: '_blank',
        label: 'PDF Document',
      },
    });
    expect(blank.attributes('rel')).toBe('noopener noreferrer');
  });

  it('handles disabled state properly by rendering a disabled button per accessibility requirements', () => {
    const wrapper = mount(BaseLink, {
      props: {
        href: '/somewhere',
        disabled: true,
        label: 'Disabled Link',
      },
    });

    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    expect(wrapper.attributes('tabindex')).toBe('-1');
    expect(wrapper.classes()).toContain('cursor-not-allowed');
  });

  it('renders a disabled button when neither to nor href is supplied per ACCESSIBILITY.md', () => {
    const wrapper = mount(BaseLink, {
      props: {
        label: 'No destination link',
      },
    });

    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    expect(wrapper.classes()).toContain('cursor-not-allowed');
  });

  it('renders a disabled button instead of forbidden href="#" placeholder', () => {
    const wrapper = mount(BaseLink, {
      props: {
        href: '#',
        label: 'Forbidden placeholder',
      },
    });

    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('aria-disabled')).toBe('true');
  });

  it('supports custom slots and withArrow=false', () => {
    const wrapper = mount(BaseLink, {
      props: {
        withArrow: false,
      },
      slots: {
        leftIcon: '<span data-test="left">★</span>',
        default: 'Custom Slot Content',
      },
    });

    expect(wrapper.find('[data-test="left"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Custom Slot Content');
    expect(wrapper.text()).not.toContain('→');
  });
});
