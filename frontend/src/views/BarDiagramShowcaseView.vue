<script setup lang="ts">
import { ref, computed } from 'vue';
import BarDiagram, { type BarDiagramItem } from '@/components/common/BarDiagram.vue';

// --- Section 1: Exact Figma Spec Data ---
const figmaRealItems: BarDiagramItem[] = [
  { label: 'Tamat SD', value: 3420 },
  { label: 'Tamat SLTA (SMA)', value: 2680 },
  { label: 'Tamat SMP', value: 1890 },
  { label: 'Tamat Perguruan Tinggi', value: 1120 },
];

const figmaDataMode = ref<'zero' | 'real'>('real');

const figmaDisplayedItems = computed(() => {
  if (figmaDataMode.value === 'zero') {
    return [
      { label: 'Tamat SD', value: 100, formattedValue: '0' },
      { label: 'Tamat SLTA (SMA)', value: 78, formattedValue: '0' },
      { label: 'Tamat SMP', value: 55, formattedValue: '0' },
      { label: 'Tamat Perguruan Tinggi', value: 35, formattedValue: '0' },
    ];
  }
  return figmaRealItems;
});

// --- Section 2: CMS Playground State ---
const cmsTitle = ref('Tingkat Pendidikan Penduduk');
const cmsUnit = ref('jiwa');
const cmsCustomMax = ref<number | undefined>(undefined);
const cmsUseCustomMax = ref(false);
const cmsShowValues = ref(true);
const cmsFormatNumbers = ref(true);
const cmsLoading = ref(false);
const cmsSelectedColor = ref('bg-brand-navy');

const colorOptions = [
  { label: 'Brand Navy (Default)', value: 'bg-brand-navy' },
  { label: 'Brand Indigo', value: 'bg-brand-indigo' },
  { label: 'Brand Violet', value: 'bg-brand-violet' },
  { label: 'Deep Blue', value: 'bg-brand-navy-deep' },
  { label: 'Emerald / Green', value: 'bg-emerald-600' },
  { label: 'Amber / Orange', value: 'bg-amber-500' },
];

const cmsItems = ref<BarDiagramItem[]>([
  { label: 'Tamat SD', value: 3420 },
  { label: 'Tamat SLTA (SMA)', value: 2680 },
  { label: 'Tamat SMP', value: 1890 },
  { label: 'Tamat Perguruan Tinggi', value: 1120 },
]);

function addItem() {
  const count = cmsItems.value.length + 1;
  cmsItems.value.push({
    label: `Kategori Baru ${count}`,
    value: 500,
  });
}

function removeItem(index: number) {
  cmsItems.value.splice(index, 1);
}

function resetToEducation() {
  cmsTitle.value = 'Tingkat Pendidikan Penduduk';
  cmsUnit.value = 'jiwa';
  cmsItems.value = [
    { label: 'Tamat SD', value: 3420 },
    { label: 'Tamat SLTA (SMA)', value: 2680 },
    { label: 'Tamat SMP', value: 1890 },
    { label: 'Tamat Perguruan Tinggi', value: 1120 },
  ];
  cmsUseCustomMax.value = false;
  cmsCustomMax.value = undefined;
}

function loadImmunizationPreset() {
  cmsTitle.value = 'Cakupan Imunisasi Balita';
  cmsUnit.value = '%';
  cmsUseCustomMax.value = true;
  cmsCustomMax.value = 100;
  cmsItems.value = [
    { label: 'Imunisasi Polio', value: 94 },
    { label: 'Imunisasi BCG', value: 89 },
    { label: 'Imunisasi Campak / MR', value: 82 },
    { label: 'Imunisasi DPT-HB-Hib', value: 76 },
  ];
}

function loadWastePreset() {
  cmsTitle.value = 'Volume Pengelolaan Sampah Bulanan';
  cmsUnit.value = 'kg';
  cmsUseCustomMax.value = false;
  cmsCustomMax.value = undefined;
  cmsItems.value = [
    { label: 'Sampah Organik (Kompos)', value: 4500 },
    { label: 'Sampah Anorganik (Bank Sampah)', value: 2800 },
    { label: 'Sampah Residu (TPA)', value: 1950 },
    { label: 'Bahan Berbahaya / Elektronik', value: 320 },
  ];
}

const generatedSnippet = computed(() => {
  const parts = ['<BarDiagram', `  title="${cmsTitle.value}"`, '  :items="items"'];
  if (cmsUnit.value) {
    parts.push(`  unit="${cmsUnit.value}"`);
  }
  if (cmsUseCustomMax.value && cmsCustomMax.value) {
    parts.push(`  :max="${cmsCustomMax.value}"`);
  }
  if (!cmsShowValues.value) {
    parts.push('  :show-values="false"');
  }
  if (!cmsFormatNumbers.value) {
    parts.push('  :format-numbers="false"');
  }
  if (cmsSelectedColor.value !== 'bg-brand-navy') {
    parts.push(`  bar-color-class="${cmsSelectedColor.value}"`);
  }
  parts.push('/>');
  return parts.join('\n');
});

