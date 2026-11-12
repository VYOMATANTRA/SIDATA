import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import {
  ComparisonTemplateServiceError,
  DEFAULT_COMPARISON_TEMPLATES,
  DEFAULT_PREVIEW_SAMPLES,
  previewComparisonTemplate,
} from '../services/comparisonTemplates.service.js';
import { previewComparisonTemplateHandler } from '../controllers/comparisonTemplates.controller.js';
import { renderComparison } from '../utils/comparisonProse.js';
import { fakeRes } from './helpers/fakeRes.js';

type AnyRecord = Record<string, unknown>;

const BODY =
  'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.';
const NAIK = 'naik {delta} {unit} ({delta_percent}%)';
const TURUN = 'turun {delta} {unit} ({delta_percent}%)';
const TETAP = 'tidak berubah';

const draft = (overrides: AnyRecord = {}) => ({
  body: BODY,
  trendNaik: NAIK,
  trendTurun: TURUN,
  trendTetap: TETAP,
  ...overrides,
});

describe('previewComparisonTemplate', () => {
  it('renders naik, turun, tetap and a zero-previous example from the default samples', () => {
    const result = previewComparisonTemplate(draft());

    assert.equal(result.valid, true);
    assert.deepEqual(result.problems, []);
    assert.equal(result.previews.length, DEFAULT_PREVIEW_SAMPLES.length);
    assert.deepEqual(
      result.previews.map((preview) => preview.trend),
      ['naik', 'turun', 'tetap', 'naik'],
    );
    assert.equal(
      result.previews[0]!.text,
      'Berdasarkan data 2026, Jumlah Penduduk tercatat 12.480 jiwa, naik 120 jiwa (0,97%) dibandingkan 2025.',
    );
    assert.equal(
      result.previews[1]!.text,
      'Berdasarkan data 2026, Jumlah Penduduk tercatat 12.240 jiwa, turun 120 jiwa (0,97%) dibandingkan 2025.',
    );
    assert.equal(
      result.previews[2]!.text,
      'Berdasarkan data 2026, Jumlah Penduduk tercatat 12.360 jiwa, tidak berubah dibandingkan 2025.',
    );
  });

  it('is byte-identical to what the public renderer produces for the same values', () => {
    const template = draft();
    const result = previewComparisonTemplate(template);

    for (const [index, sample] of DEFAULT_PREVIEW_SAMPLES.entries()) {
      const publicOutput = renderComparison(
        {
          label: sample.label,
          unit: sample.unit,
          valueCurrent: sample.valueCurrent,
          valuePrevious: sample.valuePrevious,
          periodCurrent: sample.periodCurrent,
          periodPrevious: sample.periodPrevious,
          isComputedComparison: true,
        },
        template,
      );
      assert.equal(result.previews[index]!.text, publicOutput?.text ?? null);
    }
  });

  it('shows no percentage sentence when the previous value is zero', () => {
    const result = previewComparisonTemplate(draft());
    const zero = result.previews[3]!;

    assert.equal(zero.title, 'Contoh saat nilai sebelumnya nol');
    assert.equal(zero.text, null);
    assert.match(zero.note ?? '', /nilai sebelumnya nol/);
    // The note is for a non-technical reader: no slot syntax, no status words.
    assert.doesNotMatch(zero.note ?? '', /[{}]|delta_percent|HTTP|slug/i);
  });

  it('still renders the zero-previous example when the template never uses a percentage', () => {
    const result = previewComparisonTemplate(
      draft({ trendNaik: 'naik {delta} {unit}', trendTurun: 'turun {delta} {unit}' }),
    );
    const zero = result.previews[3]!;

    assert.equal(
      zero.text,
      'Berdasarkan data 2026, Jumlah Penduduk tercatat 120 jiwa, naik 120 jiwa dibandingkan 2025.',
    );
    assert.equal(zero.note, null);
  });

  it('previews the seeded default template', () => {
    const [seed] = DEFAULT_COMPARISON_TEMPLATES;
    const result = previewComparisonTemplate({
      body: seed!.body,
      trendNaik: seed!.trendNaik,
      trendTurun: seed!.trendTurun,
      trendTetap: seed!.trendTetap,
    });

    assert.equal(result.valid, true);
    assert.equal(result.previews.length, 4);
  });

  it('formats caller-supplied exact decimals id-ID style and keeps half-up rounding', () => {
    const result = previewComparisonTemplate(
      draft({
        samples: [
          {
            title: 'Satu',
            label: 'Kepadatan',
            unit: 'jiwa/km2',
            valueCurrent: '1234567.5',
            valuePrevious: '1234500.2',
          },
        ],
      }),
    );

    assert.equal(result.previews.length, 1);
    assert.equal(result.previews[0]!.title, 'Satu');
    assert.equal(
      result.previews[0]!.text,
      'Berdasarkan data 2026, Kepadatan tercatat 1.234.567,5 jiwa/km2, naik 67,3 jiwa/km2 (0,01%) dibandingkan 2025.',
    );
  });

  describe('plain-language problems for an unfinished or invalid draft', () => {
    const problemsOf = (overrides: AnyRecord) => previewComparisonTemplate(draft(overrides));

    it('reports empty fields without throwing', () => {
      const result = previewComparisonTemplate({
        body: '',
        trendNaik: '',
        trendTurun: '  ',
        trendTetap: TETAP,
      });

      assert.equal(result.valid, false);
      assert.deepEqual(result.previews, []);
      assert.deepEqual(
        result.problems.map((problem) => problem.field),
        ['body', 'trendNaik', 'trendTurun'],
      );
    });

    it('asks for the change part when the sentence has none', () => {
      const result = problemsOf({ body: 'Penduduk tercatat {value_current} jiwa.' });

      assert.equal(result.valid, false);
      assert.deepEqual(
        result.problems.map((problem) => problem.field),
        ['body'],
      );
      assert.match(result.problems[0]!.message, /Keterangan perubahan/);
    });

    it('refuses a second change part and one inside a variant', () => {
      const twice = problemsOf({ body: `${BODY} {trend}` });
      assert.match(twice.problems[0]!.message, /hanya boleh dipakai satu kali/);

      const inVariant = problemsOf({ trendNaik: 'naik {trend}' });
      assert.equal(inVariant.problems[0]!.field, 'trendNaik');
      assert.match(inVariant.problems[0]!.message, /teks saat nilai naik/);
    });

    it('describes unknown and unbalanced parts as "bagian tidak dikenali"', () => {
      const unknown = problemsOf({ body: `${BODY} {populasi}` });
      const stray = problemsOf({ trendTetap: 'tidak berubah }' });

      assert.match(unknown.problems[0]!.message, /bagian tidak dikenali/);
      assert.match(stray.problems[0]!.message, /bagian tidak dikenali/);
    });

    it('never leaks syntax, slot names, slugs or status codes in any message', () => {
      const messages = [
        problemsOf({ body: 'tanpa bagian perubahan' }),
        problemsOf({ body: `${BODY} {trend}` }),
        problemsOf({ trendNaik: 'naik {trend}' }),
        problemsOf({ body: `${BODY} {populasi}` }),
        problemsOf({ trendTetap: 'x }' }),
        previewComparisonTemplate({ body: '', trendNaik: '', trendTurun: '', trendTetap: '' }),
      ].flatMap((result) => result.problems.map((problem) => problem.message));

      assert.ok(messages.length > 0);
      for (const message of messages) {
        assert.doesNotMatch(message, /[{}]/, message);
        assert.doesNotMatch(message, /\{trend\}|slug|HTTP|\b4\d\d\b|TREND_/i, message);
      }
    });
  });

  describe('request validation', () => {
    const rejects = (input: unknown) =>
      assert.throws(
        () => previewComparisonTemplate(input),
        (error) => error instanceof ComparisonTemplateServiceError && error.statusCode === 400,
      );

    it('rejects a non-object payload', () => {
      rejects(null);
      rejects([]);
      rejects('body');
    });

    it('rejects unknown keys and wrong types', () => {
      rejects(draft({ slug: 'x' }));
      rejects(draft({ body: 12 }));
      rejects({ body: BODY });
    });

    it('rejects an oversized sentence and malformed sample numbers', () => {
      rejects(draft({ body: 'a'.repeat(2001) }));
      rejects(draft({ samples: [{ valueCurrent: 'dua belas', valuePrevious: '1' }] }));
      rejects(draft({ samples: [] }));
      rejects(
        draft({
          samples: Array.from({ length: 7 }, () => ({ valueCurrent: '1', valuePrevious: '1' })),
        }),
      );
    });
  });
});

describe('previewComparisonTemplateHandler', () => {
  const run = (body: unknown) => {
    const res = fakeRes();
    previewComparisonTemplateHandler({ body } as unknown as Request, res);
    return res;
  };

  it('answers 200 with the rendered previews', () => {
    const res = run(draft());

    assert.equal(res.status, 200);
    const body = res.body as { valid: boolean; previews: unknown[] };
    assert.equal(body.valid, true);
    assert.equal(body.previews.length, 4);
  });

  it('answers 200 with problems (not an error) for an unfinished draft', () => {
    const res = run(draft({ body: '' }));

    assert.equal(res.status, 200);
    assert.equal((res.body as { valid: boolean }).valid, false);
  });

  it('answers 400 with a plain error for a malformed request', () => {
    const res = run({ body: BODY });

    assert.equal(res.status, 400);
    assert.equal(typeof (res.body as { error: unknown }).error, 'string');
  });
});
