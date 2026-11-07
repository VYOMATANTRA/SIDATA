<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import balikpapanLogo from '@/assets/img/logo_balikpapan.webp';
import { getAvailableNavItems, isNavItemActive } from '@/config/publicNav';

export interface NavbarProps {
  variant?: 'navy' | 'white' | 'transparent';
  title?: string;
  subtitle?: string;
  logoSrc?: string;
  homeRoute?: string;
  sticky?: boolean;
}

const props = withDefaults(defineProps<NavbarProps>(), {
  variant: 'navy',
  title: 'Kelurahan Manggar',
  subtitle: 'Kelurahan Cinta Statistik',
  logoSrc: balikpapanLogo,
  homeRoute: '/',
  sticky: false,
});

const emit = defineEmits<{
  (e: 'toggleMenu', isOpen: boolean): void;
  (e: 'logoClick'): void;
}>();

const router = useRouter();
const route = useRoute();
const currentPath = computed(() => route?.path ?? '/');
const navItems = computed(() => getAvailableNavItems(router));

const isMenuOpen = ref(false);
const toggleButtonRef = ref<HTMLButtonElement | null>(null);

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

function isEventFromOpenDialog(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  const target =
    (event.target instanceof HTMLElement ? event.target : null) ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (target?.closest('[role="dialog"], [role="alertdialog"], dialog')) {
    return true;
  }
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'));
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isMenuOpen.value) {
    if (isEventFromOpenDialog(event)) return;
    closeMenu();
    toggleButtonRef.value?.focus();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

const isNavy = computed(() => props.variant === 'navy');

const containerClasses = computed(() => {
  if (isNavy.value) {
    return [
      'bg-brand-navy text-white',
      props.sticky ? 'sticky top-0 z-40 backdrop-blur-md' : 'relative',
    ];
  }
  if (props.variant === 'transparent') {
    return [
      'bg-transparent text-slate-900',
      props.sticky ? 'sticky top-0 z-40 backdrop-blur-md' : 'relative',
    ];
  }
  // Solid white variant
  return ['bg-white text-slate-900', props.sticky ? 'sticky top-0 z-40 shadow-xs' : 'relative'];
});

const subtitleClasses = computed(() => {
  return isNavy.value ? 'text-slate-200/90' : 'text-slate-500';
});

const titleClasses = computed(() => {
  return isNavy.value ? 'text-white' : 'text-slate-900';
});

const hamburgerBarClasses = computed(() => {
  return isNavy.value ? 'bg-white' : 'bg-slate-800';
});
</script>

<template>
  <header class="w-full transition-colors duration-200" :class="containerClasses">
    <nav aria-label="Navigasi Utama" class="w-full">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8 sm:py-5">
        <!-- Brand & Identity Lockup -->
        <div class="flex items-center">
          <RouterLink
            :to="homeRoute"
            class="group focus-visible:ring-brand-indigo rounded-btn flex items-center gap-3.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            @click="emit('logoClick')"
          >
            <!-- Logo Image -->
            <slot name="logo">
              <img
                :src="logoSrc"
                alt="Logo Kota Balikpapan"
                class="h-11 w-auto shrink-0 object-contain sm:h-12"
              />
            </slot>

            <!-- Text Titles -->
            <div class="flex flex-col text-left">
              <slot name="title">
                <span
                  class="text-xs font-normal tracking-wide sm:text-sm"
                  :class="subtitleClasses"
                  data-test="navbar-subtitle"
                >
                  {{ subtitle }}
                </span>
                <span
                  class="text-base leading-tight font-bold tracking-tight sm:text-lg"
                  :class="titleClasses"
                  data-test="navbar-title"
                >
                  {{ title }}
                </span>
              </slot>
            </div>
          </RouterLink>
        </div>

        <!-- Right Actions & Hamburger Menu -->
        <div class="flex items-center gap-4">
          <!-- Optional desktop actions slot -->
          <div v-if="$slots.actions" class="hidden items-center gap-3 md:flex">
            <slot name="actions" />
          </div>

          <!-- Hamburger Toggle Button: Solid corners & equal row heights -->
          <button
            ref="toggleButtonRef"
            type="button"
            class="focus-visible:ring-brand-indigo inline-flex h-10 w-10 items-center justify-center p-1 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"
            :aria-expanded="isMenuOpen"
            aria-controls="primary-navigation-menu"
            :aria-label="isMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'"
            data-test="hamburger-btn"
            @click="toggleMenu"
          >
            <div class="flex w-6 flex-col justify-center gap-[5px]" aria-hidden="true">
              <span
                class="block h-[3px] w-full shrink-0 origin-center rounded-none transition-transform duration-200"
                :class="[hamburgerBarClasses, isMenuOpen ? 'translate-y-[8px] rotate-45' : '']"
              />
              <span
                class="block h-[3px] w-full shrink-0 rounded-none transition-opacity duration-200"
                :class="[hamburgerBarClasses, isMenuOpen ? 'opacity-0' : 'opacity-100']"
              />
              <span
                class="block h-[3px] w-full shrink-0 origin-center rounded-none transition-transform duration-200"
                :class="[hamburgerBarClasses, isMenuOpen ? '-translate-y-[8px] -rotate-45' : '']"
              />
            </div>
          </button>
        </div>
      </div>

      <!-- Mobile Drawer / Dropdown Navigation Menu -->
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-show="isMenuOpen"
          id="primary-navigation-menu"
          class="border-t border-white/10 px-6 py-6 shadow-xl"
          :class="isNavy ? 'bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-900'"
          data-test="nav-menu-drawer"
        >
          <div class="mx-auto max-w-7xl space-y-4">
            <slot name="menu" :close="closeMenu">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <RouterLink
                  v-for="item in navItems"
                  :key="item.to"
                  :to="item.to"
                  class="rounded-btn focus-visible:ring-brand-indigo block px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  :class="[
                    isNavy
                      ? isNavItemActive(item.to, currentPath)
                        ? 'bg-white/20 font-semibold text-white'
                        : 'text-white hover:bg-white/10'
                      : isNavItemActive(item.to, currentPath)
                        ? 'bg-slate-200 font-semibold text-slate-900'
                        : 'text-slate-800 hover:bg-slate-100',
                  ]"
                  :aria-current="isNavItemActive(item.to, currentPath) ? 'page' : undefined"
                  @click="closeMenu"
                >
                  {{ item.label }}
                </RouterLink>
              </div>
            </slot>
          </div>
        </div>
      </transition>
    </nav>
  </header>
</template>
