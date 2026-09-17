import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HugeQuote from '@/components/common/HugeQuote.vue';

describe('HugeQuote.vue', () => {
  it('renders default quote text and author details matching Figma screenshot', () => {
    const wrapper = mount(HugeQuote);

    // Top SectionTextArea
    const headerEl = wrapper.find('[data-test="quote-header"]');
    expect(headerEl.exists()).toBe(true);
    expect(headerEl.text()).toContain('Sambutan');
    expect(headerEl.text()).toContain('Selamat datang di Portal Data Kelurahan Manggar');

    // Bottom SectionTextArea
    const authorEl = wrapper.find('[data-test="author-details"]');
    expect(authorEl.exists()).toBe(true);
    expect(authorEl.text()).toContain('Author Name, Title');
    expect(authorEl.text()).toContain('Position');

    // Default placeholder
    const placeholderEl = wrapper.find('[data-test="portrait-placeholder"]');
    expect(placeholderEl.exists()).toBe(true);
  });

  it('renders customized quote text and author credentials', () => {
    const wrapper = mount(HugeQuote, {
      props: {
        title: 'Kata Pengantar Lurah',
        quote: 'Sambutan hangat dari pimpinan wilayah Manggar.',
        eyebrow: '01 / Sambutan',
        authorName: 'Munir Achmad, S.Sos., M.Si.',
        authorPosition: 'Lurah Manggar',
      },
    });

    const headerEl = wrapper.find('[data-test="quote-header"]');
    expect(headerEl.text()).toContain('Kata Pengantar Lurah');
    expect(headerEl.text()).toContain('Sambutan hangat dari pimpinan wilayah Manggar.');
    expect(headerEl.text()).toContain('01 / Sambutan');

    const authorEl = wrapper.find('[data-test="author-details"]');
    expect(authorEl.text()).toContain('Munir Achmad, S.Sos., M.Si.');
    expect(authorEl.text()).toContain('Lurah Manggar');
  });

  it('supports description alias for quote prop and authorRole alias for authorPosition', () => {
    const wrapper = mount(HugeQuote, {
      props: {
        description: 'Teks kutipan via description prop',
        authorRole: 'Kepala Desa',
      },
    });

    expect(wrapper.find('[data-test="quote-header"]').text()).toContain(
      'Teks kutipan via description prop',
    );
    expect(wrapper.find('[data-test="author-details"]').text()).toContain('Kepala Desa');
  });

  it('renders dynamic image when imageSrc is passed', () => {
    const wrapper = mount(HugeQuote, {
      props: {
        imageSrc: '/assets/img/lurah.png',
        imageAlt: 'Foto Lurah Manggar',
      },
    });

    const img = wrapper.find('[data-test="quote-image"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/assets/img/lurah.png');
    expect(img.attributes('alt')).toBe('Foto Lurah Manggar');
    expect(wrapper.find('[data-test="portrait-placeholder"]').exists()).toBe(false);
  });

  it('falls back to placeholder when image triggers error event', async () => {
    const wrapper = mount(HugeQuote, {
      props: {
        imageSrc: '/assets/img/broken.png',
      },
    });

    const img = wrapper.find('[data-test="quote-image"]');
    expect(img.exists()).toBe(true);

    await img.trigger('error');

    expect(wrapper.find('[data-test="portrait-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="quote-image"]').exists()).toBe(false);
  });

  it('applies light theme styles when variant="light"', () => {
    const wrapper = mount(HugeQuote, {
      props: {
        variant: 'light',
      },
    });

    const container = wrapper.find('[data-test="huge-quote"]');
    expect(container.classes()).toContain('bg-white');
    expect(container.classes()).toContain('text-slate-900');
  });

  it('supports custom slots for content and image', () => {
    const wrapper = mount(HugeQuote, {
      slots: {
        eyebrow: '<span class="test-eyebrow">Pengantar Khusus</span>',
        title: '<h2 class="test-title">Judul Kustom</h2>',
        quote: '<p class="test-desc">Paragraf Kustom</p>',
        authorName: '<h3 class="test-author">Bapak Pimpinan</h3>',
        authorPosition: '<span class="test-pos">Kepala Wilayah</span>',
        image: '<div class="test-custom-image">Custom Image Slot</div>',
      },
    });

    expect(wrapper.find('.test-eyebrow').text()).toBe('Pengantar Khusus');
    expect(wrapper.find('.test-title').text()).toBe('Judul Kustom');
    expect(wrapper.find('.test-desc').text()).toBe('Paragraf Kustom');
    expect(wrapper.find('.test-author').text()).toBe('Bapak Pimpinan');
    expect(wrapper.find('.test-pos').text()).toBe('Kepala Wilayah');
    expect(wrapper.find('.test-custom-image').text()).toBe('Custom Image Slot');
  });
});
