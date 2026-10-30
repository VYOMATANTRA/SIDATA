<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import {
  ChevronDownIcon,
  ChevronDoubleLeftIcon,
  XMarkIcon,
  GlobeAltIcon,
  ArrowLeftOnRectangleIcon,
} from '@heroicons/vue/24/outline';
import { useAuthStore } from '../../stores/auth';
import { useLogout } from '../../composables/useLogout';
import {
  ADMIN_NAV,
  isAdminNavGroup,
  isAdminNavRoleAllowed,
  type AdminNavGroup,
} from '../../config/adminNav';
// TODO: replace with a dedicated SIDATA wordmark/icon once design provides one.
import balikpapanLogo from '@/assets/img/logo_balikpapan.png';

const props = withDefaults(defineProps<{ mobileOpen?: boolean }>(), { mobileOpen: false });
const emit = defineEmits<{ (e: 'close'): void }>();

const route = useRoute();
const authStore = useAuthStore();
const { logout } = useLogout();

const access = computed(() => ({
  isAdmin: authStore.isAdmin,
  canEditData: authStore.canEditData,
}));

const visibleNav = computed(() =>
  ADMIN_NAV.filter((entry) => isAdminNavRoleAllowed(entry.roles, access.value))
    .map((entry) => {
      if (isAdminNavGroup(entry)) {
        return {
          ...entry,
          items: entry.items.filter((item) => isAdminNavRoleAllowed(item.roles, access.value)),
        };
      }
      return entry;
    })
    .filter((entry) => !isAdminNavGroup(entry) || entry.items.length > 0),
);

const COLLAPSE_STORAGE_KEY = 'sidata_admin_sidebar_collapsed';
const isCollapsed = ref(false);

onMounted(() => {
  try {
    isCollapsed.value = window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
  } catch {
    // localStorage unavailable (private mode, SSR) — default to expanded.
  }
});

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, isCollapsed.value ? '1' : '0');
  } catch {
    // Best-effort persistence only.
  }
}

// Collapsing the rail still removes `entry.label` text visually, but the label stays in the DOM
// as sr-only so links and buttons keep an accessible name for keyboard/screen-reader users.
function labelClass(collapsed: boolean, expandedClass: string): string {
  return collapsed ? 'sr-only' : expandedClass;
}

function isGroupActive(group: AdminNavGroup) {
  return group.items.some((item) => route.path === item.to);
}

const isSistemOpen = ref(false);

watchEffect(() => {
  const sistem = visibleNav.value.find(isAdminNavGroup);
  if (sistem && isGroupActive(sistem)) {
    isSistemOpen.value = true;
  }
});

function toggleSistem() {
  isSistemOpen.value = !isSistemOpen.value;
}

