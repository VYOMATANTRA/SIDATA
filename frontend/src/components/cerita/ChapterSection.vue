<script setup lang="ts">
import type { ChapterDto } from '../../stores/pages.store';
import type { IndicatorDto } from '../../stores/indicators.store';
import type { IndicatorTableDetailDto } from '../../stores/indicatorTables.store';
import SectionProse from './SectionProse.vue';
import IndicatorStat from './IndicatorStat.vue';
import MatrixTableBlock from './MatrixTableBlock.vue';

export interface ChapterSectionProps {
  chapter: ChapterDto;
  /** Section prose body, keyed by sectionId. */
  proseBySectionId: Record<string, string>;
  /** Indicators, keyed by sectionId. */
  indicatorsBySectionId: Record<string, IndicatorDto[]>;
  /** Matrix tables, keyed by sectionId. */
  tablesBySectionId: Record<string, IndicatorTableDetailDto[]>;
}

defineProps<ChapterSectionProps>();
</script>

<template>
  <section :id="chapter.slug" class="scroll-mt-24 py-10" data-test="chapter-section">
    <h2 class="flex items-baseline gap-3 text-lg font-semibold text-slate-900">
      <span v-if="chapter.number" class="text-brand-navy/40 text-base tabular-nums">{{
        chapter.number
      }}</span>
      {{ chapter.title }}
    </h2>

    <div
      v-for="section in chapter.sections"
      :key="section.id"
      class="mt-6 space-y-4"
      data-test="chapter-section-block"
    >
      <h3 v-if="section.title" class="text-base font-semibold text-slate-800">
        {{ section.title }}
      </h3>

      <SectionProse v-if="proseBySectionId[section.id]" :body="proseBySectionId[section.id]!" />

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
    </div>
  </section>
</template>
