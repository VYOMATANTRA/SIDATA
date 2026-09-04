<script setup lang="ts">
import { ref, computed } from 'vue';
import StatOverview from '@/components/common/StatOverview.vue';
import type { StatItem } from '@/components/common/StatCard.vue';
import bgHeroImage from '@/assets/img/background_laman_depan_kelurahan.png';

// Section 1: Exact Figma Default Data
const figmaTitle = 'Statistics Type';
const figmaDescription =
  'Here, you’ll explain what will user found when looking for this statistics type.';

const figmaStats: StatItem[] = [
  { icon: 'person', value: '53.098', label: 'Penduduk' },
  { icon: 'house', value: '100', label: 'Rukun Tetangga' },
  { icon: 'density', value: '2 jiwa/km²', label: 'Kepadatan\nPenduduk' },
  { icon: 'ratio', value: '1,06 : 1', label: 'Rasio Laki-laki &\nPerempuan' },
];

// Preset real chapter: Demografi Penduduk
const demographicStats: StatItem[] = [
  { icon: 'person', value: '53.098', label: 'Total Penduduk Terdata' },
  { icon: 'house', value: '100', label: 'Rukun Tetangga (RT)' },
  { icon: 'density', value: '2 jiwa/km²', label: 'Kepadatan Penduduk' },
  { icon: 'ratio', value: '1,06 : 1', label: 'Rasio Jenis Kelamin' },
];

// Preset real chapter: Fasilitas & Prasarana
const facilityStats: StatItem[] = [
  { icon: 'house', value: '14', label: 'Posyandu Aktif' },
  { icon: 'person', value: '8', label: 'Sarana Pendidikan' },
  { icon: 'density', value: '5', label: 'Taman & RTH' },
  { icon: 'ratio', value: '100%', label: 'Cakupan Layanan' },
];

// Interactive Playground State
const playgroundTitle = ref('Statistics Type');
const playgroundDescription = ref(
  'Here, you’ll explain what will user found when looking for this statistics type.',
);
const playgroundEyebrow = ref('');
const playgroundButtonLabel = ref('Lihat selengkapnya');
const playgroundTo = ref('/mockup/stat-card');
const playgroundVariant = ref<'dark' | 'glass' | 'navy' | 'light'>('dark');
const playgroundAlign = ref<'left' | 'center'>('left');
const playgroundHeadingTag = ref<'h1' | 'h2' | 'h3'>('h2');
const playgroundShowButton = ref(true);
const playgroundBgMode = ref<'image' | 'dark' | 'neutral'>('image');

const editableStats = ref<StatItem[]>([
  { icon: 'person', value: '53.098', label: 'Penduduk' },
  { icon: 'house', value: '100', label: 'Rukun Tetangga' },
  { icon: 'density', value: '2 jiwa/km²', label: 'Kepadatan Penduduk' },
  { icon: 'ratio', value: '1,06 : 1', label: 'Rasio Laki-laki & Perempuan' },
]);

const iconChoices = [
  { label: '👤 Penduduk (Person)', value: 'person' },
  { label: '🏠 Rukun Tetangga (House)', value: 'house' },
  { label: '🚩 Kepadatan Wilayah (Density)', value: 'density' },
  { label: '📊 Rasio / Gender (Ratio)', value: 'ratio' },
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
  playgroundTitle.value = 'Statistics Type';
  playgroundDescription.value =
    'Here, you’ll explain what will user found when looking for this statistics type.';
  playgroundEyebrow.value = '';
  playgroundButtonLabel.value = 'Lihat selengkapnya';
  playgroundTo.value = '/mockup/stat-card';
  playgroundVariant.value = 'dark';
  playgroundAlign.value = 'left';
  playgroundHeadingTag.value = 'h2';
  playgroundShowButton.value = true;
  playgroundBgMode.value = 'image';
  editableStats.value = [
    { icon: 'person', value: '53.098', label: 'Penduduk' },
    { icon: 'house', value: '100', label: 'Rukun Tetangga' },
    { icon: 'density', value: '2 jiwa/km²', label: 'Kepadatan Penduduk' },
    { icon: 'ratio', value: '1,06 : 1', label: 'Rasio Laki-laki & Perempuan' },
  ];
}

