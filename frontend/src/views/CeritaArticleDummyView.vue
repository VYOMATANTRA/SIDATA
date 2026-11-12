<script setup lang="ts">
import CeritaArticleTemplate from '../components/cerita/CeritaArticleTemplate.vue';
import { dummyPendidikanArticle } from '../content/ceritaArticleDummy';

/** Development-only preview of the article template with mockup content (see ceritaArticleDummy). */
</script>

<template>
  <CeritaArticleTemplate :article="dummyPendidikanArticle" />
</template>
