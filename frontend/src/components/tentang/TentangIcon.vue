<script setup lang="ts">
export type TentangIconName = 'coast' | 'people' | 'leaf' | 'chart' | 'document' | 'map' | 'system' | 'info';

const ICON_PATHS: Record<TentangIconName, string[]> = {
  coast: [
    'M12 3v2',
    'M5.6 7.2a7 7 0 0 1 12.8 0',
    'M3 12.5c1.7 0 1.7 1.5 3.4 1.5S8.1 12.5 9.8 12.5s1.7 1.5 3.4 1.5S14.9 12.5 16.6 12.5s1.7 1.5 3.4 1.5',
    'M3 17.5c1.7 0 1.7 1.5 3.4 1.5S8.1 17.5 9.8 17.5s1.7 1.5 3.4 1.5S14.9 17.5 16.6 17.5s1.7 1.5 3.4 1.5',
  ],
  people: [
    'M15.5 19.5c0-2.4-2.6-4.3-5.9-4.3S3.7 17.1 3.7 19.5',
    'M9.6 10.4a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M17.2 11.6a2.5 2.5 0 1 0 0-5',
    'M20.6 19.5c0-1.7-.8-3.2-2.2-4',
  ],
  leaf: ['M4 20c0-8.3 6-14.5 16-15.5C20 15 14.6 20 6 20H4Z', 'M4 20c2.2-5.4 5.3-8.6 9.2-10.6'],
  chart: ['M3.5 3.5v15.5a1.5 1.5 0 0 0 1.5 1.5h15.5', 'M7.5 15l3.6-3.8 3 2.6 5-5.6'],
  document: ['M7.5 3.5h6.2l4.8 4.8v12.2H7.5z', 'M13.7 3.5v4.8h4.8', 'M10.5 13.5h6', 'M10.5 17h4'],
  map: ['M9 4.2 3.5 6.7v13L9 17.2l6 2.5 5.5-2.5v-13L15 6.7 9 4.2Z', 'M9 4.2v13', 'M15 6.7v13'],
  system: ['M3.5 5h17v11h-17z', 'M8.5 20h7', 'M12 16v4'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 8h.01', 'M11.5 12h1v4.5h1'],
};

withDefaults(defineProps<{ name?: TentangIconName | string }>(), { name: 'info' });
</script>

<template>
  <svg
    class="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="(path, index) in ICON_PATHS[name as TentangIconName] ?? ICON_PATHS.info"
      :key="index"
      :d="path"
    />
  </svg>
</template>
