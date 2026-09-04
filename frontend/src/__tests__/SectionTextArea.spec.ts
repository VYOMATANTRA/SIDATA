import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionTextArea from '@/components/common/SectionTextArea.vue';

describe('SectionTextArea.vue', () => {
  it('renders section title and description matching Figma screenshot', () => {
    const wrapper = mount(SectionTextArea, {
      props: {
        title: 'Demografi Penduduk',
        description:
          'Komposisi dan kepadatan penduduk, keluarga, persebaran rasio jenis kelamin, umur, pendidikan, dan lainnya',
      },
    });

    const titleEl = wrapper.find('[data-test="section-title"]');
    const descEl = wrapper.find('[data-test="section-description"]');

    expect(titleEl.exists()).toBe(true);
    expect(titleEl.text()).toBe('Demografi Penduduk');
    expect(titleEl.element.tagName.toLowerCase()).toBe('h2');
    expect(titleEl.classes()).toContain('text-white');

    expect(descEl.exists()).toBe(true);
    expect(descEl.text()).toBe(
      'Komposisi dan kepadatan penduduk, keluarga, persebaran rasio jenis kelamin, umur, pendidikan, dan lainnya',
    );
  });

  it('renders configured headingTag for semantic hierarchy (h1, h2, h3, h4)', () => {
    const wrapper = mount(SectionTextArea, {
      props: {
        title: 'Cerita Utama',
        headingTag: 'h1',
      },
    });

    const titleEl = wrapper.find('[data-test="section-title"]');
    expect(titleEl.element.tagName.toLowerCase()).toBe('h1');
  });

  it('renders optional eyebrow category tag when provided', () => {
    const wrapper = mount(SectionTextArea, {
      props: {
        eyebrow: '01 / Kependudukan',
        title: 'Demografi Penduduk',
      },
    });

    const eyebrowEl = wrapper.find('[data-test="section-eyebrow"]');
    expect(eyebrowEl.exists()).toBe(true);
    expect(eyebrowEl.text()).toBe('01 / Kependudukan');
  });

  it('applies light theme classes when theme="light"', () => {
    const wrapper = mount(SectionTextArea, {
      props: {
        title: 'Judul Terang',
        description: 'Deskripsi tema terang',
        theme: 'light',
      },
    });

    const titleEl = wrapper.find('[data-test="section-title"]');
    const descEl = wrapper.find('[data-test="section-description"]');

    expect(titleEl.classes()).toContain('text-slate-900');
    expect(descEl.classes()).toContain('text-slate-600');
  });

  it('applies alignment classes for left, center, and right', () => {
    const leftWrapper = mount(SectionTextArea, {
      props: { title: 'Left', align: 'left' },
    });
    expect(leftWrapper.find('[data-test="section-text-area"]').classes()).toContain('items-start');

    const centerWrapper = mount(SectionTextArea, {
      props: { title: 'Center', align: 'center' },
    });
    expect(centerWrapper.find('[data-test="section-text-area"]').classes()).toContain(
      'items-center',
    );

    const rightWrapper = mount(SectionTextArea, {
      props: { title: 'Right', align: 'right' },
    });
    expect(rightWrapper.find('[data-test="section-text-area"]').classes()).toContain('items-end');
  });

  it('supports slots for title, description, and eyebrow', () => {
    const wrapper = mount(SectionTextArea, {
      slots: {
        eyebrow: '<span class="custom-eyebrow">Tag Khusus</span>',
        title: '<span class="custom-title">Judul Slot</span>',
        default: '<span class="custom-desc">Deskripsi Slot</span>',
      },
    });

    expect(wrapper.find('.custom-eyebrow').text()).toBe('Tag Khusus');
    expect(wrapper.find('.custom-title').text()).toBe('Judul Slot');
    expect(wrapper.find('.custom-desc').text()).toBe('Deskripsi Slot');
  });

  it('applies custom eyebrowClass when provided', () => {
    const wrapper = mount(SectionTextArea, {
      props: {
        eyebrow: 'Program Kelurahan Cantik mempersembahkan',
        eyebrowClass: 'text-sm font-medium text-slate-200 normal-case',
      },
    });

    const eyebrowEl = wrapper.find('[data-test="section-eyebrow"]');
    expect(eyebrowEl.classes()).toContain('text-sm');
    expect(eyebrowEl.classes()).toContain('normal-case');
    expect(eyebrowEl.classes()).toContain('text-slate-200');
  });
});
