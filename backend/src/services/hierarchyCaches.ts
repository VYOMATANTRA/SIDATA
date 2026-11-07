import { invalidateIndicatorsCache } from './indicators.service.js';
import { invalidateIndicatorTablesCache } from './indicatorTables.service.js';

/**
 * Indicator DTOs resolve `pageSlug` through section → chapter → page, so any structural removal
 * in the hierarchy drops those cached reads. Titles, ordering and creation cannot change a cached
 * field (slugs are immutable and attached sections cannot be deleted), so only deletions call it.
 */
export function invalidateHierarchyDependentCaches(): void {
  invalidateIndicatorsCache();
  invalidateIndicatorTablesCache();
}
