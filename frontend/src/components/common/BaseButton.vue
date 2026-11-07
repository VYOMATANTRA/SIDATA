<script setup lang="ts">
import { computed, type Component } from 'vue';
import { computeLinkRel } from '../../utils/link.js';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'micro';
  rel?: string;
  size?: 'sm' | 'md' | 'lg';
  state?: 'default' | 'hover' | 'active' | 'disabled';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  label?: string;
  leftIcon?: Component | string;
  rightIcon?: Component | string;
  rounded?: 'btn' | 'lg' | 'full';
  href?: string;
  target?: string;
}

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  size: 'lg',
  state: 'default',
  disabled: false,
  type: 'button',
  label: undefined,
  leftIcon: undefined,
  rightIcon: undefined,
  rounded: 'btn',
  href: undefined,
  target: undefined,
  rel: undefined,
});

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const isDisabled = computed(() => props.disabled || props.state === 'disabled');

const computedRel = computed(() => computeLinkRel(props.href, props.target, props.rel));

const baseClasses =
  'inline-flex items-center justify-center font-sans font-medium transition-colors duration-150 select-none text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

const sizeClasses = computed(() => {
  if (props.variant === 'micro') {
    return 'py-[10px] px-[7px] text-xs gap-1';
  }
  switch (props.size) {
    case 'sm':
      return 'px-3 py-1.5 text-xs gap-1.5';
    case 'md':
      return 'px-4 py-2 text-sm gap-2';
    case 'lg':
    default:
      return 'px-5 py-2.5 text-base gap-2.5';
  }
});

const roundedClasses = computed(() => {
  switch (props.rounded) {
    case 'full':
      return 'rounded-full';
    case 'lg':
      return 'rounded-lg';
    case 'btn':
    default:
      return 'rounded-btn';
  }
});

// Navy + white only. Disabled stays readable (text-muted on surface-hover is 5.13:1) and is
// distinguished by its flat fill, soft border, no shadow and the not-allowed cursor.
const variantClasses = computed(() => {
  if (isDisabled.value) {
    if (props.variant === 'secondary' || props.variant === 'micro') {
      return 'bg-surface text-text-muted border-2 border-border cursor-not-allowed hover:bg-surface hover:text-text-muted hover:border-border active:bg-surface';
    }
    // primary default
    return 'bg-surface-hover text-text-muted border-2 border-border cursor-not-allowed hover:bg-surface-hover hover:text-text-muted hover:border-border active:bg-surface-hover';
  }

  // Explicit static state preview (e.g. for design mockups / showcases)
  if (props.state === 'hover') {
    if (props.variant === 'secondary') {
      return 'bg-brand-navy text-text-inverse border-2 border-brand-navy cursor-pointer';
    }
    return 'bg-surface text-brand-navy border-2 border-brand-navy cursor-pointer';
  }

  if (props.state === 'active') {
    if (props.variant === 'secondary') {
      return 'bg-brand-navy-overlay text-text-inverse border-2 border-brand-navy-overlay cursor-pointer';
    }
    return 'bg-surface-hover text-brand-navy border-2 border-brand-navy cursor-pointer';
  }

  // Interactive dynamic states
  if (props.variant === 'secondary') {
    return 'bg-surface text-brand-navy border-2 border-brand-navy hover:bg-brand-navy hover:text-text-inverse hover:border-brand-navy active:bg-brand-navy-overlay active:text-text-inverse active:border-brand-navy-overlay cursor-pointer';
  }

  if (props.variant === 'micro') {
    return 'bg-surface text-brand-navy border border-brand-navy hover:bg-brand-navy hover:text-text-inverse hover:border-brand-navy active:bg-surface-hover active:text-brand-navy cursor-pointer';
  }

  // primary default
  return 'bg-brand-navy text-text-inverse border-2 border-brand-navy hover:bg-surface hover:text-brand-navy hover:border-brand-navy active:bg-surface-hover active:text-brand-navy active:border-brand-navy shadow-sm cursor-pointer';
});

const iconSizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-3.5 w-3.5';
    case 'md':
      return 'h-4 w-4';
    case 'lg':
    default:
      return 'h-5 w-5';
  }
});

function handleClick(event: MouseEvent) {
  if (isDisabled.value) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="!isDisabled ? href : undefined"
    :rel="href ? computedRel : undefined"
    :target="href ? target : undefined"
    :type="!href ? type : undefined"
    :disabled="!href ? isDisabled : undefined"
    :aria-disabled="isDisabled ? 'true' : undefined"
    :tabindex="href && isDisabled ? -1 : undefined"
    :class="[baseClasses, sizeClasses, roundedClasses, variantClasses]"
    @click="handleClick"
  >
    <!-- Left Icon (Slot takes precedence over prop) -->
    <span
      v-if="$slots.leftIcon || leftIcon"
      class="inline-flex shrink-0 items-center justify-center"
      data-test="left-icon"
    >
      <slot name="leftIcon">
        <component
          :is="leftIcon"
          v-if="typeof leftIcon === 'object' || typeof leftIcon === 'function'"
          :class="iconSizeClasses"
        />
        <span v-else :class="iconSizeClasses">{{ leftIcon }}</span>
      </slot>
    </span>

    <!-- Default Content (Slot takes precedence over label prop) -->
    <span v-if="$slots.default || label" class="truncate">
      <slot>{{ label }}</slot>
    </span>

    <!-- Right Icon (Slot takes precedence over prop) -->
    <span
      v-if="$slots.rightIcon || rightIcon"
      class="inline-flex shrink-0 items-center justify-center"
      data-test="right-icon"
    >
      <slot name="rightIcon">
        <component
          :is="rightIcon"
          v-if="typeof rightIcon === 'object' || typeof rightIcon === 'function'"
          :class="iconSizeClasses"
        />
        <span v-else :class="iconSizeClasses">{{ rightIcon }}</span>
      </slot>
    </span>
  </component>
</template>
