import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/tentang/kelurahan-manggar', component: { template: '<div>Profile</div>' } },
    ],
  });
}

describe('TentangBreadcrumb.vue', () => {
  it('renders unlinked parent crumb by default to avoid circular alias navigation', async () => {
    const router = createTestRouter();
    const wrapper = mount(TentangBreadcrumb, {
      props: { label: 'Kelurahan Manggar' },
      global: { plugins: [router] },
    });

    const nav = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(nav.exists()).toBe(true);

    // Parent "Tentang" is rendered as plain text span, not a RouterLink
    const link = wrapper.find('a');
    expect(link.exists()).toBe(false);

    const spans = wrapper.findAll('span');
    expect(spans.some((s) => s.text() === 'Tentang')).toBe(true);

    const currentPage = wrapper.find('[aria-current="page"]');
    expect(currentPage.text()).toBe('Kelurahan Manggar');
  });

  it('renders a RouterLink when parentTo is explicitly provided', async () => {
    const router = createTestRouter();
    const wrapper = mount(TentangBreadcrumb, {
      props: {
        label: 'Permintaan Data',
        parentLabel: 'Beranda',
        parentTo: '/',
      },
      global: { plugins: [router] },
    });

    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Beranda');
    expect(link.attributes('href')).toBe('/');

    const currentPage = wrapper.find('[aria-current="page"]');
    expect(currentPage.text()).toBe('Permintaan Data');
  });

  it('sits on the navy header surface with white text, not a white strip between navy regions', async () => {
    const router = createTestRouter();
    const wrapper = mount(TentangBreadcrumb, {
      props: { label: 'Kelurahan Manggar' },
      global: { plugins: [router] },
    });

    const nav = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(nav.classes()).toContain('bg-brand-navy');
    expect(nav.classes()).toContain('text-white');
    expect(nav.classes()).not.toContain('bg-white');
  });

  it('wraps long labels instead of overflowing, keeping the current-page marker', async () => {
    const router = createTestRouter();
    const longLabel = 'Program Desa/Kelurahan Cantik '.repeat(8).trim();
    const wrapper = mount(TentangBreadcrumb, {
      props: { label: longLabel },
      global: { plugins: [router] },
    });

    expect(wrapper.find('ol').classes()).toContain('flex-wrap');
    expect(wrapper.find('li:last-child').classes()).toContain('break-words');
    expect(wrapper.find('[aria-current="page"]').text()).toBe(longLabel);
  });
});
