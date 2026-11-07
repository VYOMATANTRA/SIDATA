import { describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import { mount } from '@vue/test-utils';
import TemplateSentenceBuilder from '../components/templates/TemplateSentenceBuilder.vue';
import {
  chipSegment,
  parseBody,
  serializeSegments,
  textSegment,
  type TemplateSegment,
} from '../utils/comparisonTemplateSegments';

/** Hosts the builder with real v-model state, so clicks feed back into the segment list. */
function mountBuilder(
  mode: 'body' | 'variant',
  initial: TemplateSegment[] = [],
  props: Record<string, unknown> = {},
) {
  const state = ref<TemplateSegment[]>(initial);
  const Host = defineComponent({
    components: { TemplateSentenceBuilder },
    setup: () => ({ state, mode, props }),
    template: `<TemplateSentenceBuilder v-model="state" :mode="mode" label="Susunan kalimat" id-prefix="t" v-bind="props" />`,
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, state };
}

describe('TemplateSentenceBuilder', () => {
  it('adds a text part and every chip as ordered parts, serialized to exact slots', async () => {
    const { wrapper, state } = mountBuilder('body');

    await wrapper.find('[data-action="add-text"]').trigger('click');
    await wrapper.find('textarea').setValue('Data ');
    await wrapper.find('[data-chip="period_current"]').trigger('click');
    await wrapper.find('[data-chip="trend"]').trigger('click');

    expect(serializeSegments(state.value)).toBe('Data {period_current}{trend}');
    wrapper.unmount();
  });

  it('prevents a second "Keterangan perubahan" and explains why in everyday words', async () => {
    const { wrapper, state } = mountBuilder('body', [chipSegment('trend')]);

    const trendButton = wrapper.find('[data-chip="trend"]');
    expect(trendButton.attributes('disabled')).toBeDefined();
    expect(trendButton.attributes('aria-describedby')).toBe(
      wrapper.find('[data-test="trend-note"]').attributes('id'),
    );
    expect(wrapper.find('[data-test="trend-note"]').text()).toContain('hanya boleh satu');

    await trendButton.trigger('click');
    expect(state.value.filter((s) => s.kind === 'chip')).toHaveLength(1);
    wrapper.unmount();
  });

  it('offers the trend chip again once the existing one is removed', async () => {
    const { wrapper } = mountBuilder('body', [chipSegment('trend')]);

    await wrapper.find('[data-action="remove"]').trigger('click');

    expect(wrapper.find('[data-chip="trend"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('does not offer the trend chip in a variant but offers every other chip', () => {
    const { wrapper } = mountBuilder('variant');

    expect(wrapper.find('[data-chip="trend"]').exists()).toBe(false);
    for (const slot of [
      'label',
      'unit',
      'value_current',
      'value_previous',
      'period_current',
      'period_previous',
      'delta',
      'delta_percent',
    ]) {
      expect(wrapper.find(`[data-chip="${slot}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('never renders a brace or slot name, even for a legacy body', () => {
    const { wrapper } = mountBuilder(
      'body',
      parseBody('Data {period_current} {populasi} { {trend} {}'),
    );

    // What a person can read or hear: visible text plus every accessible name. (`data-chip`
    // test hooks carry slot names but are invisible and never announced.)
    const labels = wrapper.findAll('[aria-label]').map((el) => el.attributes('aria-label'));
    const audible = `${wrapper.text()} ${labels.join(' ')}`;
    expect(audible).not.toMatch(/[{}]/);
    expect(audible).not.toMatch(/period_current|value_current|delta_percent|\btrend\b/);
    expect(wrapper.findAll('[data-test="unknown-chip"]').length).toBeGreaterThanOrEqual(3);
    wrapper.unmount();
  });

  it('lets the Admin remove an unrecognised part', async () => {
    const { wrapper, state } = mountBuilder('body', parseBody('a {populasi} b {trend}'));
    const unknown = wrapper.find('[data-kind="unknown"]');

    await unknown.find('[data-action="remove"]').trigger('click');

    expect(wrapper.find('[data-kind="unknown"]').exists()).toBe(false);
    expect(serializeSegments(state.value)).toBe('a  b {trend}');
    wrapper.unmount();
  });

  it('drops braces typed into a text part', async () => {
    const { wrapper, state } = mountBuilder('body', [textSegment('')]);

    await wrapper.find('textarea').setValue('naik {trend} sekali');

    expect(serializeSegments(state.value)).toBe('naik trend sekali');
    wrapper.unmount();
  });

  it('reorders with buttons (no drag needed) and keeps the first up / last down disabled', async () => {
    const { wrapper, state } = mountBuilder('body', [
      textSegment('A'),
      chipSegment('label'),
      chipSegment('trend'),
    ]);

    const rows = () => wrapper.findAll('li[data-segment-id]');
    expect(rows()[0]!.find('[data-action="up"]').attributes('disabled')).toBeDefined();
    expect(rows()[2]!.find('[data-action="down"]').attributes('disabled')).toBeDefined();

    await rows()[2]!.find('[data-action="up"]').trigger('click');
    expect(serializeSegments(state.value)).toBe('A{trend}{label}');

    await rows()[0]!.find('[data-action="down"]').trigger('click');
    expect(serializeSegments(state.value)).toBe('{trend}A{label}');
    wrapper.unmount();
  });

  it('uses real buttons with accessible names that include the part and its position', () => {
    const { wrapper } = mountBuilder('body', [textSegment('A'), chipSegment('delta')]);

    const names = wrapper.findAll('button').map((b) => b.attributes('aria-label') ?? b.text());
    expect(names).toContain('Pindahkan Selisih, bagian 2 ke atas');
    expect(names).toContain('Hapus teks, bagian 1');
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('type')).toBe('button');
      expect(button.classes()).toEqual(expect.arrayContaining(['min-h-11']));
    }
    wrapper.unmount();
  });

  it('shows the correction beside the field in a polite live region', () => {
    const { wrapper } = mountBuilder('body', [], { error: 'Susunan kalimat wajib diisi.' });

    const error = wrapper.find('[data-test="builder-error"]');
    expect(error.attributes('aria-live')).toBe('polite');
    expect(error.text()).toBe('Susunan kalimat wajib diisi.');
    expect(wrapper.find('fieldset').attributes('aria-describedby')).toContain(
      error.attributes('id'),
    );
    wrapper.unmount();
  });
});
