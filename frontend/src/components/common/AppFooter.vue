<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { getActivePinia } from 'pinia';
import BaseLink from './BaseLink.vue';
import { computeLinkRel } from '@/utils/link';
import logoBalikpapan from '@/assets/img/logo_balikpapan.webp';
import logoDesaCantik from '@/assets/img/logo_desa_cantik.webp';
import logoSdgsDesa from '@/assets/img/sdgs_desa.webp';
import logoSdgs17 from '@/assets/img/17_kemitraan_pembangunan_desa.webp';
import logoBps from '@/assets/img/logo_bps.webp';
import logoItk from '@/assets/img/logo_itk.webp';
import logoVyomatantra from '@/assets/img/logo_vyomatantra.webp';
import { useSettingsStore } from '../../stores/settings.store';
import { FOOTER_RESOURCE_LINKS, FOOTER_STORY_LINKS, FOOTER_ABOUT_LINKS } from '@/config/publicNav';

const DEFAULT_PHONE = '(0542) 746123';
const DEFAULT_ADDRESS_LINES = [
  'Kantor Kelurahan Manggar',
  'Jl. Mulawarman No. 1, RT 39',
  'Kelurahan Manggar, Kecamatan Balikpapan Timur',
  'Kota Balikpapan, Kalimantan Timur, 76116',
];

export interface FooterProps {
  year?: number | string;
  phone?: string;
  addressLines?: string[];
}

const props = withDefaults(defineProps<FooterProps>(), {
  year: 2026,
  phone: undefined,
  addressLines: undefined,
});

// Avoid initializing Pinia store when no active Pinia instance exists (e.g. isolated component unit tests)
const settingsStore = getActivePinia() ? useSettingsStore() : null;

onMounted(() => {
  // Footer is on every public page; load contact details once so pages that
  // never touch the settings store still show the admin-managed values.
  void settingsStore?.fetchPublicSettings().catch(() => {});
});

const displayPhone = computed(() => {
  if (props.phone !== undefined) return props.phone;
  return settingsStore?.isLoaded && settingsStore.contactPhone
    ? settingsStore.contactPhone
    : DEFAULT_PHONE;
});

/** Single address string (Andi #112: do not split contactAddress on commas). */
const displayAddressText = computed(() => {
  if (props.addressLines !== undefined) return props.addressLines.join(', ');
  if (settingsStore?.isLoaded && settingsStore.contactAddress) {
    return settingsStore.contactAddress;
  }
  return DEFAULT_ADDRESS_LINES.join(', ');
});

// Resource Links (Sumber Daya) per SPEC §8
const resourceLinks = FOOTER_RESOURCE_LINKS;

// Story & Statistics Links (Cerita) per SPEC §8
const storyLinks = FOOTER_STORY_LINKS;

// About Links (Tentang) per SPEC §8
const aboutLinks = FOOTER_ABOUT_LINKS;

const PARTNER_LINK_CLASS =
  'focus-visible:ring-focus-ring-inverse inline-flex items-center rounded-xs opacity-90 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none';

interface PartnerLink {
  key: string;
  href?: string;
  to?: string;
  target?: string;
  ariaLabel: string;
  dataTest: string;
  logoSrc: string;
  logoAlt: string;
  logoDataTest: string;
}

const partnerLinks: PartnerLink[] = [
  {
    key: 'bps',
    href: 'https://www.bps.go.id',
    target: '_blank',
    ariaLabel: 'Kunjungi situs web Badan Pusat Statistik (BPS) (membuka tab baru)',
    dataTest: 'link-logo-bps',
    logoSrc: logoBps,
    logoAlt: 'Logo Badan Pusat Statistik (BPS)',
    logoDataTest: 'logo-bps',
  },
  {
    key: 'itk',
    href: 'https://itk.ac.id',
    target: '_blank',
    ariaLabel: 'Kunjungi situs web Institut Teknologi Kalimantan (ITK) (membuka tab baru)',
    dataTest: 'link-logo-itk',
    logoSrc: logoItk,
    logoAlt: 'Logo Institut Teknologi Kalimantan (ITK)',
    logoDataTest: 'logo-itk',
  },
  {
    key: 'vyomatantra',
    to: '/tentang/vyomatantra',
    ariaLabel: 'Lihat profil Tim Inovasi Sosial VYOMATANTRA',
    dataTest: 'link-logo-vyomatantra',
    logoSrc: logoVyomatantra,
    logoAlt: 'Logo Tim Inovasi Sosial VYOMATANTRA',
    logoDataTest: 'logo-vyomatantra',
  },
];
</script>

