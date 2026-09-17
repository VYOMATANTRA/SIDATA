<script setup lang="ts">
import BaseLink from './BaseLink.vue';
import logoBalikpapan from '@/assets/img/logo_balikpapan.png';
import logoDesaCantik from '@/assets/img/logo_desa_cantik.png';
import logoSdgsDesa from '@/assets/img/sdgs_desa.png';
import logoSdgs17 from '@/assets/img/17_kemitraan_pembangunan_desa.png';
import logoBps from '@/assets/img/logo_bps.png';
import logoItk from '@/assets/img/logo_itk.png';
import logoVyomatantra from '@/assets/img/logo_vyomatantra.png';

export interface FooterProps {
  year?: number | string;
  phone?: string;
  addressLines?: string[];
}

withDefaults(defineProps<FooterProps>(), {
  year: 2026,
  phone: '(0542) 772158',
  addressLines: () => [
    'Kantor Kelurahan Manggar',
    'Jl. Mulawarman No. 1, RT 39',
    'Kelurahan Manggar, Kecamatan Balikpapan Timur',
    'Kota Balikpapan, Kalimantan Timur, 76116',
  ],
});

// Resource Links (Sumber Daya)
const resourceLinks = [
  { label: 'Publikasi', to: '/publikasi' },
  { label: 'Peta', to: '/peta' },
  { label: 'Permintaan Data', to: '/permintaan-data' },
];

// Story & Statistics Links (Cerita)
const storyLinks = [
  { label: 'Demografi Kependudukan', to: '/cerita/demografi' },
  { label: 'Pendidikan', to: '/cerita/pendidikan' },
  { label: 'Kesehatan', to: '/cerita/kesehatan' },
  { label: 'Pemerintahan & Kelembagaan', to: '/cerita/pemerintahan' },
  { label: 'Ekonomi & Ketertiban', to: '/cerita/ekonomi' },
  { label: 'Geografis & Tata Ruang', to: '/cerita/geografis' },
  { label: 'Infrastruktur & Perumahan', to: '/cerita/infrastruktur' },
  { label: 'Persampahan', to: '/cerita/persampahan' },
];

// About Links (Tentang)
const aboutLinks = [
  { label: 'Kelurahan Manggar', to: '/tentang/kelurahan-manggar' },
  { label: 'Program Desa/Kelurahan Cantik', to: '/tentang/desa-cantik' },
  { label: 'Inovasi Sosial VYOMATANTRA', to: '/tentang/vyomatantra' },
];
</script>

