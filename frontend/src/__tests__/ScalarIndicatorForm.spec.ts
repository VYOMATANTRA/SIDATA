import { describe, it, expect } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ScalarIndicatorForm from '../components/data/ScalarIndicatorForm.vue';
import type { Indicator, IndicatorPatch } from '../stores/indicators.store';
import type { ComparisonTemplate } from '../stores/comparisonTemplates.store';

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
    // The flag is preserved, not derived from the checkbox: this indicator is already flagged
    // computed, so re-sending `true` would only add noise (and an audit diff) to every save.
    expect(payload).not.toHaveProperty('isComputedComparison');
    expect(payload).not.toHaveProperty('comparisonTemplateId');

    wrapper.unmount();
  });

  it('does not flip isComputedComparison when saving a pair that was never flagged computed', async () => {
    // Regression: SPEC §5 restricts tier-1 to specific indicators, so a pair alone must not
    // promote an indicator into the computed set on an unrelated edit.
    const wrapper = mount(ScalarIndicatorForm, {
      props: {
        indicator: makeIndicator({ isComputedComparison: false }),
      },
    });

    expect(wrapper.find('[data-test="computed-note"]').exists()).toBe(false);

    await wrapper.find('#indicator-source').setValue('Sensus Kelurahan');
    await wrapper.find('form').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as IndicatorPatch;
    expect(payload.source).toBe('Sensus Kelurahan');
    expect(payload.valuePrevious).toBe('52386');
    expect(payload.periodPrevious).toBe('2025');
    expect(payload).not.toHaveProperty('isComputedComparison');

    wrapper.unmount();
  });

  it('clears a computed flag that would otherwise be left without a pair', async () => {
    // A stored row may be flagged computed with no pair (computed, no template yet). Saving it
    // back unchanged is a 400 ("membutuhkan value_previous"), so the flag must be cleared.
    const wrapper = mount(ScalarIndicatorForm, {
      props: {
        indicator: makeIndicator({ valuePrevious: null, periodPrevious: null }),
      },
    });

    expect(wrapper.find('[data-test="computed-note"]').exists()).toBe(true);
    expect(wrapper.find('#indicator-value-previous').exists()).toBe(false);

    await wrapper.find('form').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as IndicatorPatch;
    expect(payload.isComputedComparison).toBe(false);
    expect(payload.valuePrevious).toBeNull();
    expect(payload.periodPrevious).toBeNull();

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

  it('keeps unsaved input when the store refreshes the same indicator', async () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: { indicator: makeIndicator() },
    });

    await wrapper.find('#indicator-value-current').setValue('54000');
    await wrapper.setProps({
      indicator: makeIndicator({ valueCurrent: '99999', label: 'Total Penduduk (baru)' }),
    });

    expect((wrapper.find('#indicator-value-current').element as HTMLInputElement).value).toBe(
      '54000',
    );
    expect((wrapper.find('#indicator-label').element as HTMLInputElement).value).toBe(
      'Total Penduduk',
    );

    wrapper.unmount();
  });

  it('resets the draft when a different indicator is opened', async () => {
    const wrapper = mount(ScalarIndicatorForm, {
      props: { indicator: makeIndicator() },
    });

    await wrapper.find('#indicator-value-current').setValue('54000');
    await wrapper.setProps({
      indicator: makeIndicator({ id: 'ind-2', label: 'Jumlah KK', valueCurrent: '12000' }),
    });

    expect((wrapper.find('#indicator-label').element as HTMLInputElement).value).toBe('Jumlah KK');
    expect((wrapper.find('#indicator-value-current').element as HTMLInputElement).value).toBe(
      '12000',
    );

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

  describe('comparison template selector (SPEC §5)', () => {
    const templates: ComparisonTemplate[] = [
      {
        id: 'tpl-1',
        slug: 'perbandingan-tahunan',
        label: 'Perbandingan tahunan',
        body: 'Data {period_current}, {label} {value_current}, {trend}.',
        trendNaik: 'naik',
        trendTurun: 'turun',
        trendTetap: 'tetap',
        usageCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'tpl-2',
        slug: 'ringkas',
        label: 'Ringkas',
        body: '{label}: {trend}.',
        trendNaik: 'naik',
        trendTurun: 'turun',
        trendTetap: 'tetap',
        usageCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const selector = '#indicator-comparison-template';

    it('is shown for a computed comparison with both previous value and previous period', () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator(), templates },
      });

      expect(wrapper.find(selector).exists()).toBe(true);
      expect(wrapper.find('label[for="indicator-comparison-template"]').text()).toBe(
        'Templat kalimat perbandingan',
      );
      const options = wrapper.findAll(`${selector} option`).map((o) => o.text());
      expect(options).toEqual(['Tanpa templat', 'Perbandingan tahunan', 'Ringkas']);
      wrapper.unmount();
    });

    it('is hidden when the indicator is not flagged as a computed comparison (a pair alone does not qualify)', () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator({ isComputedComparison: false }), templates },
      });

      expect(wrapper.find('#indicator-value-previous').exists()).toBe(true);
      expect(wrapper.find(selector).exists()).toBe(false);
      wrapper.unmount();
    });

    it('is hidden when there is no previous-year pair, and when the pair is switched off', async () => {
      const none = mount(ScalarIndicatorForm, {
        props: {
          indicator: makeIndicator({ valuePrevious: null, periodPrevious: null }),
          templates,
        },
      });
      expect(none.find(selector).exists()).toBe(false);
      none.unmount();

      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator(), templates },
      });
      await wrapper.find('#indicator-comparison-enabled').setValue(false);
      expect(wrapper.find(selector).exists()).toBe(false);
      wrapper.unmount();
    });

    it('is hidden while either half of the pair is blank, and returns once both are filled', async () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator(), templates },
      });

      await wrapper.find('#indicator-period-previous').setValue('');
      expect(wrapper.find(selector).exists()).toBe(false);
      await wrapper.find('#indicator-period-previous').setValue('2025');
      await wrapper.find('#indicator-value-previous').setValue('  ');
      expect(wrapper.find(selector).exists()).toBe(false);
      await wrapper.find('#indicator-value-previous').setValue('52386');
      expect(wrapper.find(selector).exists()).toBe(true);
      wrapper.unmount();
    });

    it('attaches the chosen template in the patch', async () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator(), templates },
      });

      await wrapper.find(selector).setValue('tpl-2');
      await wrapper.find('form').trigger('submit');

      const payload = wrapper.emitted('submit')?.[0]?.[0] as IndicatorPatch;
      expect(payload.comparisonTemplateId).toBe('tpl-2');
      expect(payload.valuePrevious).toBe('52386');
      wrapper.unmount();
    });

    it('detaches with "Tanpa templat" and leaves the patch alone when nothing changed', async () => {
      const attached = makeIndicator({ comparisonTemplateId: 'tpl-1' });
      const wrapper = mount(ScalarIndicatorForm, { props: { indicator: attached, templates } });
      expect((wrapper.find(selector).element as HTMLSelectElement).value).toBe('tpl-1');
      expect(wrapper.find('[data-test="template-description"]').text()).toContain(
        '[Keterangan perubahan]',
      );

      await wrapper.find('form').trigger('submit');
      expect(wrapper.emitted('submit')?.[0]?.[0]).not.toHaveProperty('comparisonTemplateId');

      await wrapper.find(selector).setValue('');
      await wrapper.find('form').trigger('submit');
      const second = wrapper.emitted('submit')?.[1]?.[0] as IndicatorPatch | undefined;
      expect(second?.comparisonTemplateId).toBeNull();
      wrapper.unmount();
    });

    it('still detaches in the same request when the pair is cleared, and never offers a template then', async () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator({ comparisonTemplateId: 'tpl-1' }), templates },
      });

      await wrapper.find('#indicator-comparison-enabled').setValue(false);
      expect(wrapper.find(selector).exists()).toBe(false);
      await wrapper.find('form').trigger('submit');

      const payload = wrapper.emitted('submit')?.[0]?.[0] as IndicatorPatch;
      expect(payload.comparisonTemplateId).toBeNull();
      expect(payload.isComputedComparison).toBe(false);
      wrapper.unmount();
    });

    it('never sends a template for an indicator that was not already a computed comparison', async () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator({ isComputedComparison: false }), templates },
      });

      await wrapper.find('#indicator-source').setValue('Sensus');
      await wrapper.find('form').trigger('submit');

      const payload = wrapper.emitted('submit')?.[0]?.[0] as IndicatorPatch;
      expect(payload).not.toHaveProperty('comparisonTemplateId');
      expect(payload).not.toHaveProperty('isComputedComparison');
      wrapper.unmount();
    });

    it('keeps the stored choice visible and untouched when the list could not be loaded', async () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: {
          indicator: makeIndicator({ comparisonTemplateId: 'tpl-9' }),
          templates: [],
          templatesError: 'Gagal memuat daftar templat kalimat. Coba lagi.',
        },
      });

      expect(wrapper.find('[data-test="template-error"]').text()).toContain('Gagal memuat');
      const select = wrapper.find(selector).element as HTMLSelectElement;
      expect(select.value).toBe('tpl-9');
      expect(wrapper.find(`${selector} option[value="tpl-9"]`).text()).toBe(
        'Templat yang terpasang saat ini',
      );

      await wrapper.find('form').trigger('submit');
      expect(wrapper.emitted('submit')?.[0]?.[0]).not.toHaveProperty('comparisonTemplateId');
      wrapper.unmount();
    });

    it('shows no slug, braces or slot names to the Editor', () => {
      const wrapper = mount(ScalarIndicatorForm, {
        props: { indicator: makeIndicator({ comparisonTemplateId: 'tpl-1' }), templates },
      });

      const text = wrapper.find('[data-test="template-selector"]').text();
      expect(text).not.toMatch(/[{}]|perbandingan-tahunan|value_current|period_current/);
      wrapper.unmount();
    });
  });
});
