<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import balikpapanLogo from '@/assets/img/logo_balikpapan.png';

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

const isMenuOpen = ref(false);

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

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isMenuOpen.value) {
    closeMenu();
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
    <nav
      aria-label="Navigasi Utama"
      class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8 sm:py-5"
    >
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
          type="button"
          class="focus-visible:ring-brand-indigo inline-flex h-10 w-10 items-center justify-center p-1 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"
          :aria-expanded="isMenuOpen"
          aria-controls="primary-navigation-menu"
          aria-label="Buka menu navigasi"
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
    </nav>

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
        v-if="isMenuOpen"
        id="primary-navigation-menu"
        class="border-t border-white/10 px-6 py-6 shadow-xl"
        :class="isNavy ? 'bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-900'"
        data-test="nav-menu-drawer"
      >
        <div class="mx-auto max-w-7xl space-y-4">
          <slot name="menu" :close="closeMenu">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <RouterLink
                to="/"
                class="rounded-btn focus-visible:ring-brand-indigo block px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  isNavy ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                "
                @click="closeMenu"
              >
                Beranda
              </RouterLink>
              <RouterLink
                to="/mockup/button"
                class="rounded-btn focus-visible:ring-brand-indigo block px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  isNavy ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                "
                @click="closeMenu"
              >
                ❖ Mockup Button
              </RouterLink>
              <RouterLink
                to="/mockup/link"
                class="rounded-btn focus-visible:ring-brand-indigo block px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  isNavy ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                "
                @click="closeMenu"
              >
                ❖ Mockup Link
              </RouterLink>
              <RouterLink
                to="/mockup/navbar"
                class="rounded-btn focus-visible:ring-brand-indigo block px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  isNavy ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                "
                @click="closeMenu"
              >
                ❖ Mockup Navbar
              </RouterLink>
            </div>
          </slot>
        </div>
      </div>
    </transition>
  </header>
</template>
