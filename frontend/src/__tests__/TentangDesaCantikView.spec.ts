import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangDesaCantikView from '../views/TentangDesaCantikView.vue';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/tentang/desa-cantik', component: TentangDesaCantikView },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

describe('TentangDesaCantikView accessibility and content', () => {
  it('renders required semantic landmarks, skip link, and single h1', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/desa-cantik');
    await router.isReady();

    const wrapper = mount(TentangDesaCantikView, {
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
    expect(h1List[0]?.text()).toContain('Program Desa/Kelurahan Cinta Statistik (Desa Cantik)');
  });

  it('renders partner logos with descriptive alt text', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/desa-cantik');
    await router.isReady();

    const wrapper = mount(TentangDesaCantikView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.find('img[alt="Logo Desa Cantik"]').exists()).toBe(true);
    expect(wrapper.find('img[alt="Logo Badan Pusat Statistik (BPS)"]').exists()).toBe(true);
  });

  it('renders accurate hero subtitle and program description', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/desa-cantik');
    await router.isReady();

    const wrapper = mount(TentangDesaCantikView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain(
      'Upaya Kelurahan Manggar dalam mewujudkan kelurahan sadar statistik.',
    );
    expect(wrapper.text()).not.toContain('nagari');
    expect(wrapper.text()).not.toContain('Catatan Batasan Portal');
    expect(wrapper.text()).toContain('Tentang Program Desa Cantik');
    expect(wrapper.text()).toContain('Portal SIDATA');
    expect(wrapper.text()).toContain(
      'Desa/Kelurahan Cinta Statistik merupakan inisiatif dari Badan Pusat Statistik (BPS) untuk meningkatkan literasi, pengelolaan, dan pemanfaatan data statistik di tingkat desa/kelurahan agar pembangunan desa/kelurahan lebih tepat sasaran.',
    );
    expect(wrapper.text()).not.toContain('100 Ketua RT');
    expect(wrapper.text()).not.toContain('(seperti yang ditampilkan di portal SIDATA ini)');
  });

  it('renders accurate photo caption for kelurahan building', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/desa-cantik');
    await router.isReady();

    const wrapper = mount(TentangDesaCantikView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Kantor Kelurahan Manggar, Balikpapan Timur');
    expect(wrapper.text()).not.toContain('Foto bareng BPS');
  });

  it('renders external BPS portal link with accessible attributes', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/desa-cantik');
    await router.isReady();

    const wrapper = mount(TentangDesaCantikView, {
      global: { plugins: [pinia, router] },
    });

    const externalLink = wrapper.find('a[href="https://www.bps.go.id"]');
    expect(externalLink.exists()).toBe(true);
    expect(externalLink.attributes('target')).toBe('_blank');
    expect(externalLink.attributes('rel')).toContain('noopener');
    expect(externalLink.attributes('rel')).toContain('noreferrer');
    expect(externalLink.text()).toContain('Tautan eksternal');
  });
});
