import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SectionHero from '../components/landing/SectionHero.vue';
import { useContentBlocksStore, DEFAULT_HERO_BLOCK } from '../stores/contentBlocks.store';

describe('SectionHero ctaLink security', () => {
  it('falls back to #potensi when ctaLink contains backslash bypasses (/\\x, /%5cx, /\\t/x)', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    const malicious = ['/\\evil.com', '/\\x', '/%5cx', '/%5Cx', '/%5cevil.com', '/\\t/x'];

    for (const link of malicious) {
      store.blocks['landing-hero'] = {
        ...DEFAULT_HERO_BLOCK,
        metadata: { ctaLink: link },
      };
      const wrapper = mount(SectionHero, {
        global: {
          plugins: [pinia],
          stubs: { 'router-link': true },
        },
      });
      const cta = wrapper.find('a.inline-flex');
      expect(cta.attributes('href')).toBe('#potensi');
    }
  });

  it('accepts safe relative paths, anchors, and HTTPS URLs for ctaLink', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    const safeLinks = ['#potensi', '/layanan', 'https://kelurahan-manggar.balikpapan.go.id'];

    for (const link of safeLinks) {
      store.blocks['landing-hero'] = {
        ...DEFAULT_HERO_BLOCK,
        metadata: { ctaLink: link },
      };
      const wrapper = mount(SectionHero, {
        global: {
          plugins: [pinia],
          stubs: { 'router-link': true },
        },
      });
      const cta = wrapper.find('a.inline-flex');
      expect(cta.attributes('href')).toBe(link);
    }
  });
});
