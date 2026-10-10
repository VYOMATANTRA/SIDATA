import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LandingSectionHero from '../components/landing/SectionHero.vue';
import CommonSectionHero from '@/components/common/SectionHero.vue';
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
      const wrapper = mount(LandingSectionHero, {
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
      const wrapper = mount(LandingSectionHero, {
        global: {
          plugins: [pinia],
          stubs: { 'router-link': true },
        },
      });
      const cta = wrapper.find('a.inline-flex');
      expect(cta.attributes('href')).toBe(link);
    }
  });

  it('falls back to settingsStore tagline and DEFAULT_HERO_BLOCK body when title and body are empty or whitespace-only', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    store.blocks['landing-hero'] = {
      ...DEFAULT_HERO_BLOCK,
      title: '   ',
      body: '   ',
    };

    const wrapper = mount(LandingSectionHero, {
      global: {
        plugins: [pinia],
        stubs: { 'router-link': true },
      },
    });

    const h1 = wrapper.find('h1');
    expect(h1.text().trim().length).toBeGreaterThan(0);
    expect(h1.text()).toBe('Sistem Informasi Data Terpadu Kelurahan Manggar');

    const p = wrapper.find('p');
    expect(p.text().trim().length).toBeGreaterThan(0);
    expect(p.text()).toBe(DEFAULT_HERO_BLOCK.body);
  });
});

describe('Common SectionHero.vue', () => {
  it('renders default hero title, eyebrow, and description with SIDATA highlight matching Figma spec', () => {
    const wrapper = mount(CommonSectionHero);

    // Check SectionTextArea wrapper
    const textArea = wrapper.find('[data-test="hero-section-text-area"]');
    expect(textArea.exists()).toBe(true);

    // Eyebrow
    const eyebrowEl = wrapper.find('[data-test="section-eyebrow"]');
    expect(eyebrowEl.exists()).toBe(true);
    expect(eyebrowEl.text()).toBe('Program Kelurahan Cantik mempersembahkan');

    // Title & heading tag
    const titleEl = wrapper.find('[data-test="section-title"]');
    expect(titleEl.exists()).toBe(true);
    expect(titleEl.element.tagName.toLowerCase()).toBe('h1');
    expect(titleEl.text()).toBe('Sistem Informasi Data Terpadu Kelurahan');

    // Description
    const descEl = wrapper.find('[data-test="section-description"]');
    expect(descEl.exists()).toBe(true);
    expect(descEl.text()).toContain('SIDATA');
    expect(descEl.text()).toContain('Portal Data Kelurahan Manggar yang menyajikan data statistik');
  });

  it('renders customized props for title, eyebrow, and description', () => {
    const wrapper = mount(CommonSectionHero, {
      props: {
        eyebrow: 'Inovasi Statistik Terpadu',
        title: 'Portal Satu Data Manggar',
        description: 'Menyajikan seluruh indikator pembangunan kelurahan.',
        descriptionHighlight: 'SATU DATA',
        align: 'center',
      },
    });

    const eyebrowEl = wrapper.find('[data-test="section-eyebrow"]');
    expect(eyebrowEl.text()).toBe('Inovasi Statistik Terpadu');

    const titleEl = wrapper.find('[data-test="section-title"]');
    expect(titleEl.text()).toBe('Portal Satu Data Manggar');

    const descEl = wrapper.find('[data-test="section-description"]');
    expect(descEl.text()).toContain('SATU DATA —');
    expect(descEl.text()).toContain('Menyajikan seluruh indikator pembangunan kelurahan.');
  });

  it('supports custom slots for content, actions, and partner badges', () => {
    const wrapper = mount(CommonSectionHero, {
      slots: {
        eyebrow: '<span class="test-eyebrow">Tag Kustom</span>',
        title: '<h1 class="test-title">Judul Kustom</h1>',
        description: '<p class="test-desc">Deskripsi Kustom</p>',
        actions: '<button class="test-btn">Mulai Jelajah</button>',
        partners: '<span class="test-partner">BPS & ITK</span>',
      },
    });

    expect(wrapper.find('.test-eyebrow').text()).toBe('Tag Kustom');
    expect(wrapper.find('.test-title').text()).toBe('Judul Kustom');
    expect(wrapper.find('.test-desc').text()).toBe('Deskripsi Kustom');
    expect(wrapper.find('.test-btn').text()).toBe('Mulai Jelajah');
    expect(wrapper.find('.test-partner').text()).toBe('BPS & ITK');
  });

  it('applies light variant styling when variant="light" without dark background image or overlay', () => {
    const wrapper = mount(CommonSectionHero, {
      props: {
        variant: 'light',
      },
    });

    const section = wrapper.find('[data-test="section-hero"]');
    expect(section.classes()).toContain('bg-slate-50');
    expect(section.classes()).toContain('text-slate-900');
    expect(section.attributes('style')).toBeFalsy();

    const highlight = wrapper.find('.font-bold');
    expect(highlight.classes()).toContain('text-slate-900');
  });

  it('applies default hero background image and dark gradient overlay for default dark variant', () => {
    const wrapper = mount(CommonSectionHero);

    const section = wrapper.find('[data-test="section-hero"]');
    const style = section.attributes('style');
    expect(style).toContain('linear-gradient');
    expect(style).toContain('background_laman_depan_kelurahan.png');
  });

  it('applies dark gradient background overlay when custom backgroundImage is passed', () => {
    const wrapper = mount(CommonSectionHero, {
      props: {
        backgroundImage: '/test-hero-bg.png',
        showOverlay: true,
      },
    });

    const section = wrapper.find('[data-test="section-hero"]');
    const style = section.attributes('style');
    expect(style).toContain('linear-gradient');
    expect(style).toContain('/test-hero-bg.png');
  });

  it('does not apply background image to navy and glass variants by default', () => {
    const navyWrapper = mount(CommonSectionHero, {
      props: { variant: 'navy' },
    });
    expect(navyWrapper.find('[data-test="section-hero"]').attributes('style')).toBeFalsy();

    const glassWrapper = mount(CommonSectionHero, {
      props: { variant: 'glass' },
    });
    expect(glassWrapper.find('[data-test="section-hero"]').attributes('style')).toBeFalsy();
  });
});
