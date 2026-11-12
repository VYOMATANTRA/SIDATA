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

    expect(wrapper.find('[data-test="logo-balikpapan"]').attributes('alt')).toBe(
      'Logo Kota Balikpapan',
    );
    expect(wrapper.find('[data-test="logo-desa-cantik"]').attributes('alt')).toBe(
      'Logo Desa Cantik',
    );
    expect(wrapper.find('[data-test="badge-sdgs-desa"]').attributes('alt')).toBe('Logo SDGs Desa');
    expect(wrapper.find('[data-test="badge-sdgs-17"]').attributes('alt')).toBe(
      'Logo SDGs 17: Kemitraan untuk Pembangunan Desa',
    );
    expect(wrapper.find('[data-test="logo-bps"]').attributes('alt')).toBe(
      'Logo Badan Pusat Statistik (BPS)',
    );
    expect(wrapper.find('[data-test="logo-itk"]').attributes('alt')).toBe(
      'Logo Institut Teknologi Kalimantan (ITK)',
    );
    expect(wrapper.find('[data-test="logo-vyomatantra"]').attributes('alt')).toBe(
      'Logo Tim Inovasi Sosial VYOMATANTRA',
    );
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
    expect(wrapper.text()).toContain('Ketua RT');

    expect(wrapper.text()).toContain('Cerita');
    expect(wrapper.text()).toContain('Demografi Kependudukan');
    expect(wrapper.text()).toContain('Persampahan & Bank Sampah Unit');

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

    expect(wrapper.find('[data-test="copyright-text"]').text()).toContain(
      '© 2027. Hak cipta dilindungi undang-undang.',
    );
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

  it('uses explicit local type roles that stay legible on mobile', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: {
        plugins: [router],
      },
    });

    // Section labels: 16px on every width
    const headings = wrapper.findAll('h2');
    expect(headings.length).toBe(3);
    headings.forEach((h2) => {
      expect(h2.classes()).toContain('text-base');
    });

    // Navigation links: 14px, never the 10px `text-xs` of the old mobile rule
    const navLinks = wrapper.findAll('nav a');
    expect(navLinks.length).toBeGreaterThan(0);
    navLinks.forEach((link) => {
      expect(link.classes()).toContain('text-sm');
      expect(link.classes()).not.toContain('text-xs');
    });

    // Phone link inside the address block is 14px as well
    const phoneLink = wrapper.find('address a');
    expect(phoneLink.classes()).toContain('text-sm');
    expect(phoneLink.classes()).not.toContain('text-xs');

    // Address and copyright paragraphs carry their own size: the global `p` rule overrides any
    // size set on a wrapper, so the role must sit on the <p> itself.
    wrapper.findAll('address p').forEach((p) => {
      expect(p.classes()).toContain('text-sm');
    });
    const copyright = wrapper.find('[data-test="copyright-text"]');
    expect(copyright.classes()).toContain('text-sm');
    expect(copyright.classes()).not.toContain('text-xs');
    expect(copyright.element.parentElement?.classList.contains('text-xs')).toBe(false);
  });

  it('keeps the SDG badges inside the links grid on a row of their own', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: { plugins: [router] },
    });

    const grid = wrapper.find('.footer-links-grid');
    const badges = grid.find('.link-col-badges');
    expect(badges.exists()).toBe(true);
    expect(badges.find('[data-test="badge-sdgs-desa"]').exists()).toBe(true);
    expect(badges.find('[data-test="badge-sdgs-17"]').exists()).toBe(true);
    // The three link columns and the badges are the only direct grid items
    expect(grid.element.children.length).toBe(4);
  });

  it('gives every logo a fixed height with object-contain so heights match', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: { plugins: [router] },
    });

    const logos = [
      'logo-balikpapan',
      'logo-desa-cantik',
      'logo-bps',
      'logo-itk',
      'logo-vyomatantra',
    ].map((name) => wrapper.find(`[data-test="${name}"]`));
    logos.forEach((logo) => {
      expect(logo.classes()).toContain('object-contain');
      expect(logo.classes().some((c) => /^h-\d+/.test(c))).toBe(true);
    });
    const partnerHeights = ['logo-bps', 'logo-itk', 'logo-vyomatantra'].map((name) =>
      wrapper
        .find(`[data-test="${name}"]`)
        .classes()
        .filter((c) => /^(sm:)?h-\d+/.test(c))
        .join(' '),
    );
    expect(new Set(partnerHeights).size).toBe(1);
  });

  it('always includes Publikasi link in the footer per SPEC §8', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: { plugins: [router] },
    });
    expect(wrapper.find('a[href="/publikasi"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/publikasi"]').text()).toBe('Publikasi');
  });

  it('renders all real href destinations across the 3 navigation groups per SPEC §8', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: { plugins: [router] },
    });

    // 1. Sumber Daya
    const sumberDayaNav = wrapper.find('nav[aria-label="Navigasi Sumber Daya"]');
    expect(sumberDayaNav.find('a[href="/publikasi"]').text()).toBe('Publikasi');
    expect(sumberDayaNav.find('a[href="/peta"]').text()).toBe('Peta');
    expect(sumberDayaNav.find('a[href="/permintaan-data"]').text()).toBe('Permintaan Data');
    expect(sumberDayaNav.find('a[href="/ketua-rt"]').text()).toBe('Ketua RT');

    // 2. Cerita (all 8 pages)
    const ceritaNav = wrapper.find('nav[aria-label="Navigasi Cerita Statistik"]');
    expect(ceritaNav.find('a[href="/cerita/kependudukan"]').exists()).toBe(true);
    expect(ceritaNav.find('a[href="/cerita/pendidikan"]').exists()).toBe(true);
    expect(ceritaNav.find('a[href="/cerita/kesehatan"]').exists()).toBe(true);
    expect(ceritaNav.find('a[href="/cerita/pemerintahan-dan-kelembagaan"]').exists()).toBe(true);
    expect(ceritaNav.find('a[href="/cerita/ekonomi-dan-ketertiban"]').exists()).toBe(true);
    expect(ceritaNav.find('a[href="/cerita/geografis-dan-tata-ruang"]').exists()).toBe(true);
    expect(ceritaNav.find('a[href="/cerita/infrastruktur-dan-perumahan"]').exists()).toBe(true);
    expect(ceritaNav.find('a[href="/cerita/persampahan-dan-bank-sampah-unit"]').exists()).toBe(
      true,
    );

    // 3. Tentang (all 3 pages)
    const tentangNav = wrapper.find('nav[aria-label="Navigasi Tentang Kelurahan"]');
    expect(tentangNav.find('a[href="/tentang/kelurahan-manggar"]').text()).toBe(
      'Kelurahan Manggar',
    );
    expect(tentangNav.find('a[href="/tentang/desa-cantik"]').text()).toBe(
      'Program Desa/Kelurahan Cantik',
    );
    expect(tentangNav.find('a[href="/tentang/vyomatantra"]').text()).toBe(
      'Inovasi Sosial VYOMATANTRA',
    );
  });

  it('wraps the 3 Kolaborasi partner logos in accessible links with correct destinations', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppFooter, {
      global: { plugins: [router] },
    });

    // BPS outbound link
    const bpsLink = wrapper.find('[data-test="link-logo-bps"]');
    expect(bpsLink.exists()).toBe(true);
    expect(bpsLink.attributes('href')).toBe('https://www.bps.go.id');
    expect(bpsLink.attributes('target')).toBe('_blank');
    expect(bpsLink.attributes('rel')).toContain('noopener');
    expect(bpsLink.attributes('aria-label')).toContain('(membuka tab baru)');
    expect(bpsLink.find('[data-test="logo-bps"]').exists()).toBe(true);

    // ITK outbound link
    const itkLink = wrapper.find('[data-test="link-logo-itk"]');
    expect(itkLink.exists()).toBe(true);
    expect(itkLink.attributes('href')).toBe('https://itk.ac.id');
    expect(itkLink.attributes('target')).toBe('_blank');
    expect(itkLink.attributes('rel')).toContain('noopener');
    expect(itkLink.attributes('aria-label')).toContain('(membuka tab baru)');
    expect(itkLink.find('[data-test="logo-itk"]').exists()).toBe(true);

    // Tim Inovasi Sosial VYOMATANTRA link
    const vyomatantraLink = wrapper.find('[data-test="link-logo-vyomatantra"]');
    expect(vyomatantraLink.exists()).toBe(true);
    expect(vyomatantraLink.attributes('href')).toBe('/tentang/vyomatantra');
    expect(vyomatantraLink.find('[data-test="logo-vyomatantra"]').exists()).toBe(true);
  });
});
