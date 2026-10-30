<script setup lang="ts">
import { RouterLink } from 'vue-router';
import TentangIcon, { type TentangIconName } from './TentangIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    icon?: TentangIconName;
    /** Internal route destination, e.g. '/peta' */
    to?: string;
    /** External link destination, e.g. 'https://...' */
    href?: string;
    /** Optional label for the action link */
    ctaLabel?: string;
  }>(),
  { icon: 'system', to: undefined, href: undefined, ctaLabel: undefined },
);
</script>

<template>
  <article class="rounded-btn bg-brand-navy-deep flex flex-col p-5">
    <div class="flex items-center gap-3">
      <span
        class="bg-brand-indigo flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
        aria-hidden="true"
      >
        <TentangIcon :name="icon" />
      </span>
      <h3 class="text-base font-bold text-white">{{ title }}</h3>
    </div>

    <div class="mt-3 flex-1 text-base leading-relaxed text-white">
      <slot />
    </div>

    <div v-if="$slots.footer || to || href" class="mt-4 border-t border-white/70 pt-4">
      <slot name="footer">
        <RouterLink
          v-if="to"
          :to="to"
          class="bg-brand-cyan text-brand-navy inline-flex items-center gap-2 rounded-[5px] px-4 py-1.5 text-base font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span>{{ ctaLabel ?? 'Buka' }}</span>
          <span aria-hidden="true">&rarr;</span>
        </RouterLink>
        <a
          v-else-if="href"
          :href="href"
          target="_blank"
          rel="noopener noreferrer"
          class="bg-brand-cyan text-brand-navy inline-flex items-center gap-2 rounded-[5px] px-4 py-1.5 text-base font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span>{{ ctaLabel ?? 'Buka' }}</span>
          <span aria-hidden="true">&rarr;</span>
        </a>
      </slot>
    </div>
  </article>
</template>
