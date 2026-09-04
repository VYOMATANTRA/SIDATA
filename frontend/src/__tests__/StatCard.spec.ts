import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatCard from '@/components/common/StatCard.vue';

describe('StatCard.vue', () => {
  it('renders default Kelurahan Manggar statistics when no props are passed', () => {
    const wrapper = mount(StatCard);

    expect(wrapper.find('[data-test="stat-card"]').exists()).toBe(true);

    const values = wrapper.findAll('[data-test="stat-value"]');
    const labels = wrapper.findAll('[data-test="stat-label"]');

    expect(values).toHaveLength(4);
    expect(labels).toHaveLength(4);

    expect(values[0]?.text()).toBe('53.098');
    expect(labels[0]?.text()).toBe('Penduduk');

    expect(values[1]?.text()).toBe('100');
    expect(labels[1]?.text()).toBe('Rukun Tetangga');

    expect(values[2]?.text()).toBe('2 jiwa/km²');
    expect(labels[2]?.text()).toBe('Kepadatan Penduduk');

    expect(values[3]?.text()).toBe('1,06 : 1');
    expect(labels[3]?.text()).toBe('Rasio Laki-laki & Perempuan');
  });

  it('renders custom items array dynamically', () => {
    const customStats = [
      { icon: 'person', value: '12.500', label: 'Warga Terdaftar' },
      { icon: 'house', value: '45', label: 'RT Aktif' },
    ];

    const wrapper = mount(StatCard, {
      props: {
        items: customStats,
      },
    });

    const values = wrapper.findAll('[data-test="stat-value"]');
    const labels = wrapper.findAll('[data-test="stat-label"]');

    expect(values).toHaveLength(2);
    expect(labels).toHaveLength(2);

    expect(values[0]?.text()).toBe('12.500');
    expect(labels[0]?.text()).toBe('Warga Terdaftar');

    expect(values[1]?.text()).toBe('45');
    expect(labels[1]?.text()).toBe('RT Aktif');
  });

  it('supports single-item shorthand props', () => {
    const wrapper = mount(StatCard, {
      props: {
        value: '7.890',
        label: 'Total Balita',
        icon: 'person',
      },
    });

    expect(wrapper.find('[data-test="stat-value"]').text()).toBe('7.890');
    expect(wrapper.find('[data-test="stat-label"]').text()).toBe('Total Balita');
  });

  it('implements semantic description list markup (dl, dt, dd) per accessibility guidelines', () => {
    const wrapper = mount(StatCard);

    // dl description list container
    const dl = wrapper.find('dl[data-test="stat-list"]');
    expect(dl.exists()).toBe(true);

    // dt description term
    const dt = wrapper.findAll('dt');
    expect(dt).toHaveLength(4);

    // dd description details
    const dd = wrapper.findAll('dd');
    expect(dd).toHaveLength(4);

    // Verify dt precedes dd in DOM order within each stat item for screen reader accessibility
    const statItems = wrapper.findAll('[data-test="stat-item"]');
    statItems.forEach((item) => {
      const itemHtml = item.html();
      expect(itemHtml.indexOf('<dt')).toBeLessThan(itemHtml.indexOf('<dd'));
    });

    // Hidden accessible heading
    const h2 = wrapper.find('h2.sr-only');
    expect(h2.exists()).toBe(true);
    expect(h2.text()).toContain('Statistik');
  });

  it('applies dark variant classes by default matching Figma slice', () => {
    const wrapper = mount(StatCard);
    expect(wrapper.find('[data-test="stat-card"]').classes()).toContain('bg-[#232528]');
  });

  it('applies glassmorphism variant classes when variant="glass"', () => {
    const wrapper = mount(StatCard, {
      props: {
        variant: 'glass',
      },
    });
    expect(wrapper.find('[data-test="stat-card"]').classes()).toContain('bg-surface-glass');
    expect(wrapper.find('[data-test="stat-card"]').classes()).toContain('backdrop-blur-md');
  });

  it('applies navy variant classes when variant="navy"', () => {
    const wrapper = mount(StatCard, {
      props: {
        variant: 'navy',
      },
    });
    expect(wrapper.find('[data-test="stat-card"]').classes()).toContain('bg-brand-navy');
  });

  it('applies light variant classes when variant="light"', () => {
    const wrapper = mount(StatCard, {
      props: {
        variant: 'light',
      },
    });
    expect(wrapper.find('[data-test="stat-card"]').classes()).toContain('bg-white');
  });

  it('renders custom icon slot', () => {
    const wrapper = mount(StatCard, {
      slots: {
        icon: '<span class="custom-icon">🌟</span>',
      },
    });

    expect(wrapper.find('.custom-icon').exists()).toBe(true);
  });
});
