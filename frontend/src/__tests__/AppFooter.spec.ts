import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppFooter from '../components/common/AppFooter.vue';

function createMockRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });
}

describe('AppFooter.vue', () => {
  it('renders semantic footer landmark and aria-labels per accessibility guidelines', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('footer').exists()).toBe(true);
    expect(wrapper.find('footer').classes()).toContain('bg-brand-navy');
    expect(wrapper.find('nav[aria-label="Navigasi Sumber Daya"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navigasi Cerita Statistik"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navigasi Tentang Kelurahan"]').exists()).toBe(true);
  });

  it('renders all 7 logos and badges with descriptive accessible alt text', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('[data-test="logo-balikpapan"]').attributes('alt')).toBe('Logo Kota Balikpapan');
    expect(wrapper.find('[data-test="logo-desa-cantik"]').attributes('alt')).toBe('Logo Desa Cantik');
    expect(wrapper.find('[data-test="badge-sdgs-desa"]').attributes('alt')).toBe('Logo SDGs Desa');
    expect(wrapper.find('[data-test="badge-sdgs-17"]').attributes('alt')).toBe('Logo SDGs 17: Kemitraan untuk Pembangunan Desa');
    expect(wrapper.find('[data-test="logo-bps"]').attributes('alt')).toBe('Logo Badan Pusat Statistik (BPS)');
    expect(wrapper.find('[data-test="logo-itk"]').attributes('alt')).toBe('Logo Institut Teknologi Kalimantan (ITK)');
    expect(wrapper.find('[data-test="logo-vyomatantra"]').attributes('alt')).toBe('Logo Tim Inovasi Sosial VYOMATANTRA');
  });

  it('renders office address and accessible phone link', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      props: {
        phone: '(0542) 772158',
      },
      global: {
        plugins: [router],
      },
    });

    const address = wrapper.find('address');
    expect(address.text()).toContain('Kantor Kelurahan Manggar');
    expect(address.text()).toContain('Jl. Mulawarman No. 1, RT 39');
    expect(address.text()).toContain('(0542) 772158');

    const phoneLink = address.find('a[href="tel:0542772158"]');
    expect(phoneLink.exists()).toBe(true);
    expect(phoneLink.text()).toBe('(0542) 772158');
  });

  it('renders all navigation links properly with router navigation destinations', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.text()).toContain('Sumber Daya');
    expect(wrapper.text()).toContain('Publikasi');
    expect(wrapper.text()).toContain('Peta');
    expect(wrapper.text()).toContain('Permintaan Data');

    expect(wrapper.text()).toContain('Cerita');
    expect(wrapper.text()).toContain('Demografi Kependudukan');
    expect(wrapper.text()).toContain('Persampahan');

    expect(wrapper.text()).toContain('Tentang');
    expect(wrapper.text()).toContain('Program Desa/Kelurahan Cantik');
    expect(wrapper.text()).toContain('Inovasi Sosial VYOMATANTRA');
  });

  it('renders custom copyright year and text', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      props: {
        year: 2027,
      },
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('[data-test="copyright-text"]').text()).toContain('© 2027. Hak cipta dilindungi undang-undang.');
  });

  it('renders all branding, badges, navigation links, and partners in the unified responsive layout', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('[data-test="logo-balikpapan"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="logo-desa-cantik"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="badge-sdgs-desa"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="badge-sdgs-17"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="logo-bps"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="logo-itk"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="logo-vyomatantra"]').exists()).toBe(true);

    expect(wrapper.text()).toContain('Sumber Daya');
    expect(wrapper.text()).toContain('Cerita');
    expect(wrapper.text()).toContain('Tentang');
  });
});
