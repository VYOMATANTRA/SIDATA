<script setup lang="ts">
export interface SectionTextAreaProps {
  /** Heading title text */
  title?: string;
  /** Paragraph description text */
  description?: string;
  /** Optional eyebrow tag / category label above the title */
  eyebrow?: string;
  /** Heading level tag for semantic structure (default: 'h2') */
  headingTag?: 'h1' | 'h2' | 'h3' | 'h4';
  /** Visual theme: 'dark' (white text on dark background, default) | 'light' (navy text on light background) */
  theme?: 'dark' | 'light';
  /** Text alignment: 'left' (default) | 'center' | 'right' */
  align?: 'left' | 'center' | 'right';
  /** Optional max width constraint class for description (e.g. 'max-w-2xl') */
  maxWidthClass?: string;
  /** Optional custom CSS classes for the eyebrow tag */
  eyebrowClass?: string;
}

withDefaults(defineProps<SectionTextAreaProps>(), {
  title: '',
  description: '',
  eyebrow: '',
  headingTag: 'h2',
  theme: 'dark',
  align: 'left',
  maxWidthClass: 'max-w-3xl',
  eyebrowClass: undefined,
});
</script>

<template>
  <div
    class="flex min-w-0 flex-col space-y-2 sm:space-y-2.5"
    :class="[
      align === 'center'
        ? 'items-center text-center'
        : align === 'right'
          ? 'items-end text-right'
          : 'items-start text-left',
    ]"
    data-test="section-text-area"
  >
    <!-- Optional Eyebrow / Supertitle -->
    <span
      v-if="eyebrow || $slots.eyebrow"
      :class="[
        eyebrowClass
          ? eyebrowClass
          : [
              'text-xs font-semibold tracking-wider uppercase',
              theme === 'light' ? 'text-brand-indigo' : 'text-brand-cyan',
            ],
      ]"
      data-test="section-eyebrow"
    >
      <slot name="eyebrow">{{ eyebrow }}</slot>
    </span>

    <!-- Section Heading Title -->
    <component
      :is="headingTag"
      v-if="title || $slots.title"
      class="min-w-0 leading-tight font-bold tracking-tight"
      :class="[
        theme === 'light' ? 'text-slate-900' : 'text-white',
        headingTag === 'h1' ? 'text-xl' : 'text-lg sm:text-xl',
      ]"
      data-test="section-title"
    >
      <slot name="title">{{ title }}</slot>
    </component>

    <!-- Section Paragraph Description -->
    <p
      v-if="description || $slots.default"
      class="text-base leading-relaxed"
      :class="[theme === 'light' ? 'text-slate-600' : 'text-slate-200/95', maxWidthClass]"
      data-test="section-description"
    >
      <slot>{{ description }}</slot>
    </p>
  </div>
</template>
