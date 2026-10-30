import type { Component } from 'vue';
import {
  HomeIcon,
  ChartBarIcon,
  BookOpenIcon,
  MapIcon,
  PresentationChartBarIcon,
  BuildingLibraryIcon,
  Cog6ToothIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  AdjustmentsHorizontalIcon,
  ListBulletIcon,
} from '@heroicons/vue/24/outline';

/**
 * Roles that can see a nav item/group. Mirrors `authStore.isAdmin` / `authStore.canEditData`
 * (SPEC §3): 'editor' means visible to Editor or Admin, 'admin' means Admin-only.
 */
export type AdminNavRole = 'editor' | 'admin';

export interface AdminNavLink {
  label: string;
  to: string;
  icon: Component;
  roles: AdminNavRole[];
  dataTest: string;
  /**
   * Short pill text shown next to the label — e.g. "Segera hadir" for a link that only opens a
   * placeholder view (SPEC: "Links to pages that don't exist yet point at placeholders"). Keeps
   * the link navigable (not hidden/disabled) while telling an editor up front there's nothing
   * built there yet, rather than them finding out after the click.
   */
  badge?: string;
}

export interface AdminNavGroup {
  label: string;
  icon: Component;
  roles: AdminNavRole[];
  dataTest: string;
  items: AdminNavLink[];
}

export function isAdminNavGroup(entry: AdminNavLink | AdminNavGroup): entry is AdminNavGroup {
  return 'items' in entry;
}

/**
 * Single source of truth for sidebar visibility AND route guarding (SPEC §3: "Resources a role
 * isn't authorized for are hidden ... Visibility derives from one role-to-items map shared with
 * the route guards, so nav and routes can't disagree."). `router/index.ts` reads the `roles` of
 * each entry here to derive `meta.requiresAdmin` / `meta.requiresEditor` for the matching route.
 */
export const ADMIN_NAV: (AdminNavLink | AdminNavGroup)[] = [
  {
    label: 'Beranda',
    to: '/admin',
    icon: HomeIcon,
    roles: ['editor', 'admin'],
    dataTest: 'nav-beranda',
  },
  {
    label: 'Data',
    to: '/data',
    icon: ChartBarIcon,
    roles: ['editor', 'admin'],
    dataTest: 'nav-data',
  },
  {
    label: 'Cerita',
    to: '/admin/cerita',
    icon: BookOpenIcon,
    roles: ['editor', 'admin'],
    dataTest: 'nav-cerita',
    badge: 'Segera hadir',
  },
  {
    label: 'Peta',
    to: '/admin/peta',
    icon: MapIcon,
    roles: ['editor', 'admin'],
    dataTest: 'nav-peta',
    badge: 'Segera hadir',
  },
  {
    label: 'Publikasi',
    to: '/admin/publikasi',
    icon: PresentationChartBarIcon,
    roles: ['editor', 'admin'],
    dataTest: 'nav-publikasi',
    badge: 'Segera hadir',
  },
  {
    label: 'Rukun Tetangga',
    to: '/admin/rukun-tetangga',
    icon: BuildingLibraryIcon,
    roles: ['editor', 'admin'],
    dataTest: 'nav-rukun-tetangga',
    badge: 'Segera hadir',
  },
  {
    label: 'Sistem',
    icon: Cog6ToothIcon,
    roles: ['admin'],
    dataTest: 'nav-sistem',
    items: [
      {
        label: 'Akun pengguna',
        to: '/users',
        icon: UserIcon,
        roles: ['admin'],
        dataTest: 'nav-sistem-akun-pengguna',
      },
      {
        label: 'Templat kalimat',
        to: '/admin/sistem/templat-kalimat',
        icon: ChatBubbleLeftRightIcon,
        roles: ['admin'],
        dataTest: 'nav-sistem-templat-kalimat',
        badge: 'Segera hadir',
      },
      {
        label: 'Konfigurasi sistem',
        to: '/admin/sistem/konfigurasi',
        icon: AdjustmentsHorizontalIcon,
        roles: ['admin'],
        dataTest: 'nav-sistem-konfigurasi',
        badge: 'Segera hadir',
      },
      {
        label: 'Log sistem',
        to: '/audit-logs',
        icon: ListBulletIcon,
        roles: ['admin'],
        dataTest: 'nav-sistem-log',
      },
    ],
  },
];

export function isAdminNavRoleAllowed(
  roles: AdminNavRole[],
  access: { isAdmin: boolean; canEditData: boolean },
): boolean {
  if (roles.includes('admin') && access.isAdmin) return true;
  if (roles.includes('editor') && access.canEditData) return true;
  return false;
}
