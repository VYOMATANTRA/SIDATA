<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    role: string;
    meta?: string;
    photo?: string;
  }>(),
  { meta: undefined, photo: undefined },
);
</script>

<template>
  <article class="rounded-[5px] border border-gray-300 bg-white p-5 text-center">
    <div v-if="photo" class="mx-auto h-20 w-20 overflow-hidden rounded-full bg-brand-cyan">
      <img :src="photo" :alt="`Foto ${title}`" class="h-20 w-20 object-cover" />
    </div>

    <h3 class="mt-3 text-base font-bold text-brand-navy">{{ title }}</h3>
    <p v-if="meta" class="text-xs text-gray-700">{{ meta }}</p>
    <p class="mt-1 text-base text-brand-navy">{{ role }}</p>
  </article>
</template>
