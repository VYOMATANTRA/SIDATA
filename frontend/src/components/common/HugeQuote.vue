<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import SectionTextArea from './SectionTextArea.vue';

export interface HugeQuoteProps {
  /** Main section heading title (default: 'Sambutan') */
  title?: string;
  /** Main quote / welcome speech paragraph text */
  quote?: string;
  /** Alias for quote / paragraph text */
  description?: string;
  /** Optional eyebrow / category tag above title */
  eyebrow?: string;
  /** Author / Leader full name with title (default: 'Author Name, Title') */
  authorName?: string;
  /** Author official role or position (default: 'Position') */
  authorPosition?: string;
  /** Alias for authorPosition */
  authorRole?: string;
  /** Dynamic image URL for author portrait. If omitted or failed, renders a sleek placeholder */
  imageSrc?: string;
  /** Accessible alt text for the author photo */
  imageAlt?: string;
  /** Visual container variant: 'dark' (default) | 'glass' | 'navy' | 'light' | 'transparent' */
  variant?: 'dark' | 'glass' | 'navy' | 'light' | 'transparent';
  /** Main heading level tag (default: 'h2') */
  headingTag?: 'h1' | 'h2' | 'h3' | 'h4';
  /** Author heading level tag (default: 'h3') */
  authorHeadingTag?: 'h2' | 'h3' | 'h4';
  /** Text alignment (default: 'left') */
  align?: 'left' | 'center';
  /** Optional max width class for the quote description (default: 'max-w-2xl') */
  maxWidthClass?: string;
}

const props = withDefaults(defineProps<HugeQuoteProps>(), {
  title: 'Sambutan',
  quote:
    'Selamat datang di Portal Data Kelurahan Manggar. Melalui kerja sama dengan BPS dan Tim Inovasi Sosial VYOMATANTRA ITK, kami berupaya menghadirkan data kelurahan yang lebih terbuka dan mudah diakses masyarakat. Mari bersama mengenal lebih dekat potensi Kelurahan Manggar melalui program ini.',
  description: undefined,
  eyebrow: '',
  authorName: 'Author Name, Title',
  authorPosition: 'Position',
  authorRole: undefined,
  imageSrc: undefined,
  imageAlt: undefined,
  variant: 'dark',
  headingTag: 'h2',
  authorHeadingTag: 'h3',
  align: 'left',
  maxWidthClass: 'max-w-2xl',
});

// Track image load failure to seamlessly fallback to placeholder
const imageError = ref(false);

watch(
  () => props.imageSrc,
  () => {
    imageError.value = false;
  },
);

function handleImageError() {
  imageError.value = true;
}

const effectiveQuote = computed(() => {
  return props.description !== undefined ? props.description : props.quote;
});

const effectiveAuthorPosition = computed(() => {
  return props.authorRole !== undefined ? props.authorRole : props.authorPosition;
});

const computedImageAlt = computed(() => {
  return props.imageAlt || `Foto ${props.authorName}, ${effectiveAuthorPosition.value}`;
});

const theme = computed<'dark' | 'light'>(() => {
  return props.variant === 'light' ? 'light' : 'dark';
});

const containerVariantClasses = computed(() => {
  switch (props.variant) {
    case 'glass':
      return 'bg-surface-glass backdrop-blur-md border border-white/20 text-white shadow-lg';
    case 'navy':
      return 'bg-brand-navy border border-white/10 text-white shadow-md';
    case 'light':
      return 'bg-white border border-slate-200 text-slate-900 shadow-xs';
    case 'transparent':
      return 'bg-transparent text-white';
    case 'dark':
    default:
      return 'bg-[#232528]/90 border border-white/5 text-white shadow-xl';
  }
});
</script>

