<script setup lang="ts">
import { useId } from 'vue';

/**
 * Full-width message for a Cerita page that cannot show its content (page not found, request
 * failed). It keeps the navy title band so the page still looks finished inside the public shell,
 * owns the page's single `<h1>`, and takes the recovery actions (retry, back home) as a slot.
 */
withDefaults(
  defineProps<{
    title: string;
    message: string;
    /** Announce the message to assistive technology straight away (failures, not "not found"). */
    alert?: boolean;
  }>(),
  { alert: false },
);

const titleId = useId();
</script>

<template>
  <div>
    <section
      class="bg-surface-inverse border-t border-white/15 px-4 py-10 sm:px-6 sm:py-14"
      :aria-labelledby="titleId"
    >
      <div class="mx-auto max-w-5xl">
        <p class="text-text-inverse-muted text-sm font-medium tracking-[0.2em] uppercase">Cerita</p>
        <h1 :id="titleId" class="mt-2 text-lg break-words text-white sm:text-xl">{{ title }}</h1>
      </div>
    </section>

    <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <p
        class="text-brand-navy max-w-prose text-base leading-relaxed"
        :role="alert ? 'alert' : undefined"
        data-test="cerita-state-message"
      >
        {{ message }}
      </p>
      <div v-if="$slots.default" class="mt-6 flex flex-wrap items-center gap-3">
        <slot />
      </div>
    </div>
  </div>
</template>
