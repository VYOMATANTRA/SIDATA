<script setup lang="ts">
import { ref, computed, toRef, watch, watchEffect } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import {
  ChevronDownIcon,
  ChevronDoubleLeftIcon,
  XMarkIcon,
  GlobeAltIcon,
  ArrowLeftStartOnRectangleIcon,
} from '@heroicons/vue/24/outline';
import { useAuthStore } from '../../stores/auth';
import { useLogout } from '../../composables/useLogout';
import { useDrawerFocusTrap } from '../../composables/useDrawerFocusTrap';
import {
  ADMIN_NAV,
  isAdminNavGroup,
  isAdminNavRoleAllowed,
  type AdminNavGroup,
} from '../../config/adminNav';
// TODO: replace with a dedicated SIDATA wordmark/icon once design provides one.
import balikpapanLogo from '@/assets/img/logo_balikpapan.webp';

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

function readInitialCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
  } catch {
    // localStorage unavailable (private mode, SSR) — default to expanded.
    return false;
  }
}

const isCollapsed = ref(readInitialCollapsed());

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
// "Collapsed" is a desktop-rail preference (persisted in localStorage) — it must never apply to
// the mobile drawer, which is a separate full-width overlay with its own open/close state, or
// someone who collapsed the rail on desktop would open the app on a phone to a drawer of
// unlabeled icons with no way to undo it (the collapse toggle is desktop-only). `md:sr-only`
// instead of bare `sr-only` keeps labels visible at every width below the md breakpoint.
function labelClass(collapsed: boolean, expandedClass: string): string {
  return collapsed ? `${expandedClass} md:sr-only` : expandedClass;
}

function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

// A route "belongs" to a nav entry either by normalized path match, or by declaring
// `meta.navActiveFor` (see router/index.ts) when it's a child page reached by some other means
// than clicking this entry (e.g. /settings/audit-retention, linked from inside UserManagement.vue
// rather than the sidebar). Plain path-prefix matching isn't safe here: most ADMIN_NAV entries are
// /admin/* siblings, so prefix-matching against '/admin' would also light up Beranda everywhere.
function isNavActive(to: string): boolean {
  const normalizedTo = normalizePath(to);
  if (normalizePath(route.path) === normalizedTo) return true;
  return (
    typeof route.meta.navActiveFor === 'string' &&
    normalizePath(route.meta.navActiveFor) === normalizedTo
  );
}

