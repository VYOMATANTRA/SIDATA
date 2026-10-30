<script setup lang="ts">
import { computed } from 'vue';
import SectionTextArea from './SectionTextArea.vue';
import StatCard, { type StatItem } from './StatCard.vue';
import BaseButton from './BaseButton.vue';

export interface StatOverviewProps {
  /** Heading title (e.g. 'Statistics Type' or 'Demografi Penduduk') */
  title: string;
  /** Explanatory description paragraph */
  description?: string;
  /** Optional eyebrow / category tag above title */
  eyebrow?: string;
  /** List of statistics for the StatCard */
  stats?: StatItem[];
  /** Optional custom title override for the nested StatCard landmark (defaults to title) */
  cardTitle?: string;
  /** Action button label (default: 'Lihat selengkapnya') */
  buttonLabel?: string;
  /** Vue router route destination for button */
  to?: string;
  /** External URL for button */
  href?: string;
  /** StatCard visual variant: 'dark' (default) | 'glass' | 'navy' | 'light' */
  cardVariant?: 'dark' | 'glass' | 'navy' | 'light';
  /** Heading tag (default: 'h2' per WCAG section rules) */
  headingTag?: 'h1' | 'h2' | 'h3' | 'h4';
  /** Alignment: 'left' (default) | 'center' */
  align?: 'left' | 'center';
  /** Whether to show the action button (default: true) */
  showButton?: boolean;
  /** Optional background image URL for photographic card mode */
  bgImage?: string;
  /** Optional custom background gradient overlay (defaults to Figma dark linear gradient) */
  bgOverlay?: string;
  /** Optional container class overrides */
  containerClass?: string;
  /** Whether to render as a full-bleed edge-to-edge section background without rounded card border */
  isFullBleed?: boolean;
}

const props = withDefaults(defineProps<StatOverviewProps>(), {
  description: '',
  eyebrow: '',
  stats: undefined,
  cardTitle: undefined,
  buttonLabel: 'Lihat selengkapnya',
  to: undefined,
  href: undefined,
  cardVariant: 'dark',
  headingTag: 'h2',
  align: 'left',
  showButton: true,
  bgImage: undefined,
  bgOverlay: undefined,
  containerClass: '',
  isFullBleed: false,
});

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const containerStyle = computed(() => {
  if (!props.bgImage) return {};
  const overlay =
    props.bgOverlay ||
    'linear-gradient(90deg, rgba(0, 0, 0, 0.75) 40%, rgba(68, 68, 68, 0.75) 100%)';
  return {
    backgroundImage: `${overlay}, url(${props.bgImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});
</script>

<template>
  <section
    class="flex w-full flex-col transition-all"
    :class="[
      isFullBleed
        ? 'relative overflow-hidden px-4 py-16 sm:px-8 sm:py-20 md:py-24'
        : bgImage
          ? 'relative overflow-hidden rounded-2xl p-6 sm:p-8 md:p-10 shadow-xl space-y-5 sm:space-y-6'
          : 'max-w-4xl space-y-5 sm:space-y-6',
      align === 'center' ? 'items-center text-center' : 'items-start text-left',
      containerClass,
    ]"
    :style="containerStyle"
    data-test="stat-overview"
  >
    <div
      :class="[
        isFullBleed
          ? 'mx-auto flex w-full max-w-4xl flex-col space-y-6 sm:space-y-8'
          : 'flex w-full flex-col space-y-5 sm:space-y-6',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
      ]"
    >
      <!-- 1. Section Text Area Sub-component -->
      <SectionTextArea
        :title="title"
        :description="description"
        :eyebrow="eyebrow"
        :heading-tag="headingTag"
        :align="align"
        :theme="cardVariant === 'light' ? 'light' : 'dark'"
      >
        <template v-if="$slots.eyebrow" #eyebrow>
          <slot name="eyebrow" />
        </template>
        <template v-if="$slots.title" #title>
          <slot name="title" />
        </template>
        <slot name="description" />
      </SectionTextArea>

      <!-- 2. StatCard Sub-component -->
      <div class="w-full">
        <slot name="card">
          <StatCard :items="stats" :variant="cardVariant" :title="cardTitle || title">
            <template v-if="$slots['card-empty']" #empty>
              <slot name="card-empty" />
            </template>
          </StatCard>
        </slot>
      </div>

      <!-- 3. Action Button Sub-component -->
      <div v-if="showButton" class="pt-1">
        <slot name="button">
          <!-- Vue Router Destination (Accessible custom slot to prevent invalid <a><button> nesting) -->
          <router-link v-if="to" :to="to" custom v-slot="{ href: routerHref, navigate }">
            <BaseButton
              variant="primary"
              size="md"
              :label="buttonLabel"
              :href="routerHref"
              data-test="stat-overview-button"
              @click="
                (e) => {
                  navigate(e);
                  emit('click', e);
                }
              "
            >
              <template #rightIcon>
                <slot name="button-icon">
                  <svg
                    class="h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </slot>
              </template>
            </BaseButton>
          </router-link>

          <!-- External Link or Direct Click Action -->
          <BaseButton
            v-else
            variant="primary"
            size="md"
            :label="buttonLabel"
            :href="href"
            data-test="stat-overview-button"
            @click="emit('click', $event)"
          >
            <template #rightIcon>
              <slot name="button-icon">
                <svg
                  class="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </slot>
            </template>
          </BaseButton>
        </slot>
      </div>
    </div>
  </section>
</template>
