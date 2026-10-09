import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangKelurahanManggarView from '../views/TentangKelurahanManggarView.vue';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/tentang/kelurahan-manggar', component: TentangKelurahanManggarView },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

describe('TentangKelurahanManggarView accessibility and content', () => {
  it('renders required semantic landmarks, skip link, and single h1', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    // Skip to content link
    const skipLink = wrapper.find('a[href="#main-content"]');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.text()).toContain('Lewati ke konten utama');

    // Landmarks
    expect(wrapper.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);
    const mainLandmarks = wrapper.findAll('main#main-content');
    expect(mainLandmarks.length).toBe(1);
    expect(wrapper.find('footer').exists()).toBe(true);

    // Exactly one h1 per docs/ACCESSIBILITY.md
    const h1List = wrapper.findAll('h1');
    expect(h1List.length).toBe(1);
    expect(h1List[0]?.text()).toContain('Tentang Kelurahan Manggar');
  });

  it('renders Lurah profile with accessible photo alt text', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    const lurahImg = wrapper.find('img[alt="Foto resmi Lurah Kelurahan Manggar"]');
    expect(lurahImg.exists()).toBe(true);
    expect(wrapper.text()).toContain('Pimpinan Kelurahan');
    expect(wrapper.text()).toContain('Lurah Kelurahan Manggar');
  });

  it('renders SOTK table with proper accessibility attributes', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    const table = wrapper.find('table');
    expect(table.exists()).toBe(true);

    // Caption check
    expect(table.find('caption').exists()).toBe(true);

    // Header column scopes
    const colHeaders = table.findAll('th[scope="col"]');
    expect(colHeaders.length).toBe(3);

    // Row header scopes
    const rowHeaders = table.findAll('tbody th[scope="row"]');
    expect(rowHeaders.length).toBeGreaterThanOrEqual(6);

    expect(wrapper.text()).toContain('Struktur Organisasi dan Tata Kerja (SOTK)');
    expect(wrapper.text()).toContain('Seksi Pemerintahan');
    expect(wrapper.text()).toContain('Seksi Ketenteraman dan Ketertiban');
    expect(wrapper.text()).toContain('Seksi Pemberdayaan Masyarakat');
    expect(wrapper.text()).toContain('Seksi Kesejahteraan Sosial');
  });
});
