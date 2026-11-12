<script setup lang="ts">
import { useId } from 'vue';
import type { ArticleStatsBlock } from '../../types/ceritaArticle';

defineProps<{ block: ArticleStatsBlock }>();

const titleId = useId();
</script>

<template>
  <section
    class="rounded-card border-border border bg-white p-5 shadow-xs"
    :aria-labelledby="titleId"
    data-test="article-stats"
  >
    <h3 :id="titleId" class="text-brand-navy text-base font-semibold">{{ block.title }}</h3>
    <dl class="mt-4 grid grid-cols-2 gap-3">
      <div
        v-for="item in block.items"
        :key="item.id"
        class="bg-surface-muted rounded-btn px-3 py-2"
        data-test="article-stat-item"
      >
        <dd class="text-brand-navy text-xl leading-tight font-bold tabular-nums">
          {{ item.value
          }}<span v-if="item.unit" class="text-text-muted ml-1 text-sm font-normal">{{
            item.unit
          }}</span>
        </dd>
        <dt class="text-text-muted text-sm">{{ item.label }}</dt>
      </div>
    </dl>
  </section>
</template>
