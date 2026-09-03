<script setup lang="ts">
import { ref, computed } from 'vue';
import BaseLink from '../components/common/BaseLink.vue';

// Interactive Playground State
const playgroundSize = ref<'sm' | 'md' | 'lg'>('lg');
const playgroundVariant = ref<'navy' | 'indigo' | 'white'>('navy');
const playgroundWithArrow = ref(true);
const playgroundDisabled = ref(false);
const playgroundLabel = ref('Link label');
const playgroundHref = ref('https://example.com');
const clickCount = ref(0);

function handlePlaygroundClick(e: MouseEvent) {
  if (playgroundHref.value === '#' || !playgroundHref.value) {
    e.preventDefault();
  }
  clickCount.value++;
}

const generatedSnippet = computed(() => {
  const parts = ['<BaseLink'];
  if (playgroundHref.value) {
    parts.push(`  href="${playgroundHref.value}"`);
  }
  if (playgroundSize.value !== 'lg') {
    parts.push(`  size="${playgroundSize.value}"`);
  }
  if (playgroundVariant.value !== 'navy') {
    parts.push(`  variant="${playgroundVariant.value}"`);
  }
  if (!playgroundWithArrow.value) {
    parts.push('  :withArrow="false"');
  }
  if (playgroundDisabled.value) {
    parts.push('  :disabled="true"');
  }
  parts.push(`  label="${playgroundLabel.value}"`);
  parts.push('/>');
  return parts.join('\n');
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <!-- Top Navigation Bar -->
    <header class="border-b border-slate-200 bg-white px-6 py-4 shadow-xs">
      <div class="mx-auto flex max-w-7xl items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-btn bg-brand-navy font-bold text-white">
            S
          </div>
          <div>
            <h1 class="text-base font-bold text-brand-navy">SIDATA Design System</h1>
            <p class="text-xs text-slate-500">Base UI Component Specification & Verification</p>
          </div>
        </div>

        <!-- Navigation Tabs between Mockups -->
        <div class="flex items-center gap-2">
          <router-link
            to="/mockup/button"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Button
          </router-link>
          <router-link
            to="/mockup/link"
            class="rounded-btn border border-brand-navy bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition-colors"
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
            to="/"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ← Beranda
          </router-link>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-8 space-y-12 sm:px-6 sm:py-10">
      <!-- Section 1: Exact Figma Spec Matrix for Link Component -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <!-- Top Badge matching Figma screenshot -->
        <div class="mb-8">
          <span class="inline-block rounded-btn border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
            Links
          </span>
        </div>

        <!-- Figma Spec Layout Canvas -->
        <div class="overflow-x-auto pb-6">
          <div class="mx-auto flex max-w-4xl flex-col items-start gap-12 sm:flex-row sm:items-start sm:gap-16">
            <!-- Left Header: Size -->
            <div class="shrink-0">
              <div class="mb-1 text-xs font-medium text-slate-400">Size</div>
              <div class="inline-block border-b-2 border-brand-navy pb-0.5 text-xl font-bold text-slate-900">
                Large
              </div>
            </div>

            <!-- Middle Header: State rows (Default, Hover) -->
            <div class="shrink-0 space-y-8">
              <div>
                <div class="mb-1 text-xs font-medium text-slate-400">State</div>
                <div class="inline-block border-b-2 border-brand-cyan pb-0.5 text-xl font-bold text-slate-900">
                  Default
                </div>
              </div>

              <div>
                <div class="inline-block border-b-2 border-brand-cyan pb-0.5 text-xl font-bold text-slate-900">
                  Hover
                </div>
              </div>
            </div>

            <!-- Right: Figma Component Container (❖ Link) -->
            <div class="flex-1 w-full max-w-md">
              <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-violet">
                <span>❖</span> Link
              </div>

              <!-- Purple Dashed Box matching Figma Spec -->
              <div class="rounded-card border-2 border-dashed border-brand-violet bg-white/70 p-8 shadow-xs">
                <div class="space-y-8">
                  <!-- Row 1: Default State -->
                  <div>
                    <BaseLink
                      href="#"
                      state="default"
                      size="lg"
                      label="Link label"
                      @click.prevent
                    />
                  </div>

                  <!-- Row 2: Hover State -->
                  <div>
                    <BaseLink
                      href="#"
                      state="hover"
                      size="lg"
                      label="Link label"
                      @click.prevent
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Interactive Testing Playground for Link Component -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-indigo">
            ⚡ Interactive Testing Playground
          </span>
          <h2 class="text-lg font-bold text-slate-900">Live Link Tester</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Test live mouse hover, font weight transitions, keyboard focus rings, size scales, and router integration.
          </p>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- Controls Panel -->
          <div class="space-y-4 rounded-card border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-5">
            <h3 class="text-sm font-semibold text-slate-800">Link Properties</h3>

            <!-- Size Selector -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Size Scale</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="s in (['sm', 'md', 'lg'] as const)"
                  :key="s"
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium uppercase transition-colors"
                  :class="playgroundSize === s ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundSize = s"
                >
                  {{ s }}
                </button>
              </div>
            </div>

            <!-- Color Variant -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Color Variant</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="v in (['navy', 'indigo', 'white'] as const)"
                  :key="v"
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                  :class="playgroundVariant === v ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundVariant = v"
                >
                  {{ v }}
                </button>
              </div>
            </div>

            <!-- Arrow Toggle -->
            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-medium text-slate-700">Trailing Arrow (→)</span>
              <button
                type="button"
                role="switch"
                :aria-checked="playgroundWithArrow"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="playgroundWithArrow ? 'bg-brand-navy' : 'bg-slate-200'"
                @click="playgroundWithArrow = !playgroundWithArrow"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                  :class="playgroundWithArrow ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
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
              <label for="link-label-input" class="mb-1 block text-xs font-medium text-slate-600">
                Link Text
              </label>
              <input
                id="link-label-input"
                v-model="playgroundLabel"
                type="text"
                class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
              />
            </div>

            <!-- Destination URL -->
            <div>
              <label for="link-href-input" class="mb-1 block text-xs font-medium text-slate-600">
                Destination (href)
              </label>
              <input
                id="link-href-input"
                v-model="playgroundHref"
                type="text"
                class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>

          <!-- Live Output Preview & Code Snippet -->
          <div class="space-y-6 lg:col-span-7">
            <!-- Canvas Preview -->
            <div
              class="flex min-h-[220px] flex-col items-center justify-center rounded-card border border-dashed border-slate-200 p-8 transition-colors"
              :class="playgroundVariant === 'white' ? 'bg-brand-navy' : 'bg-slate-50/70'"
            >
              <BaseLink
                :href="playgroundHref"
                :size="playgroundSize"
                :variant="playgroundVariant"
                :with-arrow="playgroundWithArrow"
                :disabled="playgroundDisabled"
                :label="playgroundLabel"
                @click="handlePlaygroundClick"
              />

              <!-- Event feedback -->
              <div
                class="mt-6 flex items-center gap-4 text-xs"
                :class="playgroundVariant === 'white' ? 'text-white/70' : 'text-slate-500'"
              >
                <span class="inline-flex items-center gap-1.5">
                  <span class="font-medium" :class="playgroundVariant === 'white' ? 'text-white' : 'text-slate-700'">
                    Clicks:
                  </span>
                  <span
                    class="rounded-btn px-2 py-0.5 font-mono font-bold"
                    :class="playgroundVariant === 'white' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'"
                  >
                    {{ clickCount }}
                  </span>
                </span>
                <span>Hover over the link to see transition to bold + underline</span>
              </div>
            </div>

            <!-- Generated Snippet -->
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700">Vue SFC Usage Snippet</span>
                <span class="text-[11px] text-slate-400">Copy-paste ready</span>
              </div>
              <pre class="overflow-x-auto rounded-card bg-brand-navy p-4 font-mono text-xs text-white"><code>{{ generatedSnippet }}</code></pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
