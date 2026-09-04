import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionHero from '@/components/common/SectionHero.vue';

describe('SectionHero.vue', () => {
  it('renders default hero title, eyebrow, and description with SIDATA highlight matching Figma spec', () => {
    const wrapper = mount(SectionHero);

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
    const wrapper = mount(SectionHero, {
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
    const wrapper = mount(SectionHero, {
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

  it('applies light variant styling when variant="light"', () => {
    const wrapper = mount(SectionHero, {
      props: {
        variant: 'light',
      },
    });

    const section = wrapper.find('[data-test="section-hero"]');
    expect(section.classes()).toContain('bg-slate-50');
    expect(section.classes()).toContain('text-slate-900');
  });

  it('applies dark gradient background overlay by default', () => {
    const wrapper = mount(SectionHero, {
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
});