const dataJsonSnippet = computed(() => {
  return JSON.stringify(cmsItems.value, null, 2);
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
            <p class="text-xs text-slate-500">Bar Diagram Component Specification & CMS Dynamic Data</p>
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
            class="rounded-btn border border-brand-navy bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition-colors"
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
      <!-- Section 1: Exact Figma Component Reproduction -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-violet uppercase tracking-wider">
              <span>❖</span> Figma Component Specification
            </span>
            <h2 class="text-lg font-bold text-slate-900">Tingkat Pendidikan Penduduk Card</h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Pixel-perfect reproduction of the card design adhering to <code class="font-mono text-brand-indigo">main.css</code> tokens:
              <code class="font-mono">brand-navy (#0a2353)</code>, <code class="font-mono">rounded-card (12px)</code>, soft ice-blue track <code class="font-mono">(#ecf6f9)</code>, and custom report icon.
            </p>
          </div>

          <!-- Toggle between Raw Figma Wireframe (zeros) and Populated Real Data -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500">Mode:</span>
            <div class="inline-flex rounded-btn border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                class="rounded-btn px-2.5 py-1 font-medium transition-colors"
                :class="figmaDataMode === 'real' ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'"
                @click="figmaDataMode = 'real'"
              >
                Data Riil (3.420 jiwa)
              </button>
              <button
                type="button"
                class="rounded-btn px-2.5 py-1 font-medium transition-colors"
                :class="figmaDataMode === 'zero' ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'"
                @click="figmaDataMode = 'zero'"
              >
                Wireframe Figma (Nilai 0)
              </button>
            </div>
          </div>
        </div>

        <!-- Component Display in Spec Box -->
        <div class="mx-auto max-w-md">
          <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-violet">
            <span>❖</span> Bar Diagram (Card Container)
          </div>

          <!-- Purple Dashed Figma Canvas -->
          <div class="rounded-card border-2 border-dashed border-brand-violet bg-slate-100/60 p-6 shadow-xs">
            <BarDiagram
              title="Tingkat Pendidikan Penduduk"
              :items="figmaDisplayedItems"
              :unit="figmaDataMode === 'real' ? 'jiwa' : ''"
            />
          </div>
        </div>
      </section>

      <!-- Section 2: Interactive CMS Playground -->
      <section class="rounded-card border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
        <div class="mb-6 border-b border-slate-100 pb-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-indigo">
            ⚡ CMS Dynamic Data Simulator
          </span>
          <h2 class="text-lg font-bold text-slate-900">Live Dynamic Data Playground</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Simulate editing diagram titles, adding/removing dynamic categories, setting values, units, and custom scaling as would be entered through an administrative CMS.
          </p>
        </div>

        <!-- Presets Row -->
        <div class="mb-6 flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium text-slate-500">Muat Preset Cerita:</span>
          <button
            type="button"
            class="rounded-btn border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            @click="resetToEducation"
          >
            📚 Pendidikan (Pendidikan Chapter)
          </button>
          <button
            type="button"
            class="rounded-btn border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            @click="loadImmunizationPreset"
          >
            💉 Imunisasi Balita (Kesehatan Chapter)
          </button>
          <button
            type="button"
            class="rounded-btn border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            @click="loadWastePreset"
          >
            ♻️ Bank Sampah (Persampahan Chapter)
          </button>
        </div>

        <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <!-- CMS Controls Panel -->
          <div class="space-y-5 rounded-card border border-slate-200/80 bg-slate-50/50 p-5 lg:col-span-5">
            <h3 class="text-sm font-semibold text-slate-800">CMS Configuration Form</h3>

            <!-- Title Input -->
            <div>
              <label for="cms-title-input" class="mb-1 block text-xs font-medium text-slate-600">
                Judul Diagram (Title)
              </label>
              <input
                id="cms-title-input"
                v-model="cmsTitle"
                type="text"
                class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
              />
            </div>

            <!-- Unit Input & Max Scale -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="cms-unit-input" class="mb-1 block text-xs font-medium text-slate-600">
                  Satuan Nilai (Unit)
                </label>
                <input
                  id="cms-unit-input"
                  v-model="cmsUnit"
                  type="text"
                  placeholder="e.g. jiwa, %, kg"
                  class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
                />
              </div>

              <div>
                <label for="cms-color-select" class="mb-1 block text-xs font-medium text-slate-600">
                  Warna Bar Fill
                </label>
                <select
                  id="cms-color-select"
                  v-model="cmsSelectedColor"
                  class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
                >
                  <option v-for="c in colorOptions" :key="c.value" :value="c.value">
                    {{ c.label }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Scale Mode Option -->
            <div>
              <label class="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  v-model="cmsUseCustomMax"
                  type="checkbox"
                  class="rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                />
                Kunci Batas Maksimum (Custom Max Scale)
              </label>
              <div v-if="cmsUseCustomMax" class="mt-2">
                <input
                  v-model.number="cmsCustomMax"
                  type="number"
                  placeholder="e.g. 100 untuk persentase"
                  class="w-full rounded-btn border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
                />
                <p class="mt-1 text-[11px] text-slate-500">
                  Jika tidak dikunci, panjang bar dihitung otomatis proporsional terhadap nilai tertinggi.
                </p>
              </div>
            </div>

            <!-- Toggles -->
            <div class="space-y-2 border-t border-slate-200 pt-3">
              <label class="flex items-center gap-2 text-xs text-slate-700">
                <input
                  v-model="cmsShowValues"
                  type="checkbox"
                  class="rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                />
                Tampilkan Label Angka di Kanan
              </label>
              <label class="flex items-center gap-2 text-xs text-slate-700">
                <input
                  v-model="cmsFormatNumbers"
                  type="checkbox"
                  class="rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                />
                Format Titik Ribuan Indonesia (e.g. 3.420)
              </label>
              <label class="flex items-center gap-2 text-xs text-slate-700">
                <input
                  v-model="cmsLoading"
                  type="checkbox"
                  class="rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                />
                Simulasi Status Memuat (Skeleton Loading)
              </label>
            </div>

            <!-- Dynamic Items Editor List -->
            <div class="border-t border-slate-200 pt-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-800">
                  Daftar Bar Kategori ({{ cmsItems.length }})
                </span>
                <button
                  type="button"
                  class="rounded-btn bg-brand-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-navy-deep transition-colors"
                  @click="addItem"
                >
                  + Tambah Kategori
                </button>
              </div>

              <div class="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                <div
                  v-for="(item, idx) in cmsItems"
                  :key="idx"
                  class="flex items-center gap-2 rounded-btn border border-slate-200 bg-white p-2 text-xs shadow-2xs"
                >
                  <div class="flex-1 min-w-0">
                    <input
                      v-model="item.label"
                      type="text"
                      placeholder="Nama Bar"
                      class="w-full font-medium text-slate-900 focus:outline-none border-b border-transparent focus:border-brand-navy pb-0.5"
                    />
                  </div>
                  <div class="w-24 shrink-0">
                    <input
                      v-model.number="item.value"
                      type="number"
                      placeholder="Nilai"
                      class="w-full rounded border border-slate-200 px-2 py-0.5 text-right font-bold text-brand-navy focus:outline-none focus:border-brand-navy"
                    />
                  </div>
                  <button
                    type="button"
                    class="h-6 w-6 shrink-0 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    title="Hapus Kategori"
                    @click="removeItem(idx)"
                  >
                    &times;
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Live Preview Canvas & Snippet Output -->
          <div class="space-y-6 lg:col-span-7">
            <!-- Dynamic Canvas Preview -->
            <div>
              <span class="mb-2 block text-xs font-semibold text-slate-700">Preview Komponen Langsung</span>
              <div class="rounded-card border border-slate-200/80 bg-slate-100 p-6">
                <BarDiagram
                  :title="cmsTitle"
                  :items="cmsItems"
                  :unit="cmsUnit"
                  :max="cmsUseCustomMax ? cmsCustomMax : undefined"
                  :show-values="cmsShowValues"
                  :format-numbers="cmsFormatNumbers"
                  :bar-color-class="cmsSelectedColor"
                  :loading="cmsLoading"
                />
              </div>
            </div>

            <!-- Code Snippets -->
            <div class="space-y-4">
              <div>
                <div class="mb-1 flex items-center justify-between">
                  <span class="text-xs font-semibold text-slate-700">Vue SFC Usage Snippet</span>
                </div>
                <pre class="overflow-x-auto rounded-card bg-slate-900 p-3.5 text-xs text-slate-200"><code>{{ generatedSnippet }}</code></pre>
              </div>

              <div>
                <div class="mb-1 flex items-center justify-between">
                  <span class="text-xs font-semibold text-slate-700">CMS Data JSON Payload</span>
                </div>
                <pre class="max-h-48 overflow-x-auto rounded-card bg-slate-900 p-3.5 text-xs text-slate-200"><code>{{ dataJsonSnippet }}</code></pre>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
