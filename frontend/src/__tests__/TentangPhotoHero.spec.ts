import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TentangPhotoHero from '../components/tentang/TentangPhotoHero.vue';

function mountHero() {
  return mount(TentangPhotoHero, {
    props: {
      eyebrow: 'Profil',
      title: 'Judul',
      subtitle: 'Subjudul',
      image: '/foto.webp',
    },
  });
}

describe('TentangPhotoHero', () => {
  it('has no blanket navy tint over the whole photo', () => {
    const wrapper = mountHero();
    wrapper.findAll('div[aria-hidden="true"]').forEach((overlay) => {
      expect(overlay.classes()).not.toContain('bg-brand-navy/75');
      expect(overlay.classes()).not.toContain('bg-brand-navy');
    });
  });

  it('puts a localized navy fade behind the text instead', () => {
    const fade = mountHero().find('[data-test="hero-text-fade"]');
    expect(fade.exists()).toBe(true);
    const classes = fade.classes().join(' ');
    expect(classes).toContain('from-brand-navy');
    expect(classes).toContain('to-transparent');
    expect(fade.attributes('aria-hidden')).toBe('true');
  });

  it('ends in a white wave rather than a coloured one', () => {
    const wave = mountHero().find('[data-test="hero-wave"]');
    expect(wave.exists()).toBe(true);
    const path = wave.find('path');
    expect(path.classes()).toContain('text-surface');
    expect(path.attributes('fill-opacity')).toBeUndefined();
  });

  it('crops the photo for narrow viewports with an explicit object-position', () => {
    const img = mountHero().find('img');
    expect(img.attributes('alt')).toBe('');
    expect(img.classes().some((c) => c.startsWith('object-['))).toBe(true);
    expect(img.classes()).toContain('object-cover');
  });

  it('keeps the eyebrow, single h1 and subtitle hierarchy', () => {
    const wrapper = mountHero();
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.find('h1').text()).toBe('Judul');
    expect(wrapper.text()).toContain('Profil');
    expect(wrapper.text()).toContain('Subjudul');
    expect(wrapper.find('section').attributes('aria-labelledby')).toBe(wrapper.find('h1').attributes('id'));
  });
});
