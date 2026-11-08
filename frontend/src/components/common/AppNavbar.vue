<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import balikpapanLogo from '@/assets/img/logo_balikpapan.webp';
import { isEventFromOpenDialog, useDrawerFocusTrap } from '@/composables/useDrawerFocusTrap';
import { useIsDesktop } from '@/composables/useIsDesktop';
import { acquireBodyScrollLock } from '@/utils/bodyScrollLock';

export interface NavbarProps {
  /** Background mode of the bar. Independent of `foreground`. */
  variant?: 'navy' | 'transparent';
  /** Colour of the identity and controls; defaults to light. */
  foreground?: 'light' | 'dark';
  title?: string;
  subtitle?: string;
  logoSrc?: string;
  homeRoute?: string;
  sticky?: boolean;
  /** The bar overlays the content below it (e.g. a hero) instead of pushing it down. */
  overlay?: boolean;
}

const props = withDefaults(defineProps<NavbarProps>(), {
  variant: 'navy',
  foreground: undefined,
  title: 'Kelurahan Manggar',
  subtitle: 'Kelurahan Cinta Statistik',
  logoSrc: balikpapanLogo,
  homeRoute: '/',
  sticky: false,
  overlay: false,
});

const emit = defineEmits<{
  (e: 'toggleMenu', isOpen: boolean): void;
  (e: 'logoClick'): void;
}>();

const route = useRoute();

const isMenuOpen = ref(false);
const headerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const toggleButtonRef = ref<HTMLButtonElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);

// Below the `md` breakpoint the menu is a modal sheet (focus trap, backdrop, scroll lock); from
// `md` up it is an anchored disclosure panel with the normal tab order.
const { isDesktop } = useIsDesktop();
const isModal = computed(() => isMenuOpen.value && !isDesktop.value);

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
  emit('toggleMenu', isMenuOpen.value);
}

function closeMenu() {
  if (isMenuOpen.value) {
    isMenuOpen.value = false;
    emit('toggleMenu', false);
  }
}

async function closeAndRestoreFocus() {
  closeMenu();
  // The bar is `inert` while the sheet is modal; wait for that to lift before focusing the toggle.
  await nextTick();
  toggleButtonRef.value?.focus();
}

// Focus in on open, Tab/Shift+Tab trapped inside the sheet and Escape to close. Only active while
// the menu is a modal sheet, so the desktop disclosure never traps focus (WCAG 2.1.2).
useDrawerFocusTrap({
  isOpen: isModal,
  containerRef: panelRef,
  initialFocusRef: closeButtonRef,
  onEscape: () => void closeAndRestoreFocus(),
  ignoreDialogRef: panelRef,
});

function handleDesktopKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !isMenuOpen.value || isModal.value) return;
  if (isEventFromOpenDialog(event, panelRef.value)) return;
  if (headerRef.value?.contains(document.activeElement)) {
    void closeAndRestoreFocus();
  } else {
    closeMenu();
  }
}

function handleOutsidePointerDown(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Node && headerRef.value && !headerRef.value.contains(target)) {
    // Leave focus where the click put it.
    closeMenu();
  }
}

let releaseScrollLock: (() => void) | null = null;

function releaseLock() {
  releaseScrollLock?.();
  releaseScrollLock = null;
}

watch(isModal, (modal) => {
  if (modal) {
    releaseScrollLock ??= acquireBodyScrollLock();
  } else {
    releaseLock();
    const hadFocusInDrawer = Boolean(panelRef.value?.contains(document.activeElement));
    if (isMenuOpen.value && hadFocusInDrawer) {
      void nextTick(() => {
        toggleButtonRef.value?.focus();
      });
    }
  }
});

// Desktop disclosure only: a click outside the header dismisses the panel.
const listensForOutsideClicks = computed(() => isMenuOpen.value && isDesktop.value);
watch(listensForOutsideClicks, (listen) => {
  if (listen) {
    document.addEventListener('pointerdown', handleOutsidePointerDown);
  } else {
    document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }
});

// Navigating (link, back/forward, programmatic) always dismisses the menu. The layout owns
// post-navigation focus (focusing <main>), so the navbar only closes the menu and does nothing
// with focus. Focus restoration to the toggle is reserved for closes that did NOT navigate
// (Escape, mobile close button, outside click).
watch(
  () => route?.fullPath,
  () => {
    closeMenu();
  },
);

onMounted(() => {
  window.addEventListener('keydown', handleDesktopKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleDesktopKeydown);
  document.removeEventListener('pointerdown', handleOutsidePointerDown);
  releaseLock();
});

const isLight = computed(() => (props.foreground ?? 'light') === 'light');
const isTransparent = computed(() => props.variant === 'transparent');

const containerClasses = computed(() => [
  'transition-colors duration-200 motion-reduce:transition-none',
  props.variant === 'navy' ? 'bg-brand-navy' : 'bg-transparent',
  isLight.value ? 'text-white' : 'text-brand-navy',
  props.sticky ? 'sticky top-0 z-[55]' : 'relative', // layer order: see main.css
  props.overlay ? '-mb-[var(--public-header-height)]' : '',
]);

const focusRingClasses = computed(() =>
  isLight.value ? 'focus-visible:outline-focus-ring-inverse' : 'focus-visible:outline-focus-ring',
);

const subtitleClasses = computed(() =>
  isLight.value ? 'text-text-inverse-muted' : 'text-text-muted',
);
const titleClasses = computed(() => (isLight.value ? 'text-white' : 'text-brand-navy'));
const hamburgerBarClasses = computed(() => (isLight.value ? 'bg-white' : 'bg-brand-navy'));
</script>

