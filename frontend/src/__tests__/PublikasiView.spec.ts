import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import PublikasiView from '../views/PublikasiView.vue';

function mountPublikasiView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Beranda</div>' } },
      { path: '/publikasi', component: PublikasiView },
      { path: '/peta', component: { template: '<div>Peta</div>' } },
      { path: '/permintaan-data', component: { template: '<div>Permintaan Data</div>' } },
      { path: '/ketua-rt', component: { template: '<div>Ketua RT</div>' } },
    ],
  });

  return {
    router,
    wrapper: mount(PublikasiView, { global: { plugins: [pinia, router] } }),
  };
}

describe('PublikasiView', () => {
  it('renders accessible public landmarks and one page heading using the shared layout', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');
    await router.isReady();

    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.find('main#main-content').exists()).toBe(true);
    expect(wrapper.find('footer').exists()).toBe(true);
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.find('h1').text()).toBe('Publikasi Kelurahan Manggar');

    const breadcrumb = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Sumber Daya');
    expect(breadcrumb.text()).toContain('Publikasi');
  });

  it('lists the four publication categories with verified descriptions from source documents', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');
    await router.isReady();

    expect(wrapper.findAll('[data-test="publication-list"] article')).toHaveLength(4);
    expect(wrapper.text()).toContain('Publikasi Prodeskel');
    expect(wrapper.text()).toContain('Infografis Kelurahan Manggar');
    expect(wrapper.text()).toContain('Booklet Eco Boba');
    expect(wrapper.text()).toContain('limbah kemasan plastik');
    expect(wrapper.text()).toContain('Manggar dalam Angka 2026');
    expect(wrapper.text()).toContain('unduhan versi digital');
  });

  it('marks unavailable documents clearly without rendering fake download links or status live regions', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');
    await router.isReady();

    const statusBadges = wrapper.findAll('[data-test="publication-status"]');
    expect(statusBadges).toHaveLength(4);
    expect(statusBadges[0]?.text()).toBe('Segera hadir');
    expect(wrapper.findAll('[role="status"]')).toHaveLength(0);
    expect(wrapper.text()).toContain(
      'Tautan unduhan akan ditampilkan setelah dokumen resmi tersedia.',
    );
    expect(wrapper.findAll('a[download]')).toHaveLength(0);
    expect(wrapper.findAll('a[href$=".pdf"]')).toHaveLength(0);
  });

  it('includes working internal navigation for home and resource links', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');
    await router.isReady();

    expect(wrapper.find('a[href="/"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/peta"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/permintaan-data"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/ketua-rt"]').exists()).toBe(true);
  });
});
