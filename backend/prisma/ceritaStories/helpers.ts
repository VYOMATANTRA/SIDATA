import type { StoryContext, StoryExpectation } from './types.js';

/** A diagram of bars read from scalar indicators by exact slug, so it follows the stored values. */
export function indicatorBars(
  ctx: StoryContext,
  opts: { title: string; source: string; unit: string; items: [label: string, slug: string][] },
) {
  return {
    kind: 'diagram',
    title: opts.title,
    source: opts.source,
    bars: {
      unit: opts.unit,
      items: opts.items.map(([label, slug]) => ({ label, value: ctx.indicator(slug) })),
    },
  };
}

/** Expectations for several indicators at once. */
export const expectIndicators = (pairs: [slug: string, value: number][]): StoryExpectation[] =>
  pairs.map(([indicator, value]) => ({ indicator, value }));