<template>
  <header
    ref="headerRef"
    class="w-full"
    :class="containerClasses"
    :data-variant="variant"
    data-test="app-navbar"
  >
    <!-- Localized scrim: keeps the white identity legible when the bar is transparent over a photo -->
    <div
      v-if="isTransparent"
      class="from-brand-navy/70 pointer-events-none absolute inset-x-0 top-0 h-[calc(100%+1.5rem)] bg-gradient-to-b to-transparent"
      aria-hidden="true"
      data-test="navbar-scrim"
    />

    <nav aria-label="Navigasi Utama" class="relative w-full">
      <div class="relative mx-auto max-w-7xl">
        <!-- The sheet is a modal dialog below `md`: the logo and toggle must not stay reachable behind it -->
        <div
          class="flex h-[var(--public-header-height)] items-center justify-between gap-4 px-6 sm:px-8"
          :inert="isModal ? true : undefined"
          data-test="navbar-bar"
        >
          <!-- Brand & Identity Lockup -->
          <RouterLink
            :to="homeRoute"
            class="rounded-btn flex min-w-0 items-center gap-3.5 focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="focusRingClasses"
            @click="emit('logoClick')"
          >
            <slot name="logo">
              <img
                :src="logoSrc"
                alt="Logo Kota Balikpapan"
                class="h-11 w-auto shrink-0 object-contain sm:h-12"
              />
            </slot>

            <div class="flex min-w-0 flex-col text-left">
              <slot name="title">
                <span
                  class="truncate text-xs font-normal tracking-wide sm:text-sm"
                  :class="subtitleClasses"
                  data-test="navbar-subtitle"
                >
                  {{ subtitle }}
                </span>
                <span
                  class="truncate text-base leading-tight font-bold tracking-tight sm:text-lg"
                  :class="titleClasses"
                  data-test="navbar-title"
                >
                  {{ title }}
                </span>
              </slot>
            </div>
          </RouterLink>

          <!-- Hamburger Toggle -->
          <button
            ref="toggleButtonRef"
            type="button"
            class="rounded-btn inline-flex h-11 w-11 shrink-0 items-center justify-center transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="focusRingClasses"
            :aria-expanded="isMenuOpen"
            aria-controls="primary-navigation-menu"
            :aria-label="isMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'"
            data-test="hamburger-btn"
            @click="toggleMenu"
          >
            <div class="flex w-6 flex-col justify-center gap-[5px]" aria-hidden="true">
              <span
                class="block h-[3px] w-full shrink-0 origin-center transition-transform duration-200 motion-reduce:transition-none"
                :class="[hamburgerBarClasses, isMenuOpen ? 'translate-y-[8px] rotate-45' : '']"
              />
              <span
                class="block h-[3px] w-full shrink-0 transition-opacity duration-200 motion-reduce:transition-none"
                :class="[hamburgerBarClasses, isMenuOpen ? 'opacity-0' : 'opacity-100']"
              />
              <span
                class="block h-[3px] w-full shrink-0 origin-center transition-transform duration-200 motion-reduce:transition-none"
                :class="[hamburgerBarClasses, isMenuOpen ? '-translate-y-[8px] -rotate-45' : '']"
              />
            </div>
          </button>
        </div>

        <!-- Backdrop: mobile sheet only. Clicking it closes the menu and returns focus to the toggle -->
        <transition
          enter-active-class="transition-opacity duration-200 motion-reduce:transition-none"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition-opacity duration-150 motion-reduce:transition-none"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-show="isMenuOpen"
            class="bg-brand-navy/60 fixed inset-0 z-40 md:hidden"
            aria-hidden="true"
            data-test="nav-backdrop"
            @click="closeAndRestoreFocus"
          />
        </transition>

        <!-- Menu panel: bounded sheet below `md`, anchored panel under the bar from `md` up -->
        <transition
          enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
          enter-from-class="opacity-0 max-md:translate-x-full md:-translate-y-2"
          enter-to-class="opacity-100 max-md:translate-x-0 md:translate-y-0"
          leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
          leave-from-class="opacity-100 max-md:translate-x-0 md:translate-y-0"
          leave-to-class="opacity-0 max-md:translate-x-full md:-translate-y-2"
        >
          <div
            v-show="isMenuOpen"
            id="primary-navigation-menu"
            ref="panelRef"
            :role="isModal ? 'dialog' : undefined"
            :aria-modal="isModal ? 'true' : undefined"
            :aria-label="isModal ? 'Menu navigasi' : undefined"
            class="md:rounded-card bg-brand-navy border-white/15 text-white fixed inset-y-0 right-0 z-50 flex w-[min(88vw,22rem)] flex-col overflow-hidden border-l shadow-xl md:absolute md:inset-y-auto md:top-full md:right-6 md:mt-2 md:max-h-[calc(100dvh-var(--public-header-height)-1rem)] md:w-[46rem] md:max-w-[calc(100vw-3rem)] md:border lg:right-8"
            data-test="nav-menu-drawer"
          >
            <div
              class="flex shrink-0 items-center justify-between border-b border-white/15 px-5 py-3 md:hidden"
            >
              <span class="text-base font-semibold">Menu</span>
              <button
                ref="closeButtonRef"
                type="button"
                class="rounded-btn hover:bg-white/10 focus-visible:outline-focus-ring-inverse inline-flex h-11 w-11 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label="Tutup menu"
                data-test="menu-close-btn"
                @click="closeAndRestoreFocus"
              >
                <XMarkIcon class="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:py-4">
              <slot name="menu" :close="closeMenu" :open="isMenuOpen" />
            </div>
          </div>
        </transition>
      </div>
    </nav>
  </header>
</template>
