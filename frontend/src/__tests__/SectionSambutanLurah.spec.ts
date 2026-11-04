import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SectionSambutanLurah from '../components/landing/SectionSambutanLurah.vue';
import { useContentBlocksStore, DEFAULT_SAMBUTAN_BLOCK } from '../stores/contentBlocks.store';

describe('SectionSambutanLurah (TDD: Edge Cases First, Happy Path Last)', () => {
  // Edge Case 1: Null or empty author metadata fallbacks
  it('falls back to default author credentials when metadata is empty or missing', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    store.blocks['landing-sambutan-lurah'] = {
      ...DEFAULT_SAMBUTAN_BLOCK,
      metadata: null,
    };

    const wrapper = mount(SectionSambutanLurah, {
      global: { plugins: [pinia] },
    });

    expect(wrapper.find('h2#sambutan-title').exists()).toBe(true);
    expect(wrapper.text()).toContain('Lurah Manggar');
    expect(wrapper.text()).toContain('Kepala Kelurahan Manggar');
  });

  // Edge Case 2: Unsafe photo URL protocols rejected
  it('rejects unsafe photoUrl protocols and renders fallback portrait placeholder', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    store.blocks['landing-sambutan-lurah'] = {
      ...DEFAULT_SAMBUTAN_BLOCK,
      metadata: {
        authorName: 'Lurah Test',
        photoUrl: 'javascript:alert(1)',
      },
    };

    const wrapper = mount(SectionSambutanLurah, {
      global: { plugins: [pinia] },
    });

    // Should not render an img with javascript: src
    const img = wrapper.find('img');
    expect(img.exists()).toBe(false);
  });

  // Edge Case 3: Semantic heading and landmark integrity
  it('renders section landmark with h2#sambutan-title matching WCAG Level A', () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const wrapper = mount(SectionSambutanLurah, {
      global: { plugins: [pinia] },
    });

    const section = wrapper.find('section[aria-labelledby="sambutan-title"]');
    expect(section.exists()).toBe(true);

    const h2 = wrapper.find('h2#sambutan-title');
    expect(h2.exists()).toBe(true);
    expect(h2.text().length).toBeGreaterThan(0);
  });

  // Happy Path (Last): Custom author credentials and valid image rendering
  it('renders custom author name, title, and valid https photo correctly', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    store.blocks['landing-sambutan-lurah'] = {
      ...DEFAULT_SAMBUTAN_BLOCK,
      title: 'Pesan Dari Lurah',
      body: 'Mari bersama membangun Kelurahan Manggar tercinta.',
      metadata: {
        authorName: 'Munadi Noor, S.Sos',
        authorTitle: 'Lurah Manggar Definitif',
        photoUrl: 'https://manggar.balikpapan.go.id/img/lurah.png',
      },
    };

    const wrapper = mount(SectionSambutanLurah, {
      global: { plugins: [pinia] },
    });

    expect(wrapper.find('h2#sambutan-title').text()).toBe('Pesan Dari Lurah');
    expect(wrapper.text()).toContain('Mari bersama membangun Kelurahan Manggar tercinta.');
    expect(wrapper.text()).toContain('Munadi Noor, S.Sos');
    expect(wrapper.text()).toContain('Lurah Manggar Definitif');

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://manggar.balikpapan.go.id/img/lurah.png');
  });
});
