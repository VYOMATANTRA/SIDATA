/**
 * Shape of a Cerita story seed (one file per page under this folder). A story writes a section's
 * title, prose and figure through the same services the CMS uses, so every rule applies.
 */

/** A figure the prose quotes: a table (row or sum) or a scalar indicator. Without `row`, the check compares the sum over all rows. */
export interface StoryExpectation {
  /** A scalar indicator (by exact slug) that must equal `value`. Use instead of `table`. */
  indicator?: string;
  value?: number;
  table?: string;
  row?: string;
  male?: number;
  female?: number;
  total?: number;
  sum?: number;
}

export interface StoryTableRow {
  label: string;
  male: number | null;
  female: number | null;
  total: number | null;
}

/** What a figure builder may look up at run time, so figures follow the stored tables. */
export interface StoryContext {
  tableId(slug: string): string;
  rows(slug: string): StoryTableRow[];
  /**
   * Free-form survey records of the spatial points of a type (e.g. 'bank_sampah'), with personal
   * fields (names, phones, addresses) already removed. Lets prose be computed instead of typed.
   */
  points(type: 'bank_sampah' | 'fasilitas_umum'): Record<string, unknown>[];
  /** Current value of a scalar indicator on the page, by exact slug. */
  indicator(slug: string): number;
}

export interface StorySection {
  chapter: string;
  section: string;
  title: string;
  /** Limited Markdown; a blank line starts a new paragraph. A function computes it from stored data. */
  body: string | ((ctx: StoryContext) => string);
  /** Omitted when the data has nothing worth drawing; the section then has text only. */
  figure?: (ctx: StoryContext) => unknown;
  /** Figures the prose quotes. The section is skipped if the stored data no longer matches. */
  expect?: StoryExpectation[];
}

export interface StorySeed {
  page: string;
  sections: StorySection[];
}
