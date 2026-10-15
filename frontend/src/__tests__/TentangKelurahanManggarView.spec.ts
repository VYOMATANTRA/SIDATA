import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangKelurahanManggarView from '../views/TentangKelurahanManggarView.vue';
import { useIndicatorsStore } from '../stores/indicators.store';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/tentang', component: { template: '<div>Tentang</div>' } },
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
    expect(h1List[0]?.text()).toContain('Manggar');
  });

  it('renders the Figma photo hero with eyebrow, breadcrumb, and decorative wave', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Profil Kelurahan');
    expect(wrapper.text()).toContain('Data, potensi, dan cerita di balik perkembangan');

    // Decorative hero image carries no accessible name
    expect(wrapper.find('img[alt=""]').exists()).toBe(true);

    // Breadcrumb is added on every tentang page per the review decision
    const breadcrumb = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
  });

  it('shows the Sekilas Manggar population figure when indicator is available', async () => {
    const { pinia, router } = mountView();
    const indicatorsStore = useIndicatorsStore();
    indicatorsStore.indicators = [
      {
        id: 'ind-1',
        sectionId: 'sec-1',
        slug: 'jumlah-penduduk',
        label: 'Jumlah Penduduk',
        unit: 'jiwa',
        valueCurrent: '125000',
        valuePrevious: null,
        periodCurrent: '2025',
        isStale: false,
        hedgeNote: 'Estimasi Semester I',
      },
    ];

    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.text()).toContain('Total Penduduk Kelurahan Manggar (data 2025)');
    expect(wrapper.text()).toContain('Berdasarkan data 2025');
    expect(wrapper.text()).toContain('125.000');
    expect(wrapper.text()).toContain('jiwa');
    expect(wrapper.text()).toContain('Estimasi Semester I');
  });

  it('renders "Data Belum Tersedia" empty state when population indicator is missing', async () => {
    const { pinia, router } = mountView();
    const indicatorsStore = useIndicatorsStore();
    indicatorsStore.indicators = [];

    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.text()).toContain('Data Belum Tersedia');
    expect(wrapper.text()).toContain(
      'Informasi agregat jumlah penduduk terkini belum dipublikasikan atau gagal dimuat.',
    );
  });

  it('renders the Potensi Manggar grid with the four potential cards', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Potensi Manggar');
    expect(wrapper.text()).toContain('Pesisir & Pariwisata');
    expect(wrapper.text()).toContain('Kependudukan');
    expect(wrapper.text()).toContain('Lingkungan');
    expect(wrapper.text()).toContain('Data & Statistik');

    const potensiSection = wrapper.find('section[aria-labelledby="potensi-title"]');
    const gridUl = potensiSection.find('ul');
    expect(gridUl.classes()).toContain('sm:auto-rows-fr');

    const gridItems = gridUl.findAll('li');
    expect(gridItems.length).toBe(4);
    for (const li of gridItems) {
      expect(li.classes()).toContain('flex');
      const article = li.find('article');
      expect(article.classes()).toContain('h-full');
      expect(article.classes()).toContain('w-full');
      expect(article.classes()).toContain('flex');
    }
  });

  it('renders the publication card with a non-interactive Segera Hadir badge', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Manggar Dalam Angka');
    const badge = wrapper.find('[data-test="publication-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain('Segera Hadir');
    expect(wrapper.find('button[aria-disabled="true"]').exists()).toBe(false);
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

  it('keeps the wilayah overview on the shared StatCard component with official boundaries', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.find('[data-test="stat-card"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Kelurahan Karang Joang');
    expect(wrapper.text()).toContain('Kelurahan Manggar Baru');
    expect(wrapper.text()).toContain('Selat Makassar');
    expect(wrapper.text()).toContain('Kelurahan Sepinggan dan Sepinggan Baru');
  });
});
