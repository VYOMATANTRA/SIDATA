<script setup lang="ts">
import { ref, computed } from 'vue';
import HugeQuote from '@/components/common/HugeQuote.vue';
import bgHeroImage from '@/assets/img/background_laman_depan_kelurahan.png';
import lurahSamplePhoto from '@/assets/img/lurah_placeholder_sample.png';

// Section 1: Exact Figma Default Text
const figmaQuoteTitle = 'Sambutan';
const figmaQuoteText =
  'Selamat datang di Portal Data Kelurahan Manggar. Melalui kerja sama dengan BPS dan Tim Inovasi Sosial VYOMATANTRA ITK, kami berupaya menghadirkan data kelurahan yang lebih terbuka dan mudah diakses masyarakat. Mari bersama mengenal lebih dekat potensi Kelurahan Manggar melalui program ini.';
const figmaAuthorName = 'Author Name, Title';
const figmaAuthorPosition = 'Position';

// Preset real chapter: Sambutan Resmi Lurah Manggar
const realAuthorName = 'Munir Achmad, S.Sos., M.Si.';
const realAuthorPosition = 'Lurah Manggar, Balikpapan Timur';

// Interactive Playground State
const playgroundTitle = ref('Sambutan');
const playgroundQuote = ref(
  'Selamat datang di Portal Data Kelurahan Manggar. Melalui kerja sama dengan BPS dan Tim Inovasi Sosial VYOMATANTRA ITK, kami berupaya menghadirkan data kelurahan yang lebih terbuka dan mudah diakses masyarakat. Mari bersama mengenal lebih dekat potensi Kelurahan Manggar melalui program ini.',
);
const playgroundEyebrow = ref('');
const playgroundAuthorName = ref('Author Name, Title');
const playgroundAuthorPosition = ref('Position');
const playgroundVariant = ref<'dark' | 'glass' | 'navy' | 'light' | 'transparent'>('dark');
const playgroundAlign = ref<'left' | 'center'>('left');
const playgroundHeadingTag = ref<'h1' | 'h2' | 'h3'>('h2');
const playgroundAuthorHeadingTag = ref<'h2' | 'h3' | 'h4'>('h3');

// Picture mode: 'placeholder' | 'sample' | 'custom'
const playgroundPictureMode = ref<'placeholder' | 'sample' | 'custom'>('placeholder');
const playgroundCustomImageSrc = ref('');
const playgroundBgMode = ref<'image' | 'dark' | 'neutral'>('image');

const computedPlaygroundImageSrc = computed(() => {
  if (playgroundPictureMode.value === 'sample') {
    return lurahSamplePhoto;
  }
  if (playgroundPictureMode.value === 'custom') {
    return playgroundCustomImageSrc.value;
  }
  return undefined; // Renders built-in placeholder
});

function resetToDefault() {
  playgroundTitle.value = 'Sambutan';
  playgroundQuote.value =
    'Selamat datang di Portal Data Kelurahan Manggar. Melalui kerja sama dengan BPS dan Tim Inovasi Sosial VYOMATANTRA ITK, kami berupaya menghadirkan data kelurahan yang lebih terbuka dan mudah diakses masyarakat. Mari bersama mengenal lebih dekat potensi Kelurahan Manggar melalui program ini.';
  playgroundEyebrow.value = '';
  playgroundAuthorName.value = 'Author Name, Title';
  playgroundAuthorPosition.value = 'Position';
  playgroundVariant.value = 'dark';
  playgroundAlign.value = 'left';
  playgroundHeadingTag.value = 'h2';
  playgroundAuthorHeadingTag.value = 'h3';
  playgroundPictureMode.value = 'placeholder';
  playgroundCustomImageSrc.value = '';
  playgroundBgMode.value = 'image';
}

