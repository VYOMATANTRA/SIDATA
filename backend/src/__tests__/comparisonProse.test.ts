import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TEMPLATE_SLOTS,
  computeTrend,
  formatDecimalId,
  renderComparison,
  validateTemplateStructure,
  type ComparableIndicatorFields,
  type ComparisonTemplateText,
} from '../utils/comparisonProse.js';

// Mirrors DEFAULT_COMPARISON_TEMPLATES[0] in the service. Kept inline so this file only
// depends on the pure util it tests.
const DEFAULT_TEMPLATE: ComparisonTemplateText = {
  body: 'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.',
  trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
  trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
  trendTetap: 'tidak berubah',
};

const indicator = (
  overrides: Partial<ComparableIndicatorFields> = {},
): ComparableIndicatorFields => ({
  label: 'Jumlah Penduduk',
  unit: 'jiwa',
  valueCurrent: '12480',
  valuePrevious: '12360',
  periodCurrent: '2025',
  periodPrevious: '2024',
  isComputedComparison: true,
  ...overrides,
});

const template = (overrides: Partial<ComparisonTemplateText> = {}): ComparisonTemplateText => ({
  ...DEFAULT_TEMPLATE,
  ...overrides,
});

/** `field:code` strings, sorted, so assertions don't depend on emission order. */
const errorKeys = (t: ComparisonTemplateText): string[] =>
  validateTemplateStructure(t)
    .map((e) => `${e.field}:${e.code}`)
    .sort();

