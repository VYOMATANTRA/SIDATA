<script setup lang="ts">
import { ref, computed } from 'vue';
import SectionHero from '@/components/common/SectionHero.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import bgHeroImage from '@/assets/img/background_laman_depan_kelurahan.png';
import logoDesaCantik from '@/assets/img/logo_desa_cantik.png';
import logoBps from '@/assets/img/logo_bps.png';
import logoItk from '@/assets/img/logo_itk.png';
import logoVyomatantra from '@/assets/img/logo_vyomatantra.png';

// Section 1: Exact Figma Default Text
const figmaEyebrow = 'Program Kelurahan Cantik mempersembahkan';
const figmaTitle = 'Sistem Informasi Data Terpadu Kelurahan';
const figmaDescription =
  'Portal Data Kelurahan Manggar yang menyajikan data statistik kependudukan, pendidikan, kesehatan, ekonomi, hingga tata ruang untuk mendukung pembangunan desa yang tepat sasaran.';
const figmaHighlight = 'SIDATA';

// Interactive Playground State
const playgroundEyebrow = ref('Program Kelurahan Cantik mempersembahkan');
const playgroundTitle = ref('Sistem Informasi Data Terpadu Kelurahan');
const playgroundDescription = ref(
  'Portal Data Kelurahan Manggar yang menyajikan data statistik kependudukan, pendidikan, kesehatan, ekonomi, hingga tata ruang untuk mendukung pembangunan desa yang tepat sasaran.',
);
const playgroundHighlight = ref('SIDATA');
const playgroundAlign = ref<'left' | 'center'>('left');
const playgroundVariant = ref<'dark' | 'glass' | 'navy' | 'light' | 'transparent'>('dark');
const playgroundShowCta = ref(true);
const playgroundShowPartners = ref(true);
const playgroundBgMode = ref<'image' | 'dark' | 'neutral'>('image');

function resetToDefault() {
  playgroundEyebrow.value = 'Program Kelurahan Cantik mempersembahkan';
  playgroundTitle.value = 'Sistem Informasi Data Terpadu Kelurahan';
  playgroundDescription.value =
    'Portal Data Kelurahan Manggar yang menyajikan data statistik kependudukan, pendidikan, kesehatan, ekonomi, hingga tata ruang untuk mendukung pembangunan desa yang tepat sasaran.';
  playgroundHighlight.value = 'SIDATA';
  playgroundAlign.value = 'left';
  playgroundVariant.value = 'dark';
  playgroundShowCta.value = true;
  playgroundShowPartners.value = true;
  playgroundBgMode.value = 'image';
}

const computedBgImage = computed(() => {
  return playgroundBgMode.value === 'image' ? bgHeroImage : undefined;
});

