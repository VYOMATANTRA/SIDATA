import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatOverview from '@/components/common/StatOverview.vue';
import type { StatItem } from '@/components/common/StatCard.vue';

describe('StatOverview.vue', () => {
  it('renders section title, description, default StatCard, and action button matching Figma spec', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Statistics Type',
        description:
          'Here, you’ll explain what will user found when looking for this statistics type.',
      },
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    // Check title & description from SectionTextArea
    const titleEl = wrapper.find('[data-test="section-title"]');
    const descEl = wrapper.find('[data-test="section-description"]');
    expect(titleEl.exists()).toBe(true);
    expect(titleEl.text()).toBe('Statistics Type');
    expect(descEl.exists()).toBe(true);
    expect(descEl.text()).toBe(
      'Here, you’ll explain what will user found when looking for this statistics type.',
    );

    // Check default StatCard items (4 metrics)
    const statItems = wrapper.findAll('[data-test="stat-item"]');
    expect(statItems).toHaveLength(4);
    expect(statItems[0]!.text()).toContain('53.098');
    expect(statItems[0]!.text()).toContain('Penduduk');
    expect(statItems[1]!.text()).toContain('100');
    expect(statItems[1]!.text()).toContain('Rukun Tetangga');

    // Check action button
    const button = wrapper.find('[data-test="stat-overview-button"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('Lihat selengkapnya');
  });

  it('renders custom stats items when provided', () => {
    const customStats: StatItem[] = [
      { icon: 'person', value: '12.450', label: 'Warga' },
      { icon: 'house', value: '35', label: 'RT' },
    ];

    const wrapper = mount(StatOverview, {
      props: {
        title: 'Custom Title',
        stats: customStats,
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    const statItems = wrapper.findAll('[data-test="stat-item"]');
    expect(statItems).toHaveLength(2);
    expect(statItems[0]!.text()).toContain('12.450');
    expect(statItems[1]!.text()).toContain('35');
  });

  it('emits click event when the button is clicked', async () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Test Section',
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    const button = wrapper.find('[data-test="stat-overview-button"]');
    await button.trigger('click');

    expect(wrapper.emitted('click')).toBeTruthy();
    expect(wrapper.emitted('click')!.length).toBe(1);
  });

  it('hides the action button when showButton is false', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'No Button Section',
        showButton: false,
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    expect(wrapper.find('[data-test="stat-overview-button"]').exists()).toBe(false);
  });

  it('renders custom buttonLabel when specified', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Overview',
        buttonLabel: 'Pelajari Lebih Lanjut',
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    const button = wrapper.find('[data-test="stat-overview-button"]');
    expect(button.text()).toContain('Pelajari Lebih Lanjut');
  });

  it('renders with router-link destination when "to" is provided', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'With Route',
        to: '/kependudukan',
      },
      global: {
        stubs: {
          RouterLink: {
            template:
              '<div data-test="stubbed-router-link"><slot :href="\'/kependudukan\'" :navigate="() => {}" /></div>',
          },
        },
      },
    });

    const button = wrapper.find('[data-test="stat-overview-button"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes('href')).toBe('/kependudukan');
  });

  it('applies center alignment when align="center"', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Centered Overview',
        align: 'center',
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    const section = wrapper.find('[data-test="stat-overview"]');
    expect(section.classes()).toContain('items-center');
    expect(section.classes()).toContain('text-center');
  });

  it('supports customization via slots', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Slot Overview',
      },
      slots: {
        eyebrow: '<span class="test-eyebrow">Kategori Khusus</span>',
        title: '<h2 class="test-title">Judul Slot</h2>',
        description: '<p class="test-desc">Deskripsi Slot</p>',
        'button-icon': '<span class="test-custom-icon">✨</span>',
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    expect(wrapper.find('.test-eyebrow').text()).toBe('Kategori Khusus');
    expect(wrapper.find('.test-title').text()).toBe('Judul Slot');
    expect(wrapper.find('.test-desc').text()).toBe('Deskripsi Slot');
    expect(wrapper.find('.test-custom-icon').text()).toBe('✨');
  });

  it('renders empty state when stats is an intentionally empty array', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Empty Stats Overview',
        stats: [],
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    expect(wrapper.find('[data-test="stat-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="stat-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="stat-empty"]').text()).toContain(
      'Tidak ada data statistik yang ditampilkan.',
    );
  });

  it('supports custom card-empty slot when stats is empty', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Empty With Custom Slot',
        stats: [],
      },
      slots: {
        'card-empty': '<div class="custom-card-empty">Memuat data demografi...</div>',
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    expect(wrapper.find('.custom-card-empty').exists()).toBe(true);
    expect(wrapper.find('.custom-card-empty').text()).toBe('Memuat data demografi...');
  });

  it('forwards title to nested StatCard landmark and screen-reader heading', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Struktur Rukun Tetangga',
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    const statCard = wrapper.find('[data-test="stat-card"]');
    expect(statCard.attributes('aria-label')).toBe('Struktur Rukun Tetangga');
    expect(statCard.find('h2.sr-only').text()).toBe('Struktur Rukun Tetangga');
  });

  it('supports cardTitle override for nested StatCard when specified', () => {
    const wrapper = mount(StatOverview, {
      props: {
        title: 'Section Heading',
        cardTitle: 'Custom Card Landmark',
      },
      global: {
        stubs: { RouterLink: true },
      },
    });

    const statCard = wrapper.find('[data-test="stat-card"]');
    expect(statCard.attributes('aria-label')).toBe('Custom Card Landmark');
    expect(statCard.find('h2.sr-only').text()).toBe('Custom Card Landmark');
  });
});
