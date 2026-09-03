<script setup lang="ts">
import { computed, type Component } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

export interface LinkProps {
  href?: string;
  to?: RouteLocationRaw;
  target?: string;
  rel?: string;
  size?: 'sm' | 'md' | 'lg';
  state?: 'default' | 'hover';
  variant?: 'navy' | 'indigo' | 'white';
  label?: string;
  leftIcon?: Component | string;
  rightIcon?: Component | string;
  withArrow?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<LinkProps>(), {
  href: undefined,
  to: undefined,
  target: undefined,
  rel: undefined,
  size: 'lg',
  state: 'default',
  variant: 'navy',
  label: undefined,
  leftIcon: undefined,
  rightIcon: undefined,
  withArrow: true,
  disabled: false,
});

const isRouterLink = computed(() => !!props.to && !props.disabled);

const isExternal = computed(() => {
  if (props.target === '_blank') return true;
  if (props.href && (props.href.startsWith('http://') || props.href.startsWith('https://'))) {
    return true;
  }
  return false;
});

const computedRel = computed(() => {
  if (props.rel) return props.rel;
  if (isExternal.value) return 'noopener noreferrer';
  return undefined;
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'text-xs gap-1.5';
    case 'md':
      return 'text-sm gap-2';
    case 'lg':
    default:
      return 'text-base gap-2';
  }
});

const colorClasses = computed(() => {
  switch (props.variant) {
    case 'indigo':
      return 'text-brand-indigo';
    case 'white':
      return 'text-white';
    case 'navy':
    default:
      return 'text-brand-navy';
  }
});

const stateClasses = computed(() => {
  // Explicit static state preview (for mockup specifications matching Image 2)
  if (props.state === 'hover') {
    return 'font-bold border-b-2 border-current pb-0.5';
  }
  // Interactive dynamic state: normal weight, transitions to bold and continuous full-width border-b on hover
  return 'font-normal border-b-2 border-transparent pb-0.5 hover:font-bold hover:border-current transition-all duration-150';
});
</script>

<template>
  <RouterLink
    v-if="isRouterLink && to"
    :to="to"
    :target="target"
    :rel="computedRel"
    class="group inline-flex items-center no-underline select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo focus-visible:ring-offset-2 rounded-xs"
    :class="[sizeClasses, colorClasses, stateClasses]"
  >
    <!-- Left Icon (Slot or Prop) -->
    <span
      v-if="$slots.leftIcon || leftIcon"
      class="inline-flex shrink-0 items-center justify-center no-underline"
      data-test="left-icon"
    >
      <slot name="leftIcon">
        <component
          :is="leftIcon"
          v-if="typeof leftIcon === 'object' || typeof leftIcon === 'function'"
          class="h-4 w-4 shrink-0"
        />
        <span v-else>{{ leftIcon }}</span>
      </slot>
    </span>

    <!-- Text Label -->
    <span
      class="inline-block"
      data-test="link-label"
    >
      <slot>{{ label }}</slot>
    </span>

    <!-- Right Icon / Arrow -->
    <span
      v-if="$slots.rightIcon || rightIcon || withArrow"
      class="inline-flex shrink-0 items-center justify-center no-underline transition-transform duration-150 group-hover:translate-x-0.5"
      data-test="right-icon"
    >
      <slot name="rightIcon">
        <component
          :is="rightIcon"
          v-if="typeof rightIcon === 'object' || typeof rightIcon === 'function'"
          class="h-4 w-4 shrink-0"
        />
        <span v-else-if="rightIcon">{{ rightIcon }}</span>
        <span v-else-if="withArrow" class="font-bold leading-none select-none">→</span>
      </slot>
    </span>
  </RouterLink>

  <a
    v-else
    :href="!disabled ? (href || '#') : undefined"
    :target="target"
    :rel="computedRel"
    :aria-disabled="disabled ? 'true' : undefined"
    :tabindex="disabled ? -1 : undefined"
    class="group inline-flex items-center no-underline select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo focus-visible:ring-offset-2 rounded-xs"
    :class="[
      sizeClasses,
      colorClasses,
      stateClasses,
      { 'opacity-50 cursor-not-allowed pointer-events-none': disabled },
    ]"
  >
    <!-- Left Icon (Slot or Prop) -->
    <span
      v-if="$slots.leftIcon || leftIcon"
      class="inline-flex shrink-0 items-center justify-center no-underline"
      data-test="left-icon"
    >
      <slot name="leftIcon">
        <component
          :is="leftIcon"
          v-if="typeof leftIcon === 'object' || typeof leftIcon === 'function'"
          class="h-4 w-4 shrink-0"
        />
        <span v-else>{{ leftIcon }}</span>
      </slot>
    </span>

    <!-- Text Label -->
    <span
      class="inline-block"
      data-test="link-label"
    >
      <slot>{{ label }}</slot>
    </span>

    <!-- Right Icon / Arrow -->
    <span
      v-if="$slots.rightIcon || rightIcon || withArrow"
      class="inline-flex shrink-0 items-center justify-center no-underline transition-transform duration-150 group-hover:translate-x-0.5"
      data-test="right-icon"
    >
      <slot name="rightIcon">
        <component
          :is="rightIcon"
          v-if="typeof rightIcon === 'object' || typeof rightIcon === 'function'"
          class="h-4 w-4 shrink-0"
        />
        <span v-else-if="rightIcon">{{ rightIcon }}</span>
        <span v-else-if="withArrow" class="font-bold leading-none select-none">→</span>
      </slot>
    </span>
  </a>
</template>
