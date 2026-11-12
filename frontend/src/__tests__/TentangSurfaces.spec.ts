import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangPotentialCard from '../components/tentang/TentangPotentialCard.vue';
import TentangPublicationCard from '../components/tentang/TentangPublicationCard.vue';
import TentangResourceCard from '../components/tentang/TentangResourceCard.vue';

describe('shared tentang surfaces', () => {
  it('renders the potential card as a white card with a navy icon', () => {
    const wrapper = mount(TentangPotentialCard, {
      props: { title: 'Judul', description: 'Deskripsi', icon: 'leaf' },
    });
    const card = wrapper.find('article');
    expect(card.classes()).toContain('bg-white');
    expect(card.classes()).toContain('border');
    expect(card.classes()).not.toContain('bg-surface-muted');
    const icon = wrapper.find('span[aria-hidden="true"]');
    expect(icon.classes()).toContain('text-brand-navy');
    expect(icon.classes()).not.toContain('text-white');
    expect(wrapper.find('h3').classes()).toContain('text-brand-navy');
  });

  it('renders the publication card on the same white treatment', () => {
    const wrapper = mount(TentangPublicationCard, {
      props: { title: 'Manggar Dalam Angka', description: 'Deskripsi' },
    });
    expect(wrapper.classes()).toContain('bg-white');
    expect(wrapper.find('span[aria-hidden="true"]').classes()).toContain('text-brand-navy');
    expect(wrapper.find('[data-test="publication-badge"]').text()).toBe('Segera Hadir');
  });

  it('renders the resource band card on solid navy with a white action', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
    });
    const wrapper = mount(TentangResourceCard, {
      props: { title: 'Peta', to: '/peta', ctaLabel: 'Buka peta' },
      global: { plugins: [router] },
    });
    const card = wrapper.find('article');
    expect(card.classes()).toContain('bg-brand-navy');
    expect(card.classes()).not.toContain('bg-brand-navy-deep');
    expect(wrapper.find('a').text()).toContain('Buka peta');
  });
});
