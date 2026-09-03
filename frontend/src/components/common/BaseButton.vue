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
    return `${common} bg-gray-300 text-gray-600 cursor-not-allowed border border-transparent rounded-btn px-4 py-2 text-sm`;
  }

  switch (props.variant) {
    case 'micro':
      return `${common} py-[10px] px-[7px] border border-brand-navy rounded-btn text-xs bg-white text-brand-navy hover:bg-brand-navy hover:text-white`;
    case 'secondary':
      return `${common} px-4 py-2.5 rounded-btn border border-brand-navy bg-white text-brand-navy text-sm font-medium hover:bg-brand-navy hover:text-white hover:border-transparent`;
    case 'primary':
    default:
      return `${common} px-4 py-2.5 rounded-btn border border-transparent bg-brand-navy text-white text-sm font-medium hover:bg-white hover:text-brand-navy hover:border-brand-navy shadow-sm`;
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
