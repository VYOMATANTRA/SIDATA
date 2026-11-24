import type { ChartFigure, ChartSeries, ChartTable } from '../types/ceritaArticle';

/**
 * The numbers a Cerita chart draws, read from the indicator table it names. Pure: no DOM, no stores.
 *
 * A row with no value for the series is left out (never drawn as zero), and a group left with no
 * value is left out too. When no value is left, the chart has nothing to show and the caller renders
 * nothing (SPEC §8, "Chart").
 */

export type ChartValueKey = 'male' | 'female' | 'total';

export interface ChartValue {
  key: ChartValueKey;
  /** Text name of the value, shown in the legend and the table; never colour alone. */
  label: string;
  value: number;
}

/** One row of the table: a category on the axis, with one or two values. */
export interface ChartGroup {
  id: string;
  label: string;
  values: ChartValue[];
}

export const CHART_VALUE_LABELS: Readonly<Record<ChartValueKey, string>> = {
  male: 'Laki-laki',
  female: 'Perempuan',
  total: 'Total',
};

const SERIES_KEYS: Readonly<Record<ChartSeries, readonly ChartValueKey[]>> = {
  total: ['total'],
  by_sex: ['male', 'female'],
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The groups a chart draws, in table order. An empty list means there is nothing to draw: the table
 * is missing, or none of its rows has a value for the chosen series.
 */
export function chartGroups(
  figure: Pick<ChartFigure, 'series'>,
  table: ChartTable | null | undefined,
): ChartGroup[] {
  if (!table) return [];
  const keys = SERIES_KEYS[figure.series] ?? [];
  const groups: ChartGroup[] = [];
  for (const row of table.rows) {
    const values: ChartValue[] = [];
    for (const key of keys) {
      const value = row[key];
      if (finite(value)) values.push({ key, label: CHART_VALUE_LABELS[key], value });
    }
    if (values.length > 0) groups.push({ id: row.id, label: row.label, values });
  }
  return groups;
}

/** The largest value in the groups, used as the common scale so bars stay comparable. */
export function chartMax(groups: readonly ChartGroup[]): number {
  let max = 0;
  for (const group of groups) {
    for (const value of group.values) max = Math.max(max, value.value);
  }
  return max > 0 ? max : 1;
}
