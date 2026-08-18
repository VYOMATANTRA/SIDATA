<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  variant?: 'primary' | 'secondary' | 'micro';
  disabled?: boolean;
  withIcon?: boolean;
  type?: 'button' | 'submit' | 'reset';
  href?: string;
  target?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  disabled: false,
  withIcon: false,
  type: 'button',
  href: undefined,
  target: undefined,
});

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const baseClasses = computed(() => {
  const common =
    'inline-flex items-center justify-center transition-all duration-200 font-sans cursor-pointer select-none text-center';

  if (props.disabled) {
    return `${common} bg-gray-300 text-gray-600 cursor-not-allowed border border-transparent rounded-btn px-4 py-2 text-body-sm`;
  }

  switch (props.variant) {
    case 'micro':
      return `${common} py-[10px] px-[7px] border border-brand-biru-hytam rounded-btn text-h4 bg-white text-brand-biru-hytam hover:bg-brand-biru-hytam hover:text-white`;
    case 'secondary':
      return `${common} px-4 py-2.5 rounded-btn border border-brand-biru-hytam bg-white text-brand-biru-hytam text-body-sm font-medium hover:bg-brand-biru-hytam hover:text-white hover:border-transparent`;
    case 'primary':
    default:
      return `${common} px-4 py-2.5 rounded-btn border border-transparent bg-brand-biru-hytam text-white text-body-sm font-medium hover:bg-white hover:text-brand-biru-hytam hover:border-brand-biru-hytam shadow-sm`;
  }
});

function handleClick(event: MouseEvent) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :target="target"
    :type="!href ? type : undefined"
    :disabled="!href ? disabled : undefined"
    :class="baseClasses"
    @click="handleClick"
  >
    <span :class="{ 'inline-flex items-center gap-2': withIcon }">
      <slot name="icon" />
      <slot />
    </span>
  </component>
</template>
