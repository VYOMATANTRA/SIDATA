import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import PublikasiView from '../views/PublikasiView.vue';

function mountPublikasiView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Beranda</div>' } },
      { path: '/publikasi', component: PublikasiView },
      { path: '/peta', component: { template: '<div>Peta</div>' } },
      { path: '/permintaan-data', component: { template: '<div>Permintaan Data</div>' } },
      { path: '/ketua-rt', component: { template: '<div>Ketua RT</div>' } },
      { path: '/cerita/:slug', component: { template: '<div>Cerita</div>' } },
      { path: '/tentang/:slug', component: { template: '<div>Tentang</div>' } },
    ],
  });

  return { router, wrapper: mount(PublikasiView, { global: { plugins: [router] } }) };
}

describe('PublikasiView', () => {
  it('renders accessible public landmarks and one page heading', () => {
    const { wrapper } = mountPublikasiView();

    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.find('main#main-content').exists()).toBe(true);
    expect(wrapper.find('footer').exists()).toBe(true);
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.find('h1').text()).toBe('Publikasi Kelurahan Manggar');
  });

  it('lists the four known publication categories and names', () => {
    const { wrapper } = mountPublikasiView();

    expect(wrapper.findAll('[data-test="publication-list"] article')).toHaveLength(4);
    expect(wrapper.text()).toContain('Publikasi Prodeskel');
    expect(wrapper.text()).toContain('Infografis Kelurahan Manggar');
    expect(wrapper.text()).toContain('Booklet Eco Boba');
    expect(wrapper.text()).toContain('Manggar dalam Angka 2026');
  });

  it('marks unavailable documents clearly without rendering fake download links', () => {
    const { wrapper } = mountPublikasiView();

    expect(wrapper.findAll('[data-test="publication-status"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-test="publication-status"]')[0]?.text()).toBe('Segera hadir');
    expect(wrapper.text()).toContain('Tautan unduhan akan ditampilkan setelah dokumen resmi tersedia.');
    expect(wrapper.findAll('a[download]')).toHaveLength(0);
    expect(wrapper.findAll('a[href$=".pdf"]')).toHaveLength(0);
  });

  it('includes working internal navigation for home and resource links', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');

    expect(wrapper.find('a[href="/"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/peta"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/permintaan-data"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/ketua-rt"]').exists()).toBe(true);
  });
});
