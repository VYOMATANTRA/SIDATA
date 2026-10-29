import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../router';
import PublikasiView from '../views/PublikasiView.vue';

async function mountPublikasiView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  await router.push('/publikasi');
  await router.isReady();

  return { router, wrapper: mount(PublikasiView, { global: { plugins: [pinia, router] } }) };
}

describe('PublikasiView', () => {
  it('renders accessible public landmarks and one page heading using the shared layout', async () => {
    const { wrapper } = await mountPublikasiView();

    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.find('main#main-content').exists()).toBe(true);
    expect(wrapper.find('footer').exists()).toBe(true);
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.find('h1').text()).toBe('Publikasi Kelurahan Manggar');

    const breadcrumb = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Beranda');
    expect(breadcrumb.text()).toContain('Publikasi');
  });

  it('lists the four publication categories with verified descriptions from source documents', async () => {
    const { wrapper } = await mountPublikasiView();

    expect(wrapper.findAll('[data-test="publication-list"] article')).toHaveLength(4);
    expect(wrapper.text()).toContain('Publikasi Prodeskel');
    expect(wrapper.text()).toContain('Infografis Kelurahan Manggar');
    expect(wrapper.text()).toContain('Booklet Eco Boba');
    expect(wrapper.text()).toContain('limbah kemasan plastik');
    expect(wrapper.text()).toContain('Manggar dalam Angka 2026');
    expect(wrapper.text()).toContain('edisi cetak/PDF');
  });

  it('marks unavailable documents clearly without rendering fake download links or status live regions', async () => {
    const { wrapper } = await mountPublikasiView();

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
    const { wrapper } = await mountPublikasiView();

    expect(wrapper.find('a[href="/"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/peta"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/permintaan-data"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/ketua-rt"]').exists()).toBe(true);
  });
});