function closeMobile() {
  emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.mobileOpen) {
    closeMobile();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

const isLoggingOut = ref(false);
const logoutError = ref('');

async function handleLogout() {
  isLoggingOut.value = true;
  logoutError.value = '';
  const result = await logout();
  if (!result.ok) {
    logoutError.value = result.error;
  }
  isLoggingOut.value = false;
}
</script>

<template>
  <nav
    aria-label="Navigasi Admin"
    class="bg-brand-navy fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col border-r border-white/10 text-white transition-all duration-200 md:static md:translate-x-0"
    :class="[mobileOpen ? 'translate-x-0' : '-translate-x-full', isCollapsed ? 'md:w-20' : 'md:w-72']"
    data-test="admin-sidebar"
  >
    <div class="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-5">
      <RouterLink
        to="/admin"
        class="focus-visible:ring-brand-cyan rounded-btn flex min-w-0 items-center gap-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <img
          :src="balikpapanLogo"
          alt="Logo Kota Balikpapan"
          class="h-9 w-auto shrink-0 object-contain"
        />
        <span :class="labelClass(isCollapsed, 'min-w-0 text-left')">
          <span class="block truncate text-base leading-tight font-bold text-white">SIDATA</span>
          <span class="block truncate text-xs leading-tight text-white/60">
            Sistem Informasi Data Terpadu Kelurahan
          </span>
        </span>
      </RouterLink>

      <!-- Mobile: close the drawer. Desktop: collapse the rail. Never both at once. -->
      <button
        type="button"
        class="focus-visible:ring-brand-cyan rounded-btn shrink-0 border border-white/20 p-1.5 text-white/70 transition-transform hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:outline-none md:hidden"
        aria-label="Tutup menu navigasi"
        data-test="sidebar-mobile-close"
        @click="closeMobile"
      >
        <XMarkIcon class="h-5 w-5" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="focus-visible:ring-brand-cyan rounded-btn hidden shrink-0 border border-white/20 p-1.5 text-white/70 transition-transform hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
        :aria-expanded="!isCollapsed"
        aria-controls="admin-sidebar-nav-list"
        :aria-label="isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'"
        data-test="sidebar-collapse-toggle"
        @click="toggleCollapse"
      >
        <ChevronDoubleLeftIcon
          class="h-5 w-5 transition-transform duration-200"
          :class="isCollapsed ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
    </div>

    <ul id="admin-sidebar-nav-list" class="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      <li v-for="entry in visibleNav" :key="entry.label">
        <RouterLink
          v-if="!isAdminNavGroup(entry)"
          :to="entry.to"
          class="focus-visible:ring-brand-cyan rounded-btn flex items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            route.path === entry.to
              ? 'border-brand-cyan bg-white/10 text-white'
              : 'text-white/70 hover:bg-white/5 hover:text-white'
          "
          :aria-current="route.path === entry.to ? 'page' : undefined"
          :data-test="entry.dataTest"
          @click="closeMobile"
        >
          <component :is="entry.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
          <span :class="labelClass(isCollapsed, 'truncate')">{{ entry.label }}</span>
        </RouterLink>

        <div v-else>
          <button
            type="button"
            class="focus-visible:ring-brand-cyan rounded-btn flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:outline-none"
            :aria-expanded="isSistemOpen"
            aria-controls="admin-sistem-group"
            :data-test="entry.dataTest"
            @click="toggleSistem"
          >
            <component :is="entry.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            <span :class="labelClass(isCollapsed, 'flex-1 truncate text-left')">
              {{ entry.label }}
            </span>
            <ChevronDownIcon
              v-if="!isCollapsed"
              class="h-4 w-4 shrink-0 transition-transform duration-200"
              :class="isSistemOpen ? 'rotate-180' : ''"
              aria-hidden="true"
            />
          </button>

          <ul
            v-show="isSistemOpen"
            id="admin-sistem-group"
            class="mt-1 space-y-1"
            :class="isCollapsed ? '' : 'pl-8'"
          >
            <li v-for="item in entry.items" :key="item.label">
              <RouterLink
                :to="item.to"
                class="focus-visible:ring-brand-cyan rounded-btn flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  route.path === item.to
                    ? 'border-brand-cyan bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                "
                :aria-current="route.path === item.to ? 'page' : undefined"
                :data-test="item.dataTest"
                @click="closeMobile"
              >
                <component :is="item.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
                <span :class="labelClass(isCollapsed, 'truncate')">{{ item.label }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <div class="space-y-1 border-t border-white/10 px-3 py-4">
      <RouterLink
        to="/"
        class="focus-visible:ring-brand-cyan rounded-btn flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:outline-none"
        data-test="nav-public-site"
      >
        <GlobeAltIcon class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span :class="labelClass(isCollapsed, 'truncate')">Kembali ke Situs Publik</span>
      </RouterLink>

      <p
        v-if="logoutError"
        role="alert"
        class="px-3 text-xs text-rose-300"
        data-test="logout-error"
      >
        {{ logoutError }}
      </p>

      <button
        type="button"
        class="focus-visible:ring-brand-cyan rounded-btn flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        data-test="nav-logout"
        :disabled="isLoggingOut"
        @click="handleLogout"
      >
        <ArrowLeftOnRectangleIcon class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span :class="labelClass(isCollapsed, 'truncate')">
          {{ isLoggingOut ? 'Keluar…' : 'Keluar' }}
        </span>
      </button>
    </div>
  </nav>
</template>
