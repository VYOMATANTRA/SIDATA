import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangKelurahanManggarView from '../views/TentangKelurahanManggarView.vue';
import { useIndicatorsStore, type IndicatorDto } from '../stores/indicators.store';

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
    const sampleIndicator: IndicatorDto = {
      id: 'ind-1',
      sectionId: 'sec-1',
      slug: 'jumlah-penduduk',
      label: 'Jumlah Penduduk',
      unit: 'jiwa',
      valueCurrent: '125000',
      valuePrevious: null,
      periodCurrent: '2025',
      periodPrevious: null,
      isComputedComparison: false,
      isStale: false,
      source: null,
      hedgeNote: 'Estimasi Semester I',
      sortOrder: 0,
      comparisonTemplateId: null,
      comparison: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    indicatorsStore.bySlug = {
      'jumlah-penduduk': sampleIndicator,
    };

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
    indicatorsStore.bySlug = {};

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

  it('renders the population loading state without flashing an empty state', async () => {
    const { pinia, router } = mountView();
    const indicatorsStore = useIndicatorsStore();
    indicatorsStore.bySlug = {};
    indicatorsStore.loadingBySlug['jumlah-penduduk'] = true;
    vi.spyOn(indicatorsStore, 'fetchBySlug').mockResolvedValue(null);

    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.find('section[aria-label="Memuat data kependudukan"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Data Belum Tersedia');
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
    expect(wrapper.text()).toContain('Munir Achmad, S.E.');
  });

  it('describes the Lurah program in neutral, aspirational narration', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain(
      'diharapkan dapat membantu penyajian informasi Kelurahan Manggar secara terstruktur',
    );
    expect(wrapper.text()).toContain(
      'mendukung pemanfaatan data dalam perencanaan pelayanan masyarakat',
    );
    expect(wrapper.text()).not.toContain('kami berikhtiar');
    expect(wrapper.text()).not.toContain('pemulihan ekonomi');
  });

  it('describes the spatial map card without claiming complete coverage', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain(
      'Peta lokasi rumah ketua RT dan bank sampah aktif di Kelurahan Manggar, Kecamatan Balikpapan Timur.',
    );
    expect(wrapper.text()).not.toContain('seluruh ketua RT');
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
    const caption = table.find('caption');
    expect(caption.exists()).toBe(true);
    expect(caption.text()).toBe('Daftar Struktur Organisasi dan Tata Kerja Kelurahan Manggar');
    expect(caption.text()).not.toContain('tugas pokok dan fungsi');

    // Header column scopes
    const colHeaders = table.findAll('th[scope="col"]');
    expect(colHeaders.length).toBe(3);

    // Keep each job title as a semantic row header and reject invented appointment statuses.
    const rowHeaders = table.findAll('tbody th[scope="row"]');
    expect(rowHeaders.length).toBeGreaterThanOrEqual(5);

    expect(wrapper.text()).toContain('Struktur Organisasi dan Tata Kerja (SOTK)');
    expect(wrapper.text()).toContain('Sekretaris Lurah');
    expect(wrapper.text()).toContain('Munjiah Puspitawaty');
    expect(wrapper.text()).toContain('Kasi Pemerintahan dan Pelayanan Publik');
    expect(wrapper.text()).toContain('Hasiba, S.A.P');
    expect(wrapper.text()).toContain('Kasi Trantib L-H');
    expect(wrapper.text()).toContain('Nanang Sri Ruriyanto');
    expect(wrapper.text()).toContain('Kasi Pemberdayaan Masyarakat');
    expect(wrapper.text()).toContain('Marthen Solly');
    expect(wrapper.text()).toContain('Rincian tugas resmi belum tersedia');
    expect(wrapper.text()).not.toContain('Dalam proses penetapan definitif');
    expect(wrapper.text()).not.toContain('Penetapan resmi Pemerintah Kota Balikpapan');
    expect(wrapper.text()).not.toContain('Masa Bakti Jabatan');
    expect(wrapper.text()).not.toContain('Periode Berjalan');
  });

  it('renders Karang Joang as the approved northern boundary and keeps the other sides', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.find('[data-test="stat-card"]').exists()).toBe(true);
    const northernBoundary = wrapper
      .findAll('li')
      .find((item) => item.text().includes('Sebelah Utara:'));
    expect(northernBoundary?.findAll('span')[1]?.text()).toBe('Kelurahan Karang Joang');
    expect(wrapper.text()).not.toContain('Informasi sedang diverifikasi');
    expect(wrapper.text()).not.toContain('Lamaru');
    expect(wrapper.text()).toContain('Kelurahan Manggar Baru');
    expect(wrapper.text()).toContain('Selat Makassar');
    expect(wrapper.text()).toContain('Kelurahan Sepinggan dan Sepinggan Baru');
    expect(wrapper.text()).toContain('Batas wilayah: Manggar Dalam Angka 2026, Tabel 1.1.2');
    expect(wrapper.text()).toContain('hlm. 18 versi cetak, hlm. 19 PDF');
  });

  it('does not publish an unverified vision or mission statement', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).not.toContain('Visi dan Misi Pelayanan');
    expect(wrapper.text()).not.toContain('Terwujudnya Pelayanan Publik Kelurahan Manggar');
    expect(wrapper.text()).not.toContain('Mengoptimalkan pemanfaatan data statistik');
  });

  it('renders general area statistics and profile content from tentang content module', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    const statCard = wrapper.find('[data-test="stat-card"]');
    expect(statCard.exists()).toBe(true);
    expect(statCard.text()).toContain('100');
    expect(statCard.text()).toContain('Rukun Tetangga terdaftar');
    expect(statCard.text()).toContain('Balikpapan Timur');
    expect(statCard.text()).toContain('Kecamatan, Kota Balikpapan');
    expect(statCard.text()).toContain('Pesisir & Dataran');
    expect(statCard.text()).toContain('Potensi pantai & pertanian');
    expect(statCard.text()).toContain('Desa Cantik');
    expect(statCard.text()).toContain('Kelurahan Cinta Statistik');

    // RT count in prose
    expect(wrapper.text()).toContain('bersama 100 Rukun Tetangga (RT)');

    // Typo fix assertion: "berupaya menyediakan" instead of "strive menyediakan"
    expect(wrapper.text()).toContain('Kelurahan Manggar berupaya menyediakan');
    expect(wrapper.text()).not.toContain('strive menyediakan');
  });
});
