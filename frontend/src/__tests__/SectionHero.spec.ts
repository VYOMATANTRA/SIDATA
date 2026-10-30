import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LandingSectionHero from '../components/landing/SectionHero.vue';
import CommonSectionHero from '@/components/common/SectionHero.vue';
import { useContentBlocksStore, DEFAULT_HERO_BLOCK } from '../stores/contentBlocks.store';

describe('Landing SectionHero.vue', () => {
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

  it('applies the official background_laman_depan_kelurahan image and dark navy gradient overlay', () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const wrapper = mount(LandingSectionHero, {
      global: {
        plugins: [pinia],
        stubs: { 'router-link': true },
      },
    });

    const section = wrapper.find('section#hero');
    const style = section.attributes('style');
    expect(style).toContain('linear-gradient');
    expect(style).toContain('background_laman_depan_kelurahan.webp');
  });

  it('sanitizes and safely handles editor background image without CSS breakout or XSS', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    // Malicious injection attempt
    store.blocks['landing-hero'] = {
      ...DEFAULT_HERO_BLOCK,
      metadata: {
        backgroundImage: "x'), url('https://tracker/p.png",
      },
    };

    const wrapper = mount(LandingSectionHero, {
      global: { plugins: [pinia] },
    });

    const style = wrapper.find('section#hero').attributes('style') || '';
    // Must NOT contain the unescaped tracker injection
    expect(style).not.toContain("url('x')");
    expect(style).not.toContain("url('https://tracker/p.png");
    // Should fallback to default image safely
    expect(style).toContain('background_laman_depan_kelurahan.webp');
  });

  it('rejects protocol-relative, backslash, and dangerous schemes in background image', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    const dangerousUrls = [
      '//evil.com/tracker.png',
      '/uploads\\image.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'http://insecure.com/hero.webp',
    ];

    for (const dangerous of dangerousUrls) {
      store.blocks['landing-hero'] = {
        ...DEFAULT_HERO_BLOCK,
        metadata: { backgroundImage: dangerous },
      };

      const wrapper = mount(LandingSectionHero, {
        global: { plugins: [pinia] },
      });

      const style = wrapper.find('section#hero').attributes('style') || '';
      expect(style).toContain('background_laman_depan_kelurahan.webp');
      expect(style).not.toContain(dangerous);
    }
  });

  it('safely applies valid https:// and relative / background image URLs', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    store.blocks['landing-hero'] = {
      ...DEFAULT_HERO_BLOCK,
      metadata: {
        backgroundImage: 'https://cdn.example.com/custom-hero.webp',
      },
    };

    const wrapper = mount(LandingSectionHero, {
      global: { plugins: [pinia] },
    });

    const style = wrapper.find('section#hero').attributes('style') || '';
    expect(style).toContain('https://cdn.example.com/custom-hero.webp');
  });

  it('does not double-encode already percent-encoded background image URLs', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentBlocksStore(pinia);

    store.blocks['landing-hero'] = {
      ...DEFAULT_HERO_BLOCK,
      metadata: {
        backgroundImage: 'https://cdn.example.com/custom%20hero.webp',
      },
    };

    const wrapper = mount(LandingSectionHero, {
      global: { plugins: [pinia] },
    });

    const style = wrapper.find('section#hero').attributes('style') || '';
    expect(style).toContain('https://cdn.example.com/custom%20hero.webp');
    expect(style).not.toContain('%2520');
  });

  it('does not render empty hero-actions container when no actions slot is provided', () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const wrapper = mount(LandingSectionHero, {
      global: { plugins: [pinia] },
    });

    expect(wrapper.find('[data-test="hero-actions"]').exists()).toBe(false);
  });

  it('renders hero-actions container when actions slot is passed', () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const wrapper = mount(LandingSectionHero, {
      global: { plugins: [pinia] },
      slots: {
        actions: '<button id="test-cta">Aksi</button>',
      },
    });

    expect(wrapper.find('[data-test="hero-actions"]').exists()).toBe(true);
    expect(wrapper.find('#test-cta').exists()).toBe(true);
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
    expect(style).toContain('background_laman_depan_kelurahan.webp');
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