const generatedSnippet = computed(() => {
  const parts = ['<SectionHero'];
  if (playgroundEyebrow.value !== 'Program Kelurahan Cantik mempersembahkan') {
    parts.push(`  eyebrow="${playgroundEyebrow.value}"`);
  }
  if (playgroundTitle.value !== 'Sistem Informasi Data Terpadu Kelurahan') {
    parts.push(`  title="${playgroundTitle.value}"`);
  }
  if (playgroundHighlight.value !== 'SIDATA') {
    parts.push(`  descriptionHighlight="${playgroundHighlight.value}"`);
  }
  if (playgroundAlign.value !== 'left') {
    parts.push(`  align="${playgroundAlign.value}"`);
  }
  if (playgroundVariant.value !== 'dark') {
    parts.push(`  variant="${playgroundVariant.value}"`);
  }
  parts.push(`  description="${playgroundDescription.value}"`);
  if (playgroundShowCta.value) {
    parts.push('>');
    parts.push('  <template #actions>');
    parts.push('    <BaseButton variant="primary" label="Jelajahi Data Statistik" />');
    parts.push('    <BaseButton variant="secondary" label="Peta Wilayah Manggar" />');
    parts.push('  </template>');
    parts.push('</SectionHero>');
  } else {
    parts.push('/>');
  }
  return parts.join('\n');
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <!-- Top Mockup Navigation Bar -->
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
            <p class="text-xs text-slate-500">SectionHero Specification & Verification</p>
          </div>
        </div>

        <!-- Navigation Tabs between Component Mockups -->
        <nav aria-label="Mockup navigation tabs" class="flex flex-wrap items-center gap-2">
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
            class="rounded-btn border-brand-navy bg-brand-navy border px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            ❖ Hero
          </router-link>
          <router-link
            to="/"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ← Beranda
          </router-link>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 sm:py-10">
      <!-- Section 1: Exact Figma Spec Reproduction -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div
          class="mb-6 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <span
              class="text-brand-violet inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
            >
              <span>❖</span> Figma Component Specification
            </span>
            <h2 class="text-lg font-bold text-slate-900">Hero Section Block (SectionHero)</h2>
            <p class="mt-0.5 text-xs text-slate-500">
              Pixel-perfect implementation of the Figma slice: uses
              <code class="text-brand-indigo font-mono">SectionTextArea</code> as subcomponent with
              semantic <code class="font-mono">&lt;h1&gt;</code> per
              <code class="font-mono">docs/ACCESSIBILITY.md</code>, supported by the landing page
              brand hero background and partner logos.
            </p>
          </div>

          <span
            class="rounded-btn inline-block border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs"
          >
            Figma Slice
          </span>
        </div>

        <div class="space-y-8">
          <!-- Standalone Exact Figma Slice Box -->
          <div>
            <div class="mb-2.5 flex items-center justify-between">
              <span
                class="text-brand-violet inline-flex items-center gap-1.5 text-xs font-semibold"
              >
                <span>❖</span> 1. Exact Text Slice (Canvas Frame Reproduction)
              </span>
              <span class="text-xs text-slate-400">Exact layout, typography, and lead bold</span>
            </div>

            <div
              class="rounded-card border-brand-violet flex justify-center border-2 border-dashed bg-[#1c212b] p-6 shadow-xs sm:p-12"
            >
              <div class="w-full max-w-2xl">
                <SectionHero
                  :eyebrow="figmaEyebrow"
                  :title="figmaTitle"
                  :description="figmaDescription"
                  :description-highlight="figmaHighlight"
                  variant="transparent"
                  min-height-class="min-h-0"
                />
              </div>
            </div>
          </div>

          <!-- In Context: Full Landing Hero with Background and Action Buttons -->
          <div>
            <div class="mb-2.5 flex items-center justify-between">
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <span>🖼️</span> 2. In Context: Full Landing Page Hero (with Badges & CTAs)
              </span>
              <span class="text-xs text-slate-400"
                >Complete hero presentation as rendered on homepage</span
              >
            </div>

            <div class="overflow-hidden rounded-2xl shadow-xl">
              <SectionHero
                :eyebrow="figmaEyebrow"
                :title="figmaTitle"
                :description="figmaDescription"
                :description-highlight="figmaHighlight"
                :background-image="bgHeroImage"
                variant="dark"
              >
                <!-- Partner Badges -->
                <template #partners>
                  <div
                    class="flex items-center gap-4 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-xs"
                  >
                    <img
                      :src="logoDesaCantik"
                      alt="Logo Desa Cantik"
                      class="h-5 w-auto object-contain"
                    />
                    <div class="h-3 w-px bg-white/20" />
                    <img :src="logoBps" alt="Logo BPS" class="h-5 w-auto object-contain" />
                    <div class="h-3 w-px bg-white/20" />
                    <img :src="logoItk" alt="Logo ITK" class="h-5 w-auto object-contain" />
                    <div class="h-3 w-px bg-white/20" />
                    <img
                      :src="logoVyomatantra"
                      alt="Logo Vyomatantra"
                      class="h-4 w-auto object-contain"
                    />
                  </div>
                </template>

                <!-- CTA Actions -->
                <template #actions>
                  <router-link to="/mockup/stat-overview">
                    <BaseButton
                      variant="primary"
                      size="md"
                      label="Jelajahi Statistik"
                      class="shadow-md"
                    />
                  </router-link>
                  <router-link to="/mockup/huge-quote">
                    <BaseButton variant="secondary" size="md" label="Sambutan Lurah" />
                  </router-link>
                </template>
              </SectionHero>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Real Data Presets & Layout Variants -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span
            class="text-brand-indigo inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
          >
            🎨 Layout & Theme Variants
          </span>
          <h2 class="text-lg font-bold text-slate-900">Supported Themes & Alignments</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Adheres to <code class="text-brand-indigo font-mono">docs/UI_STYLE_GUIDE.md</code>:
            Brand Navy, Center Alignment, and Clean Light.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <!-- Preset 1: Centered Brand Hero -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >1. Center-Aligned (<code class="text-brand-indigo font-mono">align="center"</code
                >)</span
              >
              <span class="text-slate-400">Institutional Center Layout</span>
            </div>
            <div class="rounded-card overflow-hidden shadow-md">
              <SectionHero
                align="center"
                eyebrow="Kelurahan Manggar • Balikpapan Timur"
                title="Sistem Informasi Data Terpadu"
                description="Menyajikan keterbukaan data kependudukan dan sarana publik untuk warga."
                :background-image="bgHeroImage"
                min-height-class="min-h-[380px]"
              >
                <template #actions>
                  <BaseButton variant="primary" size="md" label="Buka Peta Tematik" />
                </template>
              </SectionHero>
            </div>
          </div>

          <!-- Preset 2: Clean Light Theme -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >2. Clean Light (<code class="text-brand-indigo font-mono">variant="light"</code
                >)</span
              >
              <span class="text-slate-400">Light Portal Theme</span>
            </div>
            <div class="rounded-card overflow-hidden border border-slate-200 shadow-xs">
              <SectionHero
                variant="light"
                eyebrow="Portal Data Resmi"
                title="Transparansi Informasi Wilayah"
                description="Akses mudah data statistik masyarakat terpadu secara real-time."
                description-highlight="MANGGAR SATU DATA"
                min-height-class="min-h-[380px]"
              >
                <template #actions>
                  <BaseButton variant="primary" size="md" label="Unduh Publikasi" />
                </template>
              </SectionHero>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 3: Interactive Component Playground -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span
            class="text-brand-indigo inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
          >
            ⚡ Interactive Component Tester
          </span>
          <h2 class="text-lg font-bold text-slate-900">Live Dynamic Playground</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Dynamically customize eyebrow text, main title, description prose, highlighted lead
            word, alignment, and background style in real time.
          </p>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- Controls Panel -->
          <div
            class="rounded-card space-y-5 border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-5"
          >
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-slate-800">Configuration</h3>
              <button
                type="button"
                class="rounded-btn border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                @click="resetToDefault"
              >
                Reset Default
              </button>
            </div>

            <div class="space-y-3">
              <div>
                <label
                  for="input-hero-eyebrow"
                  class="mb-1 block text-xs font-medium text-slate-600"
                >
                  Eyebrow Text (Tagline)
                </label>
                <input
                  id="input-hero-eyebrow"
                  v-model="playgroundEyebrow"
                  type="text"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label for="input-hero-title" class="mb-1 block text-xs font-medium text-slate-600">
                  Main Title (&lt;h1&gt;) <span class="text-rose-500">*</span>
                </label>
                <input
                  id="input-hero-title"
                  v-model="playgroundTitle"
                  type="text"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  for="input-hero-highlight"
                  class="mb-1 block text-xs font-medium text-slate-600"
                >
                  Highlighted Lead Word
                </label>
                <input
                  id="input-hero-highlight"
                  v-model="playgroundHighlight"
                  type="text"
                  placeholder="SIDATA"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label for="input-hero-desc" class="mb-1 block text-xs font-medium text-slate-600">
                  Description Prose
                </label>
                <textarea
                  id="input-hero-desc"
                  v-model="playgroundDescription"
                  rows="3"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <!-- Alignment & Variant -->
            <div class="space-y-3 border-t border-slate-200 pt-4">
              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-600">Alignment</label>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="rounded-btn flex-1 border px-2 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      playgroundAlign === 'left'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundAlign = 'left'"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    class="rounded-btn flex-1 border px-2 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      playgroundAlign === 'center'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundAlign = 'center'"
                  >
                    Center
                  </button>
                </div>
              </div>

              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-600"
                  >Visual Variant</label
                >
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      playgroundVariant === 'dark'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundVariant = 'dark'"
                  >
                    Dark Overlay
                  </button>
                  <button
                    type="button"
                    class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      playgroundVariant === 'light'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundVariant = 'light'"
                  >
                    Clean Light
                  </button>
                </div>
              </div>
            </div>

            <!-- Toggles & Background -->
            <div class="space-y-3 border-t border-slate-200 pt-4">
              <div class="flex items-center justify-between">
                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input
                    v-model="playgroundShowCta"
                    type="checkbox"
                    class="text-brand-navy focus:ring-brand-navy rounded"
                  />
                  Tampilkan Tombol CTA
                </label>
                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input
                    v-model="playgroundShowPartners"
                    type="checkbox"
                    class="text-brand-navy focus:ring-brand-navy rounded"
                  />
                  Tampilkan Badge Mitra
                </label>
              </div>

              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-600"
                  >Background Canvas</label
                >
                <div class="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    class="rounded-btn border px-2 py-1 text-xs font-medium transition-colors"
                    :class="
                      playgroundBgMode === 'image'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundBgMode = 'image'"
                  >
                    Foto Hero
                  </button>
                  <button
                    type="button"
                    class="rounded-btn border px-2 py-1 text-xs font-medium transition-colors"
                    :class="
                      playgroundBgMode === 'dark'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundBgMode = 'dark'"
                  >
                    Slate Dark
                  </button>
                  <button
                    type="button"
                    class="rounded-btn border px-2 py-1 text-xs font-medium transition-colors"
                    :class="
                      playgroundBgMode === 'neutral'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundBgMode = 'neutral'"
                  >
                    Neutral Light
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Live Output Preview & Code Snippet -->
          <div class="space-y-6 lg:col-span-7">
            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700">Live Rendered Component</span>
                <span class="text-xs text-slate-400">Updates reactively</span>
              </div>

              <!-- Preview Canvas Area -->
              <div class="overflow-hidden rounded-2xl shadow-lg">
                <SectionHero
                  :eyebrow="playgroundEyebrow"
                  :title="playgroundTitle"
                  :description="playgroundDescription"
                  :description-highlight="playgroundHighlight"
                  :align="playgroundAlign"
                  :variant="playgroundVariant"
                  :background-image="computedBgImage"
                  min-height-class="min-h-[460px]"
                >
                  <template v-if="playgroundShowPartners" #partners>
                    <div
                      class="flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-3 py-1 backdrop-blur-xs"
                    >
                      <img
                        :src="logoDesaCantik"
                        alt="Logo Desa Cantik"
                        class="h-4 w-auto object-contain"
                      />
                      <div class="h-3 w-px bg-white/20" />
                      <img :src="logoBps" alt="Logo BPS" class="h-4 w-auto object-contain" />
                      <div class="h-3 w-px bg-white/20" />
                      <img :src="logoItk" alt="Logo ITK" class="h-4 w-auto object-contain" />
                      <div class="h-3 w-px bg-white/20" />
                      <img
                        :src="logoVyomatantra"
                        alt="Logo Vyomatantra"
                        class="h-3.5 w-auto object-contain"
                      />
                    </div>
                  </template>

                  <template v-if="playgroundShowCta" #actions>
                    <BaseButton variant="primary" size="md" label="Jelajahi Statistik" />
                    <BaseButton variant="secondary" size="md" label="Peta Wilayah Manggar" />
                  </template>
                </SectionHero>
              </div>
            </div>

            <!-- Dynamic SFC Code Snippet -->
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700">Vue SFC Usage Snippet</span>
                <span class="font-mono text-xs text-slate-400">Vue 3 + &lt;script setup&gt;</span>
              </div>
              <pre
                class="rounded-card overflow-x-auto bg-slate-900 p-4 text-xs text-slate-200"
              ><code>{{ generatedSnippet }}</code></pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
