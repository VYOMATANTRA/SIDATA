import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BarDiagram from '@/components/common/BarDiagram.vue';

describe('BarDiagram.vue', () => {
  const sampleItems = [
    { label: 'Tamat SD', value: 3420 },
    { label: 'Tamat SLTA (SMA)', value: 2680 },
    { label: 'Tamat SMP', value: 1890 },
    { label: 'Tamat Perguruan Tinggi', value: 1120 },
  ];

  it('renders diagram title and card container', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Tingkat Pendidikan Penduduk',
        items: sampleItems,
      },
    });

    expect(wrapper.find('[data-test="diagram-title"]').text()).toBe('Tingkat Pendidikan Penduduk');
    expect(wrapper.find('[data-test="bar-diagram-card"]').exists()).toBe(true);
  });

  it('renders all bar items with labels and values', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Tingkat Pendidikan Penduduk',
        items: sampleItems,
      },
    });

    const labels = wrapper.findAll('[data-test="bar-label"]');
    const values = wrapper.findAll('[data-test="bar-value"]');

    expect(labels).toHaveLength(4);
    expect(labels[0]?.text()).toBe('Tamat SD');
    expect(labels[1]?.text()).toBe('Tamat SLTA (SMA)');
    expect(labels[2]?.text()).toBe('Tamat SMP');
    expect(labels[3]?.text()).toBe('Tamat Perguruan Tinggi');

    // Values formatted with Indonesian locale thousands separator
    expect(values[0]?.text()).toBe('3.420');
    expect(values[1]?.text()).toBe('2.680');
    expect(values[2]?.text()).toBe('1.890');
    expect(values[3]?.text()).toBe('1.120');
  });

  it('calculates bar percentage widths relative to the highest value', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Tingkat Pendidikan Penduduk',
        items: sampleItems,
      },
    });

    const fills = wrapper.findAll('[data-test="bar-fill"]');
    // Highest is 3420 -> 100%
    expect(fills[0]?.attributes('style')).toContain('width: 100%');
    // 2680 / 3420 = ~78.4%
    expect(fills[1]?.attributes('style')).toContain('width: 78.4%');
    // 1890 / 3420 = ~55.3%
    expect(fills[2]?.attributes('style')).toContain('width: 55.3%');
    // 1120 / 3420 = ~32.7%
    expect(fills[3]?.attributes('style')).toContain('width: 32.7%');
  });

  it('respects explicit max scale prop', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Cakupan Imunisasi',
        items: [
          { label: 'Polio', value: 80 },
          { label: 'Campak', value: 50 },
        ],
        max: 100,
        unit: '%',
      },
    });

    const fills = wrapper.findAll('[data-test="bar-fill"]');
    const values = wrapper.findAll('[data-test="bar-value"]');

    // With max=100, 80 value = 80% width
    expect(fills[0]?.attributes('style')).toContain('width: 80%');
    expect(fills[1]?.attributes('style')).toContain('width: 50%');

    expect(values[0]?.text()).toBe('80 %');
    expect(values[1]?.text()).toBe('50 %');
  });

  it('supports custom formattedValue overrides on individual items', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Test Override',
        items: [
          { label: 'Custom', value: 100, formattedValue: 'Khusus: 100 Orang' },
        ],
      },
    });

    expect(wrapper.find('[data-test="bar-value"]').text()).toBe('Khusus: 100 Orang');
  });

  it('can hide value labels when showValues is false', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Hidden Values',
        items: sampleItems,
        showValues: false,
      },
    });

    expect(wrapper.find('[data-test="bar-value"]').exists()).toBe(false);
  });

  it('can disable number formatting when formatNumbers is false', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Raw Numbers',
        items: [{ label: 'Raw', value: 5000 }],
        formatNumbers: false,
      },
    });

    expect(wrapper.find('[data-test="bar-value"]').text()).toBe('5000');
  });

  it('safely handles zero values without division by zero', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Zero Data',
        items: [
          { label: 'Nol 1', value: 0 },
          { label: 'Nol 2', value: 0 },
        ],
      },
    });

    const fills = wrapper.findAll('[data-test="bar-fill"]');
    expect(fills[0]?.attributes('style')).toContain('width: 0%');
    expect(fills[1]?.attributes('style')).toContain('width: 0%');
  });

  it('renders empty state when items is empty', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Diagram Kosong',
        items: [],
        emptyText: 'Tidak ada data.',
      },
    });

    expect(wrapper.find('[data-test="empty-state"]').text()).toBe('Tidak ada data.');
    expect(wrapper.find('[data-test="bars-container"]').exists()).toBe(false);
  });

  it('renders loading skeleton when loading is true', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'Sedang Memuat',
        items: sampleItems,
        loading: true,
      },
    });

    expect(wrapper.find('[data-test="loading-skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="bars-container"]').exists()).toBe(false);
  });

  it('conforms to accessibility standards with progressbar attributes', () => {
    const wrapper = mount(BarDiagram, {
      props: {
        title: 'A11y Test',
        items: [{ label: 'Tamat SD', value: 3420 }],
        unit: 'jiwa',
      },
    });

    const progressbar = wrapper.find('[role="progressbar"]');
    expect(progressbar.exists()).toBe(true);
    expect(progressbar.attributes('aria-valuenow')).toBe('3420');
    expect(progressbar.attributes('aria-valuemin')).toBe('0');
    expect(progressbar.attributes('aria-valuemax')).toBe('3420');
    expect(progressbar.attributes('aria-label')).toBe('Tamat SD: 3.420 jiwa');
  });
});
