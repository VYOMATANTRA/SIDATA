import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangVyomatantraView from '../views/TentangVyomatantraView.vue';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/tentang/vyomatantra', component: TentangVyomatantraView },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

describe('TentangVyomatantraView accessibility and content', () => {
  it('renders required semantic landmarks, skip link, and single h1', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
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
    expect(h1List[0]?.text()).toContain('Inovasi Sosial VYOMATANTRA');
  });

  it('renders partner logos and SDGs badges with accessible alt text', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.find('img[alt="Logo Tim Inovasi Sosial VYOMATANTRA"]').exists()).toBe(true);
    expect(wrapper.find('img[alt="Logo Institut Teknologi Kalimantan (ITK)"]').exists()).toBe(true);
    expect(wrapper.find('img[alt="Logo SDGs Desa"]').exists()).toBe(true);
    expect(
      wrapper.find('img[alt="Logo SDGs 17: Kemitraan untuk Pembangunan Desa"]').exists(),
    ).toBe(true);
  });

  it('renders core initiatives including Eco Boba and Bank Sampah Unit', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Program Eco Boba (Briket Arang Batok Kelapa)');
    expect(wrapper.text()).toContain('Pembinaan & Pemetaan Bank Sampah Unit (BSU)');
    expect(wrapper.text()).toContain('Rancang Bangun Sistem SIDATA');
    expect(wrapper.text()).toContain('SDG 17: Kemitraan untuk Mencapai Tujuan');
  });
});
