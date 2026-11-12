<script setup lang="ts">
import { useId } from 'vue';

withDefaults(
  defineProps<{
    eyebrow: string;
    title: string;
    subtitle: string;
    image: string;
  }>(),
  {},
);

const titleId = useId();
</script>

<template>
  <!--
    Photo hero. No blanket tint: the photo stays visible and a navy fade sits only behind the text
    (rising from the bottom on narrow widths where the text sits low, sweeping in from the left
    from md). A white wave at the bottom edge hands over to the white section that follows. The
    crop (`object-position`) keeps the building in frame on a tall mobile viewport.
  -->
  <section
    class="relative isolate flex min-h-[26rem] items-end overflow-hidden sm:min-h-[32rem]"
    :aria-labelledby="titleId"
  >
    <img
      :src="image"
      alt=""
      class="absolute inset-0 h-full w-full object-cover object-[35%_40%] md:object-center"
    />
    <div
      class="absolute inset-0 bg-linear-to-t from-brand-navy via-brand-navy/80 via-45% to-transparent md:bg-linear-to-r md:from-brand-navy md:via-brand-navy/70 md:via-40% md:to-transparent"
      aria-hidden="true"
      data-test="hero-text-fade"
    />

    <div class="relative w-full px-4 pt-28 pb-20 sm:px-6 sm:pt-36 sm:pb-28">
      <div class="mx-auto max-w-5xl">
        <p class="text-base font-medium tracking-[0.2em] text-text-inverse uppercase">{{ eyebrow }}</p>
        <h1 :id="titleId" class="mt-3 text-xl text-white">{{ title }}</h1>
        <p class="mt-4 max-w-xl text-base leading-relaxed text-text-inverse">{{ subtitle }}</p>
      </div>
    </div>

    <!-- White wave: the photo hands over to the white section below -->
    <div
      class="pointer-events-none absolute inset-x-0 -bottom-px"
      aria-hidden="true"
      data-test="hero-wave"
    >
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" class="block h-10 w-full sm:h-20">
        <path
          class="text-surface"
          d="M0 64C240 120 480 8 720 56 960 104 1200 32 1440 72V120H0Z"
          fill="currentColor"
        />
      </svg>
    </div>
  </section>
</template>
