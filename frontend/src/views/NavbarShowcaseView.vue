<script setup lang="ts">
import { ref, computed } from 'vue';
import AppNavbar from '../components/common/AppNavbar.vue';

// Playground State
const playgroundVariant = ref<'navy' | 'white'>('navy');
const playgroundTitle = ref('Kelurahan Manggar');
const playgroundSubtitle = ref('Kelurahan Cinta Statistik');
const playgroundSticky = ref(false);
const menuOpenCount = ref(0);

function handleToggleMenu(isOpen: boolean) {
  if (isOpen) {
    menuOpenCount.value++;
  }
}

const generatedSnippet = computed(() => {
  const parts = ['<AppNavbar'];
  if (playgroundVariant.value !== 'navy') {
    parts.push(`  variant="${playgroundVariant.value}"`);
  }
  if (playgroundTitle.value !== 'Kelurahan Manggar') {
    parts.push(`  title="${playgroundTitle.value}"`);
  }
  if (playgroundSubtitle.value !== 'Kelurahan Cinta Statistik') {
    parts.push(`  subtitle="${playgroundSubtitle.value}"`);
  }
  if (playgroundSticky.value) {
    parts.push('  :sticky="true"');
  }
  parts.push('/>');
  return parts.join('\n');
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <!-- Top Navigation Bar for Mockup Suite -->
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
            <p class="text-xs text-slate-500">Navbar Component Specification & Verification</p>
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
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Link
          </router-link>
          <router-link
            to="/mockup/navbar"
            class="rounded-btn border-brand-navy bg-brand-navy border px-3 py-1.5 text-xs font-medium text-white transition-colors"
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
      <!-- Section 1: Exact Figma Spec Matrix for Navbar Component -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <!-- Top Badge matching Figma screenshot -->
        <div class="mb-8">
          <span
            class="rounded-btn inline-block border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs"
          >
            Navbars
          </span>
        </div>

        <!-- Figma Component Container (❖ Navbar) -->
        <div class="mx-auto max-w-5xl">
          <div class="text-brand-violet mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <span>❖</span> Navbar
          </div>

          <!-- Purple Dashed Box matching Figma Spec -->
          <div
            class="rounded-card border-brand-violet border-2 border-dashed bg-white p-6 shadow-xs sm:p-10"
          >
            <div class="space-y-12">
              <!-- Variant 1: White Navbar (Solid white background, no card wrapper, matching Figma) -->
              <div>
                <AppNavbar variant="white" />
              </div>

              <!-- Variant 2: Solid Navy Navbar -->
              <div>
                <AppNavbar variant="navy" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Interactive Testing Playground -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span
            class="text-brand-indigo inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
          >
            ⚡ Interactive Testing Playground
          </span>
          <h2 class="text-lg font-bold text-slate-900">Live Component Tester</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Interact with the Navbar to test responsive hamburger animation, mobile drawer
            expansion, keyboard escape handling, and props.
          </p>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- Controls Panel -->
          <div
            class="rounded-card space-y-4 border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-5"
          >
            <h3 class="text-sm font-semibold text-slate-800">Navbar Properties</h3>

            <!-- Variant Selector -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Variant Style</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundVariant === 'navy'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundVariant = 'navy'"
                >
                  Solid Navy
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundVariant === 'white'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundVariant = 'white'"
                >
                  White
                </button>
              </div>
            </div>

            <!-- Sticky Toggle -->
            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-medium text-slate-700">Sticky Navbar</span>
              <button
                type="button"
                role="switch"
                :aria-checked="playgroundSticky"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="playgroundSticky ? 'bg-brand-navy' : 'bg-slate-200'"
                @click="playgroundSticky = !playgroundSticky"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                  :class="playgroundSticky ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>

            <!-- Title Input -->
            <div>
              <label for="navbar-title-input" class="mb-1 block text-xs font-medium text-slate-600">
                Main Title
              </label>
              <input
                id="navbar-title-input"
                v-model="playgroundTitle"
                type="text"
                class="rounded-btn focus:border-brand-navy w-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none"
              />
            </div>

            <!-- Subtitle Input -->
            <div>
              <label
                for="navbar-subtitle-input"
                class="mb-1 block text-xs font-medium text-slate-600"
              >
                Subtitle
              </label>
              <input
                id="navbar-subtitle-input"
                v-model="playgroundSubtitle"
                type="text"
                class="rounded-btn focus:border-brand-navy w-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none"
              />
            </div>

            <!-- Event Status Info -->
            <div class="rounded-btn border border-slate-200/80 bg-white p-3 text-xs text-slate-600">
              <div class="flex items-center justify-between">
                <span>Menu Opened Count:</span>
                <span class="text-brand-navy rounded bg-slate-100 px-2 py-0.5 font-mono font-bold">
                  {{ menuOpenCount }}
                </span>
              </div>
            </div>
          </div>

          <!-- Live Output Preview & Code Snippet -->
          <div class="space-y-6 lg:col-span-7">
            <!-- Canvas Preview -->
            <div class="rounded-card overflow-hidden border border-slate-200/80 bg-white shadow-xs">
              <AppNavbar
                :variant="playgroundVariant"
                :title="playgroundTitle"
                :subtitle="playgroundSubtitle"
                :sticky="playgroundSticky"
                @toggle-menu="handleToggleMenu"
              />
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
