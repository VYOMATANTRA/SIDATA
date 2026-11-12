<script setup lang="ts">
import { computed } from 'vue';
import type { ChapterDto } from '../../stores/pages.store';
import type { IndicatorDto } from '../../stores/indicators.store';
import type { IndicatorTableDetailDto } from '../../stores/indicatorTables.store';
import type { ContentBlock } from '../../stores/contentBlocks.store';
import SectionProse from './SectionProse.vue';
import IndicatorStat from './IndicatorStat.vue';
import MatrixTableBlock from './MatrixTableBlock.vue';

export interface ChapterSectionProps {
  chapter: ChapterDto;
  /** Section prose blocks, keyed by sectionId, pre-sorted by sortOrder. */
  proseBySectionId: Record<string, ContentBlock[]>;
  /** Indicators, keyed by sectionId. */
  indicatorsBySectionId: Record<string, IndicatorDto[]>;
  /** Matrix tables, keyed by sectionId. */
  tablesBySectionId: Record<string, IndicatorTableDetailDto[]>;
  /** Combined indicator/matrix-table fetch error for a section, keyed by sectionId. */
  sectionErrorsBySectionId: Record<string, string>;
  /**
   * True when the prose blocks could not be loaded at all. A section without figures is then
   * unknown rather than empty, so no "not available" message is claimed for it.
   */
  proseUnavailable?: boolean;
}

const props = withDefaults(defineProps<ChapterSectionProps>(), { proseUnavailable: false });
const emit = defineEmits<{ 'retry-section': [sectionId: string] }>();

function hasContent(sectionId: string): boolean {
  return (
    (props.proseBySectionId[sectionId]?.length ?? 0) > 0 ||
    (props.indicatorsBySectionId[sectionId]?.length ?? 0) > 0 ||
    (props.tablesBySectionId[sectionId]?.length ?? 0) > 0
  );
}

/** Nothing to show and nothing that failed: the editors simply have not filled it in yet. */
function isEmptySection(sectionId: string): boolean {
  return (
    !hasContent(sectionId) && !props.sectionErrorsBySectionId[sectionId] && !props.proseUnavailable
  );
}

const sections = computed(() => props.chapter.sections ?? []);
const isEmptyChapter = computed(
  () => sections.value.length === 0 || sections.value.every((s) => isEmptySection(s.id)),
);
</script>

<template>
  <section
    :id="chapter.slug"
    class="scroll-mt-[calc(var(--public-header-height)+4.5rem)] py-10 lg:scroll-mt-[calc(var(--public-header-height)+1.5rem)]"
    data-test="chapter-section"
  >
    <h2 class="text-brand-navy flex items-baseline gap-3 text-lg font-semibold">
      <span v-if="chapter.number" class="text-text-muted text-base tabular-nums">{{
        chapter.number
      }}</span>
      {{ chapter.title }}
    </h2>

    <p v-if="isEmptyChapter" class="text-text-muted mt-4 text-base" data-test="chapter-empty">
      Konten bab ini belum tersedia.
    </p>

    <template v-else>
      <div
        v-for="section in sections"
        :key="section.id"
        class="mt-6 space-y-4"
        data-test="chapter-section-block"
      >
        <h3 v-if="section.title" class="text-brand-navy text-base font-semibold">
          {{ section.title }}
        </h3>

        <SectionProse
          v-for="block in proseBySectionId[section.id] ?? []"
          :key="block.id"
          :body="block.body"
        />

        <div
          v-if="indicatorsBySectionId[section.id]?.length"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <IndicatorStat
            v-for="indicator in indicatorsBySectionId[section.id]"
            :key="indicator.id"
            :indicator="indicator"
          />
        </div>

        <MatrixTableBlock
          v-for="table in tablesBySectionId[section.id] ?? []"
          :key="table.id"
          :table="table"
        />

        <p
          v-if="isEmptySection(section.id)"
          class="text-text-muted text-base"
          data-test="section-empty"
        >
          Konten bagian ini belum tersedia.
        </p>

        <div
          v-if="sectionErrorsBySectionId[section.id]"
          class="rounded-card border-status-error-border bg-status-error-surface text-status-error flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm"
          role="alert"
          data-test="section-data-error"
        >
          <p>Sebagian data pada bagian ini belum dapat dimuat.</p>
          <button
            type="button"
            class="rounded-btn border-status-error focus-visible:outline-focus-ring min-h-9 border bg-white px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="section-retry"
            @click="emit('retry-section', section.id)"
          >
            Coba lagi
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
