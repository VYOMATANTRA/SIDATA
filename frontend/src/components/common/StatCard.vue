<script setup lang="ts">
interface Props {
  value: number | string;
  label: string;
  theme?: 'dark' | 'glass' | 'light';
}

withDefaults(defineProps<Props>(), {
  theme: 'glass',
});
</script>

<template>
  <div
    class="rounded-card flex flex-row items-center justify-between gap-[10px] px-[13px] py-[10px] backdrop-blur-md transition-transform hover:scale-[1.02]"
    :class="{
      'bg-surface-glass border border-white/20 text-white shadow-sm': theme === 'glass',
      'bg-brand-biru-hytam border-brand-biru-aja border text-white shadow-md': theme === 'dark',
      'text-brand-biru-hytam border border-slate-200 bg-white/90 shadow-sm': theme === 'light',
    }"
  >
    <div class="flex flex-col text-left">
      <span
        class="text-[16px] leading-[26px] font-semibold"
        :class="theme === 'light' ? 'text-brand-biru-hytam' : 'text-white'"
      >
        {{ value }}
      </span>
      <span
        class="text-h4 tracking-wider uppercase"
        :class="theme === 'light' ? 'text-slate-600' : 'text-white/80'"
      >
        {{ label }}
      </span>
    </div>

    <div
      v-if="$slots.icon"
      class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2"
      :class="
        theme === 'light'
          ? 'border-brand-biru-hytam text-brand-biru-hytam'
          : 'border-white text-white'
      "
    >
      <slot name="icon" />
    </div>
  </div>
</template>
