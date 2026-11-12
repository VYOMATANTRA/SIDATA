<script setup lang="ts">
import type { ArticleBlock } from '../../types/ceritaArticle';
import ArticleFigure from './ArticleFigure.vue';
import ArticleQuote from './ArticleQuote.vue';
import ArticleStats from './ArticleStats.vue';
import SectionProse from './SectionProse.vue';
import BarDiagram from '../common/BarDiagram.vue';

/** Renders a section's extra blocks in the order given. */
defineProps<{ blocks: ArticleBlock[] }>();
</script>

<template>
  <template v-for="block in blocks" :key="block.id">
    <template v-if="block.kind === 'prose'">
      <SectionProse v-for="(paragraph, i) in block.paragraphs" :key="i" :body="paragraph" />
    </template>
    <BarDiagram
      v-else-if="block.kind === 'bars'"
      :title="block.title"
      :unit="block.unit"
      :items="block.items"
      data-test="article-bars"
    />
    <ArticleFigure v-else-if="block.kind === 'figure'" :block="block" />
    <ArticleQuote v-else-if="block.kind === 'quote'" :block="block" />
    <ArticleStats v-else-if="block.kind === 'stats'" :block="block" />
  </template>
</template>
