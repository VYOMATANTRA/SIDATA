<script setup lang="ts">
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
}

withDefaults(defineProps<StatOverviewProps>(), {
  description: '',
  eyebrow: '',
  stats: undefined,
  buttonLabel: 'Lihat selengkapnya',
  to: undefined,
  href: undefined,
  cardVariant: 'dark',
  headingTag: 'h2',
  align: 'left',
  showButton: true,
});

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();
</script>

<template>
  <section
    class="flex w-full max-w-4xl flex-col space-y-5 transition-all sm:space-y-6"
    :class="align === 'center' ? 'items-center text-center' : 'items-start text-left'"
    data-test="stat-overview"
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
        <StatCard :items="stats" :variant="cardVariant">
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
            <template #leftIcon>
              <slot name="button-icon">
                <svg
                  class="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
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
          <template #leftIcon>
            <slot name="button-icon">
              <svg
                class="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </slot>
          </template>
        </BaseButton>
      </slot>
    </div>
  </section>
</template>
