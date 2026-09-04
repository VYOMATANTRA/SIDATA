<script setup lang="ts">
import { computed } from 'vue';
import SectionTextArea from './SectionTextArea.vue';
import defaultHeroBg from '@/assets/img/background_laman_depan_kelurahan.png';

export interface SectionHeroProps {
  /** Eyebrow tag above hero title (default: 'Program Kelurahan Cantik mempersembahkan') */
  eyebrow?: string;
  /** Main hero title heading (default: 'Sistem Informasi Data Terpadu Kelurahan') */
  title?: string;
  /** Primary description text paragraph */
  description?: string;
  /** Optional highlighted lead word in description (default: 'SIDATA') */
  descriptionHighlight?: string;
  /** Heading semantic tag (default: 'h1' per WCAG single h1 per page rule) */
  headingTag?: 'h1' | 'h2';
  /** Text alignment: 'left' (default) | 'center' */
  align?: 'left' | 'center';
  /** Visual container variant: 'dark' (default) | 'glass' | 'navy' | 'light' | 'transparent' */
  variant?: 'dark' | 'glass' | 'navy' | 'light' | 'transparent';
  /** Background image URL (defaults to landing page background asset) */
  backgroundImage?: string;
  /** Whether to show the dark gradient overlay over background image (default: true) */
  showOverlay?: boolean;
  /** Maximum width constraint class for description */
  maxWidthClass?: string;
  /** Custom CSS classes for eyebrow */
  eyebrowClass?: string;
  /** Minimum height class for the hero section (default: 'min-h-[520px]') */
  minHeightClass?: string;
}

const props = withDefaults(defineProps<SectionHeroProps>(), {
  eyebrow: 'Program Kelurahan Cantik mempersembahkan',
  title: 'Sistem Informasi Data Terpadu Kelurahan',
  description:
    'Portal Data Kelurahan Manggar yang menyajikan data statistik kependudukan, pendidikan, kesehatan, ekonomi, hingga tata ruang untuk mendukung pembangunan desa yang tepat sasaran.',
  descriptionHighlight: 'SIDATA',
  headingTag: 'h1',
  align: 'left',
  variant: 'dark',
  backgroundImage: defaultHeroBg,
  showOverlay: true,
  maxWidthClass: 'max-w-2xl',
  eyebrowClass: 'text-sm sm:text-base font-medium text-slate-200/90 normal-case tracking-normal',
  minHeightClass: 'min-h-[480px] sm:min-h-[560px]',
});

const theme = computed<'dark' | 'light'>(() => {
  return props.variant === 'light' ? 'light' : 'dark';
});

const backgroundStyle = computed(() => {
  if (props.variant === 'transparent' || !props.backgroundImage) {
    return {};
  }
  if (props.showOverlay) {
    return {
      backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.84), rgba(0, 27, 72, 0.90)), url(${props.backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    backgroundImage: `url(${props.backgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});
</script>

<template>
  <section
    class="relative flex w-full flex-col justify-center overflow-hidden px-6 py-14 transition-all sm:px-12 sm:py-20 md:py-24"
    :class="[
      minHeightClass,
      variant === 'light' ? 'bg-slate-50 text-slate-900' : 'text-white',
      variant === 'glass' ? 'bg-surface-glass border border-white/20 backdrop-blur-md' : '',
      variant === 'navy' ? 'bg-brand-navy' : '',
    ]"
    :style="backgroundStyle"
    data-test="section-hero"
    :aria-label="title"
  >
    <!-- Background Slot for custom canvas/video/illustration if desired -->
    <slot name="background" />

    <!-- Inner Content Container -->
    <div
      class="relative z-10 mx-auto flex w-full max-w-5xl flex-col space-y-6 sm:space-y-8"
      :class="align === 'center' ? 'items-center text-center' : 'items-start text-left'"
    >
      <!-- Partner Badges Slot (optional) -->
      <div v-if="$slots.partners || $slots.badges" class="flex flex-wrap items-center gap-3">
        <slot name="partners">
          <slot name="badges" />
        </slot>
      </div>

      <!-- Core Subcomponent: SectionTextArea -->
      <SectionTextArea
        :title="title"
        :description="description"
        :eyebrow="eyebrow"
        :heading-tag="headingTag"
        :theme="theme"
        :align="align"
        :max-width-class="maxWidthClass"
        :eyebrow-class="eyebrowClass"
        data-test="hero-section-text-area"
      >
        <template v-if="$slots.eyebrow" #eyebrow>
          <slot name="eyebrow" />
        </template>
        <template v-if="$slots.title" #title>
          <slot name="title" />
        </template>

        <!-- Custom or highlighted description -->
        <slot name="description">
          <slot>
            <span v-if="descriptionHighlight" class="font-bold text-white">
              {{ descriptionHighlight }} —
            </span>
            <span>{{ description }}</span>
          </slot>
        </slot>
      </SectionTextArea>

      <!-- Action Buttons / CTA Slot -->
      <div
        v-if="$slots.actions || $slots.cta"
        class="flex flex-wrap items-center gap-3 pt-2 sm:gap-4"
        data-test="hero-actions"
      >
        <slot name="actions">
          <slot name="cta" />
        </slot>
      </div>
    </div>
  </section>
</template>
