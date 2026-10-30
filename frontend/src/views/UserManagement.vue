<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ClockIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/vue/24/outline';
import { useUsersStore, type UserItem } from '../stores/users.store';
import { useAuthStore } from '../stores/auth';
import { setAdminHeader } from '../composables/useAdminHeader';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import { INPUT_CLASSES } from '../utils/formStyles';

const usersStore = useUsersStore();
const authStore = useAuthStore();

const searchQuery = ref('');
const isCreateModalOpen = ref(false);
const isRoleModalOpen = ref(false);
const isPasswordModalOpen = ref(false);
const isConfirmModalOpen = ref(false);
const confirmActionType = ref<'deactivate' | 'activate'>('deactivate');

const selectedUser = ref<UserItem | null>(null);
const newRoleSelection = ref('');

// Form state for creating user
const createForm = ref({
  email: '',
  roleId: '',
  password: '',
});
const createError = ref('');
const createSuccess = ref('');
const isSubmitting = ref(false);
let createCloseTimer: ReturnType<typeof setTimeout> | null = null;

// Form state for changing user password
const newPassword = ref('');
const isNewPasswordTouched = ref(false);
const passwordError = ref('');
const passwordSuccess = ref('');
let passwordCloseTimer: ReturnType<typeof setTimeout> | null = null;

const COMMON_WEAK_PASSWORDS = [
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'qwertyui',
  'qwerty123',
  'indonesia',
  'admin1234',
];

function isWeakPassword(pwd: string, mail: string): boolean {
  const lower = pwd.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.includes(lower)) return true;
  if (mail) {
    const parts = mail.split('@');
    const prefix = (parts[0] || '').toLowerCase();
    if (prefix && prefix.length >= 3 && lower.includes(prefix)) return true;
  }
  return false;
}

const newPasswordError = computed(() => {
  if (!isNewPasswordTouched.value) return '';
  if (!newPassword.value) return 'Password wajib diisi';
  if (newPassword.value.length < 8) return 'Password minimal harus 8 karakter.';
  if (newPassword.value.length > 128) return 'Password terlalu panjang (maksimal 128 karakter).';
  if (isWeakPassword(newPassword.value, selectedUser.value?.email || ''))
    return 'Password terlalu lemah atau umum digunakan.';
  return '';
});

const isNewPasswordValid = computed(() => {
  if (!newPassword.value) return false;
  if (newPassword.value.length < 8 || newPassword.value.length > 128) return false;
  if (isWeakPassword(newPassword.value, selectedUser.value?.email || '')) return false;
  return true;
});

const filteredUsers = computed(() => {
  if (!searchQuery.value.trim()) return usersStore.users;
  const q = searchQuery.value.toLowerCase().trim();
  return usersStore.users.filter(
    (u) =>
      u.email.toLowerCase().includes(q) ||
      u.role?.name.toLowerCase().includes(q) ||
      (u.deletedAt ? 'nonaktif' : 'aktif').includes(q),
  );
});

onMounted(async () => {
  setAdminHeader(
    'Manajemen Pengguna',
    'Kelola akun pengguna sistem, hak akses, dan status aktivasi.',
  );
  await Promise.all([usersStore.fetchUsers(), usersStore.fetchRoles()]);
});

function openCreateModal() {
  if (createCloseTimer) {
    clearTimeout(createCloseTimer);
    createCloseTimer = null;
  }
  const defaultRole =
    usersStore.roles.find((r) => r.name.toLowerCase() === 'user') || usersStore.roles[0];

  createForm.value = {
    email: '',
    roleId: defaultRole?.id || '',
    password: generateRandomPassword(),
  };
  createError.value = '';
  createSuccess.value = '';
  isCreateModalOpen.value = true;
}

function openRoleModal(user: UserItem) {
  selectedUser.value = user;
  newRoleSelection.value = user.roleId;
  isRoleModalOpen.value = true;
}

