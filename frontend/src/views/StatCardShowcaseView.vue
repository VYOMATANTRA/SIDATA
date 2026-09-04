<script setup lang="ts">
import { ref, computed } from 'vue';
import StatCard, { type StatItem } from '@/components/common/StatCard.vue';
import bgHeroImage from '@/assets/img/background_laman_depan_kelurahan.png';

// Section 1: Exact Figma Default Stats
const figmaStats: StatItem[] = [
  { icon: 'person', value: '53.098', label: 'Penduduk' },
  { icon: 'house', value: '100', label: 'Rukun Tetangga' },
  { icon: 'density', value: '2 jiwa/km²', label: 'Kepadatan\nPenduduk' },
  { icon: 'ratio', value: '1,06 : 1', label: 'Rasio Laki-laki &\nPerempuan' },
];

// Playground State
const playgroundVariant = ref<'dark' | 'glass' | 'navy' | 'light'>('dark');
const playgroundBgMode = ref<'neutral' | 'image'>('image');

const editableStats = ref<StatItem[]>([
  { icon: 'person', value: '53.098', label: 'Penduduk' },
  { icon: 'house', value: '100', label: 'Rukun Tetangga' },
  { icon: 'density', value: '2 jiwa/km²', label: 'Kepadatan Penduduk' },
  { icon: 'ratio', value: '1,06 : 1', label: 'Rasio Laki-laki & Perempuan' },
]);

const iconChoices = [
  { label: '👤 Penduduk (Person)', value: 'person' },
  { label: '🏠 Rukun Tetangga (House)', value: 'house' },
  { label: '🚩 Kepadatan Wilayah (Map Flag)', value: 'density' },
  { label: '📊 Rasio / Gender (Pie Chart)', value: 'ratio' },
];

function addStat() {
  editableStats.value.push({
    icon: 'person',
    value: '1.250',
    label: 'Keluarga Sejahtera',
  });
}

function removeStat(index: number) {
  editableStats.value.splice(index, 1);
}

function resetToDefault() {
  editableStats.value = [
    { icon: 'person', value: '53.098', label: 'Penduduk' },
    { icon: 'house', value: '100', label: 'Rukun Tetangga' },
    { icon: 'density', value: '2 jiwa/km²', label: 'Kepadatan Penduduk' },
    { icon: 'ratio', value: '1,06 : 1', label: 'Rasio Laki-laki & Perempuan' },
  ];
}

