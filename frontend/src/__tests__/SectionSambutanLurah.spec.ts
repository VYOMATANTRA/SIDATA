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

  describe('layout and portrait handling', () => {
    function mountWith(metadata: Record<string, unknown> | null, extra = {}) {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useContentBlocksStore(pinia);
      store.blocks['landing-sambutan-lurah'] = {
        ...DEFAULT_SAMBUTAN_BLOCK,
        ...extra,
        metadata,
      };
      return mount(SectionSambutanLurah, { global: { plugins: [pinia] } });
    }

    it('uses a navy-to-lightened-navy vertical gradient surface, not the old navy-deep one', () => {
      const wrapper = mountWith(null);
      const section = wrapper.find('section#sambutan-lurah');
      expect(section.classes()).toContain('sambutan-surface');
      expect(section.classes().join(' ')).not.toMatch(/navy-deep|cyan|violet|indigo|teal/);
    });

    it('keeps copy and portrait in separate zones and the author block in the copy zone', () => {
      const wrapper = mountWith(null);
      const copy = wrapper.find('[data-test="sambutan-copy"]');
      const portrait = wrapper.find('[data-test="portrait-container"]');
      expect(copy.exists()).toBe(true);
      expect(portrait.exists()).toBe(true);
      expect(copy.element.contains(portrait.element)).toBe(false);
      expect(copy.find('[data-test="author-details"]').exists()).toBe(true);
      expect(copy.find('h2#sambutan-title').exists()).toBe(true);
      // The portrait is never taken out of flow, so it cannot cover the name or title
      expect(portrait.classes()).not.toContain('absolute');
      expect(portrait.find('img').classes()).toContain('object-bottom');
      expect(portrait.find('img').classes()).toContain('object-contain');
    });

    it('shows the bundled portrait when the photo key is missing or empty', () => {
      expect(mountWith({ authorName: 'A' }).find('[data-test="quote-image"]').exists()).toBe(true);
      expect(mountWith({ photoUrl: '' }).find('[data-test="quote-image"]').exists()).toBe(true);
    });

    it('drops the portrait zone on explicit removal and lets the copy use the full width', () => {
      const wrapper = mountWith({ photoUrl: null });
      expect(wrapper.find('[data-test="portrait-container"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="portrait-placeholder"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="sambutan-layout"]').classes().join(' ')).not.toContain(
        'md:grid-cols-',
      );
      expect(wrapper.find('[data-test="sambutan-section"]').classes()).toContain('pb-12');
    });

    it('never shows developer placeholder text when no portrait is available', () => {
      const wrapper = mountWith({ photoUrl: 'javascript:alert(1)' });
      expect(wrapper.text()).not.toContain('imageSrc');
      expect(wrapper.text()).not.toContain('Prop dinamis');
    });

    it('drops the portrait when the photo fails to load', async () => {
      const wrapper = mountWith({ photoUrl: 'https://example.com/broken.png' });
      await wrapper.find('[data-test="quote-image"]').trigger('error');
      expect(wrapper.find('[data-test="portrait-container"]').exists()).toBe(false);
    });

    it('lets a long name, title and quote wrap instead of overflowing', () => {
      const longName = 'Dr. H. Muhammad Abdurrahman Al-Fatihah bin Sulaiman, S.Sos., M.Si., M.Ec.Dev';
      const wrapper = mountWith(
        { authorName: longName, authorTitle: 'Lurah Kelurahan Manggar, Kecamatan Balikpapan Timur' },
        { body: 'Sangat'.repeat(200) },
      );
      expect(wrapper.text()).toContain(longName);
      const name = wrapper.find('[data-test="author-details"] h3');
      expect(name.classes()).not.toContain('whitespace-nowrap');
      expect(name.classes().join(' ')).toContain('overflow-wrap:anywhere');
      expect(wrapper.find('[data-test="sambutan-quote"]').classes().join(' ')).toContain(
        'overflow-wrap:anywhere',
      );
    });
  });
});