function openPasswordModal(user: UserItem) {
  if (passwordCloseTimer) {
    clearTimeout(passwordCloseTimer);
    passwordCloseTimer = null;
  }
  selectedUser.value = user;
  newPassword.value = '';
  isNewPasswordTouched.value = false;
  passwordError.value = '';
  passwordSuccess.value = '';
  isPasswordModalOpen.value = true;
}

function openConfirmModal(user: UserItem, action: 'deactivate' | 'activate') {
  selectedUser.value = user;
  confirmActionType.value = action;
  isConfirmModalOpen.value = true;
}

const confirmTitle = computed(() =>
  confirmActionType.value === 'activate' ? 'Aktifkan Pengguna?' : 'Nonaktifkan Pengguna?',
);

const confirmDescription = computed(() => {
  const email = selectedUser.value?.email ?? '';
  return confirmActionType.value === 'activate'
    ? `Akun ${email} akan diaktifkan kembali dan dapat masuk seperti biasa.`
    : `Akun ${email} akan dinonaktifkan dan tidak dapat masuk sampai diaktifkan kembali.`;
});

function generateRandomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint32Array(12);
  crypto.getRandomValues(array);
  let pass = '';
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(array[i]! % chars.length);
  }
  return pass;
}

async function handleCreateUser() {
  createError.value = '';
  createSuccess.value = '';
  if (!createForm.value.email || !createForm.value.roleId || !createForm.value.password) {
    createError.value = 'Semua field wajib diisi.';
    return;
  }

  isSubmitting.value = true;
  try {
    const res = await usersStore.createUser(createForm.value);
    createSuccess.value = res.message || 'Pengguna berhasil dibuat.';
    createCloseTimer = setTimeout(() => {
      isCreateModalOpen.value = false;
      createCloseTimer = null;
    }, 1200);
  } catch (err: unknown) {
    createError.value = err instanceof Error ? err.message : 'Gagal membuat pengguna.';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleUpdateRole() {
  if (!selectedUser.value || !newRoleSelection.value) return;
  isSubmitting.value = true;
  try {
    await usersStore.updateUserRole(selectedUser.value.id, newRoleSelection.value);
    isRoleModalOpen.value = false;
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : 'Gagal memperbarui role');
  } finally {
    isSubmitting.value = false;
  }
}

async function handleChangePassword() {
  isNewPasswordTouched.value = true;
  if (!isNewPasswordValid.value || !selectedUser.value) return;

  isSubmitting.value = true;
  passwordError.value = '';
  passwordSuccess.value = '';
  try {
    const res = await usersStore.changeUserPassword(selectedUser.value.id, newPassword.value);
    passwordSuccess.value = res.message || 'Password pengguna berhasil diperbarui.';
    passwordCloseTimer = setTimeout(() => {
      isPasswordModalOpen.value = false;
      passwordCloseTimer = null;
    }, 1200);
  } catch (err: unknown) {
    passwordError.value = err instanceof Error ? err.message : 'Gagal mengubah password pengguna.';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleConfirmAction() {
  if (!selectedUser.value) return;
  isSubmitting.value = true;
  try {
    if (confirmActionType.value === 'activate') {
      await usersStore.reactivateUser(selectedUser.value.id);
    } else {
      await usersStore.deleteUser(selectedUser.value.id);
    }
    isConfirmModalOpen.value = false;
  } catch (err: unknown) {
    alert(
      err instanceof Error
        ? err.message
        : confirmActionType.value === 'activate'
          ? 'Gagal mengaktifkan pengguna'
          : 'Gagal menonaktifkan pengguna',
    );
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!--
      AdminLayout's header already renders the page's <h1> and subtitle (set via
      setAdminHeader in onMounted below) — this view only owns the action toolbar.
    -->
    <div class="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 pb-6">
      <router-link
        to="/settings/audit-retention"
        class="rounded-btn border-brand-navy text-brand-navy hover:bg-brand-navy focus-visible:outline-brand-navy inline-flex items-center justify-center gap-2 border-2 bg-white px-4 py-2 text-sm font-medium transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ClockIcon class="h-4 w-4" aria-hidden="true" />
        <span>Retensi Audit</span>
      </router-link>

      <BaseButton :left-icon="PlusIcon" @click="openCreateModal">Tambah Pengguna</BaseButton>
    </div>

    <!-- Controls (Search) -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="w-full max-w-sm">
        <label for="user-search" class="block text-xs font-medium text-slate-600">
          Cari pengguna
        </label>
        <div class="relative mt-1">
          <MagnifyingGlassIcon
            class="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="user-search"
            v-model="searchQuery"
            type="search"
            placeholder="Cari berdasarkan email atau role..."
            :class="INPUT_CLASSES"
            class="pl-10"
          />
        </div>
      </div>

      <p class="text-xs text-slate-600" aria-live="polite">
        Total: <span class="font-semibold text-slate-900">{{ filteredUsers.length }}</span> akun
      </p>
    </div>

    <!-- Error State -->
    <div
      v-if="usersStore.error"
      role="alert"
      class="rounded-card border border-rose-300 bg-rose-50 px-4 py-3"
    >
      <p class="text-sm font-medium text-rose-900">{{ usersStore.error }}</p>
    </div>

    <!-- Table -->
    <div class="rounded-card overflow-hidden border border-slate-200 bg-white shadow-xs">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Daftar pengguna sistem, lengkap dengan penyedia autentikasi, role, status akun, dan
            status verifikasi email.
          </caption>
          <thead>
            <tr class="bg-brand-navy text-xs font-semibold tracking-wider text-white uppercase">
              <th scope="col" class="px-6 py-4">Pengguna</th>
              <th scope="col" class="px-6 py-4">Penyedia Autentikasi</th>
              <th scope="col" class="px-6 py-4">Role</th>
              <th scope="col" class="px-6 py-4">Status Akun</th>
              <th scope="col" class="px-6 py-4">Verifikasi Email</th>
              <th scope="col" class="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-700">
            <tr v-if="usersStore.loading && !filteredUsers.length">
              <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                <div class="flex items-center justify-center gap-2">
                  <svg
                    class="text-brand-navy h-5 w-5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Memuat data pengguna...</span>
                </div>
              </td>
            </tr>

            <tr v-else-if="!filteredUsers.length">
              <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                Tidak ada data pengguna yang ditemukan.
              </td>
            </tr>

            <tr
              v-for="u in filteredUsers"
              :key="u.id"
              class="align-top transition duration-150 hover:bg-slate-50"
            >
              <!-- User Email -->
              <td class="px-6 py-4">
                <div class="font-semibold text-slate-900">{{ u.email }}</div>
                <div class="text-xs text-slate-500">ID: {{ u.id.substring(0, 8) }}...</div>
              </td>

              <!-- Auth Provider -->
              <td class="px-6 py-4 capitalize">
                <span
                  class="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {{ u.auth_provider }}
                </span>
              </td>

              <!-- Role Badge -->
              <td class="px-6 py-4">
                <span
                  :class="[
                    'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wider uppercase',
                    u.role?.name.toLowerCase() === 'admin'
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-slate-100 text-slate-700',
                  ]"
                >
                  {{ u.role?.name }}
                </span>
              </td>

              <!-- Account Status (Active vs Deactivated) -->
              <td class="px-6 py-4">
                <span
                  v-if="u.deletedAt == null"
                  class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold tracking-wider text-emerald-700 uppercase"
                >
                  Aktif
                </span>
                <span
                  v-else
                  class="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold tracking-wider text-rose-700 uppercase"
                >
                  Nonaktif
                </span>
              </td>

              <!-- Email Verification Status -->
              <td class="px-6 py-4">
                <span
                  v-if="u.email_verified"
                  class="inline-flex items-center text-xs font-medium text-emerald-700"
                >
                  Terverifikasi
                </span>
                <span v-else class="inline-flex items-center text-xs font-medium text-amber-700">
                  Belum Verifikasi
                </span>
              </td>

              <!-- Actions -->
              <td class="space-x-2 px-6 py-4 text-right">
                <template v-if="u.deletedAt == null">
                  <button
                    type="button"
                    @click="openRoleModal(u)"
                    class="rounded-btn focus-visible:outline-brand-navy border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1"
                  >
                    Ubah Role
                  </button>
                  <button
                    type="button"
                    @click="openPasswordModal(u)"
                    class="rounded-btn focus-visible:outline-brand-navy border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1"
                  >
                    Ganti Password
                  </button>
                  <button
                    v-if="u.id !== authStore.user?.id && u.role?.name.toLowerCase() !== 'admin'"
                    type="button"
                    @click="openConfirmModal(u, 'deactivate')"
                    class="rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-rose-700 transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-600"
                  >
                    Deactivate
                  </button>
                </template>

                <template v-else>
                  <button
                    type="button"
                    @click="openConfirmModal(u, 'activate')"
                    class="rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600"
                  >
                    Activate
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create User Modal -->
    <BaseModal
      :open="isCreateModalOpen"
      title="Tambah Pengguna Baru"
      description="Pengguna yang dibuat oleh Admin langsung terverifikasi dan diwajibkan membuat kata sandi saat pertama kali masuk."
      :busy="isSubmitting"
      @close="isCreateModalOpen = false"
    >
      <div
        v-if="createError"
        role="alert"
        class="rounded-card mb-4 border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-900"
      >
        {{ createError }}
      </div>
      <div
        v-if="createSuccess"
        role="status"
        class="rounded-card mb-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900"
      >
        {{ createSuccess }}
      </div>
      <div
        v-if="!usersStore.roles.length"
        class="rounded-card mb-4 border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
      >
        {{ usersStore.error || 'Daftar role tidak tersedia. Silakan muat ulang halaman.' }}
      </div>

      <form @submit.prevent="handleCreateUser" class="space-y-4">
        <div>
          <label for="create-user-email" class="mb-1 block text-xs font-medium text-slate-600">
            Email
          </label>
          <input
            id="create-user-email"
            v-model="createForm.email"
            type="email"
            placeholder="nama@email.com"
            required
            :class="INPUT_CLASSES"
          />
        </div>

        <div>
          <label for="create-user-role" class="mb-1 block text-xs font-medium text-slate-600">
            Role
          </label>
          <select id="create-user-role" v-model="createForm.roleId" required :class="INPUT_CLASSES">
            <option v-for="r in usersStore.roles" :key="r.id" :value="r.id">
              {{ r.name }}
            </option>
          </select>
        </div>

        <div>
          <div class="mb-1 flex items-center justify-between">
            <label for="create-user-password" class="block text-xs font-medium text-slate-600">
              Kata Sandi Awal
            </label>
            <button
              type="button"
              @click="createForm.password = generateRandomPassword()"
              class="text-brand-navy text-xs font-medium hover:underline"
            >
              Acak Sandi
            </button>
          </div>
          <input
            id="create-user-password"
            v-model="createForm.password"
            type="text"
            required
            :class="INPUT_CLASSES"
            class="font-mono"
          />
        </div>

        <div class="flex justify-end gap-3 pt-3">
          <BaseButton
            type="button"
            variant="secondary"
            :disabled="isSubmitting"
            @click="isCreateModalOpen = false"
          >
            Batal
          </BaseButton>
          <BaseButton type="submit" :disabled="isSubmitting">Simpan</BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- Update Role Modal -->
    <BaseModal
      :open="isRoleModalOpen"
      title="Ubah Role Pengguna"
      :description="`Pilih role baru untuk ${selectedUser?.email ?? ''}.`"
      :busy="isSubmitting"
      @close="isRoleModalOpen = false"
    >
      <div
        v-if="!usersStore.roles.length"
        class="rounded-card mb-4 border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
      >
        {{ usersStore.error || 'Daftar role tidak tersedia.' }}
      </div>

      <label for="update-role-select" class="mb-1 block text-xs font-medium text-slate-600">
        Role baru
      </label>
      <select id="update-role-select" v-model="newRoleSelection" :class="INPUT_CLASSES">
        <option v-for="r in usersStore.roles" :key="r.id" :value="r.id">
          {{ r.name }}
        </option>
      </select>

      <div class="flex justify-end gap-3 pt-5">
        <BaseButton
          type="button"
          variant="secondary"
          :disabled="isSubmitting"
          @click="isRoleModalOpen = false"
        >
          Batal
        </BaseButton>
        <BaseButton type="button" :disabled="isSubmitting" @click="handleUpdateRole">
          Simpan Perubahan
        </BaseButton>
      </div>
    </BaseModal>

    <!-- Change Password Modal -->
    <BaseModal
      :open="isPasswordModalOpen"
      title="Ganti Kata Sandi Pengguna"
      :description="`Atur kata sandi baru untuk ${selectedUser?.email ?? ''}. Pengguna akan diwajibkan mengganti kata sandi saat pertama kali masuk kembali.`"
      :busy="isSubmitting"
      @close="isPasswordModalOpen = false"
    >
      <div
        v-if="passwordError"
        role="alert"
        class="rounded-card mb-4 border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-900"
      >
        {{ passwordError }}
      </div>
      <div
        v-if="passwordSuccess"
        role="status"
        class="rounded-card mb-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900"
      >
        {{ passwordSuccess }}
      </div>

      <form @submit.prevent="handleChangePassword" class="space-y-4">
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label for="change-password-new" class="block text-xs font-medium text-slate-600">
              Kata Sandi Baru
            </label>
            <button
              type="button"
              @click="
                newPassword = generateRandomPassword();
                isNewPasswordTouched = true;
              "
              class="text-brand-navy text-xs font-medium hover:underline"
            >
              Acak Sandi
            </button>
          </div>
          <input
            id="change-password-new"
            v-model="newPassword"
            type="text"
            required
            :aria-invalid="!!newPasswordError"
            :aria-describedby="newPasswordError ? 'change-password-new-error' : undefined"
            @blur="isNewPasswordTouched = true"
            :class="INPUT_CLASSES"
            class="font-mono"
          />
          <p
            v-if="newPasswordError"
            id="change-password-new-error"
            class="mt-1 text-xs text-rose-700"
          >
            {{ newPasswordError }}
          </p>
        </div>

        <div class="flex justify-end gap-3 pt-3">
          <BaseButton
            type="button"
            variant="secondary"
            :disabled="isSubmitting"
            @click="isPasswordModalOpen = false"
          >
            Batal
          </BaseButton>
          <BaseButton
            type="submit"
            :disabled="
              isSubmitting || (isNewPasswordTouched && !isNewPasswordValid) || !newPassword
            "
          >
            Simpan Kata Sandi
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- Confirmation Modal (deactivate / activate) -->
    <BaseModal
      :open="isConfirmModalOpen"
      :title="confirmTitle"
      :description="confirmDescription"
      :busy="isSubmitting"
      @close="isConfirmModalOpen = false"
    >
      <div class="flex justify-end gap-3">
        <BaseButton
          type="button"
          variant="secondary"
          :disabled="isSubmitting"
          @click="isConfirmModalOpen = false"
        >
          Batal
        </BaseButton>
        <button
          type="button"
          @click="handleConfirmAction"
          :disabled="isSubmitting"
          :class="[
            'rounded-btn px-5 py-2.5 text-base font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
            confirmActionType === 'activate'
              ? 'bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600'
              : 'bg-rose-600 hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600',
          ]"
        >
          Ya
        </button>
      </div>
    </BaseModal>
  </div>
</template>
