import { describe, it, expect } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ScalarIndicatorForm from '../components/data/ScalarIndicatorForm.vue';
import type { Indicator, IndicatorPatch } from '../stores/indicators.store';

function makeIndicator(overrides: Partial<Indicator> = {}): Indicator {
  return {
    id: 'ind-1',
    sectionId: 'sec-1',
    slug: 'total-penduduk',
    label: 'Total Penduduk',
    unit: null,
    valueCurrent: '53098',
    valuePrevious: '52386',
    periodCurrent: '2026',
    periodPrevious: '2025',
    isComputedComparison: true,
    isStale: false,
    source: 'Prodeskel',
    hedgeNote: null,
    sortOrder: 0,
    comparisonTemplateId: null,
    comparison: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function expectEveryControlLabelled(wrapper: VueWrapper): void {
  const controls = wrapper.findAll('input, textarea, select');
  expect(controls.length).toBeGreaterThan(0);

  for (const control of controls) {
    const id = control.attributes('id');
    expect(id, `control without id: ${control.html()}`).toBeTruthy();
    expect(wrapper.find(`label[for="${id}"]`).exists(), `missing <label for="${id}">`).toBe(true);
  }
}

describe('ScalarIndicatorForm.vue', () => {
  it('pairs every control with a real label', () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: { indicator: makeIndicator() },
    });

    expectEveryControlLabelled(wrapper);
    expect(wrapper.findAll('input, textarea, select').length).toBeGreaterThan(5);
    wrapper.unmount();
  });

  it('shows the source, hedge-note and stale fields required by the issue scope', () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: { indicator: makeIndicator({ hedgeNote: 'Data Potensi Juni 2024.' }) },
    });

    expect((wrapper.find('#indicator-source').element as HTMLInputElement).value).toBe('Prodeskel');
    expect((wrapper.find('#indicator-hedge-note').element as HTMLTextAreaElement).value).toBe(
      'Data Potensi Juni 2024.',
    );
    expect(wrapper.find('#indicator-is-stale').exists()).toBe(true);
    expect(wrapper.find('label[for="indicator-is-stale"]').text()).toContain('data berumur');

    wrapper.unmount();
  });

  it('reveals the previous-year pair only when the comparison checkbox is checked', async () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: { indicator: makeIndicator() },
    });

    expect(wrapper.find('#indicator-value-previous').exists()).toBe(true);

    await wrapper.find('#indicator-comparison-enabled').setValue(false);
    expect(wrapper.find('#indicator-value-previous').exists()).toBe(false);
    expect(wrapper.find('#indicator-period-previous').exists()).toBe(false);

    await wrapper.find('#indicator-comparison-enabled').setValue(true);
    expect(wrapper.find('#indicator-value-previous').exists()).toBe(true);

    wrapper.unmount();
  });

  it('announces validation errors in text and ties them to the offending field', async () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: { indicator: makeIndicator() },
    });

    await wrapper.find('#indicator-value-current').setValue('');
    await wrapper.find('form').trigger('submit');

    const summary = wrapper.find('[role="alert"]');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain('Nilai sekarang wajib diisi.');

    const input = wrapper.find('#indicator-value-current');
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toContain('indicator-value-current-error');
    expect(wrapper.find('#indicator-value-current-error').text()).toContain(
      'Nilai sekarang wajib diisi.',
    );

    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });

  it('submits the editable fields with the pair flag enabled', async () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: { indicator: makeIndicator() },
    });

    await wrapper.find('#indicator-value-current').setValue('54000');
    await wrapper.find('#indicator-is-stale').setValue(true);
    await wrapper.find('form').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as IndicatorPatch;
    expect(payload).toBeDefined();
    expect(payload.valueCurrent).toBe('54000');
    expect(payload.isStale).toBe(true);
    expect(payload.valuePrevious).toBe('52386');
    expect(payload.periodPrevious).toBe('2025');
    expect(payload.isComputedComparison).toBe(true);
    expect(payload).not.toHaveProperty('comparisonTemplateId');

    wrapper.unmount();
  });

  it('clears the pair and detaches an attached template in one patch', async () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: {
        indicator: makeIndicator({ comparisonTemplateId: 'tpl-1' }),
      },
    });

    expect(wrapper.find('[data-test="template-detach-warning"]').exists()).toBe(true);

    await wrapper.find('#indicator-comparison-enabled').setValue(false);
    await wrapper.find('form').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as IndicatorPatch;
    expect(payload.valuePrevious).toBeNull();
    expect(payload.periodPrevious).toBeNull();
    expect(payload.isComputedComparison).toBe(false);
    expect(payload.comparisonTemplateId).toBeNull();

    wrapper.unmount();
  });

  it('surfaces a server error through the alert region', () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: {
        indicator: makeIndicator(),
        serverError: 'Slug sudah digunakan indikator lain.',
      },
    });

    expect(wrapper.find('[data-test="form-error"]').text()).toBe(
      'Slug sudah digunakan indikator lain.',
    );

    wrapper.unmount();
  });
});
