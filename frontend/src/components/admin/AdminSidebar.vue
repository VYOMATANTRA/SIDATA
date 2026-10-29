<script setup lang="ts">
import { ref, computed, onMounted, watchEffect } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { ChevronDownIcon, ChevronDoubleLeftIcon } from '@heroicons/vue/24/outline';
import { useAuthStore } from '../../stores/auth';
import {
  ADMIN_NAV,
  isAdminNavGroup,
  isAdminNavRoleAllowed,
  type AdminNavGroup,
} from '../../config/adminNav';
// TODO: replace with a dedicated SIDATA wordmark/icon once design provides one.
import balikpapanLogo from '@/assets/img/logo_balikpapan.png';

const route = useRoute();
const authStore = useAuthStore();

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
</script>

<template>
  <nav
    aria-label="Navigasi Admin"
    class="flex h-full flex-col border-r border-slate-200 bg-white transition-[width] duration-200"
    :class="isCollapsed ? 'w-20' : 'w-72'"
    data-test="admin-sidebar"
  >
    <div class="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-5">
      <RouterLink
        to="/admin"
        class="focus-visible:ring-brand-indigo rounded-btn flex min-w-0 items-center gap-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <img
          :src="balikpapanLogo"
          alt="Logo Kota Balikpapan"
          class="h-9 w-auto shrink-0 object-contain"
        />
        <span v-if="!isCollapsed" class="min-w-0 text-left">
          <span class="text-brand-navy block truncate text-base leading-tight font-bold">
            SIDATA
          </span>
          <span class="block truncate text-xs leading-tight text-slate-500">
            Sistem Informasi Data Terpadu Kelurahan
          </span>
        </span>
      </RouterLink>

      <button
        type="button"
        class="focus-visible:ring-brand-indigo rounded-btn shrink-0 border border-slate-200 p-1.5 text-slate-500 transition-transform hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none"
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
          class="focus-visible:ring-brand-indigo rounded-btn flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            route.path === entry.to
              ? 'bg-brand-navy/10 text-brand-navy'
              : 'text-slate-700 hover:bg-slate-100'
          "
          :aria-current="route.path === entry.to ? 'page' : undefined"
          :data-test="entry.dataTest"
        >
          <component :is="entry.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
          <span v-if="!isCollapsed" class="truncate">{{ entry.label }}</span>
        </RouterLink>

        <div v-else>
          <button
            type="button"
            class="focus-visible:ring-brand-indigo rounded-btn flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none"
            :aria-expanded="isSistemOpen"
            aria-controls="admin-sistem-group"
            :data-test="entry.dataTest"
            @click="toggleSistem"
          >
            <component :is="entry.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            <span v-if="!isCollapsed" class="flex-1 truncate text-left">{{ entry.label }}</span>
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
                class="focus-visible:ring-brand-indigo rounded-btn flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  route.path === item.to
                    ? 'bg-brand-navy/10 text-brand-navy'
                    : 'text-slate-600 hover:bg-slate-100'
                "
                :aria-current="route.path === item.to ? 'page' : undefined"
                :data-test="item.dataTest"
              >
                <component :is="item.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
                <span v-if="!isCollapsed" class="truncate">{{ item.label }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </nav>
</template>