<template>
  <footer
    class="app-footer-root w-full bg-brand-navy text-white transition-colors"
    aria-label="Footer Laman Kelurahan Manggar"
  >
    <div class="mx-auto max-w-7xl px-6 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
      <!-- 
        Responsive Grid via Container Queries:
        - Mobile (< 768px): Vertical stack of Brand block, then 2-col Links grid (Left: Sumber Daya + Tentang; Right: Cerita + SDGs).
        - Tablet (768px - 1023px): Brand block full width on top, then 3-col Links grid (Col 1: Sumber Daya; Col 2: Cerita; Col 3: Tentang + SDGs).
        - Desktop (>= 1024px): 12-col side-by-side grid (4-col Brand block; 8-col Links grid).
      -->
      <div class="footer-main-grid">
        <!-- Brand Identity & Address Section -->
        <div class="footer-brand-section space-y-5">
          <!-- Dual Brand Logos & Title Lockup -->
          <div class="flex items-center gap-3 sm:gap-3.5">
            <img
              :src="logoBalikpapan"
              alt="Logo Kota Balikpapan"
              class="h-11 w-auto shrink-0 object-contain sm:h-13"
              data-test="logo-balikpapan"
            />
            <img
              :src="logoDesaCantik"
              alt="Logo Desa Cantik"
              class="h-11 w-auto shrink-0 object-contain sm:h-13"
              data-test="logo-desa-cantik"
            />
            <div class="flex flex-col text-left min-w-0">
              <span class="text-xs font-normal tracking-wide text-slate-200/90 sm:text-sm">
                Kelurahan Cinta Statistik
              </span>
              <span class="text-base font-bold leading-tight tracking-tight text-white sm:text-lg">
                Kelurahan<br class="hidden sm:inline" /> Manggar
              </span>
            </div>
          </div>

          <!-- Office Address Block -->
          <address class="space-y-1 text-xs leading-relaxed text-slate-200/90 not-italic sm:text-sm">
            <p
              v-for="(line, idx) in addressLines"
              :key="idx"
              :class="{ 'font-medium text-white': idx === 0 }"
            >
              {{ line }}
            </p>
            <p class="pt-0.5">
              Telp.
              <BaseLink
                :href="`tel:${phone.replace(/[^0-9]/g, '')}`"
                variant="white"
                size="sm"
                :with-arrow="false"
              >
                {{ phone }}
              </BaseLink>
            </p>
          </address>

          <!-- Divider for mobile and tablet -->
          <div class="footer-mobile-divider border-t border-white/10 pt-2" />
        </div>

        <!-- Links & SDGs Badges Section -->
        <div class="footer-links-grid">
          <!-- 1. Sumber Daya Navigation -->
          <nav aria-label="Navigasi Sumber Daya" class="link-col-sumber space-y-3">
            <h2 class="text-sm font-semibold tracking-wide text-white sm:text-base">
              Sumber Daya
            </h2>
            <ul class="space-y-1 text-xs sm:text-sm">
              <li v-for="link in resourceLinks" :key="link.label">
                <BaseLink
                  :to="link.to"
                  variant="white"
                  size="sm"
                  :with-arrow="false"
                >
                  {{ link.label }}
                </BaseLink>
              </li>
            </ul>
          </nav>

          <!-- 2. Tentang Navigation -->
          <nav aria-label="Navigasi Tentang Kelurahan" class="link-col-tentang space-y-3">
            <h2 class="text-sm font-semibold tracking-wide text-white sm:text-base">
              Tentang
            </h2>
            <ul class="space-y-1 text-xs sm:text-sm">
              <li v-for="link in aboutLinks" :key="link.label">
                <BaseLink
                  :to="link.to"
                  variant="white"
                  size="sm"
                  :with-arrow="false"
                >
                  {{ link.label }}
                </BaseLink>
              </li>
            </ul>
          </nav>

          <!-- 3. Cerita Navigation -->
          <nav aria-label="Navigasi Cerita Statistik" class="link-col-cerita space-y-3">
            <h2 class="text-sm font-semibold tracking-wide text-white sm:text-base">
              Cerita
            </h2>
            <ul class="space-y-1 text-xs sm:text-sm">
              <li v-for="link in storyLinks" :key="link.label">
                <BaseLink
                  :to="link.to"
                  variant="white"
                  size="sm"
                  :with-arrow="false"
                >
                  {{ link.label }}
                </BaseLink>
              </li>
            </ul>
          </nav>

          <!-- 4. SDGs Badges -->
          <div class="link-col-badges">
            <div class="flex items-center gap-2.5 sm:gap-3">
              <img
                :src="logoSdgsDesa"
                alt="Logo SDGs Desa"
                class="h-16 w-16 shrink-0 object-contain sm:h-18 sm:w-18"
                data-test="badge-sdgs-desa"
              />
              <img
                :src="logoSdgs17"
                alt="Logo SDGs 17: Kemitraan untuk Pembangunan Desa"
                class="h-16 w-16 shrink-0 object-contain sm:h-18 sm:w-18"
                data-test="badge-sdgs-17"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Partner Collaboration Logos Row -->
      <div class="mt-10 border-t border-white/10 pt-8 sm:mt-12 sm:pt-10">
        <div class="flex items-center justify-center gap-8 sm:gap-12 md:gap-16">
          <img
            :src="logoBps"
            alt="Logo Badan Pusat Statistik (BPS)"
            class="h-9 w-auto object-contain sm:h-11"
            data-test="logo-bps"
          />
          <img
            :src="logoItk"
            alt="Logo Institut Teknologi Kalimantan (ITK)"
            class="h-9 w-auto object-contain sm:h-11"
            data-test="logo-itk"
          />
          <img
            :src="logoVyomatantra"
            alt="Logo Tim Inovasi Sosial VYOMATANTRA"
            class="h-9 w-auto object-contain sm:h-11"
            data-test="logo-vyomatantra"
          />
        </div>
      </div>

      <!-- Copyright Section -->
      <div class="mt-8 border-t border-white/10 pt-6 text-center text-xs text-slate-300/80 sm:mt-10">
        <p data-test="copyright-text">
          &copy; {{ year }}. Hak cipta dilindungi undang-undang.
        </p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
/* Responsive layout powered by CSS Container Queries */
.app-footer-root {
  container-type: inline-size;
}

/* Mobile defaults (< 768px): 2 columns matching Figma mobile spec */
.footer-main-grid {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.footer-brand-section {
  width: 100%;
}

.footer-mobile-divider {
  display: block;
}

.footer-links-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 1.5rem;
  row-gap: 2rem;
}

.link-col-sumber {
  grid-column: 1;
  grid-row: 1;
}

.link-col-tentang {
  grid-column: 1;
  grid-row: 2;
}

.link-col-cerita {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.link-col-badges {
  grid-column: 2;
  grid-row: 3;
  padding-top: 0.25rem;
}

/* Tablet / Medium Screens (768px to 1023px): Brand block full width on top; Links in 3 spacious columns */
@container (min-width: 768px) {
  .footer-main-grid {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .footer-brand-section {
    width: 100%;
  }

  .footer-mobile-divider {
    display: block;
  }

  .footer-links-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: 2rem;
    row-gap: 1.5rem;
  }

  .link-col-sumber {
    grid-column: 1;
    grid-row: 1;
  }

  .link-col-cerita {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .link-col-tentang {
    grid-column: 3;
    grid-row: 1;
  }

  .link-col-badges {
    grid-column: 3;
    grid-row: 2;
    padding-top: 0.5rem;
  }
}

/* Desktop (>= 1024px): 12-column side-by-side grid */
@container (min-width: 1024px) {
  .footer-main-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: 2.5rem;
    row-gap: 2rem;
  }

  .footer-brand-section {
    grid-column: span 4 / span 4;
  }

  .footer-mobile-divider {
    display: none;
  }

  .footer-links-grid {
    grid-column: span 8 / span 8;
  }
}
</style>
