<script setup lang="ts">
import { ref, computed } from 'vue';
import AppFooter from '../components/common/AppFooter.vue';

// Playground State
const playgroundYear = ref(2026);
const playgroundPhone = ref('(0542) 772158');
const playgroundAddress = ref([
  'Kantor Kelurahan Manggar',
  'Jl. Mulawarman No. 1, RT 39',
  'Kelurahan Manggar, Kecamatan Balikpapan Timur',
  'Kota Balikpapan, Kalimantan Timur, 76116',
]);

const addressInput = ref(playgroundAddress.value.join('\n'));

function updateAddress() {
  playgroundAddress.value = addressInput.value.split('\n').filter((l) => l.trim().length > 0);
}

const activePreviewMode = ref<'desktop' | 'tablet' | 'mobile'>('desktop');

const generatedSnippet = computed(() => {
  const parts = ['<AppFooter'];
  if (playgroundYear.value !== 2026) {
    parts.push(`  :year="${playgroundYear.value}"`);
  }
  if (playgroundPhone.value !== '(0542) 772158') {
    parts.push(`  phone="${playgroundPhone.value}"`);
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
          <div class="flex h-9 w-9 items-center justify-center rounded-btn bg-brand-navy font-bold text-white">
            S
          </div>
          <div>
            <h1 class="text-base font-bold text-brand-navy">SIDATA Design System</h1>
            <p class="text-xs text-slate-500">Footer Component Specification & Verification</p>
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
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ❖ Navbar
          </router-link>
          <router-link
            to="/mockup/footer"
            class="rounded-btn border border-brand-navy bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition-colors"
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
            to="/"
            class="rounded-btn border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            ← Beranda
          </router-link>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-8 space-y-12 sm:px-6 sm:py-10">
      <!-- Section 1: Exact Mobile Spec Matrix matching Figma -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <!-- Top Badge -->
        <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-violet uppercase tracking-wider">
              <span>❖</span> Mobile Viewport Specification (412px)
            </span>
            <h2 class="text-lg font-bold text-slate-900">Mobile Layout & Spacing Spec</h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Exact representation of the Figma mobile footer frame, verified with all 7 partner and program assets.
            </p>
          </div>
          <span class="inline-block rounded-btn border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
            Footers
          </span>
        </div>

        <!-- Figma Component Container (❖ Footer) -->
        <div class="mx-auto max-w-lg">
          <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-violet">
            <span>❖</span> Footer (Mobile)
          </div>

          <!-- Purple Dashed Box matching Figma Spec -->
          <div class="rounded-card border-2 border-dashed border-brand-violet bg-slate-100 p-4 sm:p-6 shadow-xs">
            <!-- Simulated Mobile Device Frame (412px) -->
            <div class="mx-auto max-w-[412px] overflow-hidden rounded-xl border border-slate-700 shadow-2xl">
              <AppFooter />
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Desktop Layout Specification -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-indigo uppercase tracking-wider">
            🖥️ Desktop Viewport Specification
          </span>
          <h2 class="text-lg font-bold text-slate-900">Desktop 12-Column Responsive Layout</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Full-width expanded layout with 4-column brand address section, 3 distinct link groups, inline SDG badges, and horizontal collaboration logos.
          </p>
        </div>

        <div class="overflow-hidden rounded-xl border border-slate-200/80 shadow-md">
          <AppFooter />
        </div>
      </section>

      <!-- Section 3: Interactive Testing Playground -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-indigo">
            ⚡ Interactive Testing Playground
          </span>
          <h2 class="text-lg font-bold text-slate-900">Live Component Tester</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Customize footer props, switch between desktop, tablet, and mobile previews, and inspect responsiveness.
          </p>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- Controls Panel -->
          <div class="space-y-4 rounded-card border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-4">
            <h3 class="text-sm font-semibold text-slate-800">Footer Properties</h3>

            <!-- Viewport Switcher -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Preview Viewport</label>
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="activePreviewMode === 'desktop' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="activePreviewMode = 'desktop'"
                >
                  Desktop
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="activePreviewMode === 'tablet' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="activePreviewMode = 'tablet'"
                >
                  Tablet (800px)
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="activePreviewMode === 'mobile' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="activePreviewMode = 'mobile'"
                >
                  Mobile (412px)
                </button>
              </div>
            </div>

            <!-- Phone Input -->
            <div>
              <label for="footer-phone-input" class="mb-1 block text-xs font-medium text-slate-600">
                Telephone Contact
              </label>
              <input
                id="footer-phone-input"
                v-model="playgroundPhone"
                type="text"
                class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
              />
            </div>

            <!-- Copyright Year Input -->
            <div>
              <label for="footer-year-input" class="mb-1 block text-xs font-medium text-slate-600">
                Copyright Year
              </label>
              <input
                id="footer-year-input"
                v-model.number="playgroundYear"
                type="number"
                class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
              />
            </div>

            <!-- Address Lines Input -->
            <div>
              <label for="footer-address-input" class="mb-1 block text-xs font-medium text-slate-600">
                Address Lines (one per row)
              </label>
              <textarea
                id="footer-address-input"
                v-model="addressInput"
                rows="4"
                class="w-full rounded-btn border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
                @input="updateAddress"
              />
            </div>
          </div>

          <!-- Live Output Preview & Code Snippet -->
          <div class="space-y-6 lg:col-span-8">
            <!-- Canvas Preview -->
            <div
              class="overflow-hidden rounded-card border border-slate-200/80 bg-slate-100 p-4 transition-colors"
            >
              <div
                class="mx-auto overflow-hidden rounded-xl shadow-lg transition-all duration-300"
                :class="{
                  'max-w-[412px]': activePreviewMode === 'mobile',
                  'max-w-[800px]': activePreviewMode === 'tablet',
                  'w-full': activePreviewMode === 'desktop',
                }"
              >
                <AppFooter
                  :year="playgroundYear"
                  :phone="playgroundPhone"
                  :address-lines="playgroundAddress"
                />
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
