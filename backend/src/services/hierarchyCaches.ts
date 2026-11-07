import { invalidateIndicatorsCache } from './indicators.service.js';
import { invalidateIndicatorTablesCache } from './indicatorTables.service.js';

/**
 * Indicator DTOs resolve `pageSlug` through section → chapter → page. A page, chapter or section
 * can only be deleted when no indicator or table hangs beneath it (409 HAS_DEPENDENTS), so no
 * cached indicator read can reference a node being removed. Dropping these caches on deletion is
 * therefore purely defensive: it keeps a read that raced the delete from outliving the hierarchy
 * row. Titles, ordering and creation cannot change a cached field (slugs are immutable), so only
 * deletions call it.
 */
export function invalidateHierarchyDependentCaches(): void {
  invalidateIndicatorsCache();
  invalidateIndicatorTablesCache();
}