<template>
  <footer
    class="app-footer-root bg-brand-navy w-full text-white transition-colors"
    aria-label="Footer Laman Kelurahan Manggar"
  >
    <div class="mx-auto max-w-7xl px-6 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
      <!-- 
        Responsive Grid via Container Queries:
        - Mobile (< 768px): Vertical stack of Brand block, then 2-col Links grid (Left: Sumber Daya + Tentang; Right: Cerita), then a full-width row for the SDG badges.
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
            <div class="flex min-w-0 flex-col text-left">
              <span class="text-sm font-normal tracking-wide text-text-inverse-muted">
                Kelurahan Cinta Statistik
              </span>
              <span class="text-base leading-tight font-bold tracking-tight text-white sm:text-lg">
                Kelurahan<br class="hidden sm:inline" />
                Manggar
              </span>
            </div>
          </div>

          <!-- Office Address Block -->
          <address class="space-y-1 leading-relaxed text-text-inverse-muted not-italic">
            <p class="text-sm font-medium text-white sm:text-base">
              {{ displayAddressText }}
            </p>
            <p class="pt-0.5 text-sm sm:text-base">
              Telp.
              <BaseLink
                :href="`tel:${displayPhone.replace(/[^0-9+]/g, '')}`"
                variant="white"
                size="md"
                :with-arrow="false"
              >
                {{ displayPhone }}
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
            <h2 class="text-base font-semibold tracking-wide text-white">Sumber Daya</h2>
            <ul class="space-y-2">
              <li v-for="link in resourceLinks" :key="link.label">
                <BaseLink
                  :to="link.to"
                  variant="white"
                  size="md"
                  :with-arrow="false"
                >
                  {{ link.label }}
                </BaseLink>
              </li>
            </ul>
          </nav>

          <!-- 2. Tentang Navigation -->
          <nav aria-label="Navigasi Tentang Kelurahan" class="link-col-tentang space-y-3">
            <h2 class="text-base font-semibold tracking-wide text-white">Tentang</h2>
            <ul class="space-y-2">
              <li v-for="link in aboutLinks" :key="link.label">
                <BaseLink
                  :to="link.to"
                  variant="white"
                  size="md"
                  :with-arrow="false"
                >
                  {{ link.label }}
                </BaseLink>
              </li>
            </ul>
          </nav>

          <!-- 3. Cerita Navigation -->
          <nav aria-label="Navigasi Cerita Statistik" class="link-col-cerita space-y-3">
            <h2 class="text-base font-semibold tracking-wide text-white">Cerita</h2>
            <ul class="space-y-2">
              <li v-for="link in storyLinks" :key="link.label">
                <BaseLink
                  :to="link.to"
                  variant="white"
                  size="md"
                  :with-arrow="false"
                >
                  {{ link.label }}
                </BaseLink>
              </li>
            </ul>
          </nav>

          <!-- 4. SDGs Badges -->
          <div class="link-col-badges">
            <div class="flex flex-wrap items-center gap-2.5 sm:gap-3">
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
        <div
          class="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 sm:gap-x-12 md:gap-x-16"
          data-test="partner-logos"
        >
          <component
            :is="partner.to ? RouterLink : 'a'"
            v-for="partner in partnerLinks"
            :key="partner.key"
            v-bind="
              partner.to
                ? { to: partner.to }
                : {
                    href: partner.href,
                    target: partner.target,
                    rel: computeLinkRel(partner.href, partner.target),
                  }
            "
            :class="PARTNER_LINK_CLASS"
            :aria-label="partner.ariaLabel"
            :data-test="partner.dataTest"
          >
            <img
              :src="partner.logoSrc"
              :alt="partner.logoAlt"
              class="h-10 w-auto max-w-full object-contain sm:h-11"
              :data-test="partner.logoDataTest"
            />
          </component>
        </div>
      </div>

      <!-- Copyright Section -->
      <div
        class="mt-8 border-t border-white/10 pt-6 text-center text-text-inverse-muted sm:mt-10"
      >
        <p class="text-sm sm:text-base" data-test="copyright-text">&copy; {{ year }}. Hak cipta dilindungi undang-undang.</p>
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

/*
 * Mobile: the SDG badges get their own full-width row, left-aligned under the link columns, so
 * no grid cell is left empty (they used to sit alone in the right cell of a third row).
 */
.link-col-badges {
  grid-column: 1 / -1;
  grid-row: 3;
  padding-top: 0;
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
