import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import PrivacyPolicyView from '../views/PrivacyPolicyView.vue';
import { publicShellKey } from '../layouts/publicShell';

function createMockRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/permintaan-data', component: { template: '<div>Permintaan Data</div>' } },
      { path: '/kebijakan-privasi', component: PrivacyPolicyView },
    ],
  });
}

describe('PrivacyPolicyView.vue', () => {
  it('renders a single h1 heading and maintains a valid heading hierarchy without skipped levels', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createMockRouter();
    await router.push('/kebijakan-privasi');
    await router.isReady();

    const wrapper = mount(PrivacyPolicyView, {
      global: {
        plugins: [pinia, router],
        provide: {
          [publicShellKey as symbol]: true,
        },
      },
    });

    const h1s = wrapper.findAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe('Kebijakan Privasi');

    const headings = wrapper.findAll('h1, h2, h3, h4, h5, h6');
    expect(headings.length).toBeGreaterThan(1);

    let prevLevel = 1;
    for (const heading of headings) {
      const level = Number(heading.element.tagName.slice(1));
      // A heading level must never jump by more than 1 down from its predecessor
      expect(level).toBeLessThanOrEqual(prevLevel + 1);
      prevLevel = level;
    }
  });

  it('renders all 8 required privacy policy sections with matching anchor IDs', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createMockRouter();
    await router.push('/kebijakan-privasi');
    await router.isReady();

    const wrapper = mount(PrivacyPolicyView, {
      global: {
        plugins: [pinia, router],
        provide: {
          [publicShellKey as symbol]: true,
        },
      },
    });

    const expectedSections = [
      { id: 'data-dikumpulkan', heading: '1. Data yang Dikumpulkan' },
      { id: 'penggunaan-data', heading: '2. Penggunaan Data' },
      { id: 'pihak-ketiga', heading: '3. Pihak Ketiga' },
      { id: 'pihak-melihat-data', heading: '4. Pihak yang Dapat Melihat Data' },
      { id: 'penyimpanan-keamanan', heading: '5. Penyimpanan dan Keamanan' },
      { id: 'hak-pengguna', heading: '6. Hak Pengguna dan Penghapusan Data' },
      { id: 'perubahan-kebijakan', heading: '7. Perubahan Kebijakan' },
      { id: 'kontak', heading: '8. Kontak' },
    ];

    for (const section of expectedSections) {
      const sectionEl = wrapper.find(`section#${section.id}`);
      expect(sectionEl.exists()).toBe(true);
      const h2 = sectionEl.find('h2');
      expect(h2.exists()).toBe(true);
      expect(h2.text()).toBe(section.heading);
    }
  });

  it('references UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createMockRouter();
    await router.push('/kebijakan-privasi');
    await router.isReady();

    const wrapper = mount(PrivacyPolicyView, {
      global: {
        plugins: [pinia, router],
        provide: {
          [publicShellKey as symbol]: true,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain('27 Tahun 2022');
    expect(text).toContain('Pelindungan Data Pribadi');
  });
});
