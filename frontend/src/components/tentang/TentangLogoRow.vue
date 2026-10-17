<script setup lang="ts">
export interface AboutLogo {
  src: string;
  alt: string;
}

withDefaults(defineProps<{ logos?: AboutLogo[] }>(), { logos: () => [] });
</script>

<template>
  <ul class="flex flex-wrap items-center justify-center gap-6">
    <li v-for="logo in logos" :key="logo.src">
      <img :src="logo.src" :alt="logo.alt" class="h-16 w-auto object-contain sm:h-20" />
    </li>
  </ul>
</template>
