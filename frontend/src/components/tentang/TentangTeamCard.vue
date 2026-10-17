<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    role: string;
    meta?: string;
    photo?: string;
    showPlaceholder?: boolean;
  }>(),
  { meta: undefined, photo: undefined, showPlaceholder: false },
);
</script>

<template>
  <article class="rounded-[5px] border border-gray-300 bg-white p-5 text-center">
    <div v-if="photo" class="mx-auto h-20 w-20 overflow-hidden rounded-full bg-brand-cyan">
      <img :src="photo" :alt="`Foto ${title}`" class="h-20 w-20 object-cover" />
    </div>

    <div
      v-else-if="showPlaceholder"
      class="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-brand-navy/10 bg-brand-cyan/40 text-brand-navy/60"
      aria-hidden="true"
      data-test="team-photo-placeholder"
    >
      <svg
        class="h-10 w-10 text-brand-navy/50"
        viewBox="0 0 24 24"
        fill="currentColor"
        focusable="false"
      >
        <path
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      </svg>
    </div>

    <h3 class="mt-3 text-base font-bold text-brand-navy">{{ title }}</h3>
    <p v-if="meta" class="text-xs text-gray-700">{{ meta }}</p>
    <p class="mt-1 text-base text-brand-navy">{{ role }}</p>
  </article>
</template>