describe('utils/comparisonProse', () => {
  describe('TEMPLATE_SLOTS', () => {
    it('lists exactly the nine allowed slots', () => {
      assert.deepEqual(
        [...TEMPLATE_SLOTS],
        [
          'label',
          'unit',
          'value_current',
          'value_previous',
          'period_current',
          'period_previous',
          'delta',
          'delta_percent',
          'trend',
        ],
      );
    });
  });

  describe('computeTrend', () => {
    it('returns naik when current is greater than previous', () => {
      assert.equal(computeTrend('12480', '12360'), 'naik');
    });

    it('returns turun when current is less than previous', () => {
      assert.equal(computeTrend('12240', '12360'), 'turun');
    });

    it('returns tetap when the values are equal', () => {
      assert.equal(computeTrend('12360', '12360'), 'tetap');
    });

    it('treats the same number at different scales as equal', () => {
      assert.equal(computeTrend('12.5', '12.50'), 'tetap');
      assert.equal(computeTrend('100', '100.0000'), 'tetap');
      assert.equal(computeTrend('007', '7'), 'tetap');
    });

    it('detects a difference in the fourth decimal place', () => {
      assert.equal(computeTrend('1.0001', '1'), 'naik');
      assert.equal(computeTrend('1', '1.0001'), 'turun');
    });

    it('orders negative numbers correctly', () => {
      assert.equal(computeTrend('-5', '-10'), 'naik');
      assert.equal(computeTrend('-10', '-5'), 'turun');
      assert.equal(computeTrend('-5', '5'), 'turun');
    });

    it('handles zero on either side', () => {
      assert.equal(computeTrend('0', '0'), 'tetap');
      assert.equal(computeTrend('0', '5'), 'turun');
      assert.equal(computeTrend('5', '0'), 'naik');
      assert.equal(computeTrend('-0', '0'), 'tetap');
    });

    it('is exact for 14-digit integers where JS numbers would collapse', () => {
      // 12345678901234.0001 and 12345678901234 are the same IEEE-754 double.
      assert.equal(Number('12345678901234.0001'), Number('12345678901234'));
      assert.equal(computeTrend('12345678901234.0001', '12345678901234.0000'), 'naik');
      assert.equal(computeTrend('12345678901234.0000', '12345678901234.0001'), 'turun');
    });
  });

  describe('formatDecimalId', () => {
    it('groups thousands with a dot', () => {
      assert.equal(formatDecimalId('12480'), '12.480');
      assert.equal(formatDecimalId('999'), '999');
      assert.equal(formatDecimalId('1000'), '1.000');
      assert.equal(formatDecimalId('100'), '100');
      assert.equal(formatDecimalId('1000000'), '1.000.000');
      assert.equal(formatDecimalId('0'), '0');
    });

    it('uses a comma as the decimal separator and trims trailing zeros', () => {
      assert.equal(formatDecimalId('12480.5000'), '12.480,5');
      assert.equal(formatDecimalId('12480.0000'), '12.480');
      assert.equal(formatDecimalId('0.1234'), '0,1234');
      assert.equal(formatDecimalId('0.5'), '0,5');
      assert.equal(formatDecimalId('10.10'), '10,1');
    });

    it('keeps the sign of negative numbers', () => {
      assert.equal(formatDecimalId('-1234.5'), '-1.234,5');
      assert.equal(formatDecimalId('-0.5'), '-0,5');
    });

    it('never renders negative zero', () => {
      assert.equal(formatDecimalId('-0'), '0');
      assert.equal(formatDecimalId('-0.0000'), '0');
    });

    it('is exact at the Decimal(18,4) maximum, with no float rounding', () => {
      assert.equal(formatDecimalId('12345678901234.5678'), '12.345.678.901.234,5678');
      assert.equal(formatDecimalId('99999999999999.9999'), '99.999.999.999.999,9999');
    });

    it('drops leading zeros', () => {
      assert.equal(formatDecimalId('007'), '7');
      assert.equal(formatDecimalId('0012480.50'), '12.480,5');
    });

    it('throws on non-numeric input instead of rendering garbage', () => {
      assert.throws(() => formatDecimalId('abc'));
      assert.throws(() => formatDecimalId(''));
    });
  });

  describe('renderComparison', () => {
    it('renders the naik sentence', () => {
      const result = renderComparison(indicator(), DEFAULT_TEMPLATE);

      assert.deepEqual(result, {
        trend: 'naik',
        text: 'Berdasarkan data 2025, Jumlah Penduduk tercatat 12.480 jiwa, naik 120 jiwa (0,97%) dibandingkan 2024.',
      });
    });

    it('renders the turun sentence with an absolute delta', () => {
      const result = renderComparison(indicator({ valueCurrent: '12240' }), DEFAULT_TEMPLATE);

      assert.deepEqual(result, {
        trend: 'turun',
        text: 'Berdasarkan data 2025, Jumlah Penduduk tercatat 12.240 jiwa, turun 120 jiwa (0,97%) dibandingkan 2024.',
      });
    });

    it('renders the tetap sentence', () => {
      const result = renderComparison(indicator({ valueCurrent: '12360' }), DEFAULT_TEMPLATE);

      assert.deepEqual(result, {
        trend: 'tetap',
        text: 'Berdasarkan data 2025, Jumlah Penduduk tercatat 12.360 jiwa, tidak berubah dibandingkan 2024.',
      });
    });

    it('treats numerically equal values at different scales as tetap', () => {
      const result = renderComparison(
        indicator({ valueCurrent: '12360.0000', valuePrevious: '12360' }),
        DEFAULT_TEMPLATE,
      );

      assert.equal(result?.trend, 'tetap');
    });

    it('substitutes every slot in both the body and the chosen variant', () => {
      const all =
        '{label}|{unit}|{value_current}|{value_previous}|{period_current}|{period_previous}|{delta}|{delta_percent}';
      const result = renderComparison(
        indicator(),
        template({
          body: `${all}|{trend}`,
          trendNaik: `N:${all}`,
          trendTurun: `T:${all}`,
          trendTetap: `S:${all}`,
        }),
      );
      const line = 'Jumlah Penduduk|jiwa|12.480|12.360|2025|2024|120|0,97';

      assert.equal(result?.text, `${line}|N:${line}`);
    });

    it('only uses the variant that matches the computed trend', () => {
      const t = template({ trendNaik: 'NAIK', trendTurun: 'TURUN', trendTetap: 'TETAP' });

      assert.equal(renderComparison(indicator(), t)?.text.includes('NAIK'), true);
      assert.equal(renderComparison(indicator(), t)?.text.includes('TURUN'), false);
      assert.equal(
        renderComparison(indicator({ valueCurrent: '1' }), t)?.text.includes('TURUN'),
        true,
      );
      assert.equal(
        renderComparison(indicator({ valueCurrent: '12360' }), t)?.text.includes('TETAP'),
        true,
      );
    });

    it('formats decimal deltas and percentages', () => {
      const result = renderComparison(
        indicator({ valueCurrent: '1234.5', valuePrevious: '1000' }),
        DEFAULT_TEMPLATE,
      );

      assert.equal(
        result?.text,
        'Berdasarkan data 2025, Jumlah Penduduk tercatat 1.234,5 jiwa, naik 234,5 jiwa (23,45%) dibandingkan 2024.',
      );
    });

    it('rounds the percentage half-up to two decimals (half-even would give 0,50)', () => {
      // 1.01 / 200 * 100 = 0.505 exactly.
      const result = renderComparison(
        indicator({ valueCurrent: '201.01', valuePrevious: '200' }),
        DEFAULT_TEMPLATE,
      );

      assert.match(result!.text, /naik 1,01 jiwa \(0,51%\)/);
    });

    it('rounds recurring fractions to two decimals (33,33 down, 66,67 up)', () => {
      // 1/3 -> 33.333…%, 2/3 -> 66.666…%
      assert.match(
        renderComparison(indicator({ valueCurrent: '4', valuePrevious: '3' }), DEFAULT_TEMPLATE)!
          .text,
        /naik 1 jiwa \(33,33%\)/,
      );
      assert.match(
        renderComparison(indicator({ valueCurrent: '5', valuePrevious: '3' }), DEFAULT_TEMPLATE)!
          .text,
        /naik 2 jiwa \(66,67%\)/,
      );
    });

    it('trims trailing zeros of the percentage', () => {
      assert.match(
        renderComparison(
          indicator({ valueCurrent: '100.5', valuePrevious: '100' }),
          DEFAULT_TEMPLATE,
        )!.text,
        /\(0,5%\)/,
      );
      assert.match(
        renderComparison(
          indicator({ valueCurrent: '110', valuePrevious: '100' }),
          DEFAULT_TEMPLATE,
        )!.text,
        /naik 10 jiwa \(10%\)/,
      );
    });

    it('renders a percentage that rounds to zero as 0', () => {
      // delta 0.0001 on a base of 100 is 0.0001% -> "0".
      const result = renderComparison(
        indicator({ valueCurrent: '100.0001', valuePrevious: '100' }),
        DEFAULT_TEMPLATE,
      );

      assert.equal(result?.trend, 'naik');
      assert.match(result!.text, /naik 0,0001 jiwa \(0%\)/);
    });

    it('groups thousands in large percentages and handles percentages over 100', () => {
      assert.match(
        renderComparison(
          indicator({ valueCurrent: '300', valuePrevious: '100' }),
          DEFAULT_TEMPLATE,
        )!.text,
        /\(200%\)/,
      );
      assert.match(
        renderComparison(
          indicator({ valueCurrent: '12000', valuePrevious: '10' }),
          DEFAULT_TEMPLATE,
        )!.text,
        /naik 11\.990 jiwa \(119\.900%\)/,
      );
    });

    it('uses the magnitude of a negative previous value for the percentage', () => {
      const result = renderComparison(
        indicator({ valueCurrent: '-5', valuePrevious: '-10' }),
        DEFAULT_TEMPLATE,
      );

      assert.equal(result?.trend, 'naik');
      assert.match(result!.text, /naik 5 jiwa \(50%\)/);
      assert.match(result!.text, /tercatat -5 jiwa/);
    });

    it('returns null when previous is 0 and the chosen variant uses {delta_percent}', () => {
      const result = renderComparison(
        indicator({ valueCurrent: '5', valuePrevious: '0' }),
        DEFAULT_TEMPLATE,
      );

      assert.equal(result, null);
    });

    it('returns null when previous is 0 and the body uses {delta_percent}, whatever the trend', () => {
      const t = template({ body: '{label} ({delta_percent}%) {trend}.' });

      assert.equal(renderComparison(indicator({ valueCurrent: '0', valuePrevious: '0' }), t), null);
    });

    it('still renders with previous 0 when {delta_percent} is not in the substituted text', () => {
      const t = template({ trendNaik: 'naik {delta} {unit}' });
      const result = renderComparison(indicator({ valueCurrent: '5', valuePrevious: '0' }), t);

      assert.equal(
        result?.text,
        'Berdasarkan data 2025, Jumlah Penduduk tercatat 5 jiwa, naik 5 jiwa dibandingkan 2024.',
      );
    });

    it('renders tetap for 0 vs 0 even though the naik variant uses {delta_percent}', () => {
      const result = renderComparison(
        indicator({ valueCurrent: '0', valuePrevious: '0' }),
        DEFAULT_TEMPLATE,
      );

      assert.deepEqual(result, {
        trend: 'tetap',
        text: 'Berdasarkan data 2025, Jumlah Penduduk tercatat 0 jiwa, tidak berubah dibandingkan 2024.',
      });
    });

    describe('refuses unpaired indicators (acceptance criterion)', () => {
      it('returns null when valuePrevious is null', () => {
        assert.equal(renderComparison(indicator({ valuePrevious: null }), DEFAULT_TEMPLATE), null);
      });

      it('returns null when periodPrevious is null', () => {
        assert.equal(renderComparison(indicator({ periodPrevious: null }), DEFAULT_TEMPLATE), null);
      });

      it('returns null when both previous fields are null', () => {
        assert.equal(
          renderComparison(
            indicator({ valuePrevious: null, periodPrevious: null }),
            DEFAULT_TEMPLATE,
          ),
          null,
        );
      });

      it('returns null when isComputedComparison is false, even with a full pair', () => {
        assert.equal(
          renderComparison(indicator({ isComputedComparison: false }), DEFAULT_TEMPLATE),
          null,
        );
      });
    });

    it('returns null for a structurally invalid template', () => {
      assert.equal(renderComparison(indicator(), template({ body: 'tanpa slot tren' })), null);
      assert.equal(renderComparison(indicator(), template({ body: '{trend} {trend}' })), null);
      assert.equal(renderComparison(indicator(), template({ trendNaik: 'naik {trend}' })), null);
      assert.equal(renderComparison(indicator(), template({ trendTetap: '{bogus}' })), null);
    });

    it('leaves no double space or space before a comma when unit is null', () => {
      const result = renderComparison(indicator({ unit: null }), DEFAULT_TEMPLATE);

      assert.equal(
        result?.text,
        'Berdasarkan data 2025, Jumlah Penduduk tercatat 12.480, naik 120 (0,97%) dibandingkan 2024.',
      );
    });

    it('collapses whitespace runs and removes spaces before punctuation', () => {
      const result = renderComparison(
        indicator(),
        template({
          body: '  Berdasarkan   data {period_current},\n{label}\ttercatat {value_current} {unit} ,  {trend} dibandingkan {period_previous} .  ',
        }),
      );

      assert.equal(
        result?.text,
        'Berdasarkan data 2025, Jumlah Penduduk tercatat 12.480 jiwa, naik 120 jiwa (0,97%) dibandingkan 2024.',
      );
    });

    it('removes a space before ; : ! ? and )', () => {
      const t = template({
        body: '{label} ; {trend} : x ! y ? (z ) .',
        trendNaik: 'naik',
        trendTurun: 'turun',
        trendTetap: 'tetap',
      });

      assert.equal(renderComparison(indicator(), t)?.text, 'Jumlah Penduduk; naik: x! y? (z).');
    });

    it('inserts values literally and does not re-expand braces they contain', () => {
      const result = renderComparison(
        indicator({ label: 'Total {trend} {delta}' }),
        DEFAULT_TEMPLATE,
      );

      assert.equal(
        result?.text,
        'Berdasarkan data 2025, Total {trend} {delta} tercatat 12.480 jiwa, naik 120 jiwa (0,97%) dibandingkan 2024.',
      );
    });

    it('treats $-sequences in values and variants literally', () => {
      const result = renderComparison(
        indicator({ label: 'Biaya $& $1 $$ $`', valueCurrent: '12360' }),
        template({ trendTetap: "tetap $& $' saja" }),
      );

      assert.equal(
        result?.text,
        "Berdasarkan data 2025, Biaya $& $1 $$ $` tercatat 12.360 jiwa, tetap $& $' saja dibandingkan 2024.",
      );
    });

    it('does not mutate its inputs and is deterministic', () => {
      const fields = Object.freeze(indicator());
      const tpl = Object.freeze(template());

      const first = renderComparison(fields, tpl);
      const second = renderComparison(fields, tpl);

      assert.deepEqual(first, second);
      assert.notEqual(first, null);
      assert.deepEqual(fields, indicator());
      assert.deepEqual(tpl, DEFAULT_TEMPLATE);
    });
  });

  describe('validateTemplateStructure', () => {
    it('accepts the default template', () => {
      assert.deepEqual(validateTemplateStructure(DEFAULT_TEMPLATE), []);
    });

    it('accepts every allowed slot in the body and every slot except trend in the variants', () => {
      const all =
        '{label} {unit} {value_current} {value_previous} {period_current} {period_previous} {delta} {delta_percent}';

      assert.deepEqual(
        validateTemplateStructure({
          body: `${all} {trend}`,
          trendNaik: all,
          trendTurun: all,
          trendTetap: all,
        }),
        [],
      );
    });

    it('accepts variants with no placeholders at all', () => {
      assert.deepEqual(
        validateTemplateStructure(
          template({ trendNaik: 'naik', trendTurun: 'turun', trendTetap: 'tetap' }),
        ),
        [],
      );
    });

    it('rejects a body without {trend}', () => {
      assert.deepEqual(errorKeys(template({ body: 'Tidak ada slot.' })), [
        'body:TREND_SLOT_MISSING',
      ]);
    });

    it('rejects a body with more than one {trend}', () => {
      assert.deepEqual(errorKeys(template({ body: '{trend} lalu {trend}' })), [
        'body:TREND_SLOT_DUPLICATE',
      ]);
    });

    for (const field of ['trendNaik', 'trendTurun', 'trendTetap'] as const) {
      it(`rejects {trend} inside ${field}`, () => {
        const t: ComparisonTemplateText = { ...DEFAULT_TEMPLATE, [field]: 'x {trend} y' };

        assert.deepEqual(errorKeys(t), [`${field}:TREND_SLOT_IN_VARIANT`]);
      });
    }

    it('rejects an unknown placeholder and names it in detail', () => {
      const errors = validateTemplateStructure(template({ body: '{trend} {populasi}' }));

      assert.equal(errors.length, 1);
      assert.deepEqual(errors[0], {
        field: 'body',
        code: 'UNKNOWN_PLACEHOLDER',
        detail: 'populasi',
      });
    });

    it('rejects unknown placeholders in variants too', () => {
      const errors = validateTemplateStructure(template({ trendTurun: 'turun {persen}' }));

      assert.deepEqual(errors, [
        { field: 'trendTurun', code: 'UNKNOWN_PLACEHOLDER', detail: 'persen' },
      ]);
    });

    it('is case- and whitespace-sensitive about placeholder names', () => {
      for (const bad of ['{Trend}', '{VALUE_CURRENT}', '{ trend }', '{trend }', '{Label}']) {
        const errors = validateTemplateStructure(template({ body: `{trend} ${bad}` }));

        assert.equal(errors.length, 1, bad);
        assert.equal(errors[0]!.code, 'UNKNOWN_PLACEHOLDER', bad);
        assert.equal(errors[0]!.detail, bad.slice(1, -1), bad);
      }
    });

    it('rejects a stray opening brace', () => {
      assert.ok(
        validateTemplateStructure(template({ body: 'Halo { {trend}' })).some(
          (e) => e.field === 'body' && e.code === 'STRAY_BRACE',
        ),
      );
    });

    it('rejects a stray closing brace', () => {
      assert.ok(
        validateTemplateStructure(template({ body: 'Halo } {trend}' })).some(
          (e) => e.field === 'body' && e.code === 'STRAY_BRACE',
        ),
      );
    });

    it('rejects empty braces', () => {
      assert.ok(
        validateTemplateStructure(template({ body: '{} {trend}' })).some(
          (e) => e.field === 'body' && e.code === 'STRAY_BRACE',
        ),
      );
    });

    it('rejects doubled braces around a slot', () => {
      assert.ok(
        validateTemplateStructure(template({ body: '{{trend}}' })).some(
          (e) => e.field === 'body' && e.code === 'STRAY_BRACE',
        ),
      );
    });

    it('rejects stray braces in variants', () => {
      assert.ok(
        validateTemplateStructure(template({ trendNaik: 'naik }' })).some(
          (e) => e.field === 'trendNaik' && e.code === 'STRAY_BRACE',
        ),
      );
    });

    it('reports every error across all fields together', () => {
      const keys = errorKeys({
        body: 'tanpa slot {foo}',
        trendNaik: 'naik {trend}',
        trendTurun: 'turun {',
        trendTetap: 'tetap {bar}',
      });

      assert.deepEqual(keys, [
        'body:TREND_SLOT_MISSING',
        'body:UNKNOWN_PLACEHOLDER',
        'trendNaik:TREND_SLOT_IN_VARIANT',
        'trendTetap:UNKNOWN_PLACEHOLDER',
        'trendTurun:STRAY_BRACE',
      ]);
    });

    it('does not mutate its input', () => {
      const t = Object.freeze({ ...DEFAULT_TEMPLATE });

      validateTemplateStructure(t);

      assert.deepEqual(t, DEFAULT_TEMPLATE);
    });
  });
});
