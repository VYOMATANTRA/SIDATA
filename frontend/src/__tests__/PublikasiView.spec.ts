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
    expect(breadcrumb.text()).toContain('Beranda');
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
    // Citations from docs/CONTENT_SOURCES.md
    expect(wrapper.findAll('[data-test="publication-source"]')).toHaveLength(4);
    expect(wrapper.text()).toContain('Booklet Pelatihan BSU.pdf');
    expect(wrapper.text()).toContain('Manggar Dalam Angka 2026.pdf');
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

  it('only renders download links for approved https:// URLs and ignores javascript: schemes', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');
    await router.isReady();

    const { useContentBlocksStore } = await import('../stores/contentBlocks.store');
    const store = useContentBlocksStore();
    store.blocks['publikasi-katalog'] = {
      id: 'block-pub',
      sectionId: null,
      type: 'prose',
      slug: 'publikasi-katalog',
      title: 'Katalog',
      body: 'Deskripsi',
      metadata: {
        publications: [
          {
            category: 'Infografis',
            title: 'Dokumen Bahaya',
            description: 'Uji XSS',
            href: 'javascript:alert(1)',
            isAvailableOnline: true,
          },
          {
            category: 'Statistik',
            title: 'Dokumen Resmi',
            description: 'Download Resmi',
            href: 'https://example.com/dokumen.pdf',
            isAvailableOnline: true,
          },
        ],
      },
      sortOrder: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false);
    const safeLink = wrapper.find('a[href="https://example.com/dokumen.pdf"]');
    expect(safeLink.exists()).toBe(true);
    expect(safeLink.text()).toContain('Unduh Dokumen');
  });

  it('keeps https href as Segera hadir when isAvailableOnline is false', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');
    await router.isReady();

    const { useContentBlocksStore } = await import('../stores/contentBlocks.store');
    const store = useContentBlocksStore();
    store.blocks['publikasi-katalog'] = {
      id: 'block-pub',
      sectionId: null,
      type: 'prose',
      slug: 'publikasi-katalog',
      title: 'Katalog',
      body: 'Deskripsi',
      metadata: {
        publications: [
          {
            category: 'Statistik',
            title: 'Dokumen Tertutup',
            description: 'Ada URL tapi belum dirilis',
            href: 'https://example.com/tertutup.pdf',
            isAvailableOnline: false,
          },
        ],
      },
      sortOrder: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.find('a[href="https://example.com/tertutup.pdf"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="publication-status"]').text()).toBe('Segera hadir');
    expect(wrapper.text()).toContain(
      'Tautan unduhan akan ditampilkan setelah dokumen resmi tersedia.',
    );
  });

  it('shows Unduh when isAvailableOnline is true and href is https', async () => {
    const { router, wrapper } = mountPublikasiView();
    await router.push('/publikasi');
    await router.isReady();

    const { useContentBlocksStore } = await import('../stores/contentBlocks.store');
    const store = useContentBlocksStore();
    store.blocks['publikasi-katalog'] = {
      id: 'block-pub',
      sectionId: null,
      type: 'prose',
      slug: 'publikasi-katalog',
      title: 'Katalog',
      body: 'Deskripsi',
      metadata: {
        publications: [
          {
            category: 'Statistik',
            title: 'Dokumen Terbuka',
            description: 'Siap diunduh',
            href: 'https://example.com/terbuka.pdf',
            isAvailableOnline: true,
          },
        ],
      },
      sortOrder: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    await wrapper.vm.$nextTick();

    const link = wrapper.find('[data-test="publication-link"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://example.com/terbuka.pdf');
    expect(wrapper.find('[data-test="publication-status"]').exists()).toBe(false);
  });
});
