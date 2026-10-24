<script setup lang="ts">
export interface SectionProseProps {
  body: string;
}

defineProps<SectionProseProps>();
</script>

<template>
  <p class="max-w-prose text-base leading-relaxed text-slate-700" data-test="section-prose">
    {{ body }}
  </p>
</template>