const generatedSnippet = computed(() => {
  const parts = ['<StatOverview'];
  parts.push(`  title="${playgroundTitle.value}"`);
  if (playgroundDescription.value) {
    parts.push(`  description="${playgroundDescription.value}"`);
  }
  if (playgroundEyebrow.value) {
    parts.push(`  eyebrow="${playgroundEyebrow.value}"`);
  }
  if (playgroundVariant.value !== 'dark') {
    parts.push(`  cardVariant="${playgroundVariant.value}"`);
  }
  if (playgroundAlign.value !== 'left') {
    parts.push(`  align="${playgroundAlign.value}"`);
  }
  if (playgroundHeadingTag.value !== 'h2') {
    parts.push(`  headingTag="${playgroundHeadingTag.value}"`);
  }
  if (playgroundButtonLabel.value !== 'Lihat selengkapnya') {
    parts.push(`  buttonLabel="${playgroundButtonLabel.value}"`);
  }
  if (playgroundTo.value) {
    parts.push(`  to="${playgroundTo.value}"`);
  }
  if (!playgroundShowButton.value) {
    parts.push('  :showButton="false"');
  }
  parts.push('  :stats="stats"');
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
          <div
            class="rounded-btn bg-brand-navy flex h-9 w-9 items-center justify-center font-bold text-white"
          >
            S
          </div>
          <div>
            <h1 class="text-brand-navy text-base font-bold">SIDATA Design System</h1>
            <p class="text-xs text-slate-500">
              StatOverview Composite Block Specification & Verification
            </p>
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
            class="rounded-btn border-brand-navy bg-brand-navy border px-3 py-1.5 text-xs font-medium text-white transition-colors"
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
            <h2 class="text-lg font-bold text-slate-900">Composite StatOverview Block</h2>
            <p class="mt-0.5 text-xs text-slate-500">
              Pixel-perfect implementation of the Figma composite component: encapsulates
              <code class="text-brand-indigo font-mono">SectionTextArea</code>,
              <code class="text-brand-indigo font-mono">StatCard</code>, and
              <code class="text-brand-indigo font-mono">BaseButton</code> with responsive layout and
              semantic markup adhering to <code class="font-mono">docs/ACCESSIBILITY.md</code> and
              <code class="font-mono">frontend/src/assets/main.css</code>.
            </p>
          </div>

          <span
            class="rounded-btn inline-block border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs"
          >
            Figma Composite Slice
          </span>
        </div>

        <div class="space-y-8">
          <!-- In Context: Hero Overlay Preview (Matching Figma Screenshot) -->
          <div>
            <div class="mb-2.5 flex items-center justify-between">
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <span>🖼️</span> In Context: Hero Overlay Section (Exact Figma Appearance)
              </span>
              <span class="text-xs text-slate-400"
                >Dark Hero Background + Translucent Card + Brand Navy CTA</span
              >
            </div>

            <div
              class="relative flex items-center justify-start overflow-hidden rounded-2xl p-6 shadow-lg sm:p-12 md:p-14"
              :style="{
                backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.82), rgba(0, 27, 72, 0.90)), url(${bgHeroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            >
              <StatOverview
                :title="figmaTitle"
                :description="figmaDescription"
                :stats="figmaStats"
                button-label="Lihat selengkapnya"
                to="/mockup/stat-card"
                card-variant="dark"
              />
            </div>
          </div>

          <!-- Standalone Canvas Box -->
          <div>
            <div class="mb-2.5 flex items-center justify-between">
              <span
                class="text-brand-violet inline-flex items-center gap-1.5 text-xs font-semibold"
              >
                <span>❖</span> Standalone Component Canvas (Dashed Figma Frame)
              </span>
              <span class="text-xs text-slate-400">Neutral Dark Canvas Preview</span>
            </div>

            <div
              class="rounded-card border-brand-violet border-2 border-dashed bg-[#1e232d] p-6 shadow-xs sm:p-10"
            >
              <StatOverview
                :title="figmaTitle"
                :description="figmaDescription"
                :stats="figmaStats"
                button-label="Lihat selengkapnya"
                to="/mockup/stat-card"
                card-variant="dark"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Real Data Chapter Presets & Style Variants -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span
            class="text-brand-indigo inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
          >
            🎨 Design System Presets & Theme Variants
          </span>
          <h2 class="text-lg font-bold text-slate-900">Supported Theme Variants & Real Chapters</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Adheres to
            <code class="text-brand-indigo font-mono">docs/UI_STYLE_GUIDE.md §3.B</code> tokens:
            Dark Charcoal, Glassmorphism (<code class="font-mono">bg-surface-glass</code>), Brand
            Navy, and Clean Light.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <!-- Preset 1: Demografi Penduduk (Figma Charcoal) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >1. Demografi Penduduk (<code class="text-brand-indigo font-mono"
                  >cardVariant="dark"</code
                >)</span
              >
              <span class="text-slate-400">Kelurahan Manggar Data</span>
            </div>
            <div
              class="rounded-card p-6 shadow-md"
              :style="{
                backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.85), rgba(0, 27, 72, 0.92)), url(${bgHeroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            >
              <StatOverview
                eyebrow="01 / Demografi"
                title="Demografi Penduduk"
                description="Komposisi dan kepadatan penduduk, keluarga, persebaran rasio jenis kelamin, dan statistik kependudukan wilayah Kelurahan Manggar."
                :stats="demographicStats"
                button-label="Lihat Data Kependudukan"
                to="/mockup/stat-card"
                card-variant="dark"
              />
            </div>
          </div>

          <!-- Preset 2: Glassmorphism Variant -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >2. Fasilitas Wilayah (<code class="text-brand-indigo font-mono"
                  >cardVariant="glass"</code
                >)</span
              >
              <span class="text-slate-400">Glassmorphism Token</span>
            </div>
            <div
              class="rounded-card p-6 shadow-md"
              :style="{
                backgroundImage: `linear-gradient(135deg, #0a2353 0%, #112c71 100%)`,
              }"
            >
              <StatOverview
                eyebrow="02 / Sarana Prasarana"
                title="Fasilitas & Layanan Publik"
                description="Persebaran sarana posyandu, pos kamling, sekolah, dan fasilitas umum masyarakat terdata di Kelurahan Manggar."
                :stats="facilityStats"
                button-label="Eksplor Fasilitas"
                to="/mockup/stat-card"
                card-variant="glass"
              />
            </div>
          </div>

          <!-- Preset 3: Brand Navy Variant -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >3. Brand Navy (<code class="text-brand-indigo font-mono">cardVariant="navy"</code
                >)</span
              >
              <span class="text-slate-400">Brand Navy Token (#0a2353)</span>
            </div>
            <div class="rounded-card bg-slate-900 p-6 shadow-md">
              <StatOverview
                eyebrow="03 / Tata Kelola"
                title="Struktur Rukun Tetangga"
                description="Informasi kepengurusan 100 RT aktif di Kelurahan Manggar, kontak pengurus, dan cakupan wilayah administrasi."
                :stats="figmaStats"
                button-label="Daftar Ketua RT"
                to="/mockup/stat-card"
                card-variant="navy"
              />
            </div>
          </div>

          <!-- Preset 4: Clean Light Theme -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >4. Clean Light Theme (<code class="text-brand-indigo font-mono"
                  >cardVariant="light"</code
                >)</span
              >
              <span class="text-slate-400">Light section container</span>
            </div>
            <div class="rounded-card border border-slate-200 bg-slate-100/70 p-6 shadow-xs">
              <StatOverview
                eyebrow="04 / Informasi Publik"
                title="Statistik Transparansi"
                description="Layanan data terbuka kelurahan untuk transparansi informasi publik masyarakat Balikpapan Timur."
                :stats="figmaStats"
                button-label="Lihat Informasi Terbuka"
                to="/mockup/stat-card"
                card-variant="light"
              />
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
            Customize section title, description paragraph, eyebrow tag, stat metrics, CTA
            destination, theme variant, and alignment in real-time.
          </p>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- Controls Panel -->
          <div
            class="rounded-card space-y-5 border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-5"
          >
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-slate-800">Section Configuration</h3>
              <button
                type="button"
                class="rounded-btn border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                @click="resetToDefault"
              >
                Reset Default
              </button>
            </div>

            <!-- Title & Eyebrow -->
            <div class="space-y-3">
              <div>
                <label for="input-eyebrow" class="mb-1 block text-xs font-medium text-slate-600">
                  Eyebrow / Supertitle (Optional)
                </label>
                <input
                  id="input-eyebrow"
                  v-model="playgroundEyebrow"
                  type="text"
                  placeholder="Contoh: 01 / Kependudukan"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label for="input-title" class="mb-1 block text-xs font-medium text-slate-600">
                  Section Title <span class="text-rose-500">*</span>
                </label>
                <input
                  id="input-title"
                  v-model="playgroundTitle"
                  type="text"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label for="input-desc" class="mb-1 block text-xs font-medium text-slate-600">
                  Section Description
                </label>
                <textarea
                  id="input-desc"
                  v-model="playgroundDescription"
                  rows="2"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <!-- Variant Selector -->
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Visual Variant</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundVariant === 'dark'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundVariant = 'dark'"
                >
                  Dark (Figma)
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundVariant === 'glass'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundVariant = 'glass'"
                >
                  Glassmorphism
                </button>
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
                  Brand Navy
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-3 py-1.5 text-xs font-medium transition-colors"
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

            <!-- Alignment & Heading Tag -->
            <div class="grid grid-cols-2 gap-3">
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
                <label
                  for="select-heading-tag"
                  class="mb-1.5 block text-xs font-medium text-slate-600"
                  >Heading Tag</label
                >
                <select
                  id="select-heading-tag"
                  v-model="playgroundHeadingTag"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none"
                >
                  <option value="h1">h1 (Hero Title)</option>
                  <option value="h2">h2 (Default Section)</option>
                  <option value="h3">h3 (Subsection)</option>
                </select>
              </div>
            </div>

            <!-- Button Options -->
            <div class="space-y-3 border-t border-slate-200 pt-4">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-800">Action Button</span>
                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input
                    v-model="playgroundShowButton"
                    type="checkbox"
                    class="text-brand-navy focus:ring-brand-navy rounded"
                  />
                  Tampilkan Tombol
                </label>
              </div>

              <div v-if="playgroundShowButton" class="grid grid-cols-2 gap-2">
                <div>
                  <label for="input-btn-label" class="mb-0.5 block text-[11px] text-slate-500"
                    >Label Tombol</label
                  >
                  <input
                    id="input-btn-label"
                    v-model="playgroundButtonLabel"
                    type="text"
                    class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label for="input-btn-to" class="mb-0.5 block text-[11px] text-slate-500"
                    >Destination Route</label
                  >
                  <input
                    id="input-btn-to"
                    v-model="playgroundTo"
                    type="text"
                    placeholder="/mockup/..."
                    class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <!-- Preview Canvas Background Mode -->
            <div class="border-t border-slate-200 pt-4">
              <label class="mb-1.5 block text-xs font-medium text-slate-600"
                >Preview Canvas Background</label
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
                  Hero Image
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
                  Light Canvas
                </button>
              </div>
            </div>

            <!-- Stats Items Editor -->
            <div class="border-t border-slate-200 pt-4">
              <div class="mb-2.5 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-800">
                  Statistik Items ({{ editableStats.length }})
                </span>
                <button
                  type="button"
                  class="rounded-btn bg-brand-navy hover:bg-brand-navy-deep px-2.5 py-1 text-xs font-medium text-white transition-colors"
                  @click="addStat"
                >
                  + Tambah Item
                </button>
              </div>

              <div class="max-h-60 space-y-2.5 overflow-y-auto pr-1">
                <div
                  v-for="(item, idx) in editableStats"
                  :key="idx"
                  class="rounded-btn space-y-2 border border-slate-200 bg-white p-2.5 text-xs shadow-2xs"
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
                      <label class="block text-[10px] text-slate-500">Nilai (Value)</label>
                      <input
                        v-model="item.value"
                        type="text"
                        class="focus:border-brand-navy w-full rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] text-slate-500">Ikon</label>
                      <select
                        v-model="item.icon"
                        class="focus:border-brand-navy w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-900 focus:outline-none"
                      >
                        <option v-for="opt in iconChoices" :key="opt.value" :value="opt.value">
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label class="block text-[10px] text-slate-500">Keterangan (Label)</label>
                    <input
                      v-model="item.label"
                      type="text"
                      class="focus:border-brand-navy w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:outline-none"
                    />
                  </div>
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
              <div
                class="flex min-h-[380px] items-center justify-center rounded-2xl p-6 transition-all sm:p-10"
                :class="[
                  playgroundBgMode === 'image'
                    ? 'shadow-lg'
                    : playgroundBgMode === 'dark'
                      ? 'bg-slate-900 shadow-md'
                      : 'border border-slate-200 bg-slate-100 shadow-inner',
                ]"
                :style="
                  playgroundBgMode === 'image'
                    ? {
                        backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.82), rgba(0, 27, 72, 0.90)), url(${bgHeroImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : {}
                "
              >
                <div class="w-full max-w-3xl">
                  <StatOverview
                    :title="playgroundTitle"
                    :description="playgroundDescription"
                    :eyebrow="playgroundEyebrow"
                    :stats="editableStats"
                    :card-variant="playgroundVariant"
                    :align="playgroundAlign"
                    :heading-tag="playgroundHeadingTag"
                    :button-label="playgroundButtonLabel"
                    :to="playgroundTo"
                    :show-button="playgroundShowButton"
                  />
                </div>
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
