<script setup lang="ts">
export interface SectionProseProps {
  body: string;
}

defineProps<SectionProseProps>();
</script>

<template>
  <p
    class="max-w-prose text-base leading-relaxed whitespace-pre-line text-text-muted"
    data-test="section-prose"
  >
    {{ body }}
  </p>
</template>
