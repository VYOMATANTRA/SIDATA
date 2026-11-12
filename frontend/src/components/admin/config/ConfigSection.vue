<script setup lang="ts">
/**
 * One labelled section of the system configuration page (SPEC §8). The heading is an `<h2>`
 * (the admin shell owns the page `<h1>`) and takes programmatic focus when the page's section
 * links jump to it, so keyboard and screen-reader users land on the section they chose.
 */
defineProps<{
  /** Anchor id of the section, e.g. `cuaca`. The heading id is `<id>-judul`. */
  id: string;
  title: string;
  description?: string;
}>();
</script>

<template>
  <section
    :id="id"
    :aria-labelledby="`${id}-judul`"
    class="border-border scroll-mt-4 space-y-4 border-t pt-8 first:border-t-0 first:pt-0"
  >
    <div class="space-y-1">
      <h2
        :id="`${id}-judul`"
        tabindex="-1"
        class="text-brand-navy text-base font-semibold focus:outline-none"
      >
        {{ title }}
      </h2>
      <p v-if="description" class="text-text-muted max-w-3xl text-sm">{{ description }}</p>
    </div>
    <slot />
  </section>
</template>
