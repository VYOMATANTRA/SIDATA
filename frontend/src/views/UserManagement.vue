<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUsersStore, type UserItem } from '../stores/users.store'
import { useAuthStore } from '../stores/auth'

const usersStore = useUsersStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const isCreateModalOpen = ref(false)
const isRoleModalOpen = ref(false)
const isDeleteModalOpen = ref(false)

const selectedUser = ref<UserItem | null>(null)
const newRoleSelection = ref('')

// Form state for creating user
const createForm = ref({
  email: '',
  roleId: '',
  password: '',
})
const createError = ref('')
const createSuccess = ref('')
const isSubmitting = ref(false)
let createCloseTimer: ReturnType<typeof setTimeout> | null = null

const filteredUsers = computed(() => {
  if (!searchQuery.value.trim()) return usersStore.users
  const q = searchQuery.value.toLowerCase().trim()
  return usersStore.users.filter(
    (u) => u.email.toLowerCase().includes(q) || u.role?.name.toLowerCase().includes(q),
  )
})

onMounted(async () => {
  await Promise.all([usersStore.fetchUsers(), usersStore.fetchRoles()])
})

function openCreateModal() {
  if (createCloseTimer) {
    clearTimeout(createCloseTimer)
    createCloseTimer = null
  }
  const defaultRole =
    usersStore.roles.find((r) => r.name.toLowerCase() === 'user') || usersStore.roles[0]

  createForm.value = {
    email: '',
    roleId: defaultRole?.id || '',
    password: generateRandomPassword(),
  }
  createError.value = ''
  createSuccess.value = ''
  isCreateModalOpen.value = true
}

function openRoleModal(user: UserItem) {
  selectedUser.value = user
  newRoleSelection.value = user.roleId
  isRoleModalOpen.value = true
}

function openDeleteModal(user: UserItem) {
  selectedUser.value = user
  isDeleteModalOpen.value = true
}

function generateRandomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const array = new Uint32Array(12)
  crypto.getRandomValues(array)
  let pass = ''
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(array[i]! % chars.length)
  }
  return pass
}

async function handleCreateUser() {
  createError.value = ''
  createSuccess.value = ''
  if (!createForm.value.email || !createForm.value.roleId || !createForm.value.password) {
    createError.value = 'Semua field wajib diisi.'
    return
  }

  isSubmitting.value = true
  try {
    const res = await usersStore.createUser(createForm.value)
    createSuccess.value = res.message || 'Pengguna berhasil dibuat.'
    createCloseTimer = setTimeout(() => {
      isCreateModalOpen.value = false
      createCloseTimer = null
    }, 1200)
  } catch (err: unknown) {
    createError.value = err instanceof Error ? err.message : 'Gagal membuat pengguna.'
  } finally {
    isSubmitting.value = false
  }
}

async function handleUpdateRole() {
  if (!selectedUser.value || !newRoleSelection.value) return
  isSubmitting.value = true
  try {
    await usersStore.updateUserRole(selectedUser.value.id, newRoleSelection.value)
    isRoleModalOpen.value = false
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : 'Gagal memperbarui role')
  } finally {
    isSubmitting.value = false
  }
}

