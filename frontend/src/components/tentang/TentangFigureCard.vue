<script setup lang="ts">
withDefaults(
  defineProps<{
    image: string;
    caption: string;
    source: string;
    alt?: string;
  }>(),
  { alt: '' },
);
</script>

<template>
  <figure class="border border-black bg-white p-4 shadow-[4px_4px_4px_rgba(0,0,0,0.5)]">
    <img :src="image" :alt="alt" class="h-48 w-full object-cover sm:h-64" />
    <figcaption class="mt-3">
      <p class="text-base text-brand-navy">{{ caption }}</p>
      <p class="text-xs text-gray-700 italic">Sumber: {{ source }}</p>
    </figcaption>
  </figure>
</template>