const generatedSnippet = computed(() => {
  const parts = ['<StatCard'];
  if (playgroundVariant.value !== 'dark') {
    parts.push(`  variant="${playgroundVariant.value}"`);
  }
  parts.push('  :items="stats"');
  parts.push('/>');
  return parts.join('\n');
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <!-- Top Mockup Navigation Bar -->
    <header class="border-b border-slate-200 bg-white px-6 py-4 shadow-xs">
      <div class="mx-auto flex max-w-7xl items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-btn bg-brand-navy font-bold text-white">
            S
          </div>
          <div>
            <h1 class="text-base font-bold text-brand-navy">SIDATA Design System</h1>
            <p class="text-xs text-slate-500">Stat Card Component Specification & Verification</p>
          </div>
        </div>

        <!-- Navigation Tabs between Component Mockups -->
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
            class="rounded-btn border border-brand-navy bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            ❖ Stat Card
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
      <!-- Section 1: Exact Figma Spec Reproduction -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-violet uppercase tracking-wider">
              <span>❖</span> Figma Component Specification
            </span>
            <h2 class="text-lg font-bold text-slate-900">Demographic Key Statistics Card</h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Pixel-perfect reproduction of the Figma stat card slice: 4 demographic metrics with clean SVG icons, bold white values, and semantic description list (<code class="font-mono text-brand-indigo">&lt;dl&gt;/&lt;dt&gt;/&lt;dd&gt;</code>) per <code class="font-mono">docs/ACCESSIBILITY.md</code>.
            </p>
          </div>

          <span class="inline-block rounded-btn border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
            Figma Slice
          </span>
        </div>

        <!-- Component Display in Spec Box -->
        <div class="space-y-6">
          <div class="mx-auto max-w-3xl">
            <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-violet">
              <span>❖</span> StatCard (Default Variant: Dark Charcoal / Standalone)
            </div>

            <!-- Purple Dashed Figma Canvas -->
            <div class="rounded-card border-2 border-dashed border-brand-violet bg-slate-100/60 p-6 sm:p-8 shadow-xs">
              <StatCard :items="figmaStats" />
            </div>
          </div>

          <!-- Hero Background Context Preview -->
          <div class="mx-auto max-w-3xl">
            <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <span>🖼️</span> In Context: Hero Overlay Preview (over Landing Page Background)
            </div>

            <div
              class="relative overflow-hidden rounded-2xl p-8 sm:p-12 shadow-md flex items-center justify-center"
              :style="{
                backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.75), rgba(0, 27, 72, 0.85)), url(${bgHeroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            >
              <div class="w-full max-w-2xl">
                <StatCard :items="figmaStats" variant="dark" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Visual Style Variants -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-indigo uppercase tracking-wider">
            🎨 Design System Variants
          </span>
          <h2 class="text-lg font-bold text-slate-900">Supported Theme Variants</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Adheres to <code class="font-mono text-brand-indigo">docs/UI_STYLE_GUIDE.md §3.B</code> tokens: Dark, Glassmorphism (<code class="font-mono">bg-surface-glass</code>), Brand Navy, and Clean Light.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
          <!-- Variant 1: Dark Charcoal (Figma Original) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>1. Dark Charcoal (<code class="font-mono text-brand-indigo">variant="dark"</code>)</span>
              <span class="text-slate-400">Default Figma Slice</span>
            </div>
            <div class="rounded-card bg-slate-100 p-4">
              <StatCard :items="figmaStats" variant="dark" />
            </div>
          </div>

          <!-- Variant 2: Glassmorphism -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>2. Glassmorphism (<code class="font-mono text-brand-indigo">variant="glass"</code>)</span>
              <span class="text-slate-400">docs/UI_STYLE_GUIDE.md §3.B</span>
            </div>
            <div
              class="rounded-card p-4"
              :style="{
                backgroundImage: `linear-gradient(135deg, #0a2353, #112c71)`,
              }"
            >
              <StatCard :items="figmaStats" variant="glass" />
            </div>
          </div>

          <!-- Variant 3: Brand Navy -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>3. Brand Navy (<code class="font-mono text-brand-indigo">variant="navy"</code>)</span>
              <span class="text-slate-400">Brand Navy Token (#0a2353)</span>
            </div>
            <div class="rounded-card bg-slate-100 p-4">
              <StatCard :items="figmaStats" variant="navy" />
            </div>
          </div>

          <!-- Variant 4: Clean Light -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>4. Clean Light (<code class="font-mono text-brand-indigo">variant="light"</code>)</span>
              <span class="text-slate-400">Light section container</span>
            </div>
            <div class="rounded-card bg-slate-100 p-4">
              <StatCard :items="figmaStats" variant="light" />
            </div>
          </div>
        </div>
      </section>

      <!-- Section 3: Interactive Testing Playground -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-indigo">
            ⚡ Interactive Component Tester
          </span>
          <h2 class="text-lg font-bold text-slate-900">Live Dynamic Playground</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Customize figures, labels, and icons dynamically; switch background contexts; and preview responsive reflow.
          </p>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- Controls Panel -->
          <div class="space-y-5 rounded-card border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-5">
            <h3 class="text-sm font-semibold text-slate-800">Card Configuration</h3>

            <!-- Variant Selector -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Visual Variant</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="playgroundVariant === 'dark' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundVariant = 'dark'"
                >
                  Dark (Figma)
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="playgroundVariant === 'glass' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundVariant = 'glass'"
                >
                  Glassmorphism
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="playgroundVariant === 'navy' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundVariant = 'navy'"
                >
                  Brand Navy
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="playgroundVariant === 'light' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundVariant = 'light'"
                >
                  Clean Light
                </button>
              </div>
            </div>

            <!-- Background Mode Selector -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Preview Background</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="playgroundBgMode === 'image' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundBgMode = 'image'"
                >
                  Hero Image
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="playgroundBgMode === 'neutral' ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  @click="playgroundBgMode = 'neutral'"
                >
                  Neutral Grey
                </button>
              </div>
            </div>

            <!-- Items Editor List -->
            <div class="border-t border-slate-200 pt-4">
              <div class="mb-2.5 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-800">
                  Statistik Items ({{ editableStats.length }})
                </span>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="rounded-btn border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    @click="resetToDefault"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    class="rounded-btn bg-brand-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-navy-deep transition-colors"
                    @click="addStat"
                  >
                    + Tambah
                  </button>
                </div>
              </div>

              <div class="max-h-72 space-y-3 overflow-y-auto pr-1">
                <div
                  v-for="(item, idx) in editableStats"
                  :key="idx"
                  class="space-y-2 rounded-btn border border-slate-200 bg-white p-3 text-xs shadow-2xs"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-slate-700">Item {{ idx + 1 }}</span>
                    <button
                      type="button"
                      class="text-slate-400 hover:text-rose-600"
                      title="Hapus"
                      @click="removeStat(idx)"
                    >
                      &times; Hapus
                    </button>
                  </div>

                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="block text-[11px] text-slate-500">Nilai (Value)</label>
                      <input
                        v-model="item.value"
                        type="text"
                        class="w-full rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-navy"
                      />
                    </div>
                    <div>
                      <label class="block text-[11px] text-slate-500">Ikon</label>
                      <select
                        v-model="item.icon"
                        class="w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-900 focus:outline-none focus:border-brand-navy"
                      >
                        <option v-for="opt in iconChoices" :key="opt.value" :value="opt.value">
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label class="block text-[11px] text-slate-500">Keterangan (Label)</label>
                    <input
                      v-model="item.label"
                      type="text"
                      class="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-brand-navy"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Live Output Preview -->
          <div class="space-y-6 lg:col-span-7">
            <div>
              <span class="mb-2 block text-xs font-semibold text-slate-700">Preview Komponen Langsung</span>
              <div
                class="rounded-2xl p-6 sm:p-10 transition-all flex items-center justify-center"
                :class="playgroundBgMode === 'image' ? 'shadow-lg' : 'bg-slate-100'"
                :style="playgroundBgMode === 'image' ? {
                  backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.75), rgba(0, 27, 72, 0.85)), url(${bgHeroImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                } : {}"
              >
                <div class="w-full max-w-2xl">
                  <StatCard :items="editableStats" :variant="playgroundVariant" />
                </div>
              </div>
            </div>

            <!-- Code Snippet -->
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700">Vue SFC Usage Snippet</span>
              </div>
              <pre class="overflow-x-auto rounded-card bg-slate-900 p-4 text-xs text-slate-200"><code>{{ generatedSnippet }}</code></pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