async function handleDeleteUser() {
  if (!selectedUser.value) return
  isSubmitting.value = true
  try {
    await usersStore.deleteUser(selectedUser.value.id)
    isDeleteModalOpen.value = false
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : 'Gagal menghapus pengguna')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- Top Bar / Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Manajemen Pengguna</span>
            <span class="text-xs px-2.5 py-1 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 rounded-full uppercase tracking-wider font-semibold">Admin Portal</span>
          </h1>
          <p class="text-slate-400 text-sm mt-1">
            Kelola pengguna sistem, peran hak akses, dan soft-deletion akun.
          </p>
        </div>

        <button
          @click="openCreateModal"
          class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition active:scale-95"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
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
            class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
          />
          <svg
            class="w-5 h-5 text-slate-500 absolute left-3 top-3"
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

        <div class="text-xs text-slate-400 font-medium">
          Total: <span class="text-white font-bold">{{ filteredUsers.length }}</span> pengguna aktif
        </div>
      </div>

      <!-- Error State -->
      <div v-if="usersStore.error" class="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
        {{ usersStore.error }}
      </div>

      <!-- Table Container -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                <th class="px-6 py-4">Pengguna</th>
                <th class="px-6 py-4">Penyedia Autentikasi</th>
                <th class="px-6 py-4">Role</th>
                <th class="px-6 py-4">Status Verifikasi</th>
                <th class="px-6 py-4">Login Pertama</th>
                <th class="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              <tr v-if="usersStore.loading && !filteredUsers.length">
                <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                  <div class="flex justify-center items-center gap-2">
                    <svg class="animate-spin h-5 w-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
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
                class="hover:bg-slate-800/40 transition duration-150"
              >
                <!-- User Email -->
                <td class="px-6 py-4">
                  <div class="font-semibold text-white">{{ u.email }}</div>
                  <div class="text-xs text-slate-500">ID: {{ u.id.substring(0, 8) }}...</div>
                </td>

                <!-- Auth Provider -->
                <td class="px-6 py-4 capitalize">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    <span v-if="u.auth_provider === 'google'">🌐</span>
                    <span v-else>🔑</span>
                    {{ u.auth_provider }}
                  </span>
                </td>

                <!-- Role Badge -->
                <td class="px-6 py-4">
                  <span
                    :class="[
                      'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border',
                      u.role?.name.toLowerCase() === 'admin'
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    ]"
                  >
                    {{ u.role?.name }}
                  </span>
                </td>

                <!-- Email Verification Status -->
                <td class="px-6 py-4">
                  <span
                    v-if="u.email_verified"
                    class="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium"
                  >
                    <span>✓</span> Terverifikasi
                  </span>
                  <span v-else class="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
                    <span>⏳</span> Pending OTP
                  </span>
                </td>

                <!-- Requires Password Change -->
                <td class="px-6 py-4">
                  <span
                    v-if="u.requires_password_change"
                    class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium"
                  >
                    Wajib Ganti Password
                  </span>
                  <span v-else class="text-xs text-slate-500">Normal</span>
                </td>

                <!-- Actions -->
                <td class="px-6 py-4 text-right space-x-2">
                  <button
                    @click="openRoleModal(u)"
                    class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition border border-slate-700"
                  >
                    Ubah Role
                  </button>
                  <button
                    v-if="u.id !== authStore.user?.id && u.role?.name.toLowerCase() !== 'admin'"
                    @click="openDeleteModal(u)"
                    class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium transition"
                  >
                    Hapus
                  </button>
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
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <h2 class="text-xl font-bold text-white">Tambah Pengguna Baru</h2>
        <p class="text-slate-400 text-xs">
          Pengguna yang dibuat oleh Admin langsung terverifikasi dan diwajibkan mengganti kata sandi saat pertama kali masuk.
        </p>

        <div v-if="createError" class="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
          {{ createError }}
        </div>
        <div v-if="createSuccess" class="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
          {{ createSuccess }}
        </div>
        <div v-if="!usersStore.roles.length" class="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-lg">
          {{ usersStore.error || 'Daftar role tidak tersedia. Silakan muat ulang halaman.' }}
        </div>

        <form @submit.prevent="handleCreateUser" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase mb-1">Email</label>
            <input
              v-model="createForm.email"
              type="email"
              placeholder="nama@email.com"
              required
              class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase mb-1">Role</label>
            <select
              v-model="createForm.roleId"
              required
              class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option v-for="r in usersStore.roles" :key="r.id" :value="r.id">
                {{ r.name }}
              </option>
            </select>
          </div>

          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="block text-xs font-semibold text-slate-300 uppercase">Kata Sandi Awal</label>
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
              class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div class="flex justify-end gap-3 pt-3">
            <button
              type="button"
              @click="isCreateModalOpen = false"
              :disabled="isSubmitting"
              class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSubmitting"
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/20 disabled:opacity-50"
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
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <h2 class="text-xl font-bold text-white">Ubah Role Pengguna</h2>
        <p class="text-slate-400 text-xs">
          Pilih role baru untuk <strong class="text-white">{{ selectedUser?.email }}</strong>:
        </p>

        <div v-if="!usersStore.roles.length" class="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-lg">
          {{ usersStore.error || 'Daftar role tidak tersedia.' }}
        </div>

        <select
          v-model="newRoleSelection"
          class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
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
            class="px-4 py-2 bg-slate-800 text-slate-300 text-sm font-medium rounded-lg disabled:opacity-50"
          >
            Batal
          </button>
          <button
            @click="handleUpdateRole"
            :disabled="isSubmitting"
            class="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div
      v-if="isDeleteModalOpen"
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <h2 class="text-xl font-bold text-red-400">Konfirmasi Nonaktifkan</h2>
        <p class="text-slate-300 text-xs leading-relaxed">
          Apakah Anda yakin ingin menonaktifkan akun <strong class="text-white">{{ selectedUser?.email }}</strong>?
          Akun akan di-soft-delete dan semua sesi login aktif pengguna akan dicabut.
        </p>

        <div class="flex justify-end gap-3 pt-3">
          <button
            type="button"
            @click="isDeleteModalOpen = false"
            :disabled="isSubmitting"
            class="px-4 py-2 bg-slate-800 text-slate-300 text-sm font-medium rounded-lg disabled:opacity-50"
          >
            Batal
          </button>
          <button
            @click="handleDeleteUser"
            :disabled="isSubmitting"
            class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-red-600/20 disabled:opacity-50"
          >
            Ya, Nonaktifkan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
