import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangKelurahanManggarView from '../views/TentangKelurahanManggarView.vue';
import { useIndicatorsStore, type IndicatorDto } from '../stores/indicators.store';
import { useContentBlocksStore } from '../stores/contentBlocks.store';
import { useStubbedPagesFetch } from './publicPagesFetch';

function mountView(options: { includeMapRoute?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/tentang', component: { template: '<div>Tentang</div>' } },
      { path: '/tentang/kelurahan-manggar', component: TentangKelurahanManggarView },
      ...(options.includeMapRoute
        ? [{ path: '/peta', component: { template: '<div>Peta</div>' } }]
        : []),
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

useStubbedPagesFetch();

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
    vi.spyOn(indicatorsStore, 'fetchBySlug').mockResolvedValue(sampleIndicator);

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
    vi.spyOn(indicatorsStore, 'fetchBySlug').mockImplementation(async () => {
      indicatorsStore.loadingBySlug['jumlah-penduduk'] = false;
      return null;
    });
    indicatorsStore.bySlug = {};
    indicatorsStore.loadingBySlug['jumlah-penduduk'] = false;

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

  it('renders error state with retry button when indicator fetch fails', async () => {
    const { pinia, router } = mountView();
    const indicatorsStore = useIndicatorsStore();
    indicatorsStore.bySlug = {};
    indicatorsStore.loadingBySlug['jumlah-penduduk'] = false;
    indicatorsStore.errorsBySlug['jumlah-penduduk'] = 'Gagal memuat indikator (status 500)';

    const fetchSpy = vi.spyOn(indicatorsStore, 'fetchBySlug').mockResolvedValue(null);

    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.find('[data-test="population-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Gagal Memuat Data');
    expect(wrapper.text()).toContain('Gagal memuat indikator (status 500)');

    const retryBtn = wrapper.find('[data-test="population-error"] button');
    expect(retryBtn.exists()).toBe(true);
    expect(retryBtn.text()).toContain('Coba lagi');
    await retryBtn.trigger('click');
    expect(fetchSpy).toHaveBeenCalledWith('jumlah-penduduk', true);
  });

  it('keeps showing the last good population value when a refresh fails', async () => {
    const { pinia, router } = mountView();
    const indicatorsStore = useIndicatorsStore();
    indicatorsStore.bySlug = {
      'jumlah-penduduk': {
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
        hedgeNote: null,
        sortOrder: 0,
        comparisonTemplateId: null,
        comparison: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    };
    indicatorsStore.loadingBySlug['jumlah-penduduk'] = false;
    indicatorsStore.errorsBySlug['jumlah-penduduk'] = 'Gagal memuat indikator (status 500)';
    const fetchSpy = vi.spyOn(indicatorsStore, 'fetchBySlug').mockResolvedValue(null);

    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.find('[data-test="population-stale-notice"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('125.000');
    expect(wrapper.text()).toContain('Menampilkan angka terakhir yang berhasil dimuat');
    expect(wrapper.find('[data-test="population-error"]').exists()).toBe(false);

    await wrapper.find('[data-test="population-stale-notice"] button').trigger('click');
    expect(fetchSpy).toHaveBeenLastCalledWith('jumlah-penduduk', true);
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

  it('renders the Lurah profile without a sample portrait', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    // A named official must never be paired with placeholder art.
    expect(wrapper.find('img[src*="lurah_placeholder_sample"]').exists()).toBe(false);
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
    const mapCard = wrapper.find('[data-test="map-resource-card"]');
    expect(mapCard.find('[data-test="map-card-coming-soon"]').exists()).toBe(true);
    expect(mapCard.find('a[href="/peta"]').exists()).toBe(false);
  });

  it('links the map card once the Peta route exists', async () => {
    const { pinia, router } = mountView({ includeMapRoute: true });
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    const mapCard = wrapper.find('[data-test="map-resource-card"]');
    expect(mapCard.find('[data-test="map-card-coming-soon"]').exists()).toBe(false);
    const mapLink = mapCard.find('a[href="/peta"]');
    expect(mapLink.exists()).toBe(true);
    expect(mapLink.text()).toContain('Buka peta');
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
    expect(statCard.text()).not.toContain('Pesisir & Dataran');
    expect(statCard.text()).not.toContain('Potensi pantai & pertanian');
    expect(statCard.text()).toContain('Desa Cantik');
    expect(statCard.text()).toContain('Kelurahan Cinta Statistik');

    // RT count in prose
    expect(wrapper.text()).toContain('bersama 100 Rukun Tetangga (RT)');

    // Typo fix assertion: "berupaya menyediakan" instead of "strive menyediakan"
    expect(wrapper.text()).toContain('Kelurahan Manggar berupaya menyediakan');
    expect(wrapper.text()).not.toContain('strive menyediakan');
  });

  it('matches the Lurah role case-insensitively in profile metadata', async () => {
    const { pinia, router } = mountView();
    const contentBlocks = useContentBlocksStore();
    contentBlocks.blocks['tentang-kelurahan-profil'] = {
      ...contentBlocks.blocks['tentang-kelurahan-profil']!,
      metadata: {
        lurahName: '',
        sotkMembers: [{ role: '  lurah ', officialName: 'Nama Dari Metadata', duties: null }],
      },
    };
    vi.spyOn(contentBlocks, 'fetchBlocks').mockResolvedValue(undefined);
    vi.spyOn(useIndicatorsStore(), 'fetchBySlug').mockResolvedValue(null);
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Nama Dari Metadata');
    wrapper.unmount();
  });

  it('does not resurrect the static Lurah when a custom SOTK roster is empty', async () => {
    const { pinia, router } = mountView();
    const contentBlocks = useContentBlocksStore();
    contentBlocks.blocks['tentang-kelurahan-profil'] = {
      ...contentBlocks.blocks['tentang-kelurahan-profil']!,
      metadata: { lurahName: '', sotkMembers: [] },
    };
    vi.spyOn(contentBlocks, 'fetchBlocks').mockResolvedValue(undefined);
    vi.spyOn(useIndicatorsStore(), 'fetchBySlug').mockResolvedValue(null);
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Nama pejabat belum tersedia');
    wrapper.unmount();
  });

  it('calls fetchBySlug without force on mount so the short cache can be used', async () => {
    const { pinia, router } = mountView();
    const indicatorsStore = useIndicatorsStore();
    const fetchSpy = vi.spyOn(indicatorsStore, 'fetchBySlug').mockResolvedValue(null);

    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    expect(fetchSpy).toHaveBeenCalledWith('jumlah-penduduk');
  });

  it('keeps the SOTK table real, with every column and a contained, keyboard-scrollable box', async () => {
    const { pinia, router } = mountView();
    vi.spyOn(useContentBlocksStore(), 'fetchBlocks').mockResolvedValue(undefined);
    vi.spyOn(useIndicatorsStore(), 'fetchBySlug').mockResolvedValue(null);
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    const scroll = wrapper.find('[data-test="sotk-scroll"]');
    expect(scroll.exists()).toBe(true);
    expect(scroll.classes()).toContain('overflow-x-auto');
    expect(scroll.attributes('tabindex')).toBe('0');
    expect(scroll.attributes('role')).toBe('region');
    expect(scroll.attributes('aria-labelledby')).toBe('sotk-title');

    const table = scroll.find('table');
    expect(table.exists()).toBe(true);
    expect(table.find('caption').exists()).toBe(true);
    const headers = table.findAll('thead th[scope="col"]');
    expect(headers).toHaveLength(3);
    headers.forEach((th) => {
      expect(th.classes()).not.toContain('hidden');
      expect(th.classes().some((c) => c.endsWith(':table-cell'))).toBe(false);
    });
    expect(table.classes().join(' ')).toContain('min-w-[44rem]');
  });

  it('renders the Potensi cards as white cards, not tinted ones', async () => {
    const { pinia, router } = mountView();
    vi.spyOn(useContentBlocksStore(), 'fetchBlocks').mockResolvedValue(undefined);
    vi.spyOn(useIndicatorsStore(), 'fetchBySlug').mockResolvedValue(null);
    await router.push('/tentang/kelurahan-manggar');
    await router.isReady();

    const wrapper = mount(TentangKelurahanManggarView, {
      global: { plugins: [pinia, router] },
    });

    const cards = wrapper.findAll('section[aria-labelledby="potensi-title"] article');
    expect(cards).toHaveLength(4);
    cards.forEach((card) => expect(card.classes()).toContain('bg-white'));
    expect(wrapper.html()).not.toMatch(/brand-(cyan|violet|indigo|teal)/);
  });
});