const generatedSnippet = computed(() => {
  const parts = ['<HugeQuote'];
  if (playgroundTitle.value !== 'Sambutan') {
    parts.push(`  title="${playgroundTitle.value}"`);
  }
  if (playgroundEyebrow.value) {
    parts.push(`  eyebrow="${playgroundEyebrow.value}"`);
  }
  if (playgroundAuthorName.value !== 'Author Name, Title') {
    parts.push(`  authorName="${playgroundAuthorName.value}"`);
  }
  if (playgroundAuthorPosition.value !== 'Position') {
    parts.push(`  authorPosition="${playgroundAuthorPosition.value}"`);
  }
  if (playgroundVariant.value !== 'dark') {
    parts.push(`  variant="${playgroundVariant.value}"`);
  }
  if (playgroundAlign.value !== 'left') {
    parts.push(`  align="${playgroundAlign.value}"`);
  }
  if (computedPlaygroundImageSrc.value) {
    parts.push(`  :imageSrc="authorPhotoUrl"`);
  }
  parts.push('>');
  parts.push(`  ${playgroundQuote.value}`);
  parts.push('</HugeQuote>');
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
            <p class="text-xs text-slate-500">HugeQuote (Sambutan) Specification & Verification</p>
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
            class="rounded-btn border-brand-navy bg-brand-navy border px-3 py-1.5 text-xs font-medium text-white transition-colors"
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
            <h2 class="text-lg font-bold text-slate-900">HugeQuote Component Block</h2>
            <p class="mt-0.5 text-xs text-slate-500">
              Pixel-perfect implementation of the Figma slice: uses
              <code class="text-brand-indigo font-mono">SectionTextArea</code> for both top quote
              speech and bottom author credentials, combined with a dynamic portrait photo slot and
              built-in SVG placeholder per <code class="font-mono">docs/SPEC.md §8</code>.
            </p>
          </div>

          <span
            class="rounded-btn inline-block border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs"
          >
            Figma Slice
          </span>
        </div>

        <div class="space-y-8">
          <!-- Standalone with Built-in Placeholder (Default State) -->
          <div>
            <div class="mb-2.5 flex items-center justify-between">
              <span
                class="text-brand-violet inline-flex items-center gap-1.5 text-xs font-semibold"
              >
                <span>❖</span> 1. Default State: Built-in Dynamic Placeholder (Zero-Asset Fallback)
              </span>
              <span class="text-xs text-slate-400"
                >Renders elegant SVG silhouette when imageSrc is empty</span
              >
            </div>

            <div
              class="rounded-card border-brand-violet flex justify-center border-2 border-dashed bg-[#1a1e27] p-6 shadow-xs sm:p-10"
            >
              <HugeQuote
                :title="figmaQuoteTitle"
                :quote="figmaQuoteText"
                :author-name="figmaAuthorName"
                :author-position="figmaAuthorPosition"
                variant="dark"
              />
            </div>
          </div>

          <!-- In Context: Real Sample Photo with Hero Overlay Background -->
          <div>
            <div class="mb-2.5 flex items-center justify-between">
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <span>🖼️</span> 2. In Context: With Real Portrait Photo (Hero Background Preview)
              </span>
              <span class="text-xs text-slate-400">Exact appearance as seen in Figma design</span>
            </div>

            <div
              class="relative flex items-center justify-center overflow-hidden rounded-2xl p-6 shadow-lg sm:p-10 md:p-12"
              :style="{
                backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.82), rgba(0, 27, 72, 0.90)), url(${bgHeroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            >
              <HugeQuote
                :title="figmaQuoteTitle"
                :quote="figmaQuoteText"
                :author-name="figmaAuthorName"
                :author-position="figmaAuthorPosition"
                :image-src="lurahSamplePhoto"
                variant="dark"
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
          <h2 class="text-lg font-bold text-slate-900">Supported Theme Variants</h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Adheres to
            <code class="text-brand-indigo font-mono">docs/UI_STYLE_GUIDE.md §3.B</code> tokens:
            Dark Charcoal, Glassmorphism (<code class="font-mono">bg-surface-glass</code>), Brand
            Navy, and Clean Light.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <!-- Preset 1: Sambutan Resmi Lurah (Figma Dark Charcoal) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >1. Sambutan Resmi Lurah (<code class="text-brand-indigo font-mono"
                  >variant="dark"</code
                >)</span
              >
              <span class="text-slate-400">Data Kelurahan Manggar</span>
            </div>
            <div
              class="rounded-card p-6 shadow-md"
              :style="{
                backgroundImage: `linear-gradient(rgba(10, 35, 83, 0.85), rgba(0, 27, 72, 0.92)), url(${bgHeroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            >
              <HugeQuote
                eyebrow="01 / Sambutan Pimpinan"
                title="Sambutan Lurah Manggar"
                quote="Selamat datang di Portal Data Kelurahan Manggar. Program keterbukaan data kependudukan, tata kelola RT, serta potensi sosial-ekonomi hadir untuk melayani masyarakat Balikpapan Timur secara transparan dan akuntabel."
                :author-name="realAuthorName"
                :author-position="realAuthorPosition"
                :image-src="lurahSamplePhoto"
                variant="dark"
              />
            </div>
          </div>

          <!-- Preset 2: Glassmorphism Variant -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >2. Glassmorphism (<code class="text-brand-indigo font-mono">variant="glass"</code
                >)</span
              >
              <span class="text-slate-400">Glass Token (bg-surface-glass)</span>
            </div>
            <div
              class="rounded-card p-6 shadow-md"
              :style="{
                backgroundImage: `linear-gradient(135deg, #0a2353 0%, #112c71 100%)`,
              }"
            >
              <HugeQuote
                eyebrow="02 / Pesan Mitra"
                title="Kolaborasi Inovasi BPS & ITK"
                quote="Melalui inisiatif Desa Cantik (Desa Cinta Statistik), kami mendampingi aparat kelurahan dan agen statistik lokal untuk mewujudkan sistem informasi data kelurahan terintegrasi."
                author-name="Tim Inovasi Sosial VYOMATANTRA"
                author-position="Institut Teknologi Kalimantan & BPS"
                variant="glass"
              />
            </div>
          </div>

          <!-- Preset 3: Brand Navy Variant -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >3. Brand Navy (<code class="text-brand-indigo font-mono">variant="navy"</code
                >)</span
              >
              <span class="text-slate-400">Brand Navy Token (#0a2353)</span>
            </div>
            <div class="rounded-card bg-slate-900 p-6 shadow-md">
              <HugeQuote
                eyebrow="03 / Kebijakan Wilayah"
                title="Komitmen Bersama Warga"
                quote="Pengelolaan lingkungan bersih, pemilahan sampah mandiri melalui Bank Sampah, dan keterbukaan layanan kependudukan adalah pondasi masa depan Kelurahan Manggar."
                :author-name="realAuthorName"
                :author-position="realAuthorPosition"
                variant="navy"
              />
            </div>
          </div>

          <!-- Preset 4: Clean Light Theme -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span
                >4. Clean Light Theme (<code class="text-brand-indigo font-mono"
                  >variant="light"</code
                >)</span
              >
              <span class="text-slate-400">Light section container</span>
            </div>
            <div class="rounded-card border border-slate-200 bg-slate-100/70 p-6 shadow-xs">
              <HugeQuote
                eyebrow="04 / Pengumuman"
                title="Layanan Terpadu Mandiri"
                quote="Manfaatkan fitur peta interaktif dan kontak Ketua RT setempat untuk kemudahan administrasi kependudukan Anda secara mandiri dan transparan."
                :author-name="realAuthorName"
                :author-position="realAuthorPosition"
                variant="light"
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
            Dynamically adjust top speech text, bottom author credentials, portrait photo mode
            (placeholder vs real photo), theme variant, and alignment in real time.
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

            <!-- Picture Source Mode (Dynamic Placeholder test) -->
            <div class="space-y-2 border-b border-slate-200 pb-4">
              <label class="block text-xs font-semibold text-slate-700"
                >Mode Foto Pimpinan (Dynamic Picture)</label
              >
              <div class="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundPictureMode === 'placeholder'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundPictureMode = 'placeholder'"
                >
                  Placeholder
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundPictureMode === 'sample'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundPictureMode = 'sample'"
                >
                  Foto Contoh
                </button>
                <button
                  type="button"
                  class="rounded-btn border px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    playgroundPictureMode === 'custom'
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  "
                  @click="playgroundPictureMode = 'custom'"
                >
                  Custom URL
                </button>
              </div>

              <div v-if="playgroundPictureMode === 'custom'" class="pt-1">
                <label for="input-custom-img" class="mb-0.5 block text-[11px] text-slate-500"
                  >Image URL</label
                >
                <input
                  id="input-custom-img"
                  v-model="playgroundCustomImageSrc"
                  type="text"
                  placeholder="https://example.com/photo.png"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <!-- Top SectionTextArea Inputs -->
            <div class="space-y-3">
              <span class="block text-xs font-semibold text-slate-800"
                >1. Top Section (SectionTextArea)</span
              >
              <div>
                <label
                  for="input-quote-title"
                  class="mb-1 block text-xs font-medium text-slate-600"
                >
                  Title (Judul Sambutan)
                </label>
                <input
                  id="input-quote-title"
                  v-model="playgroundTitle"
                  type="text"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label for="input-eyebrow" class="mb-1 block text-xs font-medium text-slate-600">
                  Eyebrow Tag (Optional)
                </label>
                <input
                  id="input-eyebrow"
                  v-model="playgroundEyebrow"
                  type="text"
                  placeholder="Contoh: 01 / Sambutan"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label for="input-quote-text" class="mb-1 block text-xs font-medium text-slate-600">
                  Quote Text (Isi Sambutan)
                </label>
                <textarea
                  id="input-quote-text"
                  v-model="playgroundQuote"
                  rows="3"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <!-- Bottom SectionTextArea Inputs -->
            <div class="space-y-3 border-t border-slate-200 pt-4">
              <span class="block text-xs font-semibold text-slate-800"
                >2. Bottom Section (SectionTextArea)</span
              >
              <div>
                <label
                  for="input-author-name"
                  class="mb-1 block text-xs font-medium text-slate-600"
                >
                  Author Name & Title
                </label>
                <input
                  id="input-author-name"
                  v-model="playgroundAuthorName"
                  type="text"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  for="input-author-position"
                  class="mb-1 block text-xs font-medium text-slate-600"
                >
                  Position / Role
                </label>
                <input
                  id="input-author-position"
                  v-model="playgroundAuthorPosition"
                  type="text"
                  class="focus:border-brand-navy w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <!-- Variant Selector -->
            <div class="border-t border-slate-200 pt-4">
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

            <!-- Alignment & Preview Canvas Background Mode -->
            <div class="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
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
                  >Canvas Background</label
                >
                <div class="flex gap-1.5">
                  <button
                    type="button"
                    class="rounded-btn flex-1 border px-1.5 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      playgroundBgMode === 'image'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundBgMode = 'image'"
                  >
                    Hero
                  </button>
                  <button
                    type="button"
                    class="rounded-btn flex-1 border px-1.5 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      playgroundBgMode === 'dark'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundBgMode = 'dark'"
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    class="rounded-btn flex-1 border px-1.5 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      playgroundBgMode === 'neutral'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    "
                    @click="playgroundBgMode = 'neutral'"
                  >
                    Light
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
              <div
                class="flex min-h-[440px] items-center justify-center rounded-2xl p-6 transition-all sm:p-10"
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
                  <HugeQuote
                    :title="playgroundTitle"
                    :quote="playgroundQuote"
                    :eyebrow="playgroundEyebrow"
                    :author-name="playgroundAuthorName"
                    :author-position="playgroundAuthorPosition"
                    :image-src="computedPlaygroundImageSrc"
                    :variant="playgroundVariant"
                    :align="playgroundAlign"
                    :heading-tag="playgroundHeadingTag"
                    :author-heading-tag="playgroundAuthorHeadingTag"
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
