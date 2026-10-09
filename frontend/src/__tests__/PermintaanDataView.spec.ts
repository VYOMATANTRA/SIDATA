import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PermintaanDataView from '../views/PermintaanDataView.vue';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/permintaan-data', component: PermintaanDataView },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

describe('PermintaanDataView accessibility and content', () => {
  it('renders required semantic landmarks, skip link, and single h1', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    // Skip to content link
    const skipLink = wrapper.find('a[href="#main-content"]');
    expect(skipLink.exists()).toBe(true);

    // Landmarks
    expect(wrapper.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);
    const mainLandmarks = wrapper.findAll('main#main-content');
    expect(mainLandmarks.length).toBe(1);
    expect(wrapper.find('footer').exists()).toBe(true);

    // Exactly one h1
    const h1List = wrapper.findAll('h1');
    expect(h1List.length).toBe(1);
    expect(h1List[0]?.text()).toContain('Permintaan Data & Informasi Publik');
  });

  it('displays strict scope notice clarifying external pointer nature per SPEC §1 and §9', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    // Scope notice per SPEC §1 & §9
    expect(wrapper.text()).toContain('Pemberitahuan Batasan Layanan Portal (SPEC §1 & §9)');
    expect(wrapper.text()).toContain('tidak menyimpan dokumen resmi PPID');
    expect(wrapper.text()).toContain('penunjuk eksternal (external pointer)');
  });

  it('renders procedural steps in a semantic ordered list <ol>', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const ol = wrapper.find('[data-test="procedure-steps"]');
    expect(ol.exists()).toBe(true);

    const steps = ol.findAll('.procedure-step');
    expect(steps.length).toBe(5);
    expect(wrapper.text()).toContain('Periksa Ketersediaan Data Publik di Portal SIDATA');
    expect(wrapper.text()).toContain('Siapkan Dokumen Persyaratan Pemohon');
    expect(wrapper.text()).toContain('Ajukan Permohonan Resmi ke PPID Kota Balikpapan');
  });

  it('renders SLA service standards in a semantic accessible table', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const table = wrapper.find('table');
    expect(table.exists()).toBe(true);
    expect(table.find('caption').exists()).toBe(true);

    const colHeaders = table.findAll('th[scope="col"]');
    expect(colHeaders.length).toBe(3);

    const rowHeaders = table.findAll('tbody th[scope="row"]');
    expect(rowHeaders.length).toBeGreaterThanOrEqual(5);

    expect(wrapper.text()).toContain('Maksimal 10 Hari Kerja');
    expect(wrapper.text()).toContain('Bebas Biaya (Gratis)');
  });

  it('renders external Balikpapan PPID link with accessible security attributes', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const ppidLink = wrapper.find('a[href="https://ppid.balikpapan.go.id"]');
    expect(ppidLink.exists()).toBe(true);
    expect(ppidLink.attributes('target')).toBe('_blank');
    expect(ppidLink.attributes('rel')).toContain('noopener');
    expect(ppidLink.attributes('rel')).toContain('noreferrer');
    expect(ppidLink.text()).toContain('Tautan eksternal');
  });
});
