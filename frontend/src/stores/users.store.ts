import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiRequestJson } from '../utils/apiClient';
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

interface UsersListResponse {
  users?: UserItem[];
}

interface RolesListResponse {
  roles?: UserRole[];
}

/** Success body of a user write; `message` is the approved sentence the views show. */
interface MutationResponse<T = unknown> {
  message?: string;
  user?: T;
}

export const useUsersStore = defineStore('users', () => {
  const users = ref<UserItem[]>([]);
  const roles = ref<UserRole[]>([]);
  /** True only while the user list is being fetched. Mutations never set it (see `mutating`). */
  const loading = ref(false);
  /** True while a create, reactivate, password, role or delete request is in flight. */
  const mutating = ref(false);
  /** User-list load error shown in the page banner. Write and role-load failures never land here. */
  const error = ref<string | null>(null);
  /** Failure class of `error`, for AlertBanner; null while `error` is null. */
  const errorKind = ref<FailureKind | null>(null);
  /** Role-list load error, kept apart from `error` so the two banners do not mirror each other. */
  const rolesError = ref<string | null>(null);
  /** Failure class of `rolesError`, for AlertBanner; null while `rolesError` is null. */
  const rolesErrorKind = ref<FailureKind | null>(null);

  // Concurrent mutations share the `mutating` flag; it stays true until the last one settles.
  let pendingMutations = 0;

  async function runMutation<T>(request: () => Promise<T>): Promise<T> {
    pendingMutations += 1;
    mutating.value = true;
    try {
      return await request();
    } finally {
      pendingMutations -= 1;
      mutating.value = pendingMutations > 0;
    }
  }

  async function fetchUsers() {
    loading.value = true;
    error.value = null;
    errorKind.value = null;
    try {
      const data = await apiRequestJson<UsersListResponse>('/api/users');
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
    rolesError.value = null;
    rolesErrorKind.value = null;
    try {
      const data = await apiRequestJson<RolesListResponse>('/api/users/roles');
      roles.value = data.roles || [];
    } catch (err: unknown) {
      const mapped = toUserMessage(err, 'memuat daftar role', 'GET');
      rolesError.value = mapped.message;
      rolesErrorKind.value = mapped.kind;
      console.error('Error fetching roles:', err);
    }
  }

  async function createUser(payload: { email: string; roleId: string; password: string }) {
    return runMutation(async () => {
      const data = await apiRequestJson<MutationResponse<UserItem>>('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data.user) {
        users.value.unshift(data.user);
      }
      return data;
    });
  }

  async function reactivateUser(userId: string) {
    return runMutation(async () => {
      const data = await apiRequestJson<MutationResponse<Partial<UserItem>>>(
        `/api/users/${userId}/reactivate`,
        { method: 'PATCH' },
      );
      const target = users.value.find((u) => u.id === userId);
      if (target) {
        target.deletedAt = null;
        if (data.user) {
          Object.assign(target, data.user);
        }
      }
      return data;
    });
  }

  async function changeUserPassword(userId: string, password: string) {
    return runMutation(async () => {
      const data = await apiRequestJson<MutationResponse>(`/api/users/${userId}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      const target = users.value.find((u) => u.id === userId);
      if (target) {
        target.requires_password_change = true;
        target.auth_provider = 'local';
      }
      return data;
    });
  }

  async function updateUserRole(userId: string, roleId: string) {
    return runMutation(async () => {
      const data = await apiRequestJson<MutationResponse<Partial<UserItem> & { role?: UserRole }>>(
        `/api/users/${userId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ roleId }),
        },
      );
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
    });
  }

  async function deleteUser(userId: string) {
    return runMutation(async () => {
      const data = await apiRequestJson<MutationResponse>(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      const target = users.value.find((u) => u.id === userId);
      if (target) {
        target.deletedAt = new Date().toISOString();
      }
      return data;
    });
  }

  return {
    users,
    roles,
    loading,
    mutating,
    error,
    errorKind,
    rolesError,
    rolesErrorKind,
    fetchUsers,
    fetchRoles,
    createUser,
    reactivateUser,
    changeUserPassword,
    updateUserRole,
    deleteUser,
  };
});
