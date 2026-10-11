// Shared fixtures for the tier-1 prose builder tests (indicators.service / indicators.controller).
//
// With the indicatorRow() defaults used by those files (125000 now vs 120000 before, unit
// "jiwa", periods 2025/2024) TEMPLATE_ROW renders NAIK_TEXT. Dropping the current value to
// 115000 renders TURUN_TEXT.

type AnyRecord = Record<string, unknown>;

export const TEMPLATE_ROW = {
  id: 'tpl-1',
  slug: 'perbandingan-tahunan',
  label: 'Perbandingan tahunan',
  body: 'Berdasarkan data {period_current}, {label} tercatat {value_current} {unit}, {trend} dibandingkan {period_previous}.',
  trendNaik: 'naik {delta} {unit} ({delta_percent}%)',
  trendTurun: 'turun {delta} {unit} ({delta_percent}%)',
  trendTetap: 'tidak berubah',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

export const NAIK_TEXT =
  'Berdasarkan data 2025, Jumlah Penduduk tercatat 125.000 jiwa, naik 5.000 jiwa (4,17%) dibandingkan 2024.';

export const TURUN_TEXT =
  'Berdasarkan data 2025, Jumlah Penduduk tercatat 115.000 jiwa, turun 5.000 jiwa (4,17%) dibandingkan 2024.';

/**
 * Makes a stubbed Prisma read faithful to the real client: the related template is only on the
 * result when the call asked for it with `include: { comparisonTemplate: true }`. A service
 * that forgets the include therefore sees no template and renders no comparison, exactly as it
 * would against the database.
 */
export function honoringInclude(row: AnyRecord, args: unknown): AnyRecord {
  const include = (args as { include?: { comparisonTemplate?: unknown } } | undefined)?.include;
  if (include?.comparisonTemplate) {
    return { ...row, comparisonTemplate: row['comparisonTemplateId'] ? TEMPLATE_ROW : null };
  }
  const rest = { ...row };
  delete rest['comparisonTemplate'];
  return rest;
}

/** `tx.comparisonTemplate.findUnique` stand-in: every requested id resolves to a template. */
export async function findAnyTemplate(args: unknown): Promise<AnyRecord> {
  return { ...TEMPLATE_ROW, id: (args as { where: { id: string } }).where.id };
}
