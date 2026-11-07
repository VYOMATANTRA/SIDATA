<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { usePagesStore } from '../../stores/pages.store';
import { useLogout } from '../../composables/useLogout';
import { getAdminEntryLink } from '../../config/adminNav';
import {
  NAV_HOME_ITEM,
  buildCeritaItems,
  buildPublicNavGroups,
  isDestinationActive,
  isNavGroupActive,
  isRouteAvailable,
} from '../../config/publicNav';

/**
 * Content of the public navigation menu: Beranda, the Cerita / Sumber Daya / Tentang groups and
 * one role-aware account area. Rendered inside `AppNavbar`'s menu panel (a modal sheet on mobile,
 * an anchored panel on desktop), which owns open/close, focus and scroll behaviour. Plain links
 * and buttons only; this is site navigation, not an application menu (no `role="menu"`).
 */
const props = withDefaults(defineProps<{ open?: boolean }>(), { open: true });
const emit = defineEmits<{ (e: 'navigate'): void }>();

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const pagesStore = usePagesStore();
const { logout } = useLogout();

const currentPath = computed(() => route?.path ?? '/');

// Cerita topics follow the page hierarchy; until it loads (or if loading fails) the deterministic
// fallback links keep the group usable.
const ceritaItems = computed(() => buildCeritaItems(pagesStore.isLoaded ? pagesStore.pages : null));
const groups = computed(() => buildPublicNavGroups(router, ceritaItems.value));
const showHome = computed(() => isRouteAvailable(router, NAV_HOME_ITEM.to));

const adminEntry = computed(() =>
  getAdminEntryLink({ isAdmin: authStore.isAdmin, canEditData: authStore.canEditData }),
);

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  user: 'Pengguna',
};
const roleLabel = computed(() => {
  const role = authStore.user?.role ?? '';
  return ROLE_LABELS[role.toLowerCase()] ?? role;
});

const isLoggingOut = ref(false);
const logoutError = ref('');

// A stale logout error must not greet the user the next time the menu opens or after navigating.
watch(
  () => props.open,
  (open) => {
    if (!open) logoutError.value = '';
  },
);
watch(
  () => route?.fullPath,
  () => {
    logoutError.value = '';
  },
);

async function handleLogout() {
  if (isLoggingOut.value) return;
  isLoggingOut.value = true;
  logoutError.value = '';
  try {
    const result = await logout();
    if (!result.ok) {
      logoutError.value = result.error;
    }
  } finally {
    isLoggingOut.value = false;
  }
}

const LINK_BASE =
  'rounded-btn flex min-h-11 items-center border-l-4 px-3 py-2 text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse';
const LINK_ACTIVE = 'border-white bg-white/15 font-semibold text-white';
const LINK_IDLE = 'border-transparent text-white hover:bg-white/10';

function linkClasses(to: string): string[] {
  return [LINK_BASE, isDestinationActive(to, currentPath.value) ? LINK_ACTIVE : LINK_IDLE];
}

const BUTTON_BASE =
  'rounded-btn inline-flex min-h-11 items-center justify-center px-5 py-2 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse';
</script>

<template>
  <div class="space-y-6" data-test="public-menu">
    <ul v-if="showHome" class="space-y-1">
      <li>
        <RouterLink
          :to="NAV_HOME_ITEM.to"
          :class="linkClasses(NAV_HOME_ITEM.to)"
          :aria-current="isDestinationActive(NAV_HOME_ITEM.to, currentPath) ? 'page' : undefined"
          data-test="menu-link-home"
          @click="emit('navigate')"
        >
          {{ NAV_HOME_ITEM.label }}
        </RouterLink>
      </li>
    </ul>

    <div class="grid gap-6 md:grid-cols-3">
      <div
        v-for="group in groups"
        :key="group.id"
        :data-test="`menu-group-${group.id}`"
        :data-active="isNavGroupActive(group, currentPath) ? 'true' : undefined"
      >
        <p
          :id="`menu-group-label-${group.id}`"
          class="mb-2 flex items-center gap-2 px-3 text-sm font-semibold tracking-wide uppercase"
          :class="isNavGroupActive(group, currentPath) ? 'text-white' : 'text-text-inverse-muted'"
        >
          <span
            v-if="isNavGroupActive(group, currentPath)"
            class="h-1.5 w-1.5 shrink-0 rounded-full bg-white"
            aria-hidden="true"
          />
          {{ group.label }}
        </p>
        <ul class="space-y-1" :aria-labelledby="`menu-group-label-${group.id}`">
          <li v-for="item in group.items" :key="item.to">
            <RouterLink
              :to="item.to"
              :class="linkClasses(item.to)"
              :aria-current="isDestinationActive(item.to, currentPath) ? 'page' : undefined"
              @click="emit('navigate')"
            >
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>

    <!-- One account area for every public page; one logged-out action. -->
    <div
      role="group"
      aria-label="Akun"
      class="border-t border-white/15 pt-5"
      data-test="menu-account"
    >
      <template v-if="authStore.isAuthenticated">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <p class="truncate text-base font-semibold" data-test="menu-account-email">
              {{ authStore.user?.email }}
            </p>
            <p class="text-text-inverse-muted text-sm" data-test="menu-account-role">
              Peran: {{ roleLabel }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <RouterLink
              v-if="adminEntry"
              :to="adminEntry.to"
              :class="[BUTTON_BASE, 'border border-white/40 text-white hover:bg-white/10']"
              data-test="menu-admin-link"
              @click="emit('navigate')"
            >
              Kelola Konten
            </RouterLink>
            <button
              type="button"
              :class="[
                BUTTON_BASE,
                'text-brand-navy hover:bg-surface-hover aria-disabled:bg-surface-hover aria-disabled:text-text-muted bg-white aria-disabled:cursor-not-allowed',
              ]"
              :aria-disabled="isLoggingOut ? 'true' : undefined"
              data-test="menu-logout-btn"
              @click="handleLogout"
            >
              {{ isLoggingOut ? 'Memproses...' : 'Keluar' }}
            </button>
          </div>
        </div>
        <p
          v-if="logoutError"
          role="alert"
          class="rounded-btn border-status-error-border bg-status-error-surface text-status-error mt-3 border px-3 py-2 text-sm font-medium"
          data-test="menu-logout-error"
        >
          {{ logoutError }}
        </p>
      </template>
      <RouterLink
        v-else
        to="/login"
        :class="[BUTTON_BASE, 'text-brand-navy hover:bg-surface-hover w-full bg-white md:w-auto']"
        data-test="menu-login-link"
        @click="emit('navigate')"
      >
        Masuk
      </RouterLink>
    </div>
  </div>
</template>