function isGroupActive(group: AdminNavGroup) {
  return group.items.some((item) => isNavActive(item.to));
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

// When the user taps a link for the page they are already viewing, `route.path` does not change,
// so close immediately (which leaves `route.path === openedPath` in AdminHeader.vue and restores
// focus to the hamburger toggle). When tapping a link to a different page, wait for `route.path`
// to commit before closing so `route.path !== openedPath` is already true when AdminHeader.vue's
// watcher runs, letting AdminLayout move focus directly to <main>.
function closeMobileOnSamePage(to: string) {
  if (route.path === to) {
    closeMobile();
  }
}

watch(() => route.path, closeMobile);

const sidebarRef = ref<HTMLElement | null>(null);
const mobileCloseButtonRef = ref<HTMLButtonElement | null>(null);

// Moves focus into the drawer when it opens on mobile, traps Tab/Shift+Tab inside it, and closes
// on Escape (ignoring Escape events from open modal dialogs). Returning focus to the header toggle
// button on close is AdminHeader.vue's job — it owns that button.
useDrawerFocusTrap({
  isOpen: toRef(props, 'mobileOpen'),
  containerRef: sidebarRef,
  initialFocusRef: mobileCloseButtonRef,
  onEscape: closeMobile,
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
    id="admin-sidebar"
    ref="sidebarRef"
    aria-label="Navigasi Admin"
    class="bg-brand-navy fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col border-r border-white/10 text-white transition-all duration-200 md:visible md:relative md:translate-x-0"
    :class="[
      mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
      isCollapsed ? 'md:w-20' : 'md:w-72',
    ]"
    data-test="admin-sidebar"
  >
    <div
      class="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-5"
      :class="isCollapsed ? 'md:flex-col md:justify-center md:gap-3 md:px-2' : ''"
      data-test="sidebar-header"
    >
      <RouterLink
        to="/admin"
        class="focus-visible:ring-brand-cyan rounded-btn flex min-w-0 items-center gap-3 focus-visible:ring-2 focus-visible:outline-none"
        :class="isCollapsed ? 'md:flex-col md:gap-1' : ''"
        @click="closeMobileOnSamePage('/admin')"
      >
        <img
          :src="balikpapanLogo"
          alt="Logo Kota Balikpapan"
          class="h-9 w-auto shrink-0 object-contain"
          :class="isCollapsed ? 'md:h-10 md:max-w-full' : ''"
        />
        <span class="min-w-0 text-left" :class="isCollapsed ? 'md:w-full md:text-center' : ''">
          <span
            class="block truncate text-base leading-tight font-bold text-white"
            :class="isCollapsed ? 'md:text-sm' : ''"
            data-test="sidebar-brand-name"
            >SIDATA</span
          >
          <span
            :class="labelClass(isCollapsed, 'block truncate text-xs leading-tight text-white/60')"
          >
            Sistem Informasi Data Terpadu Kelurahan
          </span>
        </span>
      </RouterLink>

      <!-- Mobile: close the drawer. Desktop: collapse the rail. Never both at once. -->
      <button
        ref="mobileCloseButtonRef"
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
        :inert="mobileOpen ? true : undefined"
        :aria-expanded="!isCollapsed"
        aria-controls="admin-sidebar-nav-list"
        :aria-label="isCollapsed ? 'Bentangkan sidebar' : 'Ciutkan sidebar'"
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

    <ul id="admin-sidebar-nav-list" class="relative flex-1 space-y-1 overflow-y-auto px-3 py-4">
      <li v-for="entry in visibleNav" :key="entry.label">
        <RouterLink
          v-if="!isAdminNavGroup(entry)"
          :to="entry.to"
          class="focus-visible:ring-brand-cyan rounded-btn flex items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            isNavActive(entry.to)
              ? 'border-brand-cyan bg-white/10 text-white'
              : 'text-white/70 hover:bg-white/5 hover:text-white'
          "
          :aria-current="isNavActive(entry.to) ? 'page' : undefined"
          :title="isCollapsed ? entry.label : undefined"
          :data-test="entry.dataTest"
          @click="closeMobileOnSamePage(entry.to)"
        >
          <component :is="entry.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
          <span
            :class="
              labelClass(isCollapsed, 'flex min-w-0 flex-1 items-center justify-between gap-2')
            "
          >
            <span class="truncate">{{ entry.label }}</span>
            <span
              v-if="entry.badge"
              class="shrink-0 rounded-full border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/70 uppercase"
            >
              {{ entry.badge }}
            </span>
          </span>
        </RouterLink>

        <div v-else>
          <button
            type="button"
            class="focus-visible:ring-brand-cyan rounded-btn flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:outline-none"
            :aria-expanded="isSistemOpen"
            aria-controls="admin-sistem-group"
            :title="isCollapsed ? entry.label : undefined"
            :data-test="entry.dataTest"
            @click="toggleSistem"
          >
            <component :is="entry.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            <span :class="labelClass(isCollapsed, 'flex-1 truncate text-left')">
              {{ entry.label }}
            </span>
            <ChevronDownIcon
              class="h-4 w-4 shrink-0 transition-transform duration-200"
              :class="[isSistemOpen ? 'rotate-180' : '', isCollapsed ? 'md:hidden' : '']"
              aria-hidden="true"
            />
          </button>

          <ul
            v-show="isSistemOpen"
            id="admin-sistem-group"
            class="mt-1 space-y-1 pl-8"
            :class="isCollapsed ? 'md:pl-0' : ''"
          >
            <li v-for="item in entry.items" :key="item.label">
              <RouterLink
                :to="item.to"
                class="focus-visible:ring-brand-cyan rounded-btn flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  isNavActive(item.to)
                    ? 'border-brand-cyan bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                "
                :aria-current="isNavActive(item.to) ? 'page' : undefined"
                :title="isCollapsed ? item.label : undefined"
                :data-test="item.dataTest"
                @click="closeMobileOnSamePage(item.to)"
              >
                <component :is="item.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
                <span
                  :class="
                    labelClass(
                      isCollapsed,
                      'flex min-w-0 flex-1 items-center justify-between gap-2',
                    )
                  "
                >
                  <span class="truncate">{{ item.label }}</span>
                  <span
                    v-if="item.badge"
                    class="shrink-0 rounded-full border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/70 uppercase"
                  >
                    {{ item.badge }}
                  </span>
                </span>
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
        :title="isCollapsed ? 'Kembali ke Situs Publik' : undefined"
        data-test="nav-public-site"
        @click="closeMobile"
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
        :title="isCollapsed ? 'Keluar' : undefined"
        data-test="nav-logout"
        :disabled="isLoggingOut"
        @click="handleLogout"
      >
        <ArrowLeftStartOnRectangleIcon class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span :class="labelClass(isCollapsed, 'truncate')">
          {{ isLoggingOut ? 'Keluar…' : 'Keluar' }}
        </span>
      </button>
    </div>
  </nav>
</template>
