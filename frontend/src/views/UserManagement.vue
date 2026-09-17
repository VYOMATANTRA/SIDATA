<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUsersStore, type UserItem } from '../stores/users.store';
import { useAuthStore } from '../stores/auth';

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
  <div class="min-h-screen bg-slate-950 p-6 font-sans text-slate-100 md:p-10">
    <div class="mx-auto max-w-7xl space-y-6">
      <!-- Top Bar / Header -->
      <div
        class="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center"
      >
        <div>
          <h1 class="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-white">
            <span>Manajemen Pengguna</span>
            <span
              class="rounded-full border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold tracking-wider text-indigo-300 uppercase"
            >
              Admin Portal
            </span>
          </h1>
          <p class="mt-1 text-sm text-slate-400">
            Kelola akun pengguna sistem, hak akses, dan status aktivasi.
          </p>
        </div>

        <button
          @click="openCreateModal"
          class="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 active:scale-95"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span>Tambah Pengguna</span>
        </button>
      </div>

      <!-- Controls (Search) -->
      <div class="flex items-center justify-between gap-4">
        <div class="relative w-full max-w-sm">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari berdasarkan email atau role..."
            class="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pr-4 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <svg
            class="absolute top-3 left-3 h-5 w-5 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div class="text-xs font-medium text-slate-400">
          Total: <span class="font-bold text-white">{{ filteredUsers.length }}</span> akun
        </div>
      </div>

      <!-- Error State -->
      <div
        v-if="usersStore.error"
        class="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
      >
        {{ usersStore.error }}
      </div>

      <!-- Table Container -->
      <div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <thead>
              <tr
                class="border-b border-slate-800 bg-slate-800/60 text-xs font-semibold tracking-wider text-slate-400 uppercase"
              >
                <th class="px-6 py-4">Pengguna</th>
                <th class="px-6 py-4">Penyedia Autentikasi</th>
                <th class="px-6 py-4">Role</th>
                <th class="px-6 py-4">Status Akun</th>
                <th class="px-6 py-4">Verifikasi Email</th>
                <th class="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <tr v-if="usersStore.loading && !filteredUsers.length">
                <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                  <div class="flex items-center justify-center gap-2">
                    <svg
                      class="h-5 w-5 animate-spin text-indigo-400"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      ></path>
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
                class="transition duration-150 hover:bg-slate-800/40"
              >
                <!-- User Email -->
                <td class="px-6 py-4">
                  <div class="font-semibold text-white">{{ u.email }}</div>
                  <div class="text-xs text-slate-500">ID: {{ u.id.substring(0, 8) }}...</div>
                </td>

                <!-- Auth Provider -->
                <td class="px-6 py-4 capitalize">
                  <span
                    class="inline-flex items-center rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300"
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
                        ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                        : 'border-slate-700 bg-slate-800 text-slate-300',
                    ]"
                  >
                    {{ u.role?.name }}
                  </span>
                </td>

                <!-- Account Status (Active vs Deactivated) -->
                <td class="px-6 py-4">
                  <span
                    v-if="u.deletedAt == null"
                    class="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold tracking-wider text-emerald-400 uppercase"
                  >
                    Aktif
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold tracking-wider text-rose-400 uppercase"
                  >
                    Nonaktif
                  </span>
                </td>

                <!-- Email Verification Status -->
                <td class="px-6 py-4">
                  <span
                    v-if="u.email_verified"
                    class="inline-flex items-center text-xs font-medium text-emerald-400"
                  >
                    Terverifikasi
                  </span>
                  <span v-else class="inline-flex items-center text-xs font-medium text-amber-400">
                    Belum Verifikasi
                  </span>
                </td>

                <!-- Actions -->
                <td class="space-x-2 px-6 py-4 text-right">
                  <template v-if="u.deletedAt == null">
                    <button
                      @click="openRoleModal(u)"
                      class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                    >
                      Ubah Role
                    </button>
                    <button
                      @click="openPasswordModal(u)"
                      class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                    >
                      Ganti Password
                    </button>
                    <button
                      v-if="u.id !== authStore.user?.id && u.role?.name.toLowerCase() !== 'admin'"
                      @click="openConfirmModal(u, 'deactivate')"
                      class="rounded-full border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-rose-400 transition hover:bg-rose-500/20 active:scale-95"
                    >
                      Deactivate
                    </button>
                  </template>

                  <template v-else>
                    <button
                      @click="openConfirmModal(u, 'activate')"
                      class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-emerald-400 transition hover:bg-emerald-500/20 active:scale-95"
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
    </div>

    <!-- Create User Modal -->
    <div
      v-if="isCreateModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <h2 class="text-xl font-bold text-white">Tambah Pengguna Baru</h2>
        <p class="text-xs text-slate-400">
          Pengguna yang dibuat oleh Admin langsung terverifikasi dan diwajibkan membuat kata sandi
          saat pertama kali masuk.
        </p>

        <div
          v-if="createError"
          class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
        >
          {{ createError }}
        </div>
        <div
          v-if="createSuccess"
          class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400"
        >
          {{ createSuccess }}
        </div>
        <div
          v-if="!usersStore.roles.length"
          class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400"
        >
          {{ usersStore.error || 'Daftar role tidak tersedia. Silakan muat ulang halaman.' }}
        </div>

        <form @submit.prevent="handleCreateUser" class="space-y-4">
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-300 uppercase">Email</label>
            <input
              v-model="createForm.email"
              type="email"
              placeholder="nama@email.com"
              required
              class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-300 uppercase">Role</label>
            <select
              v-model="createForm.roleId"
              required
              class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option v-for="r in usersStore.roles" :key="r.id" :value="r.id">
                {{ r.name }}
              </option>
            </select>
          </div>

          <div>
            <div class="mb-1 flex items-center justify-between">
              <label class="block text-xs font-semibold text-slate-300 uppercase"
                >Kata Sandi Awal</label
              >
              <button
                type="button"
                @click="createForm.password = generateRandomPassword()"
                class="text-xs text-indigo-400 hover:underline"
              >
                Acak Sandi
              </button>
            </div>
            <input
              v-model="createForm.password"
              type="text"
              required
              class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div class="flex justify-end gap-3 pt-3">
            <button
              type="button"
              @click="isCreateModalOpen = false"
              :disabled="isSubmitting"
              class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSubmitting"
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
            >
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Update Role Modal -->
    <div
      v-if="isRoleModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <h2 class="text-xl font-bold text-white">Ubah Role Pengguna</h2>
        <p class="text-xs text-slate-400">
          Pilih role baru untuk <strong class="text-white">{{ selectedUser?.email }}</strong
          >:
        </p>

        <div
          v-if="!usersStore.roles.length"
          class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400"
        >
          {{ usersStore.error || 'Daftar role tidak tersedia.' }}
        </div>

        <select
          v-model="newRoleSelection"
          class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option v-for="r in usersStore.roles" :key="r.id" :value="r.id">
            {{ r.name }}
          </option>
        </select>

        <div class="flex justify-end gap-3 pt-3">
          <button
            type="button"
            @click="isRoleModalOpen = false"
            :disabled="isSubmitting"
            class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            @click="handleUpdateRole"
            :disabled="isSubmitting"
            class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>

    <!-- Change Password Modal -->
    <div
      v-if="isPasswordModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <h2 class="text-xl font-bold text-white">Ganti Kata Sandi Pengguna</h2>
        <p class="text-xs text-slate-400">
          Atur kata sandi baru untuk <strong class="text-white">{{ selectedUser?.email }}</strong
          >. Pengguna akan diwajibkan mengganti kata sandi saat pertama kali masuk kembali.
        </p>

        <div
          v-if="passwordError"
          class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
        >
          {{ passwordError }}
        </div>
        <div
          v-if="passwordSuccess"
          class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400"
        >
          {{ passwordSuccess }}
        </div>

        <form @submit.prevent="handleChangePassword" class="space-y-4">
          <div>
            <div class="mb-1 flex items-center justify-between">
              <label class="block text-xs font-semibold text-slate-300 uppercase">
                Kata Sandi Baru
              </label>
              <button
                type="button"
                @click="
                  newPassword = generateRandomPassword();
                  isNewPasswordTouched = true;
                "
                class="text-xs text-indigo-400 hover:underline"
              >
                Acak Sandi
              </button>
            </div>
            <input
              v-model="newPassword"
              type="text"
              required
              @blur="isNewPasswordTouched = true"
              class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <p v-if="newPasswordError" class="mt-1 text-xs text-red-400">
              {{ newPasswordError }}
            </p>
          </div>

          <div class="flex justify-end gap-3 pt-3">
            <button
              type="button"
              @click="isPasswordModalOpen = false"
              :disabled="isSubmitting"
              class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="
                isSubmitting || (isNewPasswordTouched && !isNewPasswordValid) || !newPassword
              "
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
            >
              Simpan Kata Sandi
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Centered Confirmation Modal -->
    <div
      v-if="isConfirmModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-sm space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl"
      >
        <p class="text-base leading-relaxed font-semibold text-white">
          Apakah anda yakin ingin melakukan aksi ini ?
        </p>

        <div class="flex justify-center gap-3 pt-2">
          <button
            type="button"
            @click="isConfirmModalOpen = false"
            :disabled="isSubmitting"
            class="rounded-lg bg-slate-800 px-5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            @click="handleConfirmAction"
            :disabled="isSubmitting"
            :class="[
              'rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-lg transition disabled:opacity-50',
              confirmActionType === 'activate'
                ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-500'
                : 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-500',
            ]"
          >
            Ya
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
