import {
  CHART_TYPES,
  SEX_ONLY_CHART_TYPES,
  type ChartFigure,
  type ChartSeries,
  type ChartTable,
  type ChartType,
} from '../types/ceritaArticle';

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

/** True for a chart type the figure may use; the one check every parser shares. */
export function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && (CHART_TYPES as readonly string[]).includes(value);
}

/** True for the types that only make sense split by sex (pyramid, stacked, percent). */
export function isSexOnlyChartType(type: ChartType): boolean {
  return SEX_ONLY_CHART_TYPES.includes(type);
}

/**
 * Whole-number percentages that add up to exactly 100 (largest remainder). A value that is not a
 * positive number counts as 0. Used for every share the reader prints, so the labels never add up
 * to 99 or 101. Returns zeros when nothing is positive.
 */
export function roundShares(values: readonly number[]): number[] {
  const positive = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return positive.map(() => 0);
  const exact = positive.map((value) => (value / total) * 100);
  const shares = exact.map((value) => Math.floor(value));
  let remaining = 100 - shares.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - shares[index]! }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    shares[index]! += 1;
    remaining -= 1;
  }
  return shares;
}

/** One value of a row with its share of that row (male and female add up to 100). */
export interface RowShare {
  key: ChartValueKey;
  label: string;
  value: number;
  percent: number;
}

/** The split of one row, as a 100% bar draws it. */
export function rowShares(group: ChartGroup): RowShare[] {
  const percents = roundShares(group.values.map((value) => value.value));
  return group.values.map((value, index) => ({
    key: value.key,
    label: value.label,
    value: value.value,
    percent: percents[index] ?? 0,
  }));
}

/** One slice of a donut: a row, its value and its share of the donut's total. */
export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  percent: number;
}

/**
 * The slices of a donut for one value key (total, or male or female), in table order. A value of
 * zero or less is left out: a share cannot be negative. The percents of the slices add up to 100.
 */
export function donutSlices(groups: readonly ChartGroup[], key: ChartValueKey): DonutSlice[] {
  const parts: { id: string; label: string; value: number }[] = [];
  for (const group of groups) {
    const value = group.values.find((item) => item.key === key);
    if (value && value.value > 0)
      parts.push({ id: group.id, label: group.label, value: value.value });
  }
  const percents = roundShares(parts.map((part) => part.value));
  return parts.map((part, index) => ({ ...part, percent: percents[index] ?? 0 }));
}

/** A count the way the reader prints it: dots for thousands ("1.234"), as in Indonesian. */
export function formatChartNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

/** Shared hatch for the female series: white diagonal lines over the series colour. */
export const CHART_HATCH_OVERLAY =
  'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.9) 0 2px, transparent 2px 5px)';
