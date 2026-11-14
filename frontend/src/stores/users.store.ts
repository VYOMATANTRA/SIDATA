import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiErrorFromBody, apiFetch } from '../utils/apiClient';
import { toUserMessage, type FailureKind } from '../utils/userMessages';

export interface UserRole {
  id: string;
  name: string;
}

export interface UserItem {
  id: string;
  email: string;
  auth_provider: string;
  email_verified: boolean;
  requires_password_change: boolean;
  deletedAt: string | null;
  roleId: string;
  role: UserRole;
  createdAt: string;
}

export const useUsersStore = defineStore('users', () => {
  const users = ref<UserItem[]>([]);
  const roles = ref<UserRole[]>([]);
  const loading = ref(false);
  /** Load error (user list, role list) shown in the page banner. Write failures never land here. */
  const error = ref<string | null>(null);
  /** Failure class of `error`, for AlertBanner; null while `error` is null. */
  const errorKind = ref<FailureKind | null>(null);

  async function fetchUsers() {
    loading.value = true;
    error.value = null;
    errorKind.value = null;
    try {
      const res = await apiFetch('/api/users', {});
      const data = await res.json();
      if (!res.ok) {
        throw apiErrorFromBody(res.status, data, 'GET');
      }
      users.value = data.users || [];
    } catch (err: unknown) {
      const mapped = toUserMessage(err, 'memuat daftar pengguna', 'GET');
      error.value = mapped.message;
      errorKind.value = mapped.kind;
    } finally {
      loading.value = false;
    }
  }

  async function fetchRoles() {
    try {
      const res = await apiFetch('/api/users/roles', {});
      const data = await res.json();
      if (!res.ok) {
        throw apiErrorFromBody(res.status, data, 'GET');
      }
      roles.value = data.roles || [];
    } catch (err: unknown) {
      const mapped = toUserMessage(err, 'memuat daftar role', 'GET');
      error.value = mapped.message;
      errorKind.value = mapped.kind;
      console.error('Error fetching roles:', err);
    }
  }

  async function createUser(payload: { email: string; roleId: string; password: string }) {
    loading.value = true;
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw apiErrorFromBody(res.status, data, 'POST');
      }
      if (data.user) {
        users.value.unshift(data.user);
      }
      return data;
    } finally {
      loading.value = false;
    }
  }

  async function reactivateUser(userId: string) {
    loading.value = true;
    try {
      const res = await apiFetch(`/api/users/${userId}/reactivate`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) {
        throw apiErrorFromBody(res.status, data, 'PATCH');
      }
      const target = users.value.find((u) => u.id === userId);
      if (target) {
        target.deletedAt = null;
        if (data.user) {
          Object.assign(target, data.user);
        }
      }
      return data;
    } finally {
      loading.value = false;
    }
  }

  async function changeUserPassword(userId: string, password: string) {
    loading.value = true;
    try {
      const res = await apiFetch(`/api/users/${userId}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw apiErrorFromBody(res.status, data, 'PATCH');
      }
      const target = users.value.find((u) => u.id === userId);
      if (target) {
        target.requires_password_change = true;
        target.auth_provider = 'local';
      }
      return data;
    } finally {
      loading.value = false;
    }
  }

  async function updateUserRole(userId: string, roleId: string) {
    loading.value = true;
    try {
      const res = await apiFetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ roleId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw apiErrorFromBody(res.status, data, 'PATCH');
      }
      const target = users.value.find((u) => u.id === userId);
      if (target) {
        if (data.user?.role) {
          target.role = data.user.role;
          target.roleId = data.user.roleId || data.user.role.id || roleId;
        } else {
          const matchedRole = roles.value.find((r) => r.id === roleId);
          if (matchedRole) {
            target.role = matchedRole;
            target.roleId = roleId;
          }
        }
      }
      return data;
    } finally {
      loading.value = false;
    }
  }

  async function deleteUser(userId: string) {
    loading.value = true;
    try {
      const res = await apiFetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw apiErrorFromBody(res.status, data, 'DELETE');
      }
      const target = users.value.find((u) => u.id === userId);
      if (target) {
        target.deletedAt = new Date().toISOString();
      }
      return data;
    } finally {
      loading.value = false;
    }
  }

  return {
    users,
    roles,
    loading,
    error,
    errorKind,
    fetchUsers,
    fetchRoles,
    createUser,
    reactivateUser,
    changeUserPassword,
    updateUserRole,
    deleteUser,
  };
});