<template>
  <section
    class="relative w-full max-w-4xl overflow-hidden rounded-2xl p-6 transition-all sm:p-10 md:p-12"
    :class="containerVariantClasses"
    data-test="huge-quote"
    :aria-label="title"
  >
    <!-- Top Area: Quote Heading & Paragraph using SectionTextArea -->
    <div class="relative z-10 w-full" data-test="quote-header">
      <SectionTextArea
        :title="title"
        :description="effectiveQuote"
        :eyebrow="eyebrow"
        :heading-tag="headingTag"
        :theme="theme"
        :align="align"
        :max-width-class="maxWidthClass"
      >
        <template v-if="$slots.eyebrow" #eyebrow>
          <slot name="eyebrow" />
        </template>
        <template v-if="$slots.title" #title>
          <slot name="title" />
        </template>
        <slot name="quote">
          <slot name="description">
            <slot>{{ effectiveQuote }}</slot>
          </slot>
        </slot>
      </SectionTextArea>
    </div>

    <!-- Bottom Area: Split layout with Author info (left) and Portrait/Placeholder (right) -->
    <div
      class="relative mt-8 flex min-h-[220px] flex-col-reverse items-end justify-between gap-6 sm:mt-12 sm:flex-row sm:gap-8"
    >
      <!-- Bottom Left: Author Name & Position/Role using SectionTextArea -->
      <div class="relative z-10 w-full pb-1 sm:w-auto sm:pb-3" data-test="author-details">
        <SectionTextArea
          :title="authorName"
          :description="effectiveAuthorPosition"
          :heading-tag="authorHeadingTag"
          :theme="theme"
          :align="align"
          max-width-class="max-w-md"
        >
          <template v-if="$slots.authorName" #title>
            <slot name="authorName">{{ authorName }}</slot>
          </template>
          <slot name="authorPosition">
            <slot name="authorRole">{{ effectiveAuthorPosition }}</slot>
          </slot>
        </SectionTextArea>
      </div>

      <!-- Bottom Right: Dynamic Portrait Photo or Elegant Silhouette Placeholder -->
      <div
        class="relative z-0 flex w-full shrink-0 items-end justify-center sm:w-64 sm:justify-end md:w-72"
        data-test="portrait-container"
      >
        <slot name="image">
          <!-- Dynamic Image (when provided and successfully loaded) -->
          <img
            v-if="imageSrc && !imageError"
            :src="imageSrc"
            :alt="computedImageAlt"
            class="h-auto max-h-[340px] w-auto max-w-full object-contain object-bottom drop-shadow-xl transition-opacity duration-300 sm:max-h-[380px]"
            data-test="quote-image"
            @error="handleImageError"
          />

          <!-- Placeholder (when imageSrc is omitted or fails to load) -->
          <div
            v-else
            class="flex h-64 w-52 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition-colors sm:h-72 sm:w-60"
            :class="[
              variant === 'light'
                ? 'border-slate-300 bg-slate-100/80 text-slate-600'
                : 'border-white/20 bg-white/5 text-slate-300 backdrop-blur-xs',
            ]"
            data-test="portrait-placeholder"
            role="img"
            :aria-label="`Placeholder ${computedImageAlt}`"
          >
            <!-- Stylized Leader Silhouette SVG -->
            <div
              class="mb-3 flex h-16 w-16 items-center justify-center rounded-full"
              :class="
                variant === 'light' ? 'bg-slate-200 text-slate-500' : 'bg-white/10 text-slate-300'
              "
              aria-hidden="true"
            >
              <svg
                class="h-10 w-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <!-- Head / Silhouette -->
                <circle cx="12" cy="7" r="4" />
                <!-- Torso / Suit with Collar -->
                <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
                <path d="M12 11v4" />
                <path d="M10 15l2 2 2-2" />
              </svg>
            </div>

            <span class="text-xs font-semibold">Foto Pimpinan</span>
            <span
              class="mt-1 text-[10px] leading-tight"
              :class="variant === 'light' ? 'text-slate-500' : 'text-slate-400'"
            >
              Prop dinamis: <code class="font-mono">imageSrc</code>
            </span>
          </div>
        </slot>
      </div>
    </div>
  </section>
</template>
