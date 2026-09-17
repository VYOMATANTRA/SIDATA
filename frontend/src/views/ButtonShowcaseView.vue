<script setup lang="ts">
import { ref, computed } from 'vue';
import BaseButton from '../components/common/BaseButton.vue';

// Interactive Playground State
const playgroundVariant = ref<'primary' | 'secondary'>('primary');
const playgroundSize = ref<'sm' | 'md' | 'lg'>('lg');
const playgroundRounded = ref<'btn' | 'lg' | 'full'>('btn');
const playgroundDisabled = ref(false);
const playgroundIconOption = ref<'none' | 'left' | 'right' | 'both'>('both');
const playgroundLabel = ref('Button label');
const clickCount = ref(0);
const lastClickedTime = ref<string>('');

function handlePlaygroundClick() {
  clickCount.value++;
  const now = new Date();
  lastClickedTime.value = now.toLocaleTimeString();
}

const generatedSnippet = computed(() => {
  const parts = ['<BaseButton'];
  if (playgroundVariant.value !== 'primary') {
    parts.push(`  variant="${playgroundVariant.value}"`);
  }
  if (playgroundSize.value !== 'lg') {
    parts.push(`  size="${playgroundSize.value}"`);
  }
  if (playgroundRounded.value !== 'btn') {
    parts.push(`  rounded="${playgroundRounded.value}"`);
  }
  if (playgroundDisabled.value) {
    parts.push('  :disabled="true"');
  }
  if (playgroundIconOption.value === 'left' || playgroundIconOption.value === 'both') {
    parts.push('  <!-- #leftIcon slot or :leftIcon prop -->');
  }
  if (playgroundIconOption.value === 'right' || playgroundIconOption.value === 'both') {
    parts.push('  <!-- #rightIcon slot or :rightIcon prop -->');
  }
  parts.push(`>${playgroundLabel.value}</BaseButton>`);
  return parts.join('\n');
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <!-- Top Navigation Bar -->
    <header class="border-b border-slate-200 bg-white px-6 py-4 shadow-xs">
      <div class="mx-auto flex max-w-7xl items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="rounded-btn bg-brand-navy flex h-9 w-9 items-center justify-center font-bold text-white"
          >
            S
          </div>
          <div>
            <h1 class="text-brand-navy text-base font-bold">SIDATA Design System</h1>
            <p class="text-xs text-slate-500">Base UI Component Specification & Verification</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <router-link
            to="/mockup/button"
            class="rounded-btn border-brand-navy bg-brand-navy border px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            ❖ Button
          </router-link>
          <router-link
            to="/mockup/link"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Link
          </router-link>
          <router-link
            to="/mockup/navbar"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Navbar
          </router-link>
          <router-link
            to="/mockup/footer"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Footer
          </router-link>
          <router-link
            to="/mockup/bar-diagram"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Bar Diagram
          </router-link>
          <router-link
            to="/mockup/stat-card"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Stat Card
          </router-link>
          <router-link
            to="/mockup/stat-overview"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Stat Overview
          </router-link>
          <router-link
            to="/mockup/huge-quote"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Huge Quote
          </router-link>
          <router-link
            to="/mockup/hero"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Hero
          </router-link>
          <router-link
            to="/"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ← Beranda
          </router-link>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 sm:py-10">
      <!-- Section 1: Exact Figma Spec Matrix -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div
          class="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <span
              class="text-brand-violet inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
            >
              <span>❖</span> Figma Component Matrix
            </span>
            <h2 class="text-lg font-bold text-slate-900">Button Specification Matrix</h2>
            <p class="mt-0.5 text-xs text-slate-500">
              Exact representation of the Figma design variants (Primary / Secondary) across Icon
              states and visual states.
            </p>
          </div>

          <div class="flex items-center gap-2 text-xs text-slate-400">
            <span class="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            <span>Active Spec: main.css tokens</span>
          </div>
        </div>

        <!-- Figma Artboard Canvas Layout -->
        <div class="overflow-x-auto pb-4">
          <div class="mx-auto max-w-[960px] min-w-[760px]">
            <!-- Headers Grid: 2 Major Columns (Primary, Secondary) split into 2 Sub-columns each -->
            <div class="mb-4 grid grid-cols-2 gap-8">
              <!-- Primary Column Header -->
              <div>
                <div class="mb-0.5 text-[11px] font-medium text-slate-400">Variant</div>
                <div
                  class="border-brand-violet inline-block border-b-2 pb-0.5 text-2xl font-bold text-slate-900"
                >
                  Primary
                </div>

                <div class="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <div class="mb-0.5 text-[11px] font-medium text-slate-400">Icon</div>
                    <div
                      class="border-brand-indigo inline-block border-b-2 pb-0.5 text-xs font-semibold text-slate-900 sm:text-sm"
                    >
                      No Icon (False)
                    </div>
                  </div>

                  <div>
                    <div class="mb-0.5 text-[11px] font-medium text-slate-400">Icon</div>
                    <div
                      class="border-brand-indigo inline-block border-b-2 pb-0.5 text-xs font-semibold text-slate-900 sm:text-sm"
                    >
                      With Icon (True)
                    </div>
                  </div>
                </div>
              </div>

              <!-- Secondary Column Header -->
              <div>
                <div class="mb-0.5 text-[11px] font-medium text-slate-400">Variant</div>
                <div
                  class="border-brand-violet inline-block border-b-2 pb-0.5 text-2xl font-bold text-slate-900"
                >
                  Secondary
                </div>

                <div class="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <div class="mb-0.5 text-[11px] font-medium text-slate-400">Icon</div>
                    <div
                      class="border-brand-indigo inline-block border-b-2 pb-0.5 text-xs font-semibold text-slate-900 sm:text-sm"
                    >
                      No Icon (False)
                    </div>
                  </div>

                  <div>
                    <div class="mb-0.5 text-[11px] font-medium text-slate-400">Icon</div>
                    <div
                      class="border-brand-indigo inline-block border-b-2 pb-0.5 text-xs font-semibold text-slate-900 sm:text-sm"
                    >
                      With Icon (True)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Purple Label: ❖ Button -->
            <div class="text-brand-violet mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <span>❖</span> Button
            </div>

            <!-- Purple Dashed Container Box -->
            <div
              class="rounded-card border-brand-violet border-2 border-dashed bg-white/70 p-6 shadow-xs sm:p-8"
            >
              <div class="space-y-6">
                <!-- ROW 1: Default State -->
                <div>
                  <div
                    class="mb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase"
                  >
                    State: Default
                  </div>
                  <div class="grid grid-cols-4 items-center gap-4 sm:gap-6">
                    <!-- Primary, No Icon -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      state="default"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Primary, With Icon -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      state="default"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <!-- Book Icon -->
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, No Icon -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      state="default"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, With Icon -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      state="default"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>
                  </div>
                </div>

                <!-- ROW 2: Hover State -->
                <div>
                  <div
                    class="mb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase"
                  >
                    State: Hover
                  </div>
                  <div class="grid grid-cols-4 items-center gap-4 sm:gap-6">
                    <!-- Primary, No Icon (Hover) -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      state="hover"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Primary, With Icon (Hover) -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      state="hover"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, No Icon (Hover) -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      state="hover"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, With Icon (Hover) -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      state="hover"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>
                  </div>
                </div>

                <!-- ROW 3: Pressed / Active State -->
                <div>
                  <div
                    class="mb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase"
                  >
                    State: Pressed (Active)
                  </div>
                  <div class="grid grid-cols-4 items-center gap-4 sm:gap-6">
                    <!-- Primary, No Icon (Active) -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      state="active"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Primary, With Icon (Active) -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      state="active"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, No Icon (Active) -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      state="active"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, With Icon (Active) -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      state="active"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>
                  </div>
                </div>

                <!-- ROW 4: Disabled State -->
                <div>
                  <div
                    class="mb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase"
                  >
                    State: Disabled
                  </div>
                  <div class="grid grid-cols-4 items-center gap-4 sm:gap-6">
                    <!-- Primary, No Icon (Disabled) -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      :disabled="true"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Primary, With Icon (Disabled) -->
                    <BaseButton
                      variant="primary"
                      size="md"
                      :disabled="true"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, No Icon (Disabled) -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      :disabled="true"
                      label="Button label"
                      class="w-full justify-between"
                    >
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>

                    <!-- Secondary, With Icon (Disabled) -->
                    <BaseButton
                      variant="secondary"
                      size="md"
                      :disabled="true"
                      label="Button icon"
                      class="w-full justify-between"
                    >
                      <template #leftIcon>
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </template>
                      <template #rightIcon>
                        <span class="text-sm font-bold">→</span>
                      </template>
                    </BaseButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Interactive Live Playground -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span
            class="text-brand-indigo inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
          >
            ⚡ Interactive Testing Playground
          </span>
          <h2 class="text-lg font-bold text-slate-900">Live Component Tester</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Interact with live buttons to test mouse hover, click handlers, focus rings, and custom
            slot combinations.
          </p>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- Controls Panel -->
          <div
            class="rounded-card space-y-4 border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-5"
          >
            <h3 class="text-sm font-semibold text-slate-800">Button Properties</h3>

            <!-- Variant Selector -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Variant</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundVariant === 'primary'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundVariant = 'primary'"
                >
                  Primary
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundVariant === 'secondary'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundVariant = 'secondary'"
                >
                  Secondary
                </button>
              </div>
            </div>

            <!-- Size Selector -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Size Scale</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="s in ['sm', 'md', 'lg'] as const"
                  :key="s"
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium uppercase transition-colors"
                  :class="
                    playgroundSize === s
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundSize = s"
                >
                  {{ s }}
                </button>
              </div>
            </div>

            <!-- Rounded Shape -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600"
                >Border Radius Shape</label
              >
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="r in [
                    { key: 'btn', label: '10px (btn)' },
                    { key: 'lg', label: '8px (lg)' },
                    { key: 'full', label: 'Pill (full)' },
                  ] as const"
                  :key="r.key"
                  type="button"
                  class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundRounded === r.key
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundRounded = r.key"
                >
                  {{ r.label }}
                </button>
              </div>
            </div>

            <!-- Icons Option -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Icons Support</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="opt in [
                    { key: 'none', label: 'No Icon' },
                    { key: 'left', label: 'Left Only' },
                    { key: 'right', label: 'Right Only' },
                    { key: 'both', label: 'Both Icons' },
                  ] as const"
                  :key="opt.key"
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundIconOption === opt.key
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundIconOption = opt.key"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Disabled Switch -->
            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-medium text-slate-700">Disabled State</span>
              <button
                type="button"
                role="switch"
                :aria-checked="playgroundDisabled"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="playgroundDisabled ? 'bg-brand-navy' : 'bg-slate-200'"
                @click="playgroundDisabled = !playgroundDisabled"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                  :class="playgroundDisabled ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>

            <!-- Label Input -->
            <div>
              <label for="btn-label-input" class="mb-1 block text-xs font-medium text-slate-600">
                Button Label Text
              </label>
              <input
                id="btn-label-input"
                v-model="playgroundLabel"
                type="text"
                class="rounded-btn focus:border-brand-navy w-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <!-- Live Output Preview & Code Snippet -->
          <div class="space-y-6 lg:col-span-7">
            <!-- Canvas Preview -->
            <div
              class="rounded-card flex min-h-[220px] flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50/70 p-8"
            >
              <BaseButton
                :variant="playgroundVariant"
                :size="playgroundSize"
                :rounded="playgroundRounded"
                :disabled="playgroundDisabled"
                :label="playgroundLabel"
                @click="handlePlaygroundClick"
              >
                <template
                  v-if="playgroundIconOption === 'left' || playgroundIconOption === 'both'"
                  #leftIcon
                >
                  <svg
                    class="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                </template>

                <template
                  v-if="playgroundIconOption === 'right' || playgroundIconOption === 'both'"
                  #rightIcon
                >
                  <span class="text-sm font-bold">→</span>
                </template>
              </BaseButton>

              <!-- Event feedback -->
              <div class="mt-6 flex items-center gap-4 text-xs text-slate-500">
                <span class="inline-flex items-center gap-1.5">
                  <span class="font-medium text-slate-700">Click Events Count:</span>
                  <span
                    class="rounded-btn bg-slate-200 px-2 py-0.5 font-mono font-bold text-slate-800"
                  >
                    {{ clickCount }}
                  </span>
                </span>
                <span v-if="lastClickedTime" class="text-slate-400">
                  Terakhir: {{ lastClickedTime }}
                </span>
              </div>
            </div>

            <!-- Generated Snippet -->
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700">Vue SFC Usage Snippet</span>
                <span class="text-[11px] text-slate-400">Copy-paste ready</span>
              </div>
              <pre
                class="rounded-card bg-brand-navy overflow-x-auto p-4 font-mono text-xs text-white"
              ><code>{{ generatedSnippet }}</code></pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
